package wiki

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"comet-ui/chat"
)

type API struct {
	mu              sync.RWMutex
	graph           *Graph
	ws              []WorkspaceConfig
	indexCacheDir   string
	lister          WorkspaceLister
	dirtyStructural int32
	SSE             *SSEHub
}

// WorkspaceLister exposes the CURRENT workspace registry, decoupling
// HandleRebuild from the []WorkspaceConfig slice captured once at
// construction time. Implementations (e.g. main.go's workspace registry)
// return the live set of configured workspaces on every call.
type WorkspaceLister interface {
	List() []WorkspaceConfig
}

func NewAPI(g *Graph) *API {
	return &API{graph: g}
}

func NewAPIWithWorkspaces(ws []WorkspaceConfig, indexCacheDir string) (*API, error) {
	g, err := BuildIndex(ws, indexCacheDir)
	if err != nil {
		return nil, err
	}
	return &API{graph: g, ws: ws, indexCacheDir: indexCacheDir}, nil
}

// NewAPIWithWorkspacesAsync constructs an API immediately with an empty,
// non-nil graph — it never blocks on scanning the workspace tree. Callers
// that need the initial index populated must call Rebuild themselves,
// typically in a background goroutine, so the HTTP server can bind and
// start serving (HandleIndex/HandleLint return `[]` until the build
// completes) instead of waiting tens of seconds for a large tree to scan.
func NewAPIWithWorkspacesAsync(ws []WorkspaceConfig, indexCacheDir string) *API {
	return &API{graph: BuildGraph(nil, nil), ws: ws, indexCacheDir: indexCacheDir}
}

// SetLister wires a live WorkspaceLister so HandleRebuild rebuilds from the
// current workspace registry instead of the construction-time snapshot in
// a.ws. Passing nil restores the a.ws fallback behavior.
func (a *API) SetLister(lister WorkspaceLister) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.lister = lister
}

// DirtyCount returns the number of structural graph changes accumulated
// since the last community detection pass.
func (a *API) DirtyCount() int {
	return int(atomic.LoadInt32(&a.dirtyStructural))
}

// ResetDirty marks the current graph structure as reflected in communities.
func (a *API) ResetDirty() {
	atomic.StoreInt32(&a.dirtyStructural, 0)
}

// AddDirty records structural graph changes for deferred community detection.
func (a *API) AddDirty(n int) {
	atomic.AddInt32(&a.dirtyStructural, int32(n))
}

type componentResponse struct {
	Component Component `json:"component"`
	Forward   []Edge    `json:"forward"`
	Backlinks []Edge    `json:"backlinks"`
}

func (a *API) HandleComponent(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	id := r.URL.Query().Get("id")
	c, ok := a.graph.Component(id)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "component not found"})
		return
	}
	// Forward/Backlinks normalize a nil edge slice to an empty one before
	// encoding, same reason as HandleLint above: a component with zero
	// backlinks is common (e.g. a change's own TypeChange node — nothing
	// currently links TO a .comet.yaml) and (*Graph).Backlinks/Forward
	// return the unmodified nil slice on a map miss. encoding/json would
	// serialize that nil as `null`, and BacklinksPanel.tsx's
	// useState<WikiEdge[] | null>(null) treats a `null` backlinks value as
	// "not yet fetched" — so a real, legitimate zero-backlinks component
	// would render nothing forever instead of "暂无反向引用".
	forward := a.graph.Forward(id)
	if forward == nil {
		forward = []Edge{}
	}
	backlinks := a.graph.Backlinks(id)
	if backlinks == nil {
		backlinks = []Edge{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(componentResponse{
		Component: c,
		Forward:   forward,
		Backlinks: backlinks,
	})
}

func (a *API) HandleIndex(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	all := make([]Component, 0)
	for id := range a.graph.components {
		c, _ := a.graph.Component(id)
		all = append(all, c)
	}
	json.NewEncoder(w).Encode(all)
}

// recentItem is the wire shape for HandleRecent — a lightweight projection
// of Component tailored to a "recent changes" list (no Frontmatter payload).
type recentItem struct {
	ID        string        `json:"id"`
	Title     string        `json:"title"`
	Type      ComponentType `json:"type"`
	Workspace string        `json:"workspace"`
	UpdatedAt time.Time     `json:"updatedAt"`
	Path      string        `json:"path"`
}

// HandleRecent returns the 50 most recently updated components, newest
// first, for the sidebar's "Recent Changes" view.
// Accepts optional ?offset= and ?limit= query params for pagination.
func (a *API) HandleRecent(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	all := make([]Component, 0, len(a.graph.components))
	for id := range a.graph.components {
		c, _ := a.graph.Component(id)
		all = append(all, c)
	}
	sort.Slice(all, func(i, j int) bool {
		return all[i].UpdatedAt.After(all[j].UpdatedAt)
	})
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	if offset > len(all) {
		all = nil
	} else {
		end := offset + limit
		if end > len(all) {
			end = len(all)
		}
		all = all[offset:end]
	}
	items := make([]recentItem, len(all))
	for i, c := range all {
		items[i] = recentItem{
			ID:        c.ID,
			Title:     c.Title,
			Type:      c.Type,
			Workspace: c.Workspace,
			UpdatedAt: c.UpdatedAt,
			Path:      c.Path,
		}
	}
	json.NewEncoder(w).Encode(items)
}


// HandleCalendarMonth returns a map of days that have artifacts for a given month.
func (a *API) HandleCalendarMonth(w http.ResponseWriter, r *http.Request) {
	year, _ := strconv.Atoi(r.URL.Query().Get("year"))
	month, _ := strconv.Atoi(r.URL.Query().Get("month"))
	if year == 0 || month < 1 || month > 12 {
		today := time.Now()
		year, month = today.Year(), int(today.Month())
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	days := make(map[string]int)
	for id := range a.graph.components {
		c, _ := a.graph.Component(id)
		y, m, d := c.UpdatedAt.Date()
		if y == year && m == time.Month(month) {
			key := fmt.Sprintf("%04d-%02d-%02d", y, m, d)
			days[key]++
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"year":  year,
		"month": month,
		"days":  days,
	})
}

// HandleCalendarDay returns artifacts for a specific day, grouped by type.
func (a *API) HandleCalendarDay(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if date == "" {
		http.Error(w, "missing date", 400)
		return
	}
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		http.Error(w, "invalid date format, use YYYY-MM-DD", 400)
		return
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	type item struct {
		ID        string    `json:"id"`
		Title     string    `json:"title"`
		Type      string    `json:"type"`
		Workspace string    `json:"workspace"`
		Path      string    `json:"path"`
		UpdatedAt time.Time `json:"updatedAt"`
	}
	var items []item
	for id := range a.graph.components {
		c, _ := a.graph.Component(id)
		y, m, d := c.UpdatedAt.Date()
		if y == t.Year() && m == t.Month() && d == t.Day() {
			items = append(items, item{
				ID: id, Title: c.Title, Type: string(c.Type),
				Workspace: c.Workspace, Path: c.Path, UpdatedAt: c.UpdatedAt,
			})
		}
	}
	// Sort by type priority (same order as search)
	typeOrder := map[string]int{
		"knowledge": 0, "report": 1, "design": 2, "spec": 3,
		"plan": 4, "proposal": 5, "tasks": 6, "change": 7,
		"artifact": 8, "diagram": 9,
	}
	sort.Slice(items, func(i, j int) bool {
		oi := typeOrder[items[i].Type]
		oj := typeOrder[items[j].Type]
		if oi != oj {
			return oi < oj
		}
		return items[i].Title < items[j].Title
	})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// graphResponse mirrors index.json+graph.json's on-disk shape (see
// persistIndexCache in index.go) but served live over HTTP so the frontend
// graph view can render actual relationship edges instead of only nodes.
type graphResponse struct {
	Components      []Component    `json:"components"`
	Edges           []Edge         `json:"edges"`
	Communities     map[string]int `json:"communities"`
	CommunityLabels map[int]string `json:"communityLabels"`
}

// HandleGraph returns every component alongside every edge in the graph.
// Edges are enumerated by flattening a.graph.forward's values: BuildGraph
// (graph.go) appends each edge to forward[e.From] exactly once, so summing
// those slices yields every edge in the graph with no duplication — the
// same enumeration persistIndexCache's allEdges slice captures at build
// time, just read back from the live *Graph instead of threaded through
// as a second return value.
func (a *API) HandleGraph(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	components := make([]Component, 0, len(a.graph.components))
	for id := range a.graph.components {
		c, _ := a.graph.Component(id)
		components = append(components, c)
	}
	edges := make([]Edge, 0)
	for _, es := range a.graph.forward {
		edges = append(edges, es...)
	}
	json.NewEncoder(w).Encode(graphResponse{Components: components, Edges: edges, Communities: a.graph.Communities(), CommunityLabels: a.graph.CommunityLabels()})
}

func (a *API) HandleSearch(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	q := strings.ToLower(r.URL.Query().Get("q"))
	w.Header().Set("Content-Type", "application/json")
	var matches []Component
	for id := range a.graph.components {
		c, _ := a.graph.Component(id)
		if strings.Contains(strings.ToLower(c.Title), q) {
			matches = append(matches, c)
		}
	}
	json.NewEncoder(w).Encode(matches)
}

// semanticSearchRequest is the POST /api/wiki/search-semantic request body:
// a free-text query plus how many ranked results to return.
type semanticSearchRequest struct {
	Query string `json:"query"`
	TopK  int    `json:"topK"`
}

// semanticSearchResult is one ranked hit: enough metadata for the frontend
// to render a result row plus the cosine similarity score it was ranked by.
type semanticSearchResult struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Workspace  string  `json:"workspace"`
	Type       string  `json:"type"`
	Similarity float64 `json:"similarity"`
}

// HandleSemanticSearch embeds the query server-side (via the same
// scripts/embed.ts bun script used to build the corpus) and ranks every
// precomputed component embedding against it by cosine similarity. This
// replaces the old client-side flow where the browser fetched the entire
// embeddings corpus and ran @ternlight/mini's WASM encoder locally.
func (a *API) HandleSemanticSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", 405)
		return
	}
	var req semanticSearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", 400)
		return
	}
	if req.Query == "" {
		json.NewEncoder(w).Encode([]semanticSearchResult{})
		return
	}
	// topK=0 means return all results (frontend handles pagination)

	// Embed the query using the same script the offline corpus build uses.
	scriptPath := findEmbedScript()
	queryComps := []Component{{ID: "__query__", Title: req.Query, Path: ""}}
	embedResult, err := ComputeEmbeddings(queryComps, scriptPath)
	if err != nil {
		http.Error(w, "embedding failed: "+err.Error(), 500)
		return
	}
	queryVec, ok := embedResult["__query__"]
	if !ok || len(queryVec) == 0 {
		http.Error(w, "embedding produced no vector", 500)
		return
	}

	a.mu.RLock()
	embeddings := a.graph.Embeddings()
	components := a.graph.Components()
	a.mu.RUnlock()

	type scored struct {
		id   string
		sim  float64
		typ  string
		sortKey float64
	}

	// typeSortOrder: lower = higher priority in search results
	typeSortOrder := map[string]int{
		"knowledge": 0, "report": 1, "design": 2, "spec": 3,
		"plan": 4, "proposal": 5, "tasks": 6, "change": 7,
		"artifact": 8, "diagram": 9,
	}
	var results []scored
	queryNorm := vecNorm(queryVec)
	queryLower := strings.ToLower(req.Query)
	for id, vec := range embeddings {
		sim := cosineSim(queryVec, vec, queryNorm, vecNorm(vec))
		if sim < 0.12 {
			continue
		}
		c, ok := components[id]
		if !ok {
			results = append(results, scored{id: id, sim: sim, typ: ""})
			continue
		}
		// Title keyword boost
		if strings.Contains(strings.ToLower(c.Title), queryLower) {
			sim += 0.6
		}
		// Filename keyword boost (skip common extensions)
		filename := filepath.Base(c.Path)
		ext := filepath.Ext(filename)
		nameOnly := strings.TrimSuffix(filename, ext)
		if strings.Contains(strings.ToLower(nameOnly), queryLower) {
			sim += 0.3
		}
		// Prevent negative similarity floor
		if sim < 0 {
			sim = 0
		}
		// sortKey: type priority first, then similarity inverted for descending sort
		typOrder := typeSortOrder[string(c.Type)]
		sortKey := (1.0 - sim) + float64(typOrder)*0.001
		results = append(results, scored{id: id, sim: sim, typ: string(c.Type), sortKey: sortKey})
	}
	// Fallback: if vector search yields nothing, do title substring match
	if len(results) == 0 {
		for id, c := range components {
			name := strings.TrimSuffix(filepath.Base(c.Path), filepath.Ext(c.Path))
			if strings.Contains(strings.ToLower(c.Title), queryLower) || strings.Contains(strings.ToLower(name), queryLower) {
				results = append(results, scored{id: id, sim: 0.5, typ: string(c.Type)})
			}
		}
	}
	sort.Slice(results, func(i, j int) bool { return results[i].sortKey < results[j].sortKey })

	w.Header().Set("Content-Type", "application/json")
	out := make([]semanticSearchResult, 0, len(results))
	for _, res := range results {
		c, ok := components[res.id]
		if !ok {
			continue
		}
		out = append(out, semanticSearchResult{
			ID:         res.id,
			Title:      c.Title,
			Workspace:  c.Workspace,
			Type:       string(c.Type),
			Similarity: res.sim,
		})
	}
	json.NewEncoder(w).Encode(out)
}

func vecNorm(v []float32) float64 {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	return math.Sqrt(sum)
}

func cosineSim(a, b []float32, normA, normB float64) float64 {
	if normA == 0 || normB == 0 {
		return 0
	}
	var dot float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
	}
	return dot / (normA * normB)
}

// HandleLint normalizes a nil Lint() result to an empty slice before
// encoding. (*Graph).Lint() returns `var issues []LintIssue` unmodified when
// there are zero issues, which is a nil slice — encoding/json serializes nil
// slices as the JSON literal `null`, not `[]`. LintPanel.tsx relies on
// distinguishing "not yet fetched" (state stays null) from "fetched, zero
// issues" (state becomes []), so a raw `null` response for the clean-graph
// case would be indistinguishable from the loading state and the panel would
// never render. This mirrors HandleIndex's existing `make([]Component, 0)`
// pattern above.
func (a *API) HandleLint(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	issues := a.graph.Lint()
	if issues == nil {
		issues = []LintIssue{}
	}
	json.NewEncoder(w).Encode(issues)
}

// Rebuild reruns BuildIndex against the current workspace set (preferring
// the live lister set via SetLister over the construction-time snapshot in
// a.ws) and swaps the result into a.graph under lock. It is safe to call
// from a background goroutine — e.g. main.go kicks off the initial index
// build this way right after NewAPIWithWorkspacesAsync so the HTTP server
// can bind without waiting for a full workspace scan.
func (a *API) Rebuild() error {
	a.mu.RLock()
	lister := a.lister
	ws := a.ws
	a.mu.RUnlock()

	if lister != nil {
		ws = lister.List()
	}

	newGraph, err := BuildIndex(ws, a.indexCacheDir)
	if err != nil {
		return err
	}
	a.mu.Lock()
	a.graph = newGraph
	a.ResetDirty()
	a.mu.Unlock()
	return nil
}

func (a *API) HandleRebuild(w http.ResponseWriter, r *http.Request) {
	if err := a.Rebuild(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "rebuilt"})
}

// HandleSummarize returns an opt-in LLM summary for a component, using a
// single centralized cache directory (~/.comet-panel/wiki/summaries) rather
// than one derived from the component's own path. Deriving the cache dir
// from filepath.Dir(id) would scatter summaries across inconsistent
// locations depending on how deeply nested the component is (e.g. a
// change's design.md vs. a top-level spec vs. a nested artifact would each
// land in a different directory) — this mirrors the centralized
// ~/.comet-panel/wiki/ convention persistIndexCache already established for
// the index cache.
func (a *API) HandleSummarize(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	a.mu.RLock()
	c, ok := a.graph.Component(id)
	a.mu.RUnlock()
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	cacheDir := filepath.Join(os.Getenv("HOME"), ".comet-panel", "wiki", "summaries")
	summary, err := Summarize(r.Context(), c, cacheDir)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"summary": summary})
}

// HandleOverview returns an opt-in LLM-generated overview for a community
// of 3+ members, cached under a single centralized directory
// (~/.comet-panel/wiki/overviews) keyed by membership hash — mirroring the
// HandleSummarize/Summarize convention above, but at the community rather
// than the single-component granularity.
func (a *API) HandleOverview(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("community")
	communityID, err := strconv.Atoi(idStr)
	if idStr == "" || err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	a.mu.RLock()
	communities := a.graph.Communities()
	components := a.graph.Components()
	a.mu.RUnlock()

	var members []Component
	for id, commID := range communities {
		if commID == communityID {
			if c, ok := components[id]; ok {
				members = append(members, c)
			}
		}
	}
	if len(members) < 3 {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	cacheDir := filepath.Join(os.Getenv("HOME"), ".comet-panel", "wiki", "overviews")
	body, err := GenerateOverview(r.Context(), communityID, members, cacheDir)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"body": body})
}

// Neighborhood implements chat.WikiGraphAccessor: it returns changeID's
// direct (1-hop) neighbors — both forward edges and backlinks, so a change
// that is referenced-by another component shows up alongside one it
// references itself — plus the titles of their neighbors (2-hop), capped
// at 20 to keep the injected prompt section bounded.
func (a *API) Neighborhood(changeID string) ([]chat.NeighborInfo, []string) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	var direct []chat.NeighborInfo
	seen := map[string]bool{changeID: true}
	for _, e := range a.graph.Forward(changeID) {
		if c, ok := a.graph.Component(e.To); ok && !seen[e.To] {
			direct = append(direct, chat.NeighborInfo{ID: e.To, Title: c.Title, Kind: e.Kind})
			seen[e.To] = true
		}
	}
	for _, e := range a.graph.Backlinks(changeID) {
		if c, ok := a.graph.Component(e.From); ok && !seen[e.From] {
			direct = append(direct, chat.NeighborInfo{ID: e.From, Title: c.Title, Kind: e.Kind})
			seen[e.From] = true
		}
	}

	var secondHop []string
outer:
	for _, n := range direct {
		for _, e := range a.graph.Forward(n.ID) {
			if seen[e.To] {
				continue
			}
			if c, ok := a.graph.Component(e.To); ok {
				secondHop = append(secondHop, c.Title)
				seen[e.To] = true
				if len(secondHop) >= 20 {
					break outer
				}
			}
		}
	}
	return direct, secondHop
}

// CommunityOverview implements chat.WikiGraphAccessor: it returns the
// cached LLM overview for changeID's community, or "" when the change has
// no community, the community is too small to have one, or no overview has
// been generated yet. It never triggers generation itself (unlike
// HandleOverview) — this is a read-only cache lookup so injecting graph
// context into a chat request never blocks on an LLM call.
func (a *API) CommunityOverview(changeID string) string {
	a.mu.RLock()
	communities := a.graph.Communities()
	components := a.graph.Components()
	a.mu.RUnlock()

	communityID, ok := communities[changeID]
	if !ok {
		return ""
	}

	var members []Component
	for id, commID := range communities {
		if commID == communityID {
			if c, ok := components[id]; ok {
				members = append(members, c)
			}
		}
	}
	if len(members) < 3 {
		return ""
	}

	cacheDir := filepath.Join(a.indexCacheDir, "overviews")
	key := overviewCacheKey(members)
	data, err := os.ReadFile(overviewCachePath(cacheDir, communityID, key))
	if err != nil {
		return ""
	}
	return string(data)
}
