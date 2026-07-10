package wiki

import (
	"os"
	"path/filepath"
)

// ExtractChangeInternalLinks builds convention edges between sibling files
// within a change directory: proposal→design (generates), design→tasks
// (generates), tasks→specs/*/spec.md (implements). Only edges where both
// endpoints exist on disk are emitted.
func ExtractChangeInternalLinks(changeDir string) []Edge {
	var edges []Edge

	proposal := filepath.Join(changeDir, "proposal.md")
	design := filepath.Join(changeDir, "design.md")
	tasks := filepath.Join(changeDir, "tasks.md")

	proposalExists := fileExists(proposal)
	designExists := fileExists(design)
	tasksExists := fileExists(tasks)

	if proposalExists && designExists {
		edges = append(edges, Edge{
			From: proposal, To: design, Kind: "generates", Source: "convention-internal",
		})
	}
	if designExists && tasksExists {
		edges = append(edges, Edge{
			From: design, To: tasks, Kind: "generates", Source: "convention-internal",
		})
	}

	// tasks → specs/*/spec.md
	if tasksExists {
		specsDir := filepath.Join(changeDir, "specs")
		entries, err := os.ReadDir(specsDir)
		if err == nil {
			for _, e := range entries {
				if !e.IsDir() {
					continue
				}
				specPath := filepath.Join(specsDir, e.Name(), "spec.md")
				if fileExists(specPath) {
					edges = append(edges, Edge{
						From: tasks, To: specPath, Kind: "implements", Source: "convention-internal",
					})
				}
			}
		}
	}

	return edges
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
