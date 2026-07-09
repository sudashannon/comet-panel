package wiki

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHandleWikiComponent_ReturnsBacklinks(t *testing.T) {
	root := t.TempDir()
	openspecDir := filepath.Join(root, "openspec")
	changeDir := filepath.Join(openspecDir, "changes", "my-change")
	os.MkdirAll(changeDir, 0755)
	os.WriteFile(filepath.Join(changeDir, ".comet.yaml"), []byte("design_doc: design.md\n"), 0644)
	os.WriteFile(filepath.Join(changeDir, "design.md"), []byte("# Design\n"), 0644)

	g, _ := BuildIndex([]WorkspaceConfig{{Alias: "miao", Path: openspecDir}}, "")
	api := NewAPI(g)

	designPath := filepath.Join(changeDir, "design.md")
	req := httptest.NewRequest("GET", "/api/wiki/component/x?id="+designPath, nil)
	w := httptest.NewRecorder()
	api.HandleComponent(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleWikiComponent_NotFoundReturns404(t *testing.T) {
	g := BuildGraph(nil, nil)
	api := NewAPI(g)
	req := httptest.NewRequest("GET", "/api/wiki/component/x?id=/nonexistent", nil)
	w := httptest.NewRecorder()
	api.HandleComponent(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestHandleLint_ReturnsIssues(t *testing.T) {
	orphan := Component{ID: "orphan", Title: "Orphan", Type: TypeSpec}
	g := BuildGraph([]Component{orphan}, nil)
	api := NewAPI(g)

	req := httptest.NewRequest("GET", "/api/wiki/lint", nil)
	w := httptest.NewRecorder()
	api.HandleLint(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var issues []LintIssue
	json.NewDecoder(w.Body).Decode(&issues)
	if len(issues) == 0 {
		t.Fatal("expected at least the orphan issue")
	}
}

// TestHandleLint_CleanGraphReturnsEmptyArrayNotNull guards against a subtle
// nil-vs-null bug: (*Graph).Lint() returns a nil slice when there are zero
// issues (Go's `var issues []LintIssue` never gets appended to), and encoding/json
// serializes a nil slice as the JSON literal `null`, not `[]`. LintPanel.tsx
// uses `useState<LintIssue[] | null>(null)` to distinguish "not yet fetched"
// from "fetched, zero issues" — if the handler ever regresses to encoding the
// raw nil slice, a clean wiki would decode to `null` and get stuck rendering
// nothing forever instead of showing "未发现问题". We assert on the raw
// response bytes (not a JSON-decoded value) because decoding `null` into a Go
// slice also yields nil/empty, which would mask this exact bug.
func TestHandleLint_CleanGraphReturnsEmptyArrayNotNull(t *testing.T) {
	root := Component{ID: "root", Title: "Root Change", Type: TypeChange}
	linked := Component{ID: "linked", Title: "Linked", Type: TypeSpec}
	g := BuildGraph(
		[]Component{root, linked},
		[]Edge{{From: "root", To: "linked", Kind: "references", Source: "yaml"}},
	)
	api := NewAPI(g)

	req := httptest.NewRequest("GET", "/api/wiki/lint", nil)
	w := httptest.NewRecorder()
	api.HandleLint(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	body := strings.TrimSpace(w.Body.String())
	if body != "[]" {
		t.Fatalf("expected raw response body to be the empty JSON array literal \"[]\" for a clean graph, got %q", body)
	}
}
