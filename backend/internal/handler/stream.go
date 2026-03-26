package handler

import (
	"io"
	"log"
	"net/http"
)

type StreamHandler struct {
	icecastURL string
}

func NewStreamHandler(icecastURL string) *StreamHandler {
	return &StreamHandler{icecastURL: icecastURL}
}

// HandleStream proxies the Icecast listener stream to the browser.
// This avoids the browser needing direct access to the Icecast port.
func (h *StreamHandler) HandleStream(w http.ResponseWriter, r *http.Request) {
	resp, err := http.Get(h.icecastURL)
	if err != nil {
		http.Error(w, "stream unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Forward Icecast headers
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", "no-cache, no-store")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	buf := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				return
			}
			flusher.Flush()
		}
		if err == io.EOF {
			return
		}
		if err != nil {
			log.Printf("[stream proxy] read error: %v", err)
			return
		}
	}
}
