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
	if w.debounce != 2e9 {
		t.Errorf("debounce = %v, want 2s", w.debounce)
	}
	if w.communityDelay != 10e9 {
		t.Errorf("communityDelay = %v, want 10s", w.communityDelay)
	}
}
