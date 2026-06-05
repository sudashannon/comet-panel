package chat

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type ProviderConfig struct {
	APIKey      string  `json:"api_key"`
	APIBase     string  `json:"api_base"`
	Model       string  `json:"model"`
	Temperature float64 `json:"temperature"`
	MaxTokens   int     `json:"max_tokens"`
	Thinking    string  `json:"thinking"`
}

type Config struct {
	ActiveProvider string                    `json:"active_provider"`
	Providers      map[string]ProviderConfig `json:"providers"`
}

func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".comet-ui", "config.json"), nil
}

func LoadConfig() (*Config, error) {
	path, err := configPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return defaultConfig(), nil
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return defaultConfig(), nil
	}
	if cfg.Providers == nil {
		cfg.Providers = map[string]ProviderConfig{}
	}
	return &cfg, nil
}

func SaveConfig(cfg *Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	os.MkdirAll(dir, 0700)
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func defaultConfig() *Config {
	return &Config{
		ActiveProvider: "minimax",
		Providers: map[string]ProviderConfig{
			"minimax": {
				APIBase:     "https://api.minimaxi.com",
				Model:       "MiniMax-M3",
				Temperature: 1.0,
				MaxTokens:   4096,
				Thinking:    "auto",
			},
		},
	}
}
