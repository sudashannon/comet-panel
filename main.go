package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"comet-ui/chat"
	"comet-ui/wiki"
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
	baseDir := flag.String("dir", "openspec", "path to openspec directory")
	flag.Parse()

	mux := http.NewServeMux()

	reg, err := NewWorkspaceRegistry(filepath.Join(os.Getenv("HOME"), ".comet-panel", "workspaces.yaml"))
	if err != nil {
		log.Fatalf("workspace registry: %v", err)
	}

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

	wikiCacheDir := filepath.Join(os.Getenv("HOME"), ".comet-panel", "wiki")
	wikiAPI, err := wiki.NewAPIWithWorkspaces(toWikiWorkspaces(reg.List()), wikiCacheDir)
	if err != nil {
		log.Printf("wiki index build failed (non-fatal, dashboard still serves): %v", err)
		wikiAPI, _ = wiki.NewAPIWithWorkspaces(nil, wikiCacheDir)
	}
	mux.HandleFunc("/api/wiki/index", wikiAPI.HandleIndex)
	mux.HandleFunc("/api/wiki/component/", wikiAPI.HandleComponent)
	mux.HandleFunc("/api/wiki/search", wikiAPI.HandleSearch)
	mux.HandleFunc("/api/wiki/rebuild", wikiAPI.HandleRebuild)
	mux.HandleFunc("/api/wiki/lint", wikiAPI.HandleLint)
	mux.HandleFunc("/api/wiki/summarize", wikiAPI.HandleSummarize)

	mux.HandleFunc("/api/changes", func(w http.ResponseWriter, r *http.Request) {
		handleListChangesMultiWorkspace(w, r, *baseDir, reg)
	})
	mux.HandleFunc("/api/changes/", func(w http.ResponseWriter, r *http.Request) {
		handleGetChange(w, r, *baseDir)
	})
	mux.HandleFunc("/api/artifact", func(w http.ResponseWriter, r *http.Request) {
		handleGetArtifact(w, r, *baseDir)
	})

	mux.HandleFunc("/api/chat/message", chat.HandleMessage(*baseDir, *baseDir))
	mux.HandleFunc("/api/chat/session", chat.HandleSession)
	mux.HandleFunc("/api/chat/config", chat.HandleConfig)
	mux.HandleFunc("/api/chat/providers", chat.HandleProviders)

	mux.Handle("/", staticHandler())

	addr := fmt.Sprintf(":%d", *port)
	url := fmt.Sprintf("http://localhost:%d", *port)
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

func handleGetChange(w http.ResponseWriter, r *http.Request, baseDir string) {
	dir := getDir(r, baseDir)
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
	detail, err := scanChangeDetail(dir, name)
	if err != nil {
		writeJSONError(w, err.Error(), 404)
		return
	}
	enc := json.NewEncoder(w)
	enc.Encode(detail)
}

func handleGetArtifact(w http.ResponseWriter, r *http.Request, baseDir string) {
	dir := getDir(r, baseDir)
	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "missing path", 400)
		return
	}

	absPath, err := filepath.Abs(path)
	if err != nil {
		writeJSONError(w, "invalid path", 400)
		return
	}
	rootAbs, _ := filepath.Abs(filepath.Join(dir, ".."))
	if !strings.HasPrefix(absPath, rootAbs) {
		writeJSONError(w, "path outside project directory", 403)
		return
	}

	content, err := os.ReadFile(absPath)
	if err != nil {
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
