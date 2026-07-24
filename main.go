package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"html"
	"io"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"comet-ui/chat"
	"comet-ui/wiki"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
)

//go:embed web/dist
var webDist embed.FS

func staticHandler() http.Handler {
	sub, err := fs.Sub(webDist, "web/dist")
	if err != nil {
		log.Fatalf("embed sub: %v", err)
	}
	return http.FileServer(http.FS(sub))
}

func main() {
	port := flag.Int("port", 8989, "port to listen on")
	bind := flag.String("bind", "localhost", "address to bind to (use 0.0.0.0 for LAN access)")
	shareURL := flag.String("share-url", "", "public base URL for share links (default: auto-detect or localhost)")
	baseDir := flag.String("dir", "openspec", "path to openspec directory")
	flag.Parse()

	mux := http.NewServeMux()

	reg, err := NewWorkspaceRegistry(filepath.Join(os.Getenv("HOME"), ".comet-panel", "workspaces.yaml"))
	if err != nil {
		log.Fatalf("workspace registry: %v", err)
	}
	workspaceRegistryAliasSnapshot = reg.List

	// Share URL precedence: --share-url flag > auto-detected LAN IP > localhost.
	shareBaseURL := fmt.Sprintf("http://localhost:%d", *port)
	if *shareURL != "" {
		shareBaseURL = *shareURL
	} else if ip := detectLANIP(); ip != "" {
		shareBaseURL = fmt.Sprintf("http://%s:%d", ip, *port)
	}
	// Always prefer explicit --share-url; auto-detection is unreliable on WSL2.
	shareManager := NewShareManager(shareBaseURL)

	mux.HandleFunc("/api/workspaces", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleListWorkspaces(w, r, reg)
		case http.MethodPost:
			handleAddWorkspace(w, r, reg)
		default:
			writeJSONError(w, "method not allowed", 405)
		}
	})

	mux.HandleFunc("/api/sync", handleSync(reg))
	mux.HandleFunc("/api/sync/config", handleSyncConfig(reg))

	mux.HandleFunc("/api/bookmarks", handleBookmarks)

	wikiCacheDir := filepath.Join(os.Getenv("HOME"), ".comet-panel", "wiki")
	wikiAPI := wiki.NewAPIWithWorkspacesAsync(toWikiWorkspaces(reg.List()), wikiCacheDir)
	sseHub := wiki.NewSSEHub()
	wikiAPI.SSE = sseHub
	// Wire the live registry so /api/wiki/rebuild reflects runtime workspace
	// adds instead of only the construction-time snapshot taken above.
	wikiAPI.SetLister(registryLister{reg})
	// The initial index build scans the whole workspace tree and can take
	// tens of seconds on a large repo. Run it in the background so
	// ListenAndServe below binds immediately instead of leaving the
	// dashboard unreachable for the whole scan; HandleIndex/HandleLint
	mux.HandleFunc("/api/wiki/fix-dead-links", wikiAPI.HandleFixDeadLinks)
	// serve `[]` off the empty graph from NewAPIWithWorkspacesAsync until
	// this swaps in the built one.
	watcher := wiki.NewWatcher(wikiAPI, "scripts/embed.ts")
	mirrorDir := filepath.Join(os.Getenv("HOME"), ".comet-panel", "knowledge-repo")
	syncCfg := reg.Sync()
	if syncCfg.Enabled {
		mirror := wiki.NewMirror(mirrorDir, syncCfg.Remote)
		if err := mirror.Init(); err != nil {
			log.Printf("knowledge mirror init failed (non-fatal): %v", err)
		} else {
			watcher.SetMirror(mirror)
		}
	}
	go func() {
		if err := wikiAPI.Rebuild(); err != nil {
			log.Printf("wiki index build failed (non-fatal, dashboard still serves): %v", err)
			return
		}
		watcher.SyncMirror()
	}()
	workspacePaths := make([]string, 0, len(reg.List())*5)
	for _, ws := range reg.List() {
		workspacePaths = append(workspacePaths, ws.Path)
		// Also watch sibling docs/, knowledge/, and *_docs/ (same as BuildIndex scanRoots)
		parent := filepath.Dir(ws.Path)
		if docsDir := filepath.Join(parent, "docs"); dirExists(docsDir) {
			workspacePaths = append(workspacePaths, docsDir)
		}
		if knowledgeDir := filepath.Join(parent, "knowledge"); dirExists(knowledgeDir) {
			workspacePaths = append(workspacePaths, knowledgeDir)
		}
		workspacePaths = append(workspacePaths, wiki.FindDocsDirs(parent)...)
	}
	if err := watcher.Start(workspacePaths); err != nil {
		log.Printf("wiki watcher start failed (non-fatal): %v", err)
	} else {
		defer watcher.Stop()
	}
	mux.HandleFunc("/api/wiki/index", wikiAPI.HandleIndex)
	mux.HandleFunc("/api/wiki/graph", wikiAPI.HandleGraph)
	mux.HandleFunc("/api/wiki/recent", wikiAPI.HandleRecent)
	mux.HandleFunc("/api/wiki/component/", wikiAPI.HandleComponent)
	mux.HandleFunc("/api/wiki/search", wikiAPI.HandleSearch)
	mux.HandleFunc("/api/wiki/rebuild", wikiAPI.HandleRebuild)
	mux.HandleFunc("/api/wiki/lint", wikiAPI.HandleLint)
	mux.HandleFunc("/api/wiki/summarize", wikiAPI.HandleSummarize)
	mux.HandleFunc("/api/wiki/overview", wikiAPI.HandleOverview)
	mux.HandleFunc("/api/wiki/search-semantic", wikiAPI.HandleSemanticSearch)
	mux.HandleFunc("/api/wiki/calendar/month", wikiAPI.HandleCalendarMonth)
	mux.HandleFunc("/api/wiki/calendar/day", wikiAPI.HandleCalendarDay)
	mux.HandleFunc("/mcp", wikiAPI.HandleMCP)
	mux.Handle("/api/wiki/events", sseHub)

	mux.HandleFunc("/api/changes", func(w http.ResponseWriter, r *http.Request) {
		handleListChangesMultiWorkspace(w, r, *baseDir, reg)
	})
	transitionLock := NewTransitionLock()
	mux.HandleFunc("/api/changes/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/transition") {
			name := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/changes/"), "/transition")
			handleTransition(w, r, name, *baseDir, transitionLock, reg)
			return
		}
		handleGetChange(w, r, *baseDir, reg) // existing GET behavior, unchanged
	})
	mux.HandleFunc("/api/artifact", func(w http.ResponseWriter, r *http.Request) {
		handleGetArtifact(w, r, *baseDir, reg)
	})

	mux.HandleFunc("/api/chat/message", chat.HandleMessage(*baseDir, *baseDir, wikiAPI))
	mux.HandleFunc("/api/chat/session", chat.HandleSession)
	mux.HandleFunc("/api/chat/config", chat.HandleConfig)
	mux.HandleFunc("/api/chat/providers", chat.HandleProviders)

	mux.HandleFunc("/api/report", func(w http.ResponseWriter, r *http.Request) { handleReport(w, r, reg) })
	mux.HandleFunc("/api/reports", handleListReports)
	mux.HandleFunc("/api/reports/get", handleGetReport)
mux.HandleFunc("/api/share/create", func(w http.ResponseWriter, r *http.Request) { handleCreateShare(w, r, shareManager) })
	mux.HandleFunc("/api/share/list", func(w http.ResponseWriter, r *http.Request) { handleListShares(w, r, shareManager) })
	mux.HandleFunc("/api/share/revoke", func(w http.ResponseWriter, r *http.Request) { handleRevokeShare(w, r, shareManager) })
	mux.HandleFunc("/share/", func(w http.ResponseWriter, r *http.Request) { handleSharePage(w, r, shareManager) })

	mux.Handle("/", staticHandler())

	addr := fmt.Sprintf("%s:%d", *bind, *port)
	url := fmt.Sprintf("http://%s:%d", *bind, *port)
	fmt.Printf("Comet UI Dashboard → %s\n", url)

	go openBrowser(url)

	log.Fatal(http.ListenAndServe(addr, mux))
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		return
	}
	cmd.Start()
}

// toWikiWorkspaces converts main's WorkspaceConfig to wiki's WorkspaceConfig.
// The two types are structurally identical but distinct named types in
// different packages — Go cannot import a `package main` directory
// ("is a program, not an importable package"), so wiki defines its own
// mirrored WorkspaceConfig (see wiki/index.go) and this converts between
// them at the one call site that crosses the boundary.
func toWikiWorkspaces(ws []WorkspaceConfig) []wiki.WorkspaceConfig {
	out := make([]wiki.WorkspaceConfig, len(ws))
	for i, w := range ws {
		out[i] = wiki.WorkspaceConfig{Alias: w.Alias, Path: w.Path, Color: w.Color}
	}
	return out
}

// registryLister adapts *WorkspaceRegistry to wiki.WorkspaceLister so
// wiki.API.HandleRebuild always sees the live registry contents (including
// workspaces added at runtime via POST /api/workspaces) rather than the
// slice captured once when wikiAPI was constructed.
type registryLister struct{ reg *WorkspaceRegistry }

func (l registryLister) List() []wiki.WorkspaceConfig {
	return toWikiWorkspaces(l.reg.List())
}

func writeJSONError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func getDir(r *http.Request, defaultDir string) string {
	d := r.URL.Query().Get("dir")
	if d == "" {
		return defaultDir
	}
	return d
}

// resolveWorkspaceDir resolves the working directory for a request that may
// carry a `?workspace=<alias>` query param. Precedence: `?workspace=`
// (looked up against the live registry) wins over the legacy `?dir=` param,
// which in turn wins over defaultDir. An unregistered alias is a hard
// error — it must never silently fall back to defaultDir, since that would
// let a client unknowingly operate on the wrong (or a shared default)
// workspace.
func resolveWorkspaceDir(r *http.Request, defaultDir string, reg *WorkspaceRegistry) (string, error) {
	alias := r.URL.Query().Get("workspace")
	if alias == "" {
		return getDir(r, defaultDir), nil
	}
	if reg != nil {
		for _, ws := range reg.List() {
			if ws.Alias == alias {
				return ws.Path, nil
			}
		}
	}
	return "", fmt.Errorf("unknown workspace %q", alias)
}

func handleListWorkspaces(w http.ResponseWriter, r *http.Request, reg *WorkspaceRegistry) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reg.List())
}

func handleAddWorkspace(w http.ResponseWriter, r *http.Request, reg *WorkspaceRegistry) {
	var cfg WorkspaceConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeJSONError(w, "invalid body", 400)
		return
	}
	if cfg.Alias == "" || cfg.Path == "" {
		writeJSONError(w, "alias and path are required", 400)
		return
	}
	// Validate the path up front so a bad Path (non-absolute, missing, or
	// the filesystem root / a direct child of it) surfaces as 400 rather
	// than being conflated with the 409 alias-conflict case below.
	if err := validateWorkspacePath(cfg.Path); err != nil {
		writeJSONError(w, err.Error(), 400)
		return
	}
	if err := reg.Add(cfg); err != nil {
		writeJSONError(w, err.Error(), 409)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cfg)
}

// handleListChangesMultiWorkspace replaces handleListChanges as the /api/changes
// entry point. If no workspaces are registered, it preserves the original
// single-directory behavior (scanAllChanges against the --dir flag value) so
// existing deployments keep working without a workspaces.yaml migration.
func handleListChangesMultiWorkspace(w http.ResponseWriter, r *http.Request, defaultDir string, reg *WorkspaceRegistry) {
	w.Header().Set("Content-Type", "application/json")

	registered := reg.List()
	if len(registered) == 0 {
		dir := getDir(r, defaultDir)
		changes, err := scanAllChanges(dir)
		if err != nil {
			writeJSONError(w, err.Error(), 500)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"changes": changes, "dir": dir})
		return
	}

	filterAlias := r.URL.Query().Get("workspace")
	changes, failedWorkspaces := scanAllWorkspaces(registered)
	if filterAlias != "" {
		var filtered []ChangeSummary
		for _, c := range changes {
			if c.Workspace == filterAlias {
				filtered = append(filtered, c)
			}
		}
		changes = filtered
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"changes": changes, "failedWorkspaces": failedWorkspaces})
}

func handleGetChange(w http.ResponseWriter, r *http.Request, baseDir string, reg *WorkspaceRegistry) {
	dir, err := resolveWorkspaceDir(r, baseDir, reg)
	if err != nil {
		writeJSONError(w, err.Error(), 400)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/changes/")
	name = filepath.Clean(name)
	if name == "" || name == "." {
		writeJSONError(w, "missing name", 400)
		return
	}
	if strings.Contains(name, "..") || strings.Contains(name, "/") {
		writeJSONError(w, "invalid name", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	detail, scanErr := scanChangeDetail(dir, name)
	if scanErr != nil {
		writeJSONError(w, scanErr.Error(), 404)
		return
	}
	enc := json.NewEncoder(w)
	enc.Encode(detail)
}

func handleTransition(w http.ResponseWriter, r *http.Request, changeName, defaultDir string, lock *TransitionLock, reg *WorkspaceRegistry) {
	var body struct {
		TargetPhase string `json:"targetPhase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.TargetPhase == "" {
		writeJSONError(w, "invalid body: targetPhase required", 400)
		return
	}

	// Validate changeName — mirror handleGetChange's own validation
	if changeName == "" || changeName == "." || strings.Contains(changeName, "..") || strings.Contains(changeName, "/") {
		writeJSONError(w, "invalid change name", 400)
		return
	}
	// Validate targetPhase — constrain to known phases only
	validPhases := map[string]bool{"open": true, "design": true, "build": true, "verify": true, "archive": true}
	if !validPhases[body.TargetPhase] {
		writeJSONError(w, "invalid targetPhase: must be one of open/design/build/verify/archive", 400)
		return
	}

	workspaceDir, err := resolveWorkspaceDir(r, defaultDir, reg)
	if err != nil {
		writeJSONError(w, err.Error(), 400)
		return
	}

	// Pre-flight: fail fast if the guard script can't even be located,
	// before opening an SSE stream or taking the lock.
	if _, _, err := resolveCometGuard(); err != nil {
		writeJSONError(w, err.Error(), 400)
		return
	}

	if !lock.TryAcquire(changeName) {
		writeJSONError(w, fmt.Sprintf("a transition for %q is already in progress", changeName), 409)
		return
	}
	defer lock.Release(changeName)

	output, err := TriggerTransition(r.Context(), changeName, body.TargetPhase, workspaceDir)
	if err != nil {
		writeJSONError(w, err.Error(), 500)
		return
	}
	defer output.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, "streaming not supported", 500)
		return
	}

	buf := make([]byte, 4096)
	for {
		n, readErr := output.Read(buf)
		if n > 0 {
			fmt.Fprintf(w, "data: %s\n\n", string(buf[:n]))
			flusher.Flush()
		}
		if readErr != nil {
			// A clean io.EOF means the guard process exited 0 (success).
			// Any other error (from cmd.Run() via pw.CloseWithError in
			// TriggerTransition) means it exited non-zero or failed to
			// start. Emit an explicit final marker — the raw output
			// stream alone gives the client no way to tell these apart.
			if readErr == io.EOF {
				fmt.Fprintf(w, "data: __GUARD_EXIT__:0\n\n")
			} else {
				fmt.Fprintf(w, "data: __GUARD_EXIT__:1:%s\n\n", readErr.Error())
			}
			flusher.Flush()
			break
		}
	}
}

func handleGetArtifact(w http.ResponseWriter, r *http.Request, baseDir string, reg *WorkspaceRegistry) {
	dir, err := resolveWorkspaceDir(r, baseDir, reg)
	if err != nil {
		writeJSONError(w, err.Error(), 400)
		return
	}
	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "missing path", 400)
		return
	}

	absPath, absErr := filepath.Abs(path)
	if absErr != nil {
		writeJSONError(w, "invalid path", 400)
		return
	}
	// The traversal guard root MUST be derived from the resolved workspace
	// dir (which may come from ?workspace=<alias>), never from the process's
	// --dir flag baseDir — otherwise a request scoped to workspace A could
	// read files belonging to workspace B or any other directory reachable
	// only via baseDir's parent.
	//
	// The check below is boundary-correct: filepath.Rel gives the relative
	// path from rootAbs to absPath, and any escape outside rootAbs produces
	// a leading ".." segment (or exactly ".."). A plain strings.HasPrefix on
	// the raw absolute paths is NOT safe here — HasPrefix("/tmp/ws-evil",
	// "/tmp/ws") is true even though ws-evil is a sibling, not a
	// subdirectory, of ws.
	rootAbs, _ := filepath.Abs(filepath.Join(dir, ".."))
	rel, relErr := filepath.Rel(rootAbs, absPath)
	if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		writeJSONError(w, "path outside project directory", 403)
		return
	}

	content, readErr := os.ReadFile(absPath)
	if readErr != nil {
		writeJSONError(w, "file not found", 404)
		return
	}

	ext := filepath.Ext(absPath)
	ct := mime.TypeByExtension(ext)
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Write(content)
}

// handleCreateShare generates a share token for a document and returns the link.
func handleCreateShare(w http.ResponseWriter, r *http.Request, mgr *ShareManager) {
	if r.Method != http.MethodPost {
		writeJSONError(w, "method not allowed", 405)
		return
	}
	var req struct {
		Path      string `json:"path"`
		Workspace string `json:"workspace"`
		TTL       int    `json:"ttl"` // seconds; 0 = no expiry
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid body", 400)
		return
	}
	if req.Path == "" {
		writeJSONError(w, "missing path", 400)
		return
	}
	var ttl time.Duration
	if req.TTL > 0 {
		ttl = time.Duration(req.TTL) * time.Second
	}
	_, url, err := mgr.CreateShare(req.Path, req.Workspace, ttl)
	if err != nil {
		writeJSONError(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": url})
}

// handleListShares returns all active share tokens.
func handleListShares(w http.ResponseWriter, r *http.Request, mgr *ShareManager) {
	if r.Method != http.MethodGet {
		writeJSONError(w, "method not allowed", 405)
		return
	}
	shares := mgr.ListShares()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(shares)
}


// handleRevokeShare removes a share token.
func handleRevokeShare(w http.ResponseWriter, r *http.Request, mgr *ShareManager) {
	if r.Method != http.MethodDelete && r.Method != http.MethodPost {
		writeJSONError(w, "method not allowed", 405)
		return
	}
	token := r.URL.Query().Get("token")
	if token == "" {
		writeJSONError(w, "missing token", 400)
		return
	}
	if err := mgr.RevokeShare(token); err != nil {
		writeJSONError(w, err.Error(), 404)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "revoked"})
}

// handleSharePage serves a minimal read-only HTML page for a shared document.
func handleSharePage(w http.ResponseWriter, r *http.Request, mgr *ShareManager) {
	token := strings.TrimPrefix(r.URL.Path, "/share/")
	if token == "" {
		writeJSONError(w, "missing token", 400)
		return
	}
	entry, err := mgr.ValidateShare(token)
	if err != nil {
		w.WriteHeader(404)
		w.Write([]byte(`<html><body><h1>链接已失效</h1><p>该分享链接不存在或已过期。</p>
<script src="//cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>document.querySelectorAll("code.language-mermaid").forEach(c=>{c.parentElement.className="mermaid";c.parentElement.innerHTML=c.textContent});mermaid.initialize({startOnLoad:true,theme:"neutral"})</script>
</body></html>`))
		return
	}
	content, readErr := os.ReadFile(entry.Path)
	if readErr != nil {
		w.WriteHeader(404)
		w.Write([]byte(`<html><body><h1>文档不可用</h1><p>原文档已被移动或删除。</p>
<script src="//cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>document.querySelectorAll("code.language-mermaid").forEach(c=>{c.parentElement.className="mermaid";c.parentElement.innerHTML=c.textContent});mermaid.initialize({startOnLoad:true,theme:"neutral"})</script>
</body></html>`))
		return
	}
	html := renderMarkdownToHTML(entry.Path, string(content))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(html))
}

// renderMarkdownToHTML converts markdown source to a styled HTML page using goldmark.
func renderMarkdownToHTML(path, src string) string {
	var buf bytes.Buffer
	title := filepath.Base(path)
		md := goldmark.New(goldmark.WithExtensions(extension.GFM))
	if err := md.Convert([]byte(src), &buf); err != nil {
		log.Printf("share render: goldmark error for %s: %v", path, err)
		return fmt.Sprintf(`<html><body><pre>%s</pre>
<script src="//cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>document.querySelectorAll("code.language-mermaid").forEach(c=>{c.parentElement.className="mermaid";c.parentElement.innerHTML=c.textContent});mermaid.initialize({startOnLoad:true,theme:"neutral"})</script>
</body></html>`, html.EscapeString(src))
	}
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%s</title>

<style>
  :root{--paper:#fafaf8;--ink:#1d1d1f;--grey-3:#6e6e73;--accent:#002FA7;--border:#e8e8ed}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--paper);color:var(--ink);font-family:"Inter","PingFang SC",system-ui,sans-serif;padding:48px;max-width:860px;margin:0 auto;line-height:1.75}
  h1{font-size:28px;font-weight:800;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid var(--ink)}
  h2{font-size:20px;font-weight:700;margin:32px 0 12px}
  h3{font-size:16px;font-weight:600;margin:24px 0 8px}
  p,li{font-size:15px;margin-bottom:8px}
  ul,ol{padding-left:24px;margin-bottom:12px}
  blockquote{border-left:3px solid var(--border);padding-left:14px;color:var(--grey-3);margin:12px 0}
  code{background:#f0f0ee;padding:1px 4px;border-radius:3px;font-size:13px}
  pre{background:#f0f0ee;padding:14px;border-radius:6px;overflow-x:auto;font-size:13px;margin:12px 0}
  pre code{background:none;padding:0}
  table{border-collapse:collapse;width:100%%;margin:12px 0}
  th,td{border:1px solid var(--border);padding:8px 12px;text-align:left}
  th{background:#f5f5f7;font-weight:600}
  img{max-width:100%%;border-radius:6px}
  a{color:var(--accent)}
  hr{border:none;border-top:1px solid var(--border);margin:24px 0}
  footer{margin-top:48px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--grey-3)}
</style>
</head>
<body>
<div class="content">%s</div>
<footer>通过 Comet-Panel 分享 · 原文路径: %s</footer>

<script src="//cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>document.querySelectorAll("code.language-mermaid").forEach(c=>{c.parentElement.className="mermaid";c.parentElement.innerHTML=c.textContent});mermaid.initialize({startOnLoad:true,theme:"neutral"})</script>
</body>
</html>`, html.EscapeString(title), buf.String(), html.EscapeString(path))
}
