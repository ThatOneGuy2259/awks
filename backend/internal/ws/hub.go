package ws

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mccann/awks3/backend/internal/model"
)

type Client struct {
	Hub          *Hub
	Conn         *websocket.Conn
	Send         chan []byte
	Done         chan struct{} // closed to signal WritePump to stop
	UserID       string
	Username     string
	Avatar       string
	OnDisconnect func() // called when client disconnects
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
	onChange   func()
}

func NewHub(onChange func()) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		onChange:   onChange,
	}
}

// SetOnChange updates the callback invoked when clients connect or disconnect.
func (h *Hub) SetOnChange(fn func()) {
	h.mu.Lock()
	h.onChange = fn
	h.mu.Unlock()
}

func (h *Hub) removeClient(client *Client) {
	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.Done)
	}
}

func (h *Hub) Run() {
	var debounceTimer *time.Timer
	scheduleOnChange := func() {
		if debounceTimer != nil {
			debounceTimer.Stop()
		}
		debounceTimer = time.AfterFunc(time.Second, func() {
			h.mu.RLock()
			fn := h.onChange
			h.mu.RUnlock()
			if fn != nil {
				fn()
			}
		})
	}

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			scheduleOnChange()
		case client := <-h.unregister:
			h.mu.Lock()
			h.removeClient(client)
			h.mu.Unlock()
			scheduleOnChange()
		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					h.removeClient(client)
				}
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) Register(c *Client) {
	h.register <- c
}

func (h *Hub) Unregister(c *Client) {
	h.unregister <- c
}

func (h *Hub) Broadcast(msg model.WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("failed to marshal ws message: %v", err)
		return
	}
	h.broadcast <- data
}

func (h *Hub) BroadcastRaw(data []byte) {
	h.broadcast <- data
}

// SendToClient sends a message to a specific client by pointer.
func (h *Hub) SendToClient(c *Client, msg model.WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("failed to marshal ws message: %v", err)
		return
	}
	select {
	case c.Send <- data:
	default:
		log.Printf("failed to send to client %s: buffer full", c.UserID)
	}
}

func (h *Hub) GetListeners() []model.Listener {
	h.mu.RLock()
	defer h.mu.RUnlock()

	seen := make(map[string]bool)
	listeners := make([]model.Listener, 0)
	for client := range h.clients {
		if !seen[client.UserID] {
			seen[client.UserID] = true
			listeners = append(listeners, model.Listener{
				ID:        client.UserID,
				Username:  client.Username,
				AvatarURL: client.Avatar,
			})
		}
	}
	return listeners
}

func (h *Hub) ListenerCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	seen := make(map[string]bool)
	for client := range h.clients {
		seen[client.UserID] = true
	}
	return len(seen)
}

func (c *Client) WritePump() {
	defer c.Conn.Close()
	for {
		select {
		case msg, ok := <-c.Send:
			if !ok {
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-c.Done:
			return
		}
	}
}

func (c *Client) ReadPump(onMessage func(*Client, []byte)) {
	defer func() {
		if c.OnDisconnect != nil {
			c.OnDisconnect()
		}
		c.Hub.Unregister(c)
		c.Conn.Close()
	}()
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			return
		}
		if onMessage != nil {
			onMessage(c, message)
		}
	}
}
