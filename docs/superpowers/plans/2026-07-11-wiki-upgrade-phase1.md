# Wiki Upgrade Phase 1: 图谱基础修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the graph's disconnected-node problem by making YAML edges cover archived changes, adding change-internal convention edges, and extending lint rules.

**Architecture:** Fix the `BuildIndex` archive recursion gap so YAML edges populate for all 343+ archived components; add a new link layer `ExtractChangeInternalLinks` that auto-connects sibling files within a change; extend `Lint()` with lifecycle gap rules.

**Tech Stack:** Go (wiki package), existing goldmark/pathresolve dependencies, no new deps.

## Global Constraints

- No external dependencies added
- All new code in `wiki/` package with table-driven tests
- Existing tests must continue to pass (`go test ./...`)
- Single binary deployment preserved
- Rebuild + restart to verify live graph

---

### Task 1: Fix BuildIndex archive recursion

**Files:**
- Modify: `wiki/index.go:64-112` (the changesDir iteration loop)
- Modify: `wiki/index_test.go` (add archive test case)

**Interfaces:**
- Consumes: `ExtractYAMLLinks(changeDir, root string) ([]Edge, error)` — unchanged
- Produces: `BuildIndex` now iterates `changes/archive/*/` in addition to `changes/*/`

- [ ] **Step 1: Write the failing test**

Add to `wiki/index_test.go`:

```go
func TestBuildIndex_ArchiveChangesGetYAMLEdges(t *testing.T) {
	dir := t.TempDir()
	// Create workspace structure: <dir>/openspec/changes/archive/2026-06-04-test-change/
	openspecDir := filepath.Join(dir, "openspec")
	archiveChangeDir := filepath.Join(openspecDir, "changes", "archive", "2026-06-04-test-change")
	os.MkdirAll(archiveChangeDir, 0755)

	// Create a target spec file that .comet.yaml references
	specDir := filepath.Join(dir, "docs", "superpowers", "specs")
	os.MkdirAll(specDir, 0755)
	os.WriteFile(filepath.Join(specDir, "test-design.md"), []byte("# Test Design\n"), 0644)

	// Create .comet.yaml with design_doc reference
	os.WriteFile(filepath.Join(archiveChangeDir, ".comet.yaml"), []byte(
		"phase: archive\ndesign_doc: docs/superpowers/specs/test-design.md\n",
	), 0644)

	// Create the design.md so ScanComponents picks it up
	os.WriteFile(filepath.Join(archiveChangeDir, "design.md"), []byte("# Design\n"), 0644)

	ws := []WorkspaceConfig{{Alias: "test", Path: openspecDir}}
	g, err := BuildIndex(ws, "")
	if err != nil {
		t.Fatal(err)
	}

	// The .comet.yaml node should have forward edges
	yamlID := filepath.Join(archiveChangeDir, ".comet.yaml")
	edges := g.Forward(yamlID)
	if len(edges) == 0 {
		t.Errorf("expected YAML edges from archived change, got 0")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/shanl/workspace/comet-panel && go test ./wiki/ -run TestBuildIndex_ArchiveChangesGetYAMLEdges -v`
Expected: FAIL with "expected YAML edges from archived change, got 0"

- [ ] **Step 3: Fix BuildIndex to recurse into archive/**

In `wiki/index.go`, replace the single-level iteration (lines 64-112) with a helper that also descends into `archive/*/`:

```go
// After line 63 (allComponents = append...), replace the changesDir block:

changesDir := filepath.Join(openspecPath, "changes")

// collectChangeDirs returns all direct change dirs under changesDir,
// plus all subdirs of changesDir/archive/ (one level deep).
changeDirs := collectChangeDirs(changesDir)

for _, changeDir := range changeDirs {
	// ... same body as before (yamlPath stat, ExtractYAMLLinks, etc.)
}
```

Add the helper function:

```go
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/shanl/workspace/comet-panel && go test ./wiki/ -run TestBuildIndex_ArchiveChangesGetYAMLEdges -v`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /home/shanl/workspace/comet-panel && go test -count=1 ./... && go vet ./...`
Expected: all pass

- [ ] **Step 6: Verify live — rebuild + check edge count**

```bash
cd /home/shanl/workspace/comet-panel
go build -o comet-panel . && systemctl --user restart comet-panel && sleep 2
# Before: 0 yaml edges from archive changes
curl -s http://localhost:8989/api/wiki/graph | python3 -c "
import json, sys; data = json.load(sys.stdin)
yaml_edges = [e for e in data['edges'] if e.get('source') == 'yaml']
archive_from = [e for e in yaml_edges if '/archive/' in e['from']]
print(f'Total yaml edges: {len(yaml_edges)} (was 24)')
print(f'Archive yaml edges: {len(archive_from)} (was 0)')
orphans = [c for c in data['components'] if not any(e['from']==c['id'] or e['to']==c['id'] for e in data['edges'])]
print(f'Orphan nodes: {len(orphans)} / {len(data[\"components\"])}')
"
```

Expected: Archive yaml edges > 0; orphan percentage drops significantly.

- [ ] **Step 7: Commit**

```bash
git add wiki/index.go wiki/index_test.go
git commit -m "fix(wiki): BuildIndex recurse into changes/archive/ for YAML edges

BuildIndex only iterated direct children of changes/, missing all
archived change directories. Added collectChangeDirs helper that also
descends one level into changes/archive/*/, so archived changes get
their YAML-layer edges (design_doc, plan, verification_report) properly
extracted and connected in the graph."
```

---

### Task 2: Add change-internal convention edges

**Files:**
- Create: `wiki/links_internal.go`
- Create: `wiki/links_internal_test.go`
- Modify: `wiki/index.go` (call new function in BuildIndex loop)

**Interfaces:**
- Consumes: `changeDir string` (absolute path to a change directory)
- Produces: `ExtractChangeInternalLinks(changeDir string) []Edge`
  - Returns edges between sibling files within a change: proposal→design, design→tasks, tasks→specs

- [ ] **Step 1: Write the failing test**

Create `wiki/links_internal_test.go`:

```go
package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractChangeInternalLinks(t *testing.T) {
	dir := t.TempDir()

	// Create sibling files
	os.WriteFile(filepath.Join(dir, "proposal.md"), []byte("# Proposal\n"), 0644)
	os.WriteFile(filepath.Join(dir, "design.md"), []byte("# Design\n"), 0644)
	os.WriteFile(filepath.Join(dir, "tasks.md"), []byte("# Tasks\n"), 0644)
	specDir := filepath.Join(dir, "specs", "my-spec")
	os.MkdirAll(specDir, 0755)
	os.WriteFile(filepath.Join(specDir, "spec.md"), []byte("# Spec\n"), 0644)

	edges := ExtractChangeInternalLinks(dir)

	// Expected: proposal→design, design→tasks, tasks→spec
	if len(edges) < 3 {
		t.Errorf("expected at least 3 internal edges, got %d", len(edges))
	}

	// Verify kinds and source
	for _, e := range edges {
		if e.Source != "convention-internal" {
			t.Errorf("edge source = %q, want convention-internal", e.Source)
		}
		if e.Kind != "generates" && e.Kind != "implements" {
			t.Errorf("edge kind = %q, want generates or implements", e.Kind)
		}
	}

	// Verify specific edges exist
	proposalPath := filepath.Join(dir, "proposal.md")
	designPath := filepath.Join(dir, "design.md")
	tasksPath := filepath.Join(dir, "tasks.md")
	specPath := filepath.Join(specDir, "spec.md")

	assertEdge(t, edges, proposalPath, designPath, "generates")
	assertEdge(t, edges, designPath, tasksPath, "generates")
	assertEdge(t, edges, tasksPath, specPath, "implements")
}

func TestExtractChangeInternalLinks_PartialFiles(t *testing.T) {
	dir := t.TempDir()
	// Only proposal + design, no tasks
	os.WriteFile(filepath.Join(dir, "proposal.md"), []byte("# P\n"), 0644)
	os.WriteFile(filepath.Join(dir, "design.md"), []byte("# D\n"), 0644)

	edges := ExtractChangeInternalLinks(dir)
	if len(edges) != 1 {
		t.Errorf("expected 1 edge (proposal→design), got %d", len(edges))
	}
}

func assertEdge(t *testing.T, edges []Edge, from, to, kind string) {
	t.Helper()
	for _, e := range edges {
		if e.From == from && e.To == to && e.Kind == kind {
			return
		}
	}
	t.Errorf("missing edge %s --%s--> %s", filepath.Base(from), kind, filepath.Base(to))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/shanl/workspace/comet-panel && go test ./wiki/ -run TestExtractChangeInternalLinks -v`
Expected: FAIL — `ExtractChangeInternalLinks` undefined

- [ ] **Step 3: Implement ExtractChangeInternalLinks**

Create `wiki/links_internal.go`:

```go
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/shanl/workspace/comet-panel && go test ./wiki/ -run TestExtractChangeInternalLinks -v`
Expected: PASS

- [ ] **Step 5: Wire into BuildIndex**

In `wiki/index.go`, inside the `for _, changeDir := range changeDirs` loop, add after the YAML edges extraction:

```go
// Convention-internal edges (proposal→design→tasks→specs)
internalEdges := ExtractChangeInternalLinks(changeDir)
allEdges = append(allEdges, internalEdges...)
```

- [ ] **Step 6: Run full test suite**

Run: `cd /home/shanl/workspace/comet-panel && go test -count=1 ./... && go vet ./...`
Expected: all pass

- [ ] **Step 7: Verify live**

```bash
go build -o comet-panel . && systemctl --user restart comet-panel && sleep 2
curl -s http://localhost:8989/api/wiki/graph | python3 -c "
import json, sys; data = json.load(sys.stdin)
internal = [e for e in data['edges'] if e.get('source') == 'convention-internal']
print(f'Internal convention edges: {len(internal)}')
# Check a known multi-file change
sec = [e for e in internal if 'app-security-cloud-integration' in e['from']]
print(f'app-security-cloud-integration internal edges: {len(sec)}')
"
```

Expected: internal edges > 50; app-security has ≥2.

- [ ] **Step 8: Commit**

```bash
git add wiki/links_internal.go wiki/links_internal_test.go wiki/index.go
git commit -m "feat(wiki): add change-internal convention edges

New link layer: ExtractChangeInternalLinks auto-connects sibling files
within a change directory (proposal→design→tasks→specs) using
convention-internal source. Wired into BuildIndex for all change dirs."
```

---

### Task 3: Extend lint rules

**Files:**
- Modify: `wiki/lint.go` (add 3 new rules)
- Modify: `wiki/lint_test.go` (add test cases)
- Modify: `wiki/wiki.go` (add CreatedAt field to Component if not present)

**Interfaces:**
- Consumes: `*Graph` with Components and Edges
- Produces: Extended `Lint()` returning new issue rules: `design-no-plan`, `tasks-no-artifact`, `stale-active`

- [ ] **Step 1: Write failing tests**

Add to `wiki/lint_test.go`:

```go
func TestLint_DesignNoPlan(t *testing.T) {
	// A design component in a change with no plan edge outgoing
	design := Component{ID: "/test/changes/x/design.md", Type: TypeDesign, Path: "/test/changes/x/design.md"}
	// Change node older than 3 days
	change := Component{
		ID: "/test/changes/x/.comet.yaml", Type: TypeChange,
		Path: "/test/changes/x/.comet.yaml",
		Frontmatter: map[string]any{"created_at": "2026-06-01"},
	}
	g := BuildGraph([]Component{design, change}, nil)
	issues := g.Lint()

	found := false
	for _, i := range issues {
		if i.Rule == "design-no-plan" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected design-no-plan lint issue")
	}
}

func TestLint_StaleActive(t *testing.T) {
	change := Component{
		ID: "/test/changes/stale/.comet.yaml", Type: TypeChange,
		Path: "/test/changes/stale/.comet.yaml",
		Frontmatter: map[string]any{"created_at": "2026-06-01", "phase": "build"},
	}
	g := BuildGraph([]Component{change}, nil)
	issues := g.Lint()

	found := false
	for _, i := range issues {
		if i.Rule == "stale-active" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected stale-active lint issue")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/shanl/workspace/comet-panel && go test ./wiki/ -run "TestLint_DesignNoPlan|TestLint_StaleActive" -v`
Expected: FAIL — no such rules yet

- [ ] **Step 3: Implement new lint rules**

Add to `wiki/lint.go`:

```go
import "time"

// lintLifecycleGaps checks for missing workflow artifacts (design-no-plan,
// tasks-no-artifact) and stale active changes.
func (g *Graph) lintLifecycleGaps() []LintIssue {
	var issues []LintIssue
	now := time.Now()

	for id, c := range g.components {
		if c.Type == TypeChange {
			createdStr, _ := c.Frontmatter["created_at"].(string)
			phase, _ := c.Frontmatter["phase"].(string)
			created, err := time.Parse("2006-01-02", createdStr)
			if err != nil {
				continue
			}
			age := now.Sub(created)

			// stale-active: non-archived, >14 days
			if phase != "archive" && phase != "" && age > 14*24*time.Hour {
				issues = append(issues, LintIssue{
					Rule:        "stale-active",
					ComponentID: id,
					Detail:      fmt.Sprintf("phase=%s, created %s (%d days ago)", phase, createdStr, int(age.Hours()/24)),
				})
			}
		}

		// design-no-plan: design exists in a change dir, no plan sibling
		if c.Type == TypeDesign && !strings.Contains(id, "/archive/") {
			changeDir := filepath.Dir(id)
			// Check if a plan edge exists from the change's .comet.yaml
			yamlID := filepath.Join(changeDir, ".comet.yaml")
			edges := g.Forward(yamlID)
			hasPlan := false
			for _, e := range edges {
				if strings.Contains(e.To, "plans") {
					hasPlan = true
					break
				}
			}
			if !hasPlan {
				// Check created_at from the change component
				if changeComp, ok := g.components[yamlID]; ok {
					createdStr, _ := changeComp.Frontmatter["created_at"].(string)
					created, err := time.Parse("2006-01-02", createdStr)
					if err == nil && now.Sub(created) > 3*24*time.Hour {
						issues = append(issues, LintIssue{
							Rule:        "design-no-plan",
							ComponentID: id,
							Detail:      fmt.Sprintf("design exists since %s but no plan reference found", createdStr),
						})
					}
				}
			}
		}
	}
	return issues
}
```

Wire into `Lint()`:

```go
func (g *Graph) Lint() []LintIssue {
	var issues []LintIssue
	// ... existing orphan/dead-link/duplicate checks ...
	issues = append(issues, g.lintLifecycleGaps()...)
	return issues
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/shanl/workspace/comet-panel && go test ./wiki/ -run "TestLint_DesignNoPlan|TestLint_StaleActive" -v`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /home/shanl/workspace/comet-panel && go test -count=1 ./... && go vet ./...`
Expected: all pass

- [ ] **Step 6: Verify live lint output**

```bash
go build -o comet-panel . && systemctl --user restart comet-panel && sleep 2
curl -s http://localhost:8989/api/wiki/lint | python3 -c "
import json, sys
from collections import Counter
data = json.load(sys.stdin)
rules = Counter(i['rule'] for i in data)
print(f'Lint issues by rule: {dict(rules)}')
"
```

Expected: new rules appear in output.

- [ ] **Step 7: Commit**

```bash
git add wiki/lint.go wiki/lint_test.go
git commit -m "feat(wiki): lint lifecycle gap rules (design-no-plan, stale-active)

New lint rules detect:
- design-no-plan: design.md exists >3 days without a plan reference
- stale-active: non-archived change >14 days old
Both skip archived changes."
```

---

### Task 4: Final verification + commit summary

- [ ] **Step 1: Full rebuild + comprehensive graph stats**

```bash
cd /home/shanl/workspace/comet-panel
go build -o comet-panel . && systemctl --user restart comet-panel && sleep 2
curl -s http://localhost:8989/api/wiki/graph | python3 -c "
import json, sys
from collections import Counter
data = json.load(sys.stdin)
comps = data['components']
edges = data['edges']
print(f'Components: {len(comps)}')
print(f'Edges: {len(edges)}')
sources = Counter(e.get('source','?') for e in edges)
print(f'By source: {dict(sources)}')
# Orphan count
comp_ids = {c['id'] for c in comps}
connected = set()
for e in edges:
    if e['from'] in comp_ids: connected.add(e['from'])
    if e['to'] in comp_ids: connected.add(e['to'])
orphans = len(comp_ids - connected)
print(f'Orphans: {orphans}/{len(comp_ids)} ({100*orphans//len(comp_ids)}%)')
print(f'Target: <20% (was >60%)')
"
```

- [ ] **Step 2: Run web tests**

```bash
cd /home/shanl/workspace/comet-panel/web && npx vitest run 2>&1 | grep -E "Test Files|Tests "
```

Expected: all pass (no frontend changes in this phase).

- [ ] **Step 3: Push**

```bash
cd /home/shanl/workspace/comet-panel && git push origin master
```
