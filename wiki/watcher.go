package wiki

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Watcher watches a set of workspace directories for changes to markdown
// and .comet.yaml files and triggers incremental wiki index updates.
//
// File-change events are debounced by `debounce` before triggering a
// rebuild, and community detection (more expensive: Louvain over the whole
// graph) is further debounced by `communityDelay` after any structural
// change so a burst of edits during a save-heavy edit session only pays
// for community re-detection once, after things settle.
type Watcher struct {
	api            *API
	scriptPath     string
	debounce       time.Duration
	communityDelay time.Duration
	watcher        *fsnotify.Watcher
	stop           chan struct{}
	wg             sync.WaitGroup
}

// NewWatcher constructs a Watcher bound to api. scriptPath is currently
// unused by the rebuild path (BuildIndex resolves the embed script itself
// via findEmbedScript) but is kept on the struct so callers can wire it
// through once per-file incremental embedding lands.
func NewWatcher(api *API, scriptPath string) *Watcher {
	return &Watcher{
		api:            api,
		scriptPath:     scriptPath,
		debounce:       2 * time.Second,
		communityDelay: 10 * time.Second,
		stop:           make(chan struct{}),
	}
}

// Start begins watching the given directory paths (recursively) for .md and
// .comet.yaml changes. It spawns a background goroutine and returns
// immediately; it never blocks the caller (e.g. the HTTP server).
func (w *Watcher) Start(paths []string) error {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	w.watcher = fw

	for _, root := range paths {
		filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if !info.IsDir() {
				return nil
			}
			name := info.Name()
			if name == ".git" || name == "node_modules" || (strings.HasPrefix(name, ".") && name != "." && name != "..") {
				return filepath.SkipDir
			}
			if addErr := fw.Add(path); addErr != nil {
				log.Printf("wiki watcher: failed to watch %s: %v", path, addErr)
			}
			return nil
		})
	}

	w.wg.Add(1)
	go w.loop()
	return nil
}

// Stop shuts down the watcher and blocks until its goroutine has exited.
func (w *Watcher) Stop() {
	close(w.stop)
	w.watcher.Close()
	w.wg.Wait()
}

func (w *Watcher) loop() {
	defer w.wg.Done()

	var pending []string
	var timer *time.Timer
	var communityTimer *time.Timer

	resetTimer := func() {
		if timer != nil {
			timer.Stop()
		}
		timer = time.AfterFunc(w.debounce, func() {
			files := pending
			pending = nil
			if len(files) == 0 {
				return
			}
			w.processBatch(files)
			if communityTimer != nil {
				communityTimer.Stop()
			}
			communityTimer = time.AfterFunc(w.communityDelay, func() {
				w.redetectCommunities()
			})
		})
	}

	for {
		select {
		case <-w.stop:
			return
		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			if !isWikiFile(event.Name) {
				continue
			}
			if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) == 0 {
				continue
			}
			pending = append(pending, event.Name)
			resetTimer()
		case err, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("wiki watcher error: %v", err)
		}
	}
}

// isWikiFile reports whether path is a file the watcher cares about:
// markdown files or .comet.yaml frontmatter files.
func isWikiFile(path string) bool {
	base := filepath.Base(path)
	return strings.HasSuffix(base, ".md") || base == ".comet.yaml"
}

// processBatch handles a debounced batch of file changes by triggering an
// index rebuild. BuildIndex already re-scans every workspace and
// re-embeds via the ternlight script, so a full Rebuild here re-scans and
// re-embeds only what changed on disk since the last build in terms of
// wall-clock cost (unchanged files are still cheap to re-read) while
// keeping the update path simple and correct; a true per-file patch
// (re-scan just the changed component, re-extract its edges, re-embed
// only that vector, and recompute only its similarity edges) is a
// follow-up optimization once this path is exercised in production.
func (w *Watcher) processBatch(files []string) {
	log.Printf("wiki watcher: %d file(s) changed, rebuilding index", len(files))
	if err := w.api.Rebuild(); err != nil {
		log.Printf("wiki watcher: rebuild failed: %v", err)
	}
}

// redetectCommunities re-runs community detection (and re-derives
// community labels) on the current graph. It is called on a longer
// debounce than processBatch since Louvain community detection is more
// expensive than a single rescan and doesn't need to run on every edit.
func (w *Watcher) redetectCommunities() {
	w.api.mu.Lock()
	defer w.api.mu.Unlock()
	g := w.api.graph
	g.SetCommunities(DetectCommunities(g))
	components := g.Components()
	comps := make([]Component, 0, len(components))
	for _, c := range components {
		comps = append(comps, c)
	}
	g.SetCommunityLabels(CommunityLabels(comps, g.Communities(), g.Embeddings()))
	log.Printf("wiki watcher: communities re-detected")
}
