package wiki

import (
	"fmt"
	"os"
	"regexp"
)

type LintIssue struct {
	Rule        string `json:"rule"` // orphan | dead-link | duplicate | task-artifact-missing
	ComponentID string `json:"componentId"`
	Detail      string `json:"detail"`
}

// Lint runs the orphan, dead-link, and duplicate-title checks. Root-level
// "change" components are excluded from orphan detection — they're
// expected to be hubs with only outgoing edges in small workspaces.
func (g *Graph) Lint() []LintIssue {
	var issues []LintIssue

	for id, c := range g.components {
		if c.Type == TypeChange {
			continue
		}
		if len(g.forward[id]) == 0 && len(g.backward[id]) == 0 {
			issues = append(issues, LintIssue{Rule: "orphan", ComponentID: id, Detail: c.Title})
		}
	}

	for from, edges := range g.forward {
		for _, e := range edges {
			if _, ok := g.components[e.To]; !ok {
				issues = append(issues, LintIssue{
					Rule: "dead-link", ComponentID: from,
					Detail: fmt.Sprintf("link to %s has no matching component", e.To),
				})
			}
		}
	}

	byTitle := map[string][]string{}
	for id, c := range g.components {
		byTitle[c.Title] = append(byTitle[c.Title], id)
	}
	for title, ids := range byTitle {
		if len(ids) > 1 {
			for _, id := range ids {
				issues = append(issues, LintIssue{Rule: "duplicate", ComponentID: id, Detail: title})
			}
		}
	}

	return issues
}

var artifactTaskNumRe = regexp.MustCompile(`^task-(\d+)-`)

// LintTaskArtifacts checks, per task number (1..totalTasks), whether at
// least one task-NN-*.md file exists in artifactsDir. It counts distinct
// task numbers present, NOT raw file count — a task with multiple role
// files (implementer, oracle-review, ...) must not inflate the count.
func (g *Graph) LintTaskArtifacts(tasksComponent Component, artifactsDir string, totalTasks int) []LintIssue {
	present := map[int]bool{}
	entries, err := os.ReadDir(artifactsDir)
	if err == nil {
		for _, e := range entries {
			m := artifactTaskNumRe.FindStringSubmatch(e.Name())
			if m == nil {
				continue
			}
			var n int
			fmt.Sscanf(m[1], "%d", &n)
			present[n] = true
		}
	}

	var issues []LintIssue
	for n := 1; n <= totalTasks; n++ {
		if !present[n] {
			issues = append(issues, LintIssue{
				Rule:        "task-artifact-missing",
				ComponentID: tasksComponent.ID,
				Detail:      fmt.Sprintf("task %d", n),
			})
		}
	}
	return issues
}
