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

	// The change directory itself must be a TypeChange component keyed by
	// its .comet.yaml path — that's the From endpoint ExtractYAMLLinks
	// uses for edges, so without this node the change has no identity in
	// the graph and BacklinksPanel can never resolve it (Phase③ closeout).
	yamlPath := filepath.Join(changeDir, ".comet.yaml")
	changeComp, ok := g.Component(yamlPath)
	if !ok {
		t.Fatalf("expected a component for the change directory keyed by %s", yamlPath)
	}
	if changeComp.Type != TypeChange {
		t.Fatalf("expected change component Type to be TypeChange, got %q", changeComp.Type)
	}
	if changeComp.Title != "my-change" {
		t.Fatalf("expected change component Title to be %q, got %q", "my-change", changeComp.Title)
	}

	// And it must have a resolvable forward edge to design.md, since that's
	// the whole point: the change node is now a real graph endpoint.
	fwd := g.Forward(yamlPath)
	if len(fwd) != 1 || fwd[0].To != designPath {
		t.Fatalf("expected 1 forward edge from change component to design.md, got %+v", fwd)
	}
}
