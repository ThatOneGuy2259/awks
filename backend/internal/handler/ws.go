package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/clerk/clerk-sdk-go/v2/jwt"
	"github.com/clerk/clerk-sdk-go/v2/user"
	"github.com/gorilla/websocket"
	"github.com/mccann/awks3/backend/internal/audio"
	"github.com/mccann/awks3/backend/internal/model"
	"github.com/mccann/awks3/backend/internal/service"
	"github.com/mccann/awks3/backend/internal/store"
	"github.com/mccann/awks3/backend/internal/ws"
)

// maxListenOnly caps signed-out /listen connections. Each one costs a WebRTC
// peer and ~100 kbps of the home server's upload.
const maxListenOnly = 25

type WSHandler struct {
	hub            *ws.Hub
	peerManager    *audio.PeerManager
	playback       *service.PlaybackService
	queries        store.Querier
	listen         *ListenHandler
	allowedOrigins []string
}

func NewWSHandler(hub *ws.Hub, pm *audio.PeerManager, p *service.PlaybackService, q store.Querier, listen *ListenHandler, corsOrigin string) *WSHandler {
	origins := strings.Split(corsOrigin, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	return &WSHandler{hub: hub, peerManager: pm, playback: p, queries: q, listen: listen, allowedOrigins: origins}
}

func (h *WSHandler) upgrader() websocket.Upgrader {
	return websocket.Upgrader{
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
}

// newClient builds a hub client with the per-client message limits.
func (h *WSHandler) newClient(conn *websocket.Conn) *ws.Client {
	return &ws.Client{
		Hub:           h.hub,
		Conn:          conn,
		Send:          make(chan []byte, 256),
		Done:          make(chan struct{}),
		ChatLimit:     ws.NewRateLimiter(5, 2*time.Second),
		ReactionLimit: ws.NewRateLimiter(10, 500*time.Millisecond),
		OfferLimit:    ws.NewRateLimiter(3, 5*time.Second),
	}
}

// start registers the client and runs its pumps.
func (h *WSHandler) start(client *ws.Client) {
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

// HandleListenWS serves paired /listen screens: the first message must be
// LISTEN_AUTH with the device key from pairing. They get playback messages
// only, plus the current track and queue on connect.
func (h *WSHandler) HandleListenWS(w http.ResponseWriter, r *http.Request) {
	if h.hub.ListenOnlyCount() >= maxListenOnly {
		http.Error(w, "too many listen-only connections", http.StatusServiceUnavailable)
		return
	}

	upgrader := h.upgrader()
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	conn.SetReadLimit(4096)
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		conn.Close()
		return
	}
	var authMsg struct {
		Type string `json:"type"`
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	deviceID, ok := "", false
	if json.Unmarshal(raw, &authMsg) == nil && authMsg.Type == "LISTEN_AUTH" {
		deviceID, ok = h.listen.DeviceForToken(r.Context(), authMsg.Data.Token)
	}
	if !ok {
		// 1008 tells the page its key is gone, so it asks for a new code.
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "invalid listen key"))
		conn.Close()
		return
	}
	conn.SetReadDeadline(time.Time{})

	client := h.newClient(conn)
	client.ListenOnly = true
	client.DeviceID = deviceID
	client.UserID = fmt.Sprintf("listen-%p", client)

	h.hub.SendToClient(client, h.playback.NowPlayingMessage())
	h.hub.SendToClient(client, service.QueueUpdateMessage(r.Context(), h.queries))
	h.start(client)
}

func (h *WSHandler) HandleWS(w http.ResponseWriter, r *http.Request) {
	upgrader := h.upgrader()
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

	client := h.newClient(conn)
	client.UserID = userID
	client.Username = username
	client.Avatar = avatar

	h.start(client)
}

func (h *WSHandler) handleMessage(c *ws.Client, raw []byte) {
	var msg struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}

	// Listen-only pages can only set up audio.
	if c.ListenOnly && msg.Type != "WEBRTC_OFFER" && msg.Type != "WEBRTC_ICE_CANDIDATE" {
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
		if !c.ChatLimit.Allow() {
			h.hub.SendToClient(c, model.WSMessage{Type: "CHAT_RATE_LIMITED"})
			return
		}
		// Truncate by runes so a multi-byte character is never split.
		if utf8.RuneCountInString(data.Text) > 500 {
			data.Text = string([]rune(data.Text)[:500])
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
		if !allowed[data.Emoji] || !c.ReactionLimit.Allow() {
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
		// Each offer builds a new PeerConnection, so cap how often it happens.
		if !c.OfferLimit.Allow() {
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
