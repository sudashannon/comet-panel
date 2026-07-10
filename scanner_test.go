package main

import (
	"os"
	"path/filepath"
	"testing"
)

func writeYAML(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, ".comet.yaml"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestParseCometYAML_ReviewAndLifecycleFields(t *testing.T) {
	dir := t.TempDir()
	writeYAML(t, dir, `
phase: build
visualized: true
design_reviewed: true
verify_reviewed: false
created_at: 2026-07-01
verified_at: null
build_mode: subagent-driven-development
review_mode: standard
tdd_mode: direct
auto_transition: true
`)
	cy, err := parseCometYAML(filepath.Join(dir, ".comet.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if !cy.Visualized || !cy.DesignReviewed || cy.VerifyReviewed {
		t.Fatalf("review flags mismatch: %+v", cy)
	}
	if cy.CreatedAt != "2026-07-01" || cy.VerifiedAt != "" {
		t.Fatalf("lifecycle fields mismatch: %+v", cy)
	}
	if cy.BuildMode != "subagent-driven-development" || cy.ReviewMode != "standard" || cy.TddMode != "direct" {
		t.Fatalf("mode fields mismatch: %+v", cy)
	}
	if !cy.AutoTransition {
		t.Fatalf("auto_transition mismatch: %+v", cy)
	}
}

func TestStateWarning_ArchivedTrueButPhaseNotArchive(t *testing.T) {
	got := computeStateWarning(true, "build")
	if got == "" {
		t.Fatal("expected a warning, got none")
	}
}

func TestStateWarning_PhaseArchiveButNotArchived(t *testing.T) {
	got := computeStateWarning(false, "archive")
	if got == "" {
		t.Fatal("expected a warning, got none")
	}
}

func TestStateWarning_Consistent(t *testing.T) {
	if got := computeStateWarning(false, "build"); got != "" {
		t.Fatalf("expected no warning, got %q", got)
	}
	if got := computeStateWarning(true, "archive"); got != "" {
		t.Fatalf("expected no warning, got %q", got)
	}
}

func TestPhaseStatus_KnownPhase(t *testing.T) {
	cases := []struct {
		target, want string
	}{
		{"open", "completed"},
		{"design", "completed"},
		{"build", "current"},
		{"verify", "pending"},
		{"archive", "pending"},
	}
	for _, c := range cases {
		if got := phaseStatus("build", c.target); got != c.want {
			t.Errorf("phaseStatus(%q, %q) = %q, want %q", "build", c.target, got, c.want)
		}
	}
}

func TestPhaseStatus_UnknownActualPhase(t *testing.T) {
	// A change with no .comet.yaml (or an unrecognized phase value) must not
	// fabricate "open" (index 0 default) — that misleadingly presents a
	// possibly far-along change as "just started". Every target phase
	// should come back "unknown" instead.
	for _, target := range []string{"open", "design", "build", "verify", "archive"} {
		if got := phaseStatus("", target); got != "unknown" {
			t.Errorf("phaseStatus(%q, %q) = %q, want %q", "", target, got, "unknown")
		}
		if got := phaseStatus("not-a-real-phase", target); got != "unknown" {
			t.Errorf("phaseStatus(%q, %q) = %q, want %q", "not-a-real-phase", target, got, "unknown")
		}
	}
}

func TestScanWorkspaceChanges_TagsWorkspaceAlias(t *testing.T) {
	dir := t.TempDir()
	changesDir := filepath.Join(dir, "changes")
	os.MkdirAll(filepath.Join(changesDir, "my-change"), 0755)
	writeYAML(t, filepath.Join(changesDir, "my-change"), "phase: build\n")

	ws := WorkspaceConfig{Alias: "miao", Path: dir, Color: "#0063f8"}
	summaries, err := scanWorkspaceChanges(ws)
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 1 || summaries[0].Workspace != "miao" {
		t.Fatalf("expected 1 change tagged with workspace 'miao', got %+v", summaries)
	}
}

func TestScanAllWorkspaces_AggregatesAndSkipsUnreadable(t *testing.T) {
	dir := t.TempDir()
	changesDir := filepath.Join(dir, "changes")
	os.MkdirAll(filepath.Join(changesDir, "my-change"), 0755)
	writeYAML(t, filepath.Join(changesDir, "my-change"), "phase: build\n")

	registry := []WorkspaceConfig{
		{Alias: "good", Path: dir, Color: "#0063f8"},
		{Alias: "broken", Path: "/nonexistent/path/does/not/exist", Color: "#dc2626"},
	}
	summaries, failed := scanAllWorkspaces(registry)
	if len(summaries) != 1 {
		t.Fatalf("expected 1 change from the readable workspace, got %d", len(summaries))
	}
	if summaries[0].Workspace != "good" {
		t.Fatalf("expected workspace tag 'good', got %q", summaries[0].Workspace)
	}
	if len(failed) != 1 || failed[0] != "broken" {
		t.Fatalf("expected failedAliases=['broken'], got %+v", failed)
	}
}

func TestScanAllChanges_ToleratesRepoRootPath(t *testing.T) {
	// A workspace registered as the repo ROOT (no changes/ directly under
	// it) but with an openspec/changes/ subtree must still be scanned by
	// descending into openspec/ — this is the tolerance behavior under test.
	repoRoot := t.TempDir()
	changeDir := filepath.Join(repoRoot, "openspec", "changes", "add-thing")
	os.MkdirAll(changeDir, 0755)
	writeYAML(t, changeDir, "phase: build\n")
	os.WriteFile(filepath.Join(changeDir, "tasks.md"), []byte("- [x] one\n- [ ] two\n"), 0644)

	summaries, err := scanAllChanges(repoRoot)
	if err != nil {
		t.Fatalf("expected repo-root path to be tolerated, got error: %v", err)
	}
	if len(summaries) != 1 || summaries[0].Name != "add-thing" {
		t.Fatalf("expected 1 change named 'add-thing' found via openspec/changes descent, got %+v", summaries)
	}
	if summaries[0].TasksCompleted != 1 || summaries[0].TasksTotal != 2 {
		t.Fatalf("expected tasks 1/2 (proves tasks.md was read from the descended dir), got %d/%d",
			summaries[0].TasksCompleted, summaries[0].TasksTotal)
	}
}

func TestScanAllChanges_OpenspecDirPathUnchanged(t *testing.T) {
	// Regression: when baseDir already IS the openspec dir (has changes/
	// directly), the pre-existing behavior must be unaffected by the new
	// descend logic — it must not accidentally look for baseDir/openspec.
	openspecDir := t.TempDir()
	changeDir := filepath.Join(openspecDir, "changes", "my-change")
	os.MkdirAll(changeDir, 0755)
	writeYAML(t, changeDir, "phase: design\n")

	summaries, err := scanAllChanges(openspecDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 1 || summaries[0].Name != "my-change" {
		t.Fatalf("expected 1 change 'my-change' unaffected by descend logic, got %+v", summaries)
	}
}

func TestScanAllChanges_NeitherDirExists_ReturnsErrorNoPanic(t *testing.T) {
	// Neither baseDir/changes nor baseDir/openspec/changes exists: must
	// surface the original os.ReadDir error rather than panic or silently
	// succeed with an empty result.
	dir := t.TempDir()
	summaries, err := scanAllChanges(dir)
	if err == nil {
		t.Fatalf("expected an error when neither changes/ nor openspec/changes/ exists, got summaries=%+v", summaries)
	}
}
