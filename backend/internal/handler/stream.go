package handler

import (
	"log"
	"net/http"

	"github.com/mccann/awks3/backend/internal/audio"
)

type StreamHandler struct {
	broadcaster *audio.Broadcaster
}

func NewStreamHandler(b *audio.Broadcaster) *StreamHandler {
	return &StreamHandler{broadcaster: b}
}

// HandleStream serves the audio stream to a listener.
// The connection stays open until the client disconnects.
func (h *StreamHandler) HandleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "audio/ogg")
	w.Header().Set("Transfer-Encoding", "chunked")
	w.Header().Set("Cache-Control", "no-cache, no-store")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	client := h.broadcaster.Register()
	defer h.broadcaster.Unregister(client)

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case data, ok := <-client.Ch:
			if !ok {
				return // channel closed (dropped by broadcaster)
			}
			if _, err := w.Write(data); err != nil {
				log.Printf("[stream] write error: %v", err)
				return
			}
			flusher.Flush()
		}
	}
}
