package wiki

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type LintIssue struct {
	Rule        string `json:"rule"` // orphan | dead-link | duplicate | task-artifact-missing | design-no-plan | stale-active
	ComponentID string `json:"componentId"`
	Detail      string `json:"detail"`
}

// Lint runs the orphan, dead-link, duplicate-title, and lifecycle-gap
// (design-no-plan, stale-active — see lintLifecycleGaps) checks. Root-level
// "change" components and components under an "/archive/" path segment are
// excluded from orphan detection — change nodes are expected to be hubs with
// only outgoing edges in small workspaces, and archived artifacts are
// expected to be disconnected from the active graph, so flagging either has
// no actionable value for a working dashboard.
func (g *Graph) Lint() []LintIssue {
	var issues []LintIssue

	for id, c := range g.components {
		if c.Type == TypeChange || strings.Contains(c.Path, "/archive/") {
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
			// Skip groups where every component's title is just its filename fallback
			allFallback := true
			for _, id := range ids {
				c := g.components[id]
				if c.Title != strings.TrimSuffix(filepath.Base(c.Path), ".md") {
					allFallback = false
					break
				}
			}
			if allFallback {
				continue
			}
			for _, id := range ids {
				issues = append(issues, LintIssue{Rule: "duplicate", ComponentID: id, Detail: title})
			}
		}
	}

	issues = append(issues, g.lintLifecycleGaps()...)
	return issues
}

// frontmatterTime reads a frontmatter value as time.Time. yaml.Unmarshal
// parses bare "YYYY-MM-DD" scalars into time.Time directly when the field
// comes from a real .comet.yaml; test fixtures instead set the field as a
// plain string, so both representations must be accepted.
func frontmatterTime(v any) (time.Time, bool) {
	switch t := v.(type) {
	case time.Time:
		return t, true
	case string:
		if parsed, err := time.Parse("2006-01-02", t); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

// lintLifecycleGaps flags workflow-lifecycle gaps that the link-based checks
// above cannot see:
//   - design-no-plan: a design.md exists (>3 days old, by its change's
//     created_at) but the change's .comet.yaml has no outgoing edge whose
//     target path contains "plans" — i.e. no plan has been written yet.
//   - stale-active: a change is not archived (phase != "archive"/"") and its
//     created_at is >14 days old — it has been sitting active too long.
//
// Both skip anything under an "/archive/" path segment, since archived
// changes are expected to be old and done.
func (g *Graph) lintLifecycleGaps() []LintIssue {
	var issues []LintIssue
	now := time.Now()

	for id, c := range g.components {
		if strings.Contains(id, "/archive/") {
			continue
		}

		if c.Type == TypeChange {
			createdAt, ok := frontmatterTime(c.Frontmatter["created_at"])
			if !ok {
				continue
			}
			phase, _ := c.Frontmatter["phase"].(string)
			age := now.Sub(createdAt)

			if phase != "archive" && phase != "" && age > 14*24*time.Hour {
				issues = append(issues, LintIssue{
					Rule:        "stale-active",
					ComponentID: id,
					Detail:      fmt.Sprintf("phase=%s, created %s (%d days ago)", phase, createdAt.Format("2006-01-02"), int(age.Hours()/24)),
				})
			}
		}

		if c.Type == TypeDesign {
			changeDir := filepath.Dir(id)
			yamlID := filepath.Join(changeDir, ".comet.yaml")
			changeComp, ok := g.components[yamlID]
			if !ok {
				continue
			}
			createdAt, ok := frontmatterTime(changeComp.Frontmatter["created_at"])
			if !ok || now.Sub(createdAt) <= 3*24*time.Hour {
				continue
			}

			hasPlan := false
			for _, e := range g.Forward(yamlID) {
				if strings.Contains(e.To, "plans") {
					hasPlan = true
					break
				}
			}
			if !hasPlan {
				issues = append(issues, LintIssue{
					Rule:        "design-no-plan",
					ComponentID: id,
					Detail:      fmt.Sprintf("design exists since %s but no plan reference found", createdAt.Format("2006-01-02")),
				})
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
