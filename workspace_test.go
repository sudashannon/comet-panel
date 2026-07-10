package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadWorkspaces(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "workspaces.yaml")
	content := `
workspaces:
  - alias: miao
    path: /home/shanl/workspace/miao/openspec
    color: "#0063f8"
  - alias: wan2_2_deploy
    path: /home/shanl/workspace/wan2_2_deploy/openspec
    color: "#16a34a"
`
	if err := os.WriteFile(cfgPath, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	ws, err := LoadWorkspaces(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(ws) != 2 {
		t.Fatalf("expected 2 workspaces, got %d", len(ws))
	}
	if ws[0].Alias != "miao" || ws[0].Path != "/home/shanl/workspace/miao/openspec" || ws[0].Color != "#0063f8" {
		t.Fatalf("workspace[0] mismatch: %+v", ws[0])
	}
}

func TestLoadWorkspaces_MissingFileReturnsEmpty(t *testing.T) {
	ws, err := LoadWorkspaces(filepath.Join(t.TempDir(), "nonexistent.yaml"))
	if err != nil {
		t.Fatalf("expected no error for missing config, got %v", err)
	}
	if len(ws) != 0 {
		t.Fatalf("expected empty slice, got %d entries", len(ws))
	}
}

func TestWorkspaceRegistry_AddPersistsAndUpdatesMemory(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "workspaces.yaml")

	reg, err := NewWorkspaceRegistry(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(reg.List()) != 0 {
		t.Fatalf("expected empty registry, got %d", len(reg.List()))
	}

	miaoPath := filepath.Join(t.TempDir(), "miao", "openspec")
	if err := os.MkdirAll(filepath.Join(miaoPath, "changes"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := reg.Add(WorkspaceConfig{Alias: "miao", Path: miaoPath, Color: "#0063f8"}); err != nil {
		t.Fatal(err)
	}

	// in-memory reflects the addition immediately
	if len(reg.List()) != 1 || reg.List()[0].Alias != "miao" {
		t.Fatalf("expected in-memory registry to contain 'miao', got %+v", reg.List())
	}

	// a fresh load from disk also reflects it (proves it was persisted)
	reloaded, err := LoadWorkspaces(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(reloaded) != 1 || reloaded[0].Alias != "miao" {
		t.Fatalf("expected persisted config to contain 'miao', got %+v", reloaded)
	}
}

func TestWorkspaceRegistry_AddDuplicateAliasRejected(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))
	pathX := filepath.Join(t.TempDir(), "x")
	pathY := filepath.Join(t.TempDir(), "y")
	os.MkdirAll(filepath.Join(pathX, "changes"), 0755)
	os.MkdirAll(filepath.Join(pathY, "changes"), 0755)
	if err := reg.Add(WorkspaceConfig{Alias: "miao", Path: pathX, Color: "#000"}); err != nil {
		t.Fatalf("expected first Add to succeed, got %v", err)
	}
	err := reg.Add(WorkspaceConfig{Alias: "miao", Path: pathY, Color: "#111"})
	if err == nil {
		t.Fatal("expected an error when adding a duplicate alias")
	}
}

func TestValidateWorkspacePath_RejectsDirWithoutChangesDir(t *testing.T) {
	// An existing, absolute, non-root directory with neither "changes/"
	// nor "openspec/changes/" must be rejected — this is the new add-time
	// guard against silently registering an unreadable workspace.
	dir := filepath.Join(t.TempDir(), "empty-workspace")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	err := validateWorkspacePath(dir)
	if err == nil {
		t.Fatal("expected an error for a workspace dir with no changes/ nor openspec/changes/")
	}
	if !strings.Contains(err.Error(), "openspec/changes") {
		t.Fatalf("expected error to mention openspec/changes, got: %v", err)
	}
}

func TestValidateWorkspacePath_AcceptsDirWithChangesSubdir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "flat-workspace")
	if err := os.MkdirAll(filepath.Join(dir, "changes"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := validateWorkspacePath(dir); err != nil {
		t.Fatalf("expected nil error for a dir with changes/, got %v", err)
	}
}

func TestValidateWorkspacePath_AcceptsRepoRootWithOpenspecChangesSubdir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "repo-root-workspace")
	if err := os.MkdirAll(filepath.Join(dir, "openspec", "changes"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := validateWorkspacePath(dir); err != nil {
		t.Fatalf("expected nil error for a dir with openspec/changes/, got %v", err)
	}
}
