package handler

import (
	"log"
	"net/http"

	"github.com/mccann/awks3/backend/internal/service"
)

type PlaybackHandler struct {
	playback *service.PlaybackService
}

func NewPlaybackHandler(p *service.PlaybackService) *PlaybackHandler {
	return &PlaybackHandler{playback: p}
}

func (h *PlaybackHandler) GetPlayback(w http.ResponseWriter, r *http.Request) {
	state, err := h.playback.GetCurrentState(r.Context())
	if err != nil {
		log.Printf("[playback] error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if state == nil {
		writeJSON(w, map[string]interface{}{"playing": false})
		return
	}
	writeJSON(w, state)
}
