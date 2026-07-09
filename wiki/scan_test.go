package wiki

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanComponents_FindsMarkdownFilesAndExtractsTitle(t *testing.T) {
	root := t.TempDir()
	changesDir := filepath.Join(root, "changes", "my-change")
	os.MkdirAll(changesDir, 0755)
	os.WriteFile(filepath.Join(changesDir, "proposal.md"), []byte("# My Change Proposal\n\nBody text.\n"), 0644)
	os.WriteFile(filepath.Join(changesDir, "design.md"), []byte("# Design Doc\n\nBody.\n"), 0644)

	components, err := ScanComponents(root, "miao")
	if err != nil {
		t.Fatal(err)
	}
	if len(components) != 2 {
		t.Fatalf("expected 2 components, got %d: %+v", len(components), components)
	}

	byTitle := map[string]Component{}
	for _, c := range components {
		byTitle[c.Title] = c
	}
	prop, ok := byTitle["My Change Proposal"]
	if !ok {
		t.Fatalf("expected a component titled 'My Change Proposal', got %+v", components)
	}
	if prop.Type != TypeProposal {
		t.Fatalf("expected TypeProposal, got %v", prop.Type)
	}
	if prop.Workspace != "miao" {
		t.Fatalf("expected workspace 'miao', got %q", prop.Workspace)
	}
}

func TestScanComponents_FallsBackToFilenameWhenNoHeading(t *testing.T) {
	root := t.TempDir()
	// must be under a recognized directory ("specs") to be classified —
	// classifyPath does not recognize arbitrary directory names like "docs"
	dir := filepath.Join(root, "docs", "superpowers", "specs")
	os.MkdirAll(dir, 0755)
	os.WriteFile(filepath.Join(dir, "notes.md"), []byte("no heading here, just text\n"), 0644)

	components, err := ScanComponents(root, "miao")
	if err != nil {
		t.Fatal(err)
	}
	if len(components) != 1 || components[0].Title != "notes" {
		t.Fatalf("expected fallback title 'notes', got %+v", components)
	}
}

func TestScanComponents_SkipsMalformedFileWithoutAbortingWholeScan(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "docs", "superpowers", "specs")
	os.MkdirAll(dir, 0755)
	// malformed frontmatter: unclosed YAML flow sequence — yaml.Unmarshal will error
	os.WriteFile(filepath.Join(dir, "broken.md"), []byte("---\ntags: [unclosed\n---\n# Broken\n"), 0644)
	os.WriteFile(filepath.Join(dir, "good.md"), []byte("# Good Doc\n"), 0644)

	components, err := ScanComponents(root, "miao")
	if err != nil {
		t.Fatal(err)
	}
	if len(components) != 1 || components[0].Title != "Good Doc" {
		t.Fatalf("expected the malformed file to be skipped and the good file still indexed, got %+v", components)
	}
}

func TestScanComponents_ParsesFrontmatter(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "docs", "superpowers", "specs")
	os.MkdirAll(dir, 0755)
	content := "---\ntags: [rx101, secure-boot]\nreviewed: true\n---\n# Titled Doc\n"
	os.WriteFile(filepath.Join(dir, "doc.md"), []byte(content), 0644)

	components, err := ScanComponents(root, "miao")
	if err != nil {
		t.Fatal(err)
	}
	if len(components) != 1 {
		t.Fatalf("expected 1 component, got %d", len(components))
	}
	fm := components[0].Frontmatter
	if fm["reviewed"] != true {
		t.Fatalf("expected frontmatter reviewed=true, got %+v", fm)
	}
}
