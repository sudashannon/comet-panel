package wiki

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestSSEHubBroadcastDelivers verifies that an event broadcast after a
// client connects is delivered over the SSE stream in the expected
// "event: graph-updated\ndata: <payload>\n\n" wire format. It uses a real
// httptest.Server (rather than httptest.ResponseRecorder) so the client
// read and the handler's write happen on genuinely separate connections
// synchronized by the network stack, avoiding a data race on a shared
// in-memory buffer.
func TestSSEHubBroadcastDelivers(t *testing.T) {
	hub := NewSSEHub()
	srv := httptest.NewServer(hub)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL, nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer resp.Body.Close()

	// Wait for the client to register before broadcasting.
	deadline := time.Now().Add(2 * time.Second)
	for {
		hub.mu.Lock()
		n := len(hub.clients)
		hub.mu.Unlock()
		if n > 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for client to register")
		}
		time.Sleep(time.Millisecond)
	}

	hub.Broadcast(`{"changed":1}`)

	reader := bufio.NewReader(resp.Body)
	var lines []string
	for i := 0; i < 2; i++ {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read SSE stream: %v", err)
		}
		lines = append(lines, line)
	}
	got := strings.Join(lines, "")
	if !strings.Contains(got, "event: graph-updated") || !strings.Contains(got, `data: {"changed":1}`) {
		t.Fatalf("body missing expected SSE event, got: %q", got)
	}
}

// TestSSEHubBroadcastDropsWhenNoClients ensures Broadcast is a no-op (does
// not block or panic) when there are no connected clients.
func TestSSEHubBroadcastDropsWhenNoClients(t *testing.T) {
	hub := NewSSEHub()
	hub.Broadcast(`{"changed":1}`)
}
