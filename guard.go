package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

// resolveCometGuard locates the comet-guard entrypoint. It never
// reimplements guard logic — it only finds the script a human/agent would
// invoke manually, so behavior stays identical to the CLI forever.
//
// Resolution order:
//  1. $COMET_GUARD env var (explicit override, e.g. set in the systemd
//     unit file for non-standard installs)
//  2. ~/.config/opencode/skills/comet/scripts/comet-guard.mjs (0.4.0+ canonical)
//  3. ~/.config/opencode/skills/comet/scripts/comet-guard.sh (legacy)
func resolveCometGuard() (interpreter, scriptPath string, err error) {
	if envPath := os.Getenv("COMET_GUARD"); envPath != "" {
		if _, statErr := os.Stat(envPath); statErr == nil {
			return interpreterFor(envPath), envPath, nil
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", err
	}
	scriptDir := filepath.Join(home, ".config", "opencode", "skills", "comet", "scripts")

	mjsPath := filepath.Join(scriptDir, "comet-guard.mjs")
	if _, statErr := os.Stat(mjsPath); statErr == nil {
		return "node", mjsPath, nil
	}

	shPath := filepath.Join(scriptDir, "comet-guard.sh")
	if _, statErr := os.Stat(shPath); statErr == nil {
		return "bash", shPath, nil
	}

	return "", "", fmt.Errorf("comet-guard not found: checked $COMET_GUARD, %s, %s", mjsPath, shPath)
}

func interpreterFor(path string) string {
	if filepath.Ext(path) == ".mjs" {
		return "node"
	}
	return "bash"
}

// TriggerTransition shells out to the resolved comet-guard script with
// --apply. It never inspects or judges the output — the caller streams it
// verbatim to the client (see HandleTransition in Task 32).
func TriggerTransition(changeName, targetPhase, workspaceDir string) (io.ReadCloser, error) {
	interp, script, err := resolveCometGuard()
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(interp, script, changeName, targetPhase, "--apply")
	cmd.Dir = workspaceDir
	pr, pw := io.Pipe()
	cmd.Stdout = pw
	cmd.Stderr = pw

	go func() {
		err := cmd.Run()
		if err != nil {
			pw.CloseWithError(err)
			return
		}
		pw.Close()
	}()

	return pr, nil
}

// TransitionLock guards against concurrent guard invocations for the same
// change. Each change name may have at most one in-flight transition;
// different change names never block each other.
type TransitionLock struct {
	mu       sync.Mutex
	inFlight map[string]bool
}

func NewTransitionLock() *TransitionLock {
	return &TransitionLock{inFlight: make(map[string]bool)}
}

func (l *TransitionLock) TryAcquire(changeName string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.inFlight[changeName] {
		return false
	}
	l.inFlight[changeName] = true
	return true
}

func (l *TransitionLock) Release(changeName string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.inFlight, changeName)
}
