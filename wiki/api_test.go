package wiki

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
