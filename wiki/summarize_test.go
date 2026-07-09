package wiki

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSummarize_ReturnsCachedResultWhenFresh(t *testing.T) {
	root := t.TempDir()
	srcPath := filepath.Join(root, "doc.md")
	os.WriteFile(srcPath, []byte("# Doc\ncontent"), 0644)

	cacheDir := filepath.Join(root, ".wiki", "summaries")
	os.MkdirAll(cacheDir, 0755)

	comp := Component{ID: srcPath, Path: srcPath, Title: "Doc", UpdatedAt: time.Now()}
	cachePath := summaryCachePath(cacheDir, comp.ID)
	os.WriteFile(cachePath, []byte("cached summary text"), 0644)
	// ensure cache mtime is newer than source
	future := time.Now().Add(time.Hour)
	os.Chtimes(cachePath, future, future)

	got, err := Summarize(context.Background(), comp, cacheDir)
	if err != nil {
		t.Fatal(err)
	}
	if got != "cached summary text" {
		t.Fatalf("expected cached summary, got %q", got)
	}
}

func TestSummaryCachePath_IsStableAndFilenameSafe(t *testing.T) {
	p1 := summaryCachePath("/cache", "/some/path/design.md")
	p2 := summaryCachePath("/cache", "/some/path/design.md")
	if p1 != p2 {
		t.Fatal("expected the same component ID to always produce the same cache path")
	}
	if filepath.Dir(p1) != "/cache" {
		t.Fatalf("expected cache path under /cache, got %q", p1)
	}
}
