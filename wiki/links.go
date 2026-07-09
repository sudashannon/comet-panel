package wiki

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"comet-ui/internal/pathresolve"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

// ExtractYAMLLinks reads .comet.yaml in changeDir and builds Edges for its
// design_doc/plan/verification_report references — the highest-confidence
// link layer, reusing the exact path resolution rule scanner.go uses.
func ExtractYAMLLinks(changeDir, root string) ([]Edge, error) {
	yamlPath := filepath.Join(changeDir, ".comet.yaml")
	data, err := os.ReadFile(yamlPath)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var edges []Edge
	fieldToKind := map[string]string{
		"design_doc":          "implements",
		"plan":                "implements",
		"verification_report": "references",
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		kind, ok := fieldToKind[key]
		if !ok || val == "" || val == "null" || val == "~" {
			continue
		}
		target := pathresolve.ResolveArtifactPath(val, root, changeDir)
		edges = append(edges, Edge{
			From:   yamlPath,
			To:     target,
			Kind:   kind,
			Source: "yaml",
		})
	}
	return edges, nil
}

// ExtractMarkdownLinks parses [text](path) links and ![alt](path) images out
// of a component's source file and resolves relative paths against the
// file's own directory — standard markdown semantics. filepath.Join +
// filepath.Clean correctly collapse multi-level "../" (Go's stdlib does
// this right; do not hand-roll this resolution).
//
// goldmark represents links and images as distinct concrete AST types
// (*ast.Link and *ast.Image) that both embed an unexported baseLink struct
// independently — they are sibling types, not parent/child — so a single
// type assertion on *ast.Link alone would silently skip every image
// reference (e.g. diagram embeds like "![diagram](../../diagrams/x.svg)").
// Both node types promote the same Destination field from baseLink, so it
// is read the same way for either.
func ExtractMarkdownLinks(component Component) ([]Edge, error) {
	data, err := os.ReadFile(component.Path)
	if err != nil {
		return nil, err
	}

	md := goldmark.New()
	doc := md.Parser().Parse(text.NewReader(data))

	var edges []Edge
	fileDir := filepath.Dir(component.Path)

	ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		var dest []byte
		switch v := n.(type) {
		case *ast.Link:
			dest = v.Destination
		case *ast.Image:
			dest = v.Destination
		default:
			return ast.WalkContinue, nil
		}
		d := string(dest)
		if d == "" || strings.HasPrefix(d, "http://") || strings.HasPrefix(d, "https://") ||
			strings.HasPrefix(d, "#") || strings.HasPrefix(d, "mailto:") {
			return ast.WalkContinue, nil
		}
		target := filepath.Clean(filepath.Join(fileDir, d))
		edges = append(edges, Edge{
			From:   component.Path,
			To:     target,
			Kind:   "references",
			Source: "markdown-link",
		})
		return ast.WalkContinue, nil
	})

	return edges, nil
}

var taskArtifactRe = regexp.MustCompile(`^task-(\d+)-`)

// ExtractArtifactConventionLinks links every task-NN-*.md file in
// artifactsDir back to tasksComponent, by filename convention alone (no
// content parsing needed — the number in "task-NN-" is authoritative).
func ExtractArtifactConventionLinks(tasksComponent Component, artifactsDir string) ([]Edge, error) {
	entries, err := os.ReadDir(artifactsDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var edges []Edge
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		if !taskArtifactRe.MatchString(e.Name()) {
			continue
		}
		edges = append(edges, Edge{
			From:   tasksComponent.Path,
			To:     filepath.Join(artifactsDir, e.Name()),
			Kind:   "generates",
			Source: "markdown-link",
		})
	}
	return edges, nil
}
