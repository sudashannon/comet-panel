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

func TestHandleGetChange_RoutesViaWorkspaceAlias(t *testing.T) {
	wsA := t.TempDir()
	openspecA := filepath.Join(wsA, "openspec")
	os.MkdirAll(filepath.Join(openspecA, "changes", "change-a"), 0755)
	writeYAML(t, filepath.Join(openspecA, "changes", "change-a"), "phase: build\n")

	wsB := t.TempDir()
	openspecB := filepath.Join(wsB, "openspec")
	os.MkdirAll(filepath.Join(openspecB, "changes", "change-a"), 0755)
	writeYAML(t, filepath.Join(openspecB, "changes", "change-a"), "phase: design\n")

	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))
	reg.Add(WorkspaceConfig{Alias: "a", Path: openspecA, Color: "#000"})
	reg.Add(WorkspaceConfig{Alias: "b", Path: openspecB, Color: "#111"})

	req := httptest.NewRequest("GET", "/api/changes/change-a?workspace=b", nil)
	w := httptest.NewRecorder()
	handleGetChange(w, req, "unused-default", reg)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var detail ChangeDetail
	if err := json.Unmarshal(w.Body.Bytes(), &detail); err != nil {
		t.Fatal(err)
	}
	if detail.Phase != "design" {
		t.Fatalf("expected change-a resolved from workspace b (phase=design), got phase=%q", detail.Phase)
	}
}

func TestHandleGetChange_FallsBackToBaseDirWhenNoWorkspaceParam(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "changes", "my-change"), 0755)
	writeYAML(t, filepath.Join(dir, "changes", "my-change"), "phase: build\n")

	reg, _ := NewWorkspaceRegistry(filepath.Join(t.TempDir(), "workspaces.yaml"))
	reg.Add(WorkspaceConfig{Alias: "other", Path: t.TempDir(), Color: "#000"})

	req := httptest.NewRequest("GET", "/api/changes/my-change", nil)
	w := httptest.NewRecorder()
	handleGetChange(w, req, dir, reg)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 falling back to baseDir, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleGetChange_UnregisteredWorkspaceAliasReturns400(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))

	req := httptest.NewRequest("GET", "/api/changes/my-change?workspace=ghost", nil)
	w := httptest.NewRecorder()
	handleGetChange(w, req, ".", reg)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unregistered workspace alias, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleGetArtifact_TraversalGuardUsesResolvedWorkspaceRoot(t *testing.T) {
	wsA := t.TempDir()
	openspecA := filepath.Join(wsA, "openspec")
	os.MkdirAll(openspecA, 0755)
	secretA := filepath.Join(wsA, "secret-a.txt")
	os.WriteFile(secretA, []byte("secret-a"), 0644)

	wsB := t.TempDir()
	openspecB := filepath.Join(wsB, "openspec")
	os.MkdirAll(openspecB, 0755)
	secretB := filepath.Join(wsB, "secret-b.txt")
	os.WriteFile(secretB, []byte("secret-b"), 0644)

	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))
	reg.Add(WorkspaceConfig{Alias: "a", Path: openspecA, Color: "#000"})
	reg.Add(WorkspaceConfig{Alias: "b", Path: openspecB, Color: "#111"})

	// Requesting workspace a's artifact while trying to path-escape into
	// workspace b's secret must be rejected — the guard must be recomputed
	// from the resolved workspace root (wsA), not from baseDir.
	req := httptest.NewRequest("GET", "/api/artifact?workspace=a&path="+secretB, nil)
	w := httptest.NewRecorder()
	handleGetArtifact(w, req, "unused-default", reg)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 cross-workspace escape rejected, got %d: %s", w.Code, w.Body.String())
	}

	// A legitimate in-workspace artifact request must still succeed.
	req2 := httptest.NewRequest("GET", "/api/artifact?workspace=a&path="+secretA, nil)
	w2 := httptest.NewRecorder()
	handleGetArtifact(w2, req2, "unused-default", reg)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 for in-workspace artifact, got %d: %s", w2.Code, w2.Body.String())
	}
}
