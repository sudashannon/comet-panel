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

func TestExtractMarkdownLinks_ResolvesRelativeToFileDir(t *testing.T) {
	root := t.TempDir()
	specDir := filepath.Join(root, "docs", "superpowers", "specs")
	diagramDir := filepath.Join(root, "diagrams", "my-topic")
	os.MkdirAll(specDir, 0755)
	os.MkdirAll(diagramDir, 0755)
	os.WriteFile(filepath.Join(diagramDir, "01-component.svg"), []byte("<svg/>"), 0644)

	specFile := filepath.Join(specDir, "2026-07-09-my-topic-design.md")
	// this is the EXACT bug pattern fixed earlier: 3 levels up from specs/ reaches
	// the workspace root where diagrams/ lives (specs -> superpowers -> docs -> root)
	os.WriteFile(specFile, []byte("![diagram](../../../diagrams/my-topic/01-component.svg)\n"), 0644)

	comp := Component{ID: specFile, Path: specFile, Type: TypeSpec, Workspace: "miao"}
	edges, err := ExtractMarkdownLinks(comp)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 1 {
		t.Fatalf("expected 1 edge, got %d: %+v", len(edges), edges)
	}
	want := filepath.Join(diagramDir, "01-component.svg")
	if edges[0].To != want {
		t.Fatalf("got To=%q, want %q (multi-level ../ must collapse correctly)", edges[0].To, want)
	}
	if edges[0].Source != "markdown-link" {
		t.Fatalf("expected Source=markdown-link, got %q", edges[0].Source)
	}
}

func TestExtractMarkdownLinks_SkipsExternalAndAnchorLinks(t *testing.T) {
	root := t.TempDir()
	f := filepath.Join(root, "doc.md")
	os.WriteFile(f, []byte("[ext](https://example.com/x) [anchor](#section) [rel](./other.md)\n"), 0644)
	os.WriteFile(filepath.Join(root, "other.md"), []byte("# Other\n"), 0644)

	comp := Component{ID: f, Path: f, Type: TypeSpec, Workspace: "miao"}
	edges, err := ExtractMarkdownLinks(comp)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 1 {
		t.Fatalf("expected only the 1 relative-file link to survive, got %d: %+v", len(edges), edges)
	}
	if edges[0].To != filepath.Join(root, "other.md") {
		t.Fatalf("unexpected target: %q", edges[0].To)
	}
}

func TestExtractArtifactConventionLinks_MatchesByTaskNumber(t *testing.T) {
	root := t.TempDir()
	tasksPath := filepath.Join(root, "tasks.md")
	os.WriteFile(tasksPath, []byte("- [ ] Task 1\n- [ ] Task 2\n"), 0644)

	artifactsDir := filepath.Join(root, "artifacts", "my-plan")
	os.MkdirAll(artifactsDir, 0755)
	os.WriteFile(filepath.Join(artifactsDir, "task-01-implementer.md"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(artifactsDir, "task-01-oracle-review.md"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(artifactsDir, "task-02-implementer.md"), []byte("x"), 0644)

	tasksComp := Component{ID: tasksPath, Path: tasksPath, Type: TypeTasks, Workspace: "miao"}
	edges, err := ExtractArtifactConventionLinks(tasksComp, artifactsDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 3 {
		t.Fatalf("expected 3 edges (one per artifact file), got %d: %+v", len(edges), edges)
	}
	for _, e := range edges {
		if e.Kind != "generates" || e.Source != "markdown-link" {
			// Note: reuses "markdown-link" confidence tier — convention-derived,
			// same high-confidence bucket as layer 2, distinct from "yaml".
			t.Fatalf("unexpected edge shape: %+v", e)
		}
	}
}

func TestExtractArtifactConventionLinks_MissingDirReturnsNoEdges(t *testing.T) {
	root := t.TempDir()
	tasksPath := filepath.Join(root, "tasks.md")
	tasksComp := Component{ID: tasksPath, Path: tasksPath, Type: TypeTasks, Workspace: "miao"}
	edges, err := ExtractArtifactConventionLinks(tasksComp, filepath.Join(root, "nonexistent"))
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 0 {
		t.Fatalf("expected 0 edges, got %d", len(edges))
	}
}
