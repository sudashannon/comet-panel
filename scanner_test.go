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
