package ws

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/mccann/awks3/backend/internal/model"
)

type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	UserID   string
	Username string
	Avatar   string
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

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			if h.onChange != nil {
				h.onChange()
			}
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			if h.onChange != nil {
				h.onChange()
			}
		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
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
	for msg := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

func (c *Client) ReadPump(onMessage func(*Client, []byte)) {
	defer func() {
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
