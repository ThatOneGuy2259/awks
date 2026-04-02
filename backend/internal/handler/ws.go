package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/clerk/clerk-sdk-go/v2/jwt"
	"github.com/clerk/clerk-sdk-go/v2/user"
	"github.com/gorilla/websocket"
	"github.com/mccann/awks3/backend/internal/audio"
	"github.com/mccann/awks3/backend/internal/model"
	"github.com/mccann/awks3/backend/internal/ws"
)

type WSHandler struct {
	hub            *ws.Hub
	peerManager    *audio.PeerManager
	allowedOrigins []string
}

func NewWSHandler(hub *ws.Hub, pm *audio.PeerManager, corsOrigin string) *WSHandler {
	origins := strings.Split(corsOrigin, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	return &WSHandler{hub: hub, peerManager: pm, allowedOrigins: origins}
}

func (h *WSHandler) HandleWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			for _, allowed := range h.allowedOrigins {
				if origin == allowed {
					return true
				}
			}
			log.Printf("[ws] rejected origin: %s", origin)
			return false
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	// Wait for AUTH message as the first message (10s timeout)
	conn.SetReadLimit(4096)
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))

	_, raw, err := conn.ReadMessage()
	if err != nil {
		log.Printf("[ws] auth read error: %v", err)
		conn.Close()
		return
	}

	var authMsg struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &authMsg); err != nil || authMsg.Type != "AUTH" {
		log.Printf("[ws] expected AUTH message, got: %s", authMsg.Type)
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "expected AUTH"))
		conn.Close()
		return
	}

	var authData struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(authMsg.Data, &authData); err != nil || authData.Token == "" {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "missing token"))
		conn.Close()
		return
	}

	claims, err := jwt.Verify(context.Background(), &jwt.VerifyParams{Token: authData.Token})
	if err != nil {
		log.Printf("[ws] invalid token: %v", err)
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "invalid token"))
		conn.Close()
		return
	}

	userID := claims.Subject

	// Reset read deadline after successful auth
	conn.SetReadDeadline(time.Time{})

	// Fetch user details from Clerk
	clerkUser, err := user.Get(r.Context(), userID)
	if err != nil {
		log.Printf("[ws] clerk get user error: %v", err)
		conn.Close()
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
		if len(data.Text) > 500 {
			data.Text = data.Text[:500]
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
