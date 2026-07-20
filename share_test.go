package main

import (
	"strings"
	"testing"
	"time"
)

func TestShareManager_CreateAndValidate(t *testing.T) {
	m := NewShareManager("")

	token, _, err := m.CreateShare("/x/design.md", "rx101", 1*time.Hour)
	if err != nil {
		t.Fatalf("CreateShare: %v", err)
	}
	if token == "" {
		t.Fatal("got empty token")
	}

	entry, err := m.ValidateShare(token)
	if err != nil {
		t.Fatalf("ValidateShare: %v", err)
	}
	if entry.Path != "/x/design.md" {
		t.Errorf("path = %s, want /x/design.md", entry.Path)
	}
	if entry.Workspace != "rx101" {
		t.Errorf("workspace = %s, want rx101", entry.Workspace)
	}
}

func TestShareManager_ValidateReturnsErrorForUnknownToken(t *testing.T) {
	m := NewShareManager("")
	_, err := m.ValidateShare("nonexistent")
	if err == nil || err.Error() != "token not found" {
		t.Fatalf("expected 'token not found', got: %v", err)
	}
}

func TestShareManager_ValidateReturnsErrorForExpiredToken(t *testing.T) {
	m := NewShareManager("")
	token, _, err := m.CreateShare("/x/design.md", "", 1*time.Millisecond)
	if err != nil {
		t.Fatalf("CreateShare: %v", err)
	}
	time.Sleep(10 * time.Millisecond)
	_, err = m.ValidateShare(token)
	if err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expected 'token expired', got: %v", err)
	}
}

func TestShareManager_Revoke(t *testing.T) {
	m := NewShareManager("")
	token, _, err := m.CreateShare("/x/design.md", "", 1*time.Hour)
	if err != nil {
		t.Fatalf("CreateShare: %v", err)
	}

	if err := m.RevokeShare(token); err != nil {
		t.Fatalf("RevokeShare: %v", err)
	}

	_, err = m.ValidateShare(token)
	if err == nil || err.Error() != "token not found" {
		t.Fatalf("expected 'token not found' after revoke, got: %v", err)
	}
}

func TestShareManager_RevokeUnknownTokenReturnsError(t *testing.T) {
	m := NewShareManager("")
	err := m.RevokeShare("nonexistent")
	if err == nil || err.Error() != "token not found" {
		t.Fatalf("expected 'token not found', got: %v", err)
	}
}

func TestShareManager_CreateReturnsURLWithHost(t *testing.T) {
	m := NewShareManager("http://192.168.1.100:8989")
	_, url, err := m.CreateShare("/x/design.md", "", 1*time.Hour)
	if err != nil {
		t.Fatalf("CreateShare: %v", err)
	}
	if !strings.HasPrefix(url, "http://192.168.1.100:8989/share/") {
		t.Fatalf("url = %s, want prefix http://192.168.1.100:8989/share/", url)
	}
}

func TestShareManager_CreateReturnsLocalhostFallback(t *testing.T) {
	m := NewShareManager("")
	_, url, err := m.CreateShare("/x/design.md", "", 1*time.Hour)
	if err != nil {
		t.Fatalf("CreateShare: %v", err)
	}
	if !strings.HasPrefix(url, "http://localhost:8989/share/") {
		t.Fatalf("url = %s, want prefix http://localhost:8989/share/", url)
	}
}

func TestShareManager_SweepCleansExpiredTokens(t *testing.T) {
	m := NewShareManager("")
	token1, _, _ := m.CreateShare("/x/1.md", "", 1*time.Millisecond)
	_, _, _ = m.CreateShare("/x/2.md", "", 1*time.Hour)
	time.Sleep(10 * time.Millisecond)

	m.sweep()

	if _, err := m.ValidateShare(token1); err == nil {
		t.Fatal("expected token1 to be swept out")
	}
}
