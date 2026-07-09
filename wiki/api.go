package wiki

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type API struct {
	mu            sync.RWMutex
	graph         *Graph
	ws            []WorkspaceConfig
	indexCacheDir string
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
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(componentResponse{
		Component: c,
		Forward:   a.graph.Forward(id),
		Backlinks: a.graph.Backlinks(id),
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

func (a *API) HandleRebuild(w http.ResponseWriter, r *http.Request) {
	newGraph, err := BuildIndex(a.ws, a.indexCacheDir)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	a.mu.Lock()
	a.graph = newGraph
	a.mu.Unlock()
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
