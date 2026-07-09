// Package pathresolve holds the artifact-path resolution rule shared by
// scanner.go (main package) and wiki (separate package, cannot import main).
// A bare filename (no "/") is relative to the change directory; a path
// containing "/" is relative to the workspace root — matching the
// .comet.yaml convention for design_doc/plan/verification_report fields.
package pathresolve

import (
	"path/filepath"
	"strings"
)

func ResolveArtifactPath(ref, root, changeDir string) string {
	if ref == "" {
		return ""
	}
	if !strings.Contains(ref, "/") {
		return filepath.Join(changeDir, ref)
	}
	return filepath.Join(root, ref)
}
