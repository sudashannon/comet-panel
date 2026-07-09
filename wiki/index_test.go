package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildIndex_EndToEnd(t *testing.T) {
	root := t.TempDir()
	openspecDir := filepath.Join(root, "openspec")
	changeDir := filepath.Join(openspecDir, "changes", "my-change")
	os.MkdirAll(changeDir, 0755)
	os.WriteFile(filepath.Join(changeDir, "proposal.md"), []byte("# Proposal\n"), 0644)
	os.WriteFile(filepath.Join(changeDir, ".comet.yaml"), []byte("design_doc: design.md\n"), 0644)
	os.WriteFile(filepath.Join(changeDir, "design.md"), []byte("# Design\n"), 0644)

	ws := []WorkspaceConfig{{Alias: "miao", Path: openspecDir, Color: "#0063f8"}}
	g, err := BuildIndex(ws, "")
	if err != nil {
		t.Fatal(err)
	}

	designPath := filepath.Join(changeDir, "design.md")
	if _, ok := g.Component(designPath); !ok {
		t.Fatalf("expected design.md to be indexed as a component")
	}
	back := g.Backlinks(designPath)
	if len(back) != 1 {
		t.Fatalf("expected 1 backlink to design.md (from .comet.yaml), got %+v", back)
	}
}
