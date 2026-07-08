package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleListWorkspaces_Empty(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))

	req := httptest.NewRequest("GET", "/api/workspaces", nil)
	w := httptest.NewRecorder()
	handleListWorkspaces(w, req, reg)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got []WorkspaceConfig
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("expected empty list, got %+v", got)
	}
}

func TestHandleAddWorkspace_PersistsAndReturns201(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))

	body, _ := json.Marshal(WorkspaceConfig{Alias: "miao", Path: "/x/miao/openspec", Color: "#0063f8"})
	req := httptest.NewRequest("POST", "/api/workspaces", bytes.NewReader(body))
	w := httptest.NewRecorder()
	handleAddWorkspace(w, req, reg)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	if len(reg.List()) != 1 {
		t.Fatalf("expected registry to contain 1 workspace, got %d", len(reg.List()))
	}
}

func TestHandleListChanges_FallsBackToSingleDirWhenNoWorkspacesRegistered(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "changes", "my-change"), 0755)
	writeYAML(t, filepath.Join(dir, "changes", "my-change"), "phase: build\n")

	reg, _ := NewWorkspaceRegistry(filepath.Join(t.TempDir(), "workspaces.yaml")) // empty registry

	req := httptest.NewRequest("GET", "/api/changes", nil)
	w := httptest.NewRecorder()
	handleListChangesMultiWorkspace(w, req, dir, reg)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		Changes []ChangeSummary `json:"changes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Changes) != 1 {
		t.Fatalf("expected fallback to single-dir scan to find 1 change, got %d", len(body.Changes))
	}
}
