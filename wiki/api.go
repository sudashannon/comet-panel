package wiki

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"comet-ui/chat"
)

type API struct {
	mu            sync.RWMutex
	graph         *Graph
	ws            []WorkspaceConfig
	indexCacheDir string
	lister        WorkspaceLister
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
