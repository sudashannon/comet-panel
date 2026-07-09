package wiki

import (
	"os"
	"path/filepath"
	"strings"

	"comet-ui/internal/pathresolve"
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
