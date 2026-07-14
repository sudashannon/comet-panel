package wiki

import "testing"

func TestIsWikiFile(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"changes/x/design.md", true},
		{"changes/x/.comet.yaml", true},
		{"changes/x/image.png", false},
		{"/absolute/path/to/proposal.md", true},
		{"changes/x/comet.yaml", false},
		{"changes/x/notes.markdown", false},
	}
	for _, c := range cases {
		if got := isWikiFile(c.path); got != c.want {
			t.Errorf("isWikiFile(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}

func TestNewWatcherDefaults(t *testing.T) {
	api := NewAPI(BuildGraph(nil, nil))
	w := NewWatcher(api, "scripts/embed.ts")
	if w.debounce != 5e9 {
		t.Errorf("debounce = %v, want 5s", w.debounce)
	}
	if w.communityDelay != 30e9 {
		t.Errorf("communityDelay = %v, want 30s", w.communityDelay)
	}
}

func TestCommunityRedetectionRequiresDirtyThreshold(t *testing.T) {
	graph := BuildGraph([]Component{{ID: "a"}}, nil)
	graph.SetCommunities(map[string]int{"sentinel": 7})
	api := NewAPI(graph)
	watcher := NewWatcher(api, "")

	api.AddDirty(communityDirtyThreshold)
	watcher.redetectCommunities()
	if api.DirtyCount() != communityDirtyThreshold {
		t.Fatalf("dirty count below trigger was reset: %d", api.DirtyCount())
	}
	if got := graph.Communities()["sentinel"]; got != 7 {
		t.Fatalf("communities changed below threshold: sentinel=%d", got)
	}

	api.AddDirty(1)
	watcher.redetectCommunities()
	if api.DirtyCount() != 0 {
		t.Fatalf("dirty count after re-detection = %d, want 0", api.DirtyCount())
	}
	if _, stale := graph.Communities()["sentinel"]; stale {
		t.Fatal("community detection did not replace stale communities")
	}
}
