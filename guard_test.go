// guard_test.go
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveCometGuard_PrefersEnvVarOverride(t *testing.T) {
	fakePath := filepath.Join(t.TempDir(), "fake-guard.mjs")
	os.WriteFile(fakePath, []byte("// fake"), 0644)
	t.Setenv("COMET_GUARD", fakePath)

	interp, path, err := resolveCometGuard()
	if err != nil {
		t.Fatal(err)
	}
	if path != fakePath || interp != "node" {
		t.Fatalf("expected node+%s, got %s+%s", fakePath, interp, path)
	}
}

func TestResolveCometGuard_FallsBackToKnownDiskLocation(t *testing.T) {
	t.Setenv("COMET_GUARD", "")
	home := t.TempDir()
	t.Setenv("HOME", home)
	scriptDir := filepath.Join(home, ".config", "opencode", "skills", "comet", "scripts")
	os.MkdirAll(scriptDir, 0755)
	mjsPath := filepath.Join(scriptDir, "comet-guard.mjs")
	os.WriteFile(mjsPath, []byte("// real"), 0644)

	interp, path, err := resolveCometGuard()
	if err != nil {
		t.Fatal(err)
	}
	if path != mjsPath || interp != "node" {
		t.Fatalf("expected node+%s, got %s+%s", mjsPath, interp, path)
	}
}

func TestResolveCometGuard_FallsBackToLegacyShellScript(t *testing.T) {
	t.Setenv("COMET_GUARD", "")
	home := t.TempDir()
	t.Setenv("HOME", home)
	scriptDir := filepath.Join(home, ".config", "opencode", "skills", "comet", "scripts")
	os.MkdirAll(scriptDir, 0755)
	shPath := filepath.Join(scriptDir, "comet-guard.sh")
	os.WriteFile(shPath, []byte("# real"), 0644)
	// no .mjs present — must fall back to .sh

	interp, path, err := resolveCometGuard()
	if err != nil {
		t.Fatal(err)
	}
	if path != shPath || interp != "bash" {
		t.Fatalf("expected bash+%s, got %s+%s", shPath, interp, path)
	}
}

func TestResolveCometGuard_ErrorsWhenNothingFound(t *testing.T) {
	t.Setenv("COMET_GUARD", "")
	t.Setenv("HOME", t.TempDir()) // empty — no scripts dir at all
	_, _, err := resolveCometGuard()
	if err == nil {
		t.Fatal("expected an error when no guard script can be located")
	}
}
