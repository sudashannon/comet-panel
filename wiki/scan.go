package wiki

import (
	"bufio"
	"log"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ScanComponents walks workspaceRoot for markdown files and builds a
// Component for each one. Classification by ComponentType happens by
// filename convention (proposal.md, design.md, tasks.md) or by directory
// convention (docs/superpowers/specs/, docs/superpowers/plans/,
// docs/superpowers/artifacts/, diagrams/) — anything else is skipped.
//
// A single malformed file must not abort the whole scan (design doc error
// table: "遇到格式错误的 markdown → 跳过+记录日志，不中断整体索引"). Only a
// directory-read failure from filepath.Walk itself propagates as a real
// error; a per-file parse failure is logged and skipped.
func ScanComponents(workspaceRoot, workspaceAlias string) ([]Component, error) {
	var components []Component

	err := filepath.Walk(workspaceRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err // directory traversal error — genuinely fatal, propagate
		}
		if info.IsDir() || !strings.HasSuffix(path, ".md") {
			return nil
		}
		typ := classifyPath(path)
		if typ == "" {
			return nil
		}
		absPath, err := filepath.Abs(path)
		if err != nil {
			log.Printf("wiki scan: skipping %s, could not resolve absolute path: %v", path, err)
			return nil
		}
		fm, title, err := parseFrontmatterAndTitle(path)
		if err != nil {
			log.Printf("wiki scan: skipping %s, parse error: %v", path, err)
			return nil
		}
		components = append(components, Component{
			ID:          absPath,
			Type:        typ,
			Title:       title,
			Path:        absPath,
			Workspace:   workspaceAlias,
			Frontmatter: fm,
			UpdatedAt:   info.ModTime(),
		})
		return nil
	})
	return components, err
}

func classifyPath(path string) ComponentType {
	base := filepath.Base(path)
	switch base {
	case "proposal.md":
		return TypeProposal
	case "design.md":
		return TypeDesign
	case "tasks.md":
		return TypeTasks
	}
	switch {
	case strings.Contains(path, string(filepath.Separator)+"specs"+string(filepath.Separator)):
		return TypeSpec
	case strings.Contains(path, string(filepath.Separator)+"plans"+string(filepath.Separator)):
		return TypePlan
	case strings.Contains(path, string(filepath.Separator)+"artifacts"+string(filepath.Separator)):
		return TypeArtifact
	case strings.Contains(path, string(filepath.Separator)+"diagrams"+string(filepath.Separator)):
		return TypeDiagram
	}
	return ""
}

// parseFrontmatterAndTitle reads a leading "---\n...\n---\n" YAML block (if
// present) and the first "# heading" line. Falls back to the filename
// (without extension) when no heading is found.
func parseFrontmatterAndTitle(path string) (map[string]any, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	fm := map[string]any{}
	title := ""

	firstLine := true
	inFrontmatter := false
	var fmLines []string

	for scanner.Scan() {
		line := scanner.Text()
		if firstLine && strings.TrimSpace(line) == "---" {
			inFrontmatter = true
			firstLine = false
			continue
		}
		firstLine = false
		if inFrontmatter {
			if strings.TrimSpace(line) == "---" {
				inFrontmatter = false
				if err := yaml.Unmarshal([]byte(strings.Join(fmLines, "\n")), &fm); err != nil {
					return nil, "", err
				}
				continue
			}
			fmLines = append(fmLines, line)
			continue
		}
		if title == "" && strings.HasPrefix(strings.TrimSpace(line), "# ") {
			title = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "# "))
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, "", err
	}
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(path), ".md")
	}
	return fm, title, nil
}
