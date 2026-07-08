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
