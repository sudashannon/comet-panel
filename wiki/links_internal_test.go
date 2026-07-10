package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractChangeInternalLinks(t *testing.T) {
	dir := t.TempDir()

	// Create sibling files
	os.WriteFile(filepath.Join(dir, "proposal.md"), []byte("# Proposal\n"), 0644)
	os.WriteFile(filepath.Join(dir, "design.md"), []byte("# Design\n"), 0644)
	os.WriteFile(filepath.Join(dir, "tasks.md"), []byte("# Tasks\n"), 0644)
	specDir := filepath.Join(dir, "specs", "my-spec")
	os.MkdirAll(specDir, 0755)
	os.WriteFile(filepath.Join(specDir, "spec.md"), []byte("# Spec\n"), 0644)

	edges := ExtractChangeInternalLinks(dir)

	// Expected: proposal→design, design→tasks, tasks→spec
	if len(edges) < 3 {
		t.Errorf("expected at least 3 internal edges, got %d", len(edges))
	}

	// Verify kinds and source
	for _, e := range edges {
		if e.Source != "convention-internal" {
			t.Errorf("edge source = %q, want convention-internal", e.Source)
		}
		if e.Kind != "generates" && e.Kind != "implements" {
			t.Errorf("edge kind = %q, want generates or implements", e.Kind)
		}
	}

	// Verify specific edges exist
	proposalPath := filepath.Join(dir, "proposal.md")
	designPath := filepath.Join(dir, "design.md")
	tasksPath := filepath.Join(dir, "tasks.md")
	specPath := filepath.Join(specDir, "spec.md")

	assertEdge(t, edges, proposalPath, designPath, "generates")
	assertEdge(t, edges, designPath, tasksPath, "generates")
	assertEdge(t, edges, tasksPath, specPath, "implements")
}

func TestExtractChangeInternalLinks_PartialFiles(t *testing.T) {
	dir := t.TempDir()
	// Only proposal + design, no tasks
	os.WriteFile(filepath.Join(dir, "proposal.md"), []byte("# P\n"), 0644)
	os.WriteFile(filepath.Join(dir, "design.md"), []byte("# D\n"), 0644)

	edges := ExtractChangeInternalLinks(dir)
	if len(edges) != 1 {
		t.Errorf("expected 1 edge (proposal→design), got %d", len(edges))
	}
}

func assertEdge(t *testing.T, edges []Edge, from, to, kind string) {
	t.Helper()
	for _, e := range edges {
		if e.From == from && e.To == to && e.Kind == kind {
			return
		}
	}
	t.Errorf("missing edge %s --%s--> %s", filepath.Base(from), kind, filepath.Base(to))
}
