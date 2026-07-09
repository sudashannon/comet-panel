package pathresolve

import "testing"

func TestResolveArtifactPath_BareFilenameIsChangeDirRelative(t *testing.T) {
	got := ResolveArtifactPath("design.md", "/root/miao", "/root/miao/openspec/changes/my-change")
	want := "/root/miao/openspec/changes/my-change/design.md"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestResolveArtifactPath_PathWithSlashIsRootRelative(t *testing.T) {
	got := ResolveArtifactPath("docs/superpowers/specs/x-design.md", "/root/miao", "/root/miao/openspec/changes/my-change")
	want := "/root/miao/docs/superpowers/specs/x-design.md"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestResolveArtifactPath_EmptyRefReturnsEmpty(t *testing.T) {
	if got := ResolveArtifactPath("", "/root", "/root/x"); got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
}
