package wiki

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"gopkg.in/yaml.v3"
)

// WorkspaceConfig mirrors the root package's WorkspaceConfig (workspace.go:
// Alias, Path, Color). It is intentionally duplicated here rather than
// imported: the root package is `package main`, and Go does not allow
// importing a main package ("is a program, not an importable package").
// main.go converts between the two (see toWikiWorkspaces) when calling
// NewAPIWithWorkspaces.
type WorkspaceConfig struct {
	Alias string
	Path  string
	Color string
}

// BuildIndex scans every registered workspace, extracts all three link
// layers, and returns a queryable Graph. Individual file errors are
// skipped (a malformed file should not abort the whole index per the
// design doc's error-handling table).
//
// ws.Path is the openspec directory itself — the established convention
// confirmed by scanner.go's scanAllChanges (changesDir =
// filepath.Join(baseDir, "changes"), projectRoot = filepath.Join(baseDir,
// "..")), by the WorkspaceConfig test fixtures in workspace_test.go /
// main_workspace_test.go (Path values end in ".../openspec"), and by the
// live production --dir flag (--dir ../miao/openspec). The project root,
// one level above ws.Path, is where docs/superpowers/{specs,plans,artifacts}/
// and diagrams/ live as SIBLINGS of openspec/ — NOT as descendants of it.
//
// After building, the graph is also persisted to indexCacheDir as
// index.json + graph.json (design doc: "索引存储：.wiki/index.json +
// .wiki/graph.json"). These files are a debugging/inspection artifact —
// BuildIndex always rebuilds from source on every call; nothing reads
// these files back in this plan. indexCacheDir="" skips persistence
// (used by tests that don't care about the on-disk artifact).
func BuildIndex(workspaces []WorkspaceConfig, indexCacheDir string) (*Graph, error) {
	var allComponents []Component
	var allEdges []Edge

	for _, ws := range workspaces {
		// Determine the openspec dir and the scan root.
		// If <path>/changes exists → it's an openspec dir; scan parent as projectRoot.
		// If <path>/openspec/changes exists → nested openspec; scan <path> as projectRoot.
		// Otherwise → it's a plain docs directory (e.g. lz100/); scan ws.Path directly.
		openspecPath := ws.Path
		var scanRoots []string
		if dirExists(filepath.Join(openspecPath, "changes")) {
			// It's an openspec dir. Scan it for changes.
			// Also scan sibling docs/, knowledge/, and *_docs/ if present.
			scanRoots = append(scanRoots, openspecPath)
			parent := filepath.Dir(openspecPath)
			docsDir := filepath.Join(parent, "docs")
			if dirExists(docsDir) {
				scanRoots = append(scanRoots, docsDir)
			}
			knowledgeDir := filepath.Join(parent, "knowledge")
			if dirExists(knowledgeDir) {
				scanRoots = append(scanRoots, knowledgeDir)
			}
			scanRoots = append(scanRoots, FindDocsDirs(parent)...)
		} else if dirExists(filepath.Join(openspecPath, "openspec", "changes")) {
			openspecPath = filepath.Join(openspecPath, "openspec")
			scanRoots = append(scanRoots, openspecPath)
			parent := filepath.Dir(openspecPath)
			docsDir := filepath.Join(parent, "docs")
			if dirExists(docsDir) {
				scanRoots = append(scanRoots, docsDir)
			}
			knowledgeDir := filepath.Join(parent, "knowledge")
			if dirExists(knowledgeDir) {
				scanRoots = append(scanRoots, knowledgeDir)
			}
			scanRoots = append(scanRoots, FindDocsDirs(parent)...)
		} else {
			// No openspec structure — plain docs directory
			scanRoots = append(scanRoots, ws.Path)
		}
		projectRoot := filepath.Dir(openspecPath)

		var components []Component
		for _, root := range scanRoots {
			comps, err := ScanComponents(root, ws.Alias)
			if err != nil {
				log.Printf("wiki index: workspace %q scan %s had errors: %v", ws.Alias, root, err)
			}
			components = append(components, comps...)
		}
		allComponents = append(allComponents, components...)

		changesDir := filepath.Join(openspecPath, "changes")
		changeDirs := collectChangeDirs(changesDir)
		for _, changeDir := range changeDirs {

			// A TypeChange component is created for every change directory
			// that has a .comet.yaml, keyed by the .comet.yaml path itself.
			// That path is exactly the From endpoint ExtractYAMLLinks uses
			// for its edges (see links.go), so without this component the
			// change directory has no graph node of its own — its outgoing
			// edges dangle from an ID nothing resolves, and the frontend
			// can never look up backlinks for a change (scanner.go's
			// ChangeSummary.ComponentID points here for that lookup).
			yamlPath := filepath.Join(changeDir, ".comet.yaml")
			if data, err := os.ReadFile(yamlPath); err == nil {
				fm := map[string]any{}
				if err := yaml.Unmarshal(data, &fm); err != nil {
					log.Printf("wiki index: %s: failed to parse .comet.yaml frontmatter: %v", yamlPath, err)
					fm = nil
				}
				allComponents = append(allComponents, Component{
					ID:          yamlPath,
					Type:        TypeChange,
					Title:       filepath.Base(changeDir),
					Path:        yamlPath,
					Workspace:   ws.Alias,
					Frontmatter: fm,
				})
			}

			yamlEdges, _ := ExtractYAMLLinks(changeDir, projectRoot)
			allEdges = append(allEdges, yamlEdges...)

			// Convention-internal edges (proposal→design→tasks→specs)
			internalEdges := ExtractChangeInternalLinks(changeDir)
			allEdges = append(allEdges, internalEdges...)

			tasksPath := filepath.Join(changeDir, "tasks.md")
			if _, err := os.Stat(tasksPath); err == nil {
				tasksComp := Component{ID: tasksPath, Path: tasksPath, Type: TypeTasks, Workspace: ws.Alias}
				// artifacts dir convention: docs/superpowers/artifacts/<plan-slug>/
				// plan slug is derived the same way scanner.go does (trim .md from basename).
				// Reuses yamlEdges computed above — no need to call ExtractYAMLLinks twice.
				for _, e := range yamlEdges {
					if strings.Contains(e.To, "plans") {
						slug := strings.TrimSuffix(filepath.Base(e.To), ".md")
						artifactsDir := filepath.Join(projectRoot, "docs", "superpowers", "artifacts", slug)
						artEdges, _ := ExtractArtifactConventionLinks(tasksComp, artifactsDir)
						allEdges = append(allEdges, artEdges...)
					}
				}
			}
		}

		for _, c := range components {
			mdEdges, err := ExtractMarkdownLinks(c)
			if err != nil {
				continue
			}
			allEdges = append(allEdges, mdEdges...)
		}
	}

	// Vector similarity edges (ternlight embeddings) — load cache first,
	// only embed components that aren't already cached.
	scriptPath := findEmbedScript()
	var embeddings map[string][]float32
	cachePath := ""
	if indexCacheDir != "" {
		cachePath = filepath.Join(indexCacheDir, "embeddings.bin")
		if cached, err := LoadEmbeddings(cachePath); err == nil && len(cached) > 0 {
			embeddings = cached
		}
	}
	// Find components missing from cache
	var missing []Component
	if embeddings == nil {
		embeddings = make(map[string][]float32)
	}
	for _, c := range allComponents {
		if _, ok := embeddings[c.ID]; !ok {
			missing = append(missing, c)
		}
	}
	// Remove stale entries (components that no longer exist)
	compIDs := make(map[string]bool, len(allComponents))
	for _, c := range allComponents {
		compIDs[c.ID] = true
	}
	for id := range embeddings {
		if !compIDs[id] {
			delete(embeddings, id)
		}
	}
	// Only call expensive embed for missing components
	if len(missing) > 0 {
		log.Printf("wiki index: embedding %d new/changed components (cache has %d)", len(missing), len(embeddings))
		newVecs, err := ComputeEmbeddings(missing, scriptPath)
		if err != nil {
			log.Printf("wiki: embedding computation failed (non-fatal): %v", err)
		} else {
			for id, vec := range newVecs {
				embeddings[id] = vec
			}
		}
	}
	var simEdges []Edge
	if len(embeddings) > 0 {
		simEdges = ComputeVectorSimilarityEdges(embeddings, 3, 0.5)
		if cachePath != "" {
			if err := SaveEmbeddings(cachePath, embeddings); err != nil {
				log.Printf("wiki index: failed to cache embeddings: %v", err)
			}
		}
	}
	allEdges = append(allEdges, simEdges...)

	g := BuildGraph(allComponents, allEdges)
	g.SetEmbeddings(embeddings)
	g.SetCommunities(DetectCommunities(g))
	g.SetCommunityLabels(CommunityLabels(allComponents, g.Communities(), embeddings))
	if indexCacheDir != "" {
		persistIndexCache(indexCacheDir, allComponents, allEdges) // best-effort, errors logged not returned
	}
	return g, nil
}

// findEmbedScript locates scripts/embed.ts. It tries, in order: relative to
// this source file (works under `go test`, where CWD is the package dir and
// os.Args[0] is a throwaway test binary in a temp dir), relative to the
// running executable (production: the binary ships next to scripts/), and
// finally relative to the current working directory (dev `go run` from repo
// root). Returns the first candidate that exists on disk, or the CWD-relative
// path as a last resort so callers get a descriptive "not found" error.
func findEmbedScript() string {
	if _, thisFile, _, ok := runtime.Caller(0); ok {
		// thisFile is .../wiki/index.go; repo root is one level up.
		candidate := filepath.Join(filepath.Dir(thisFile), "..", "scripts", "embed.ts")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	candidate := filepath.Join(filepath.Dir(os.Args[0]), "scripts", "embed.ts")
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	return "scripts/embed.ts"
}

// collectChangeDirs lists all change directories: direct children of
// changesDir (excluding "archive" itself) plus one-level children of
// changesDir/archive/. This ensures archived changes get YAML edge
// extraction too.
func collectChangeDirs(changesDir string) []string {
	var dirs []string
	entries, err := os.ReadDir(changesDir)
	if err != nil {
		return nil
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if e.Name() == "archive" {
			archiveDir := filepath.Join(changesDir, "archive")
			archiveEntries, err := os.ReadDir(archiveDir)
			if err == nil {
				for _, ae := range archiveEntries {
					if ae.IsDir() {
						dirs = append(dirs, filepath.Join(archiveDir, ae.Name()))
					}
				}
			}
			continue
		}
		dirs = append(dirs, filepath.Join(changesDir, e.Name()))
	}
	return dirs
}

func persistIndexCache(dir string, components []Component, edges []Edge) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("wiki: could not create index cache dir %s: %v", dir, err)
		return
	}
	if data, err := json.MarshalIndent(components, "", "  "); err == nil {
		os.WriteFile(filepath.Join(dir, "index.json"), data, 0644)
	}
	if data, err := json.MarshalIndent(edges, "", "  "); err == nil {
		os.WriteFile(filepath.Join(dir, "graph.json"), data, 0644)
	}
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// FindDocsDirs returns directories under parent that should be scanned for
// wiki content: "design_docs" and any directory ending in "_docs" (e.g.
// nv_docs, qcom_docs, x5_docs). These are sibling to openspec/docs/knowledge
// but were previously not included in scan roots.
func FindDocsDirs(parent string) []string {
	entries, err := os.ReadDir(parent)
	if err != nil {
		return nil
	}
	var dirs []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if name == "design_docs" || (strings.HasSuffix(name, "_docs") && len(name) > 5) {
			dirs = append(dirs, filepath.Join(parent, name))
		}
	}
	return dirs
}
