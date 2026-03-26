package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mccann/awks3/backend/internal/model"
	"github.com/mccann/awks3/backend/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHandler struct {
	hub *ws.Hub
}

func NewWSHandler(hub *ws.Hub) *WSHandler {
	return &WSHandler{hub: hub}
}

func (h *WSHandler) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	// Get user info from query params
	userID := r.URL.Query().Get("user_id")
	username := r.URL.Query().Get("username")
	avatar := r.URL.Query().Get("avatar_url")
	if userID == "" {
		userID = "anonymous"
		username = "Anonymous"
	}

	client := &ws.Client{
		Hub:      h.hub,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		UserID:   userID,
		Username: username,
		Avatar:   avatar,
	}

	h.hub.Register(client)

	go client.WritePump()
	go client.ReadPump(func(c *ws.Client, msg []byte) {
		h.handleMessage(c, msg)
	})
}

func (h *WSHandler) handleMessage(c *ws.Client, raw []byte) {
	var msg struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}

	switch msg.Type {
	case "CHAT_SEND":
		var data struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.Text == "" {
			return
		}
		h.hub.Broadcast(model.WSMessage{
			Type: "CHAT_MESSAGE",
			Data: model.ChatMessage{
				User: model.Listener{
					ID:        c.UserID,
					Username:  c.Username,
					AvatarURL: c.Avatar,
				},
				Text:      data.Text,
				Timestamp: time.Now(),
			},
		})

	case "TRACK_ENDED":
		// Client reports track ended; the server-side timer handles advancement
		log.Printf("client %s reported track ended", c.UserID)
	}
}
