package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractYAMLLinks_DesignDocAndPlan(t *testing.T) {
	root := t.TempDir()
	changeDir := filepath.Join(root, "openspec", "changes", "my-change")
	os.MkdirAll(changeDir, 0755)
	os.WriteFile(filepath.Join(changeDir, ".comet.yaml"), []byte(`
design_doc: docs/superpowers/specs/2026-07-09-my-change-design.md
plan: docs/superpowers/plans/2026-07-09-my-change.md
`), 0644)

	edges, err := ExtractYAMLLinks(changeDir, root)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 2 {
		t.Fatalf("expected 2 edges, got %d: %+v", len(edges), edges)
	}
	for _, e := range edges {
		if e.Source != "yaml" {
			t.Fatalf("expected Source=yaml, got %q", e.Source)
		}
		if e.From != filepath.Join(changeDir, ".comet.yaml") {
			t.Fatalf("unexpected From: %q", e.From)
		}
	}
}

func TestExtractYAMLLinks_BareFilenameResolvesToChangeDir(t *testing.T) {
	root := t.TempDir()
	changeDir := filepath.Join(root, "openspec", "changes", "my-change")
	os.MkdirAll(changeDir, 0755)
	os.WriteFile(filepath.Join(changeDir, ".comet.yaml"), []byte("design_doc: design.md\n"), 0644)

	edges, err := ExtractYAMLLinks(changeDir, root)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 1 || edges[0].To != filepath.Join(changeDir, "design.md") {
		t.Fatalf("expected bare filename resolved to change dir, got %+v", edges)
	}
}
