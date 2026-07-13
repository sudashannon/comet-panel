package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestHandleBookmarks_GetEmpty(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bookmarks.json")
	req := httptest.NewRequest(http.MethodGet, "/api/bookmarks", nil)
	rec := httptest.NewRecorder()
	handleBookmarksAt(rec, req, path)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []Bookmark
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("expected empty list, got %d", len(got))
	}
}

func TestHandleBookmarks_PostAddsAndDedupes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bookmarks.json")
	b := Bookmark{Path: "/x/design.md", Title: "Design", Type: "design"}
	body, _ := json.Marshal(b)

	req := httptest.NewRequest(http.MethodPost, "/api/bookmarks", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handleBookmarksAt(rec, req, path)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Posting the same path again must not duplicate the entry.
	req2 := httptest.NewRequest(http.MethodPost, "/api/bookmarks", bytes.NewReader(body))
	rec2 := httptest.NewRecorder()
	handleBookmarksAt(rec2, req2, path)

	var got []Bookmark
	if err := json.Unmarshal(rec2.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 bookmark after dedup, got %d", len(got))
	}
	if got[0].Path != "/x/design.md" || got[0].StarredAt == "" {
		t.Fatalf("unexpected bookmark: %+v", got[0])
	}
}

func TestHandleBookmarks_DeleteRemovesByPath(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bookmarks.json")
	for _, p := range []string{"/x/a.md", "/x/b.md"} {
		body, _ := json.Marshal(Bookmark{Path: p, Title: p, Type: "design"})
		req := httptest.NewRequest(http.MethodPost, "/api/bookmarks", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handleBookmarksAt(rec, req, path)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/bookmarks?path="+"/x/a.md", nil)
	rec := httptest.NewRecorder()
	handleBookmarksAt(rec, req, path)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []Bookmark
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Path != "/x/b.md" {
		t.Fatalf("expected only b.md remaining, got %+v", got)
	}
}

func TestHandleBookmarks_MethodNotAllowed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bookmarks.json")
	req := httptest.NewRequest(http.MethodPut, "/api/bookmarks", nil)
	rec := httptest.NewRecorder()
	handleBookmarksAt(rec, req, path)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}
