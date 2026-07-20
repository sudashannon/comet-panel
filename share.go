package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

// ShareEntry represents a single shareable document link.
type ShareEntry struct {
	Path      string    `json:"path"`
	Workspace string    `json:"workspace"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// ShareManager creates and validates time-limited share tokens for documents.
type ShareManager struct {
	mu       sync.RWMutex
	tokens   map[string]*ShareEntry
	baseURL  string // e.g. "http://192.168.1.100:8989"
}

// NewShareManager creates a new ShareManager. baseURL is the public-facing
// origin used to construct share links; if empty, "http://localhost:8989"
// is used as default.
func NewShareManager(baseURL string) *ShareManager {
	if baseURL == "" {
		baseURL = "http://localhost:8989"
	}
	m := &ShareManager{
		tokens:  make(map[string]*ShareEntry),
		baseURL: baseURL,
	}
	// Background sweep of expired tokens every 5 minutes.
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			m.sweep()
		}
	}()
	return m
}

// CreateShare generates a new share token for a document and returns the
// token and the full shareable URL. ttl is the token's lifetime; a zero or
// negative ttl means the token never expires.
func (m *ShareManager) CreateShare(path, workspace string, ttl time.Duration) (token, url string, err error) {
	token, err = generateToken()
	if err != nil {
		return "", "", fmt.Errorf("generate token: %w", err)
	}

	entry := &ShareEntry{
		Path:      path,
		Workspace: workspace,
		CreatedAt: time.Now(),
	}
	if ttl > 0 {
		entry.ExpiresAt = time.Now().Add(ttl)
	}

	m.mu.Lock()
	m.tokens[token] = entry
	m.mu.Unlock()

	url = fmt.Sprintf("%s/share/%s", m.baseURL, token)
	return token, url, nil
}

// ValidateShare looks up a token and returns its ShareEntry if it exists and
// has not expired. Expired tokens are removed on sight.
func (m *ShareManager) ValidateShare(token string) (*ShareEntry, error) {
	m.mu.RLock()
	entry, ok := m.tokens[token]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("token not found")
	}

	if !entry.ExpiresAt.IsZero() && time.Now().After(entry.ExpiresAt) {
		m.mu.Lock()
		delete(m.tokens, token)
		m.mu.Unlock()
		return nil, fmt.Errorf("token expired")
	}

	return entry, nil
}

// RevokeShare removes a token immediately.
func (m *ShareManager) RevokeShare(token string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.tokens[token]; !ok {
		return fmt.Errorf("token not found")
	}
	delete(m.tokens, token)
	return nil
}

// sweep removes all expired tokens. It is called periodically by the
// background goroutine started in NewShareManager.
func (m *ShareManager) sweep() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for token, entry := range m.tokens {
		if !entry.ExpiresAt.IsZero() && now.After(entry.ExpiresAt) {
			delete(m.tokens, token)
		}
	}
}

// generateToken produces a cryptographically random 32-byte hex string.
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
