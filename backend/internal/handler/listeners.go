package handler

import (
	"net/http"

	"github.com/mccann/awks3/backend/internal/ws"
)

type ListenerHandler struct {
	hub *ws.Hub
}

func NewListenerHandler(h *ws.Hub) *ListenerHandler {
	return &ListenerHandler{hub: h}
}

func (h *ListenerHandler) GetListeners(w http.ResponseWriter, r *http.Request) {
	listeners := h.hub.GetListeners()
	writeJSON(w, map[string]interface{}{
		"count":     len(listeners),
		"listeners": listeners,
	})
}
