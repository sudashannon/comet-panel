package wiki

import (
	"fmt"
	"net/http"
	"sync"
)

// SSEHub manages server-sent event connections for wiki graph updates and
// watcher lifecycle signals like indexing-started.
type SSEHub struct {
	mu      sync.Mutex
	clients map[chan sseMessage]struct{}
}

type sseMessage struct {
	event string
	data  string
}

func NewSSEHub() *SSEHub {
	return &SSEHub{clients: make(map[chan sseMessage]struct{})}
}

// Broadcast sends a graph-updated event to all connected clients.
func (h *SSEHub) Broadcast(event string) {
	h.BroadcastNamed("graph-updated", event)
}

// BroadcastNamed sends a named SSE event with the provided data payload.
func (h *SSEHub) BroadcastNamed(name, data string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- sseMessage{event: name, data: data}:
		default: // drop if client is slow
		}
	}
}

// ServeHTTP handles SSE connections.
func (h *SSEHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", 500)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	flusher.Flush()

	ch := make(chan sseMessage, 8)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		delete(h.clients, ch)
		h.mu.Unlock()
	}()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-ch:
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", msg.event, msg.data)
			flusher.Flush()
		}
	}
}
