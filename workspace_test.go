package main

import (
	"os"
	"path/filepath"
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
