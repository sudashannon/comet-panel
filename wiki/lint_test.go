package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLint_OrphanDetection(t *testing.T) {
	orphan := Component{ID: "orphan", Title: "Orphan", Type: TypeSpec}
	linked := Component{ID: "linked", Title: "Linked", Type: TypeSpec}
	root := Component{ID: "root", Title: "Root Change", Type: TypeChange}

	g := BuildGraph(
		[]Component{orphan, linked, root},
		[]Edge{{From: "root", To: "linked", Kind: "references", Source: "yaml"}},
	)

	issues := g.Lint()
	found := false
	for _, i := range issues {
		if i.Rule == "orphan" && i.ComponentID == "orphan" {
			found = true
		}
		if i.ComponentID == "root" && i.Rule == "orphan" {
			t.Fatal("root-level change nodes must be excluded from orphan detection")
		}
	}
	if !found {
		t.Fatal("expected an orphan issue for the disconnected component")
	}
}

func TestLint_DeadLinkDetection(t *testing.T) {
	src := Component{ID: "src", Title: "Src", Type: TypeSpec}
	g := BuildGraph(
		[]Component{src},
		[]Edge{{From: "src", To: "/does/not/exist.md", Kind: "references", Source: "markdown-link"}},
	)
	issues := g.Lint()
	found := false
	for _, i := range issues {
		if i.Rule == "dead-link" && i.ComponentID == "src" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a dead-link issue for an edge pointing to an unindexed component")
	}
}

func TestLint_DuplicateTitleDetection(t *testing.T) {
	a := Component{ID: "a", Title: "Same Title", Type: TypeSpec}
	b := Component{ID: "b", Title: "Same Title", Type: TypeSpec}
	g := BuildGraph([]Component{a, b}, nil)
	issues := g.Lint()
	found := false
	for _, i := range issues {
		if i.Rule == "duplicate" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a duplicate-title issue")
	}
}

func TestLint_ArchivePathExcludedFromOrphans(t *testing.T) {
	archived := Component{
		ID:    "archived",
		Title: "Archived Doc",
		Type:  TypeSpec,
		Path:  "/repo/openspec/changes/archive/2025-01-old-change/spec.md",
	}
	g := BuildGraph([]Component{archived}, nil)

	issues := g.Lint()
	for _, i := range issues {
		if i.Rule == "orphan" && i.ComponentID == "archived" {
			t.Fatal("components whose Path contains /archive/ must be excluded from orphan detection")
		}
	}
}

func TestLint_FilenameFallbackDuplicatesExcluded(t *testing.T) {
	a := Component{ID: "a", Title: "spec", Type: TypeSpec, Path: "/repo/changes/change-a/spec.md"}
	b := Component{ID: "b", Title: "spec", Type: TypeSpec, Path: "/repo/changes/change-b/spec.md"}
	g := BuildGraph([]Component{a, b}, nil)

	issues := g.Lint()
	for _, i := range issues {
		if i.Rule == "duplicate" {
			t.Fatalf("filename-fallback titles (Title == filename without .md) must not be flagged as duplicates, got %+v", i)
		}
	}
}

func TestLint_TaskArtifactMissing_CountsPerTaskNumberNotRawFileCount(t *testing.T) {
	root := t.TempDir()
	tasksPath := filepath.Join(root, "tasks.md")
	// 2 tasks declared
	os.WriteFile(tasksPath, []byte("- [ ] Task 1\n- [ ] Task 2\n"), 0644)

	artifactsDir := filepath.Join(root, "artifacts", "my-plan")
	os.MkdirAll(artifactsDir, 0755)
	// task 1 has TWO role files (implementer + oracle-review) — must not be
	// miscounted as "2 tasks done" when task 2 has ZERO files (the exact bug
	// fixed in the design doc's self-review: raw file count vs task count).
	os.WriteFile(filepath.Join(artifactsDir, "task-01-implementer.md"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(artifactsDir, "task-01-oracle-review.md"), []byte("x"), 0644)

	tasksComp := Component{ID: tasksPath, Path: tasksPath, Type: TypeTasks}
	g := BuildGraph([]Component{tasksComp}, nil)

	issues := g.LintTaskArtifacts(tasksComp, artifactsDir, 2) // 2 tasks total
	if len(issues) != 1 {
		t.Fatalf("expected exactly 1 missing-task issue (task 2), got %d: %+v", len(issues), issues)
	}
	if issues[0].Detail != "task 2" {
		t.Fatalf("expected the missing task to be identified as 'task 2', got %+v", issues[0])
	}
}
