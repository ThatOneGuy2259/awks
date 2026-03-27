package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/clerk/clerk-sdk-go/v2/jwt"
	"github.com/clerk/clerk-sdk-go/v2/user"
	"github.com/gorilla/websocket"
	"github.com/mccann/awks3/backend/internal/audio"
	"github.com/mccann/awks3/backend/internal/model"
	"github.com/mccann/awks3/backend/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHandler struct {
	hub         *ws.Hub
	peerManager *audio.PeerManager
}

func NewWSHandler(hub *ws.Hub, pm *audio.PeerManager) *WSHandler {
	return &WSHandler{hub: hub, peerManager: pm}
}

func (h *WSHandler) HandleWS(w http.ResponseWriter, r *http.Request) {
	// Verify Clerk JWT from query parameter
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	claims, err := jwt.Verify(context.Background(), &jwt.VerifyParams{Token: token})
	if err != nil {
		log.Printf("[ws] invalid token: %v", err)
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	userID := claims.Subject

	// Fetch user details from Clerk
	clerkUser, err := user.Get(r.Context(), userID)
	if err != nil {
		log.Printf("[ws] clerk get user error: %v", err)
		http.Error(w, "could not resolve user", http.StatusUnauthorized)
		return
	}

	// Build display name
	username := ""
	firstName := ""
	lastName := ""
	if clerkUser.FirstName != nil {
		firstName = *clerkUser.FirstName
	}
	if clerkUser.LastName != nil {
		lastName = *clerkUser.LastName
	}
	if firstName != "" && lastName != "" {
		username = string([]rune(firstName)[0]) + ". " + lastName
	} else if firstName != "" {
		username = firstName
	} else if clerkUser.Username != nil && *clerkUser.Username != "" {
		username = *clerkUser.Username
	} else {
		username = userID[:8]
	}

	avatar := ""
	if clerkUser.ImageURL != nil {
		avatar = *clerkUser.ImageURL
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	client := &ws.Client{
		Hub:      h.hub,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		Done:     make(chan struct{}),
		UserID:   userID,
		Username: username,
		Avatar:   avatar,
	}

	clientID := fmt.Sprintf("%p", client)
	client.OnDisconnect = func() {
		h.peerManager.RemoveClient(clientID)
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

	case "REACTION":
		var data struct {
			Emoji string `json:"emoji"`
		}
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.Emoji == "" {
			return
		}
		allowed := map[string]bool{"🔥": true, "❤️": true, "😂": true, "💀": true, "🗑️": true}
		if !allowed[data.Emoji] {
			return
		}
		h.hub.Broadcast(model.WSMessage{
			Type: "REACTION",
			Data: map[string]string{
				"emoji":    data.Emoji,
				"user_id":  c.UserID,
				"username": c.Username,
			},
		})

	case "WEBRTC_OFFER":
		var data struct {
			SDP string `json:"sdp"`
		}
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.SDP == "" {
			return
		}
		clientID := fmt.Sprintf("%p", c)
		sendToClient := func(msgType string, payload interface{}) {
			h.hub.SendToClient(c, model.WSMessage{
				Type: msgType,
				Data: payload,
			})
		}
		if err := h.peerManager.HandleOffer(clientID, data.SDP, sendToClient); err != nil {
			log.Printf("[webrtc] offer error for %s: %v", c.UserID, err)
		}

	case "WEBRTC_ICE_CANDIDATE":
		var data struct {
			Candidate string `json:"candidate"`
		}
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.Candidate == "" {
			return
		}
		clientID := fmt.Sprintf("%p", c)
		if err := h.peerManager.HandleICECandidate(clientID, data.Candidate); err != nil {
			log.Printf("[webrtc] ICE candidate error for %s: %v", c.UserID, err)
		}

	case "TRACK_ENDED":
		log.Printf("client %s reported track ended", c.UserID)
	}
}
