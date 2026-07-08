package main

import (
	"os"

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
