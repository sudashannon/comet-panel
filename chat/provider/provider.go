package provider

import "context"

type ContentBlock struct {
	Type     string       `json:"type"`
	Text     string       `json:"text,omitempty"`
	Thinking string       `json:"thinking,omitempty"`
	Source   *ImageSource `json:"source,omitempty"`
}

type ImageSource struct {
	Type      string `json:"type"`
	MediaType string `json:"media_type"`
	Data      string `json:"data"`
}

type Message struct {
	Role    string         `json:"role"`
	Content []ContentBlock `json:"content"`
}

type StreamEvent struct {
	Type    string `json:"type"`
	Content string `json:"content,omitempty"`
	Error   string `json:"error,omitempty"`
}

type ChatOptions struct {
	Temperature float64
	MaxTokens   int
	Thinking    string
}

type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type Provider interface {
	Name() string
	Models() []string
	SupportsImages() bool
	ChatStream(ctx context.Context, apiKey, apiBase, model, systemPrompt string,
		messages []Message, opts ChatOptions) (<-chan StreamEvent, error)
}

type ProviderInfo struct {
	Name           string   `json:"name"`
	Models         []string `json:"models"`
	SupportsImages bool     `json:"supports_images"`
}

var registry = map[string]Provider{}

func Register(p Provider) {
	registry[p.Name()] = p
}

func Get(name string) Provider {
	return registry[name]
}

func List() []ProviderInfo {
	var infos []ProviderInfo
	for _, p := range registry {
		infos = append(infos, ProviderInfo{
			Name:           p.Name(),
			Models:         p.Models(),
			SupportsImages: p.SupportsImages(),
		})
	}
	return infos
}
