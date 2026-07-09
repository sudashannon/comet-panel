package wiki

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
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
		projectRoot := filepath.Dir(ws.Path)

		components, err := ScanComponents(projectRoot, ws.Alias)
		if err != nil {
			continue // skip unreadable workspace, matches scanner.go's scanAllWorkspaces behavior
		}
		allComponents = append(allComponents, components...)

		changesDir := filepath.Join(ws.Path, "changes")
		entries, err := os.ReadDir(changesDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			changeDir := filepath.Join(changesDir, e.Name())
			yamlEdges, _ := ExtractYAMLLinks(changeDir, projectRoot)
			allEdges = append(allEdges, yamlEdges...)

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

	g := BuildGraph(allComponents, allEdges)
	if indexCacheDir != "" {
		persistIndexCache(indexCacheDir, allComponents, allEdges) // best-effort, errors logged not returned
	}
	return g, nil
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
