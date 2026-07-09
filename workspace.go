package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

type WorkspaceConfig struct {
	Alias string `yaml:"alias" json:"alias"`
	Path  string `yaml:"path" json:"path"`
	Color string `yaml:"color" json:"color"`
}

type workspacesFile struct {
	Workspaces []WorkspaceConfig `yaml:"workspaces"`
}

// LoadWorkspaces reads the workspace registry config. A missing file is not
// an error — it means no workspaces are registered yet.
func LoadWorkspaces(configPath string) ([]WorkspaceConfig, error) {
	data, err := os.ReadFile(configPath)
	if os.IsNotExist(err) {
		return []WorkspaceConfig{}, nil
	}
	if err != nil {
		return nil, err
	}
	var f workspacesFile
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if f.Workspaces == nil {
		return []WorkspaceConfig{}, nil
	}
	return f.Workspaces, nil
}

type WorkspaceRegistry struct {
	mu         sync.RWMutex
	workspaces []WorkspaceConfig
	configPath string
}

func NewWorkspaceRegistry(configPath string) (*WorkspaceRegistry, error) {
	ws, err := LoadWorkspaces(configPath)
	if err != nil {
		return nil, err
	}
	return &WorkspaceRegistry{workspaces: ws, configPath: configPath}, nil
}

func (r *WorkspaceRegistry) List() []WorkspaceConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]WorkspaceConfig, len(r.workspaces))
	copy(out, r.workspaces)
	return out
}

func (r *WorkspaceRegistry) Add(cfg WorkspaceConfig) error {
	if err := validateWorkspacePath(cfg.Path); err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for _, w := range r.workspaces {
		if w.Alias == cfg.Alias {
			return fmt.Errorf("workspace alias %q already registered", cfg.Alias)
		}
	}

	updated := append(r.workspaces, cfg)
	if err := persistWorkspaces(r.configPath, updated); err != nil {
		return err
	}
	r.workspaces = updated
	return nil
}

// validateWorkspacePath rejects workspace paths that would make the
// per-request traversal guard in handleGetArtifact a no-op or otherwise
// expose the whole filesystem: the path must be an absolute, existing
// directory, and must not be the filesystem root or one of its direct
// children (e.g. "/", "/etc", "/home") — registering such a path would let
// GET /api/artifact?workspace=<alias>&path=/etc/shadow read anything the
// server process can access.
func validateWorkspacePath(path string) error {
	if !filepath.IsAbs(path) {
		return fmt.Errorf("workspace path %q must be an absolute path", path)
	}

	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("workspace path %q is not accessible: %w", path, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("workspace path %q is not a directory", path)
	}

	clean := filepath.Clean(path)
	segments := strings.FieldsFunc(clean, func(c rune) bool { return c == filepath.Separator })
	if len(segments) < 2 {
		return fmt.Errorf("workspace path %q must not be the filesystem root or a direct child of it", path)
	}

	return nil
}

func persistWorkspaces(configPath string, ws []WorkspaceConfig) error {
	f := workspacesFile{Workspaces: ws}
	data, err := yaml.Marshal(f)
	if err != nil {
		return err
	}
	if dir := filepath.Dir(configPath); dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	return os.WriteFile(configPath, data, 0644)
}
