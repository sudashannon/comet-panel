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

	// The workspace Path must be a real, existing directory now that
	// validateWorkspacePath rejects non-existent paths at Add() time.
	miaoPath := filepath.Join(t.TempDir(), "miao", "openspec")
	os.MkdirAll(miaoPath, 0755)
	body, _ := json.Marshal(WorkspaceConfig{Alias: "miao", Path: miaoPath, Color: "#0063f8"})
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

// TestHandleGetArtifact_SiblingPrefixEscapeBlocked exercises the exact
// vulnerability flagged in review: strings.HasPrefix(absPath, rootAbs) does
// a plain string-prefix comparison, so a sibling directory whose name is
// prefixed by the workspace root's name (e.g. "<root>-evil") satisfies the
// old guard even though it is NOT inside the workspace. This must be
// rejected with 403.
func TestHandleGetArtifact_SiblingPrefixEscapeBlocked(t *testing.T) {
	base := t.TempDir()
	// The traversal guard's root is the PARENT of the resolved workspace
	// dir (openspecPath's parent), so nest the registered path one level
	// deep: rootAbs will resolve to base/ws, and base/ws-evil is a sibling
	// of "ws" at that same level — exactly the string-prefix collision
	// strings.HasPrefix("/base/ws-evil", "/base/ws") falsely allows.
	wsRoot := filepath.Join(base, "ws")
	openspecDir := filepath.Join(wsRoot, "openspec")
	os.MkdirAll(openspecDir, 0755)

	evilRoot := filepath.Join(base, "ws-evil")
	os.MkdirAll(evilRoot, 0755)
	secret := filepath.Join(evilRoot, "secret.txt")
	os.WriteFile(secret, []byte("top-secret"), 0644)

	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))
	reg.Add(WorkspaceConfig{Alias: "w", Path: openspecDir, Color: "#000"})

	req := httptest.NewRequest("GET", "/api/artifact?workspace=w&path="+secret, nil)
	w := httptest.NewRecorder()
	handleGetArtifact(w, req, "unused-default", reg)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for sibling-prefix path escape (ws vs ws-evil), got %d: %s", w.Code, w.Body.String())
	}
}

// TestWorkspaceRegistry_Add_RejectsRootPath ensures registering "/" (or any
// non-absolute / non-existent path) as a workspace is rejected outright,
// since an unvalidated root path makes the traversal guard a no-op and
// permits reading arbitrary files on the host.
func TestWorkspaceRegistry_Add_RejectsRootPath(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))

	if err := reg.Add(WorkspaceConfig{Alias: "root", Path: "/", Color: "#000"}); err == nil {
		t.Fatal("expected Add to reject Path \"/\", got nil error")
	}
	if len(reg.List()) != 0 {
		t.Fatalf("expected registry to remain empty after rejected root path, got %d", len(reg.List()))
	}
}

func TestWorkspaceRegistry_Add_RejectsNonAbsolutePath(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))

	if err := reg.Add(WorkspaceConfig{Alias: "rel", Path: "relative/path", Color: "#000"}); err == nil {
		t.Fatal("expected Add to reject a non-absolute Path, got nil error")
	}
}

func TestWorkspaceRegistry_Add_RejectsNonExistentPath(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))

	if err := reg.Add(WorkspaceConfig{Alias: "ghost", Path: filepath.Join(dir, "does-not-exist"), Color: "#000"}); err == nil {
		t.Fatal("expected Add to reject a non-existent Path, got nil error")
	}
}

func TestHandleAddWorkspace_RootPathReturns400(t *testing.T) {
	dir := t.TempDir()
	reg, _ := NewWorkspaceRegistry(filepath.Join(dir, "workspaces.yaml"))

	body, _ := json.Marshal(WorkspaceConfig{Alias: "root", Path: "/", Color: "#000"})
	req := httptest.NewRequest("POST", "/api/workspaces", bytes.NewReader(body))
	w := httptest.NewRecorder()
	handleAddWorkspace(w, req, reg)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for root path workspace registration, got %d: %s", w.Code, w.Body.String())
	}
}
