# WebRTC Audio Streaming Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Icecast HTTP streaming with WebRTC peer connections using Pion for sub-second audio latency.

**Architecture:** The Go server reads OGG/Opus files via Pion's oggreader, writes Opus samples to a shared `TrackLocalStaticSample`. Each listener gets a WebRTC peer connection (signaled over the existing WebSocket) that receives audio from this shared track. Icecast, the stream proxy, and the custom OGG reader are removed.

**Tech Stack:** Pion WebRTC v4 (Go), RTCPeerConnection (browser), existing WebSocket for signaling

**Spec:** `docs/superpowers/specs/2026-03-26-webrtc-audio-design.md`

---

## File Map

### New Files
- `backend/internal/audio/peermanager.go` — creates/manages WebRTC peer connections per listener
- `frontend/src/hooks/useWebRTC.ts` — browser RTCPeerConnection with signaling over WebSocket

### Modified Files
- `backend/go.mod` — add `github.com/pion/webrtc/v4`
- `backend/internal/audio/broadcaster.go` — replace Icecast writer with Pion TrackLocalStaticSample + oggreader
- `backend/internal/handler/ws.go` — handle WEBRTC_OFFER and WEBRTC_ICE_CANDIDATE messages
- `backend/internal/ws/hub.go` — add SendToClient method for targeted signaling responses
- `backend/cmd/server/main.go` — create PeerManager, remove Icecast/stream config
- `backend/internal/config/config.go` — replace Icecast config with ICE servers config
- `backend/.env` — replace Icecast vars with WEBRTC_ICE_SERVERS
- `docker-compose.yml` — remove Icecast service
- `frontend/src/hooks/useAudioStream.ts` — replaced by useWebRTC
- `frontend/src/hooks/useWebSocket.ts` — add message callback registration for WebRTC signaling
- `frontend/src/App.tsx` — use useWebRTC instead of useAudioStream
- `frontend/vite.config.ts` — remove /stream proxy

### Deleted Files
- `backend/internal/handler/stream.go` — Icecast proxy no longer needed
- `backend/internal/audio/ogg.go` — replaced by Pion's oggreader
- `frontend/src/components/player/AudioStream.tsx` — replaced by WebRTC

---

## Task 1: Add Pion Dependency & Rewrite Broadcaster

**Files:**
- Modify: `backend/go.mod`
- Modify: `backend/internal/audio/broadcaster.go`
- Delete: `backend/internal/audio/ogg.go`

- [ ] **Step 1: Add Pion WebRTC dependency**

```bash
cd /Users/mccann/development/awks3/backend && go get github.com/pion/webrtc/v4@latest
```

- [ ] **Step 2: Delete the custom OGG reader**

```bash
rm /Users/mccann/development/awks3/backend/internal/audio/ogg.go
```

- [ ] **Step 3: Replace broadcaster.go entirely**

Replace `backend/internal/audio/broadcaster.go` with:

```go
package audio

import (
	"context"
	"io"
	"log"
	"os"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
	"github.com/pion/webrtc/v4/pkg/media/oggreader"
)

// Broadcaster reads OGG/Opus audio files and writes Opus samples to a
// shared WebRTC track at real-time pace. All peer connections that have
// this track added will receive the audio.
type Broadcaster struct {
	track  *webrtc.TrackLocalStaticSample
	skipCh chan struct{}
	wakeCh chan struct{}
}

func NewBroadcaster() (*Broadcaster, error) {
	track, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus},
		"audio",
		"awks-radio",
	)
	if err != nil {
		return nil, err
	}
	return &Broadcaster{
		track:  track,
		skipCh: make(chan struct{}, 1),
		wakeCh: make(chan struct{}, 1),
	}, nil
}

// Track returns the shared audio track that should be added to each peer connection.
func (b *Broadcaster) Track() *webrtc.TrackLocalStaticSample {
	return b.track
}

// Skip signals the broadcaster to stop the current track immediately.
func (b *Broadcaster) Skip() {
	select {
	case b.skipCh <- struct{}{}:
	default:
	}
}

// Wake signals the broadcaster that a new track may be available.
func (b *Broadcaster) Wake() {
	select {
	case b.wakeCh <- struct{}{}:
	default:
	}
}

// Run is the main broadcaster loop.
func (b *Broadcaster) Run(ctx context.Context, getNextTrack func() (string, float64, error), onTrackDone func(skipped bool)) {
	for {
		audioPath, startOffset, err := getNextTrack()
		if err != nil {
			log.Printf("[broadcaster] error getting next track: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		if audioPath == "" {
			select {
			case <-ctx.Done():
				return
			case <-b.wakeCh:
				continue
			}
		}

		log.Printf("[broadcaster] streaming %s (offset=%.1fs)", audioPath, startOffset)
		skipped := b.streamFile(ctx, audioPath, startOffset)
		onTrackDone(skipped)
	}
}

// streamFile reads an OGG/Opus file and writes samples to the WebRTC track at real-time pace.
func (b *Broadcaster) streamFile(ctx context.Context, path string, startOffsetSec float64) bool {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("[broadcaster] failed to open %s: %v", path, err)
		return false
	}
	defer f.Close()

	ogg, _, err := oggreader.NewWith(f)
	if err != nil {
		log.Printf("[broadcaster] failed to create ogg reader: %v", err)
		return false
	}

	// Read pages, calculate timing from granule positions
	var lastGranule uint64

	// If resuming mid-track, skip pages until target position
	if startOffsetSec > 0 {
		targetGranule := uint64(startOffsetSec * 48000)
		for {
			pageData, pageHeader, err := ogg.ParseNextPage()
			if err != nil {
				log.Printf("[broadcaster] seek failed: %v", err)
				return false
			}
			_ = pageData
			if pageHeader.GranulePosition >= targetGranule {
				lastGranule = pageHeader.GranulePosition
				break
			}
		}
		log.Printf("[broadcaster] seeked to %.1fs", startOffsetSec)
	}

	startTime := time.Now()
	startGranule := lastGranule

	for {
		select {
		case <-ctx.Done():
			return false
		case <-b.skipCh:
			return true
		default:
		}

		pageData, pageHeader, err := ogg.ParseNextPage()
		if err == io.EOF {
			return false
		}
		if err != nil {
			log.Printf("[broadcaster] OGG read error: %v", err)
			return false
		}

		// Calculate sample duration from granule difference
		sampleCount := pageHeader.GranulePosition - lastGranule
		if sampleCount == 0 {
			// Header pages have granule 0, skip timing for them
			continue
		}
		sampleDuration := time.Duration(float64(sampleCount) / 48000.0 * float64(time.Second))

		// Write the Opus sample to the shared track
		if err := b.track.WriteSample(media.Sample{
			Data:     pageData,
			Duration: sampleDuration,
		}); err != nil {
			log.Printf("[broadcaster] WriteSample error: %v", err)
			return false
		}

		lastGranule = pageHeader.GranulePosition

		// Pace: sleep to maintain real-time playback
		pageTimeSec := float64(pageHeader.GranulePosition-startGranule) / 48000.0
		elapsed := time.Since(startTime).Seconds()
		ahead := pageTimeSec - elapsed
		if ahead > 0.005 {
			sleepTimer := time.NewTimer(time.Duration(ahead * float64(time.Second)))
			select {
			case <-sleepTimer.C:
			case <-b.skipCh:
				sleepTimer.Stop()
				return true
			case <-ctx.Done():
				sleepTimer.Stop()
				return false
			}
		}
	}
}
```

- [ ] **Step 4: Tidy modules**

```bash
cd /Users/mccann/development/awks3/backend && go mod tidy
```

- [ ] **Step 5: Verify the audio package compiles**

```bash
cd /Users/mccann/development/awks3/backend && go build ./internal/audio/...
```

Expected: PASS. The full build will fail because main.go still references the old Broadcaster constructor — that's expected and fixed in later tasks.

- [ ] **Step 6: Commit**

```bash
git rm backend/internal/audio/ogg.go
git add backend/go.mod backend/go.sum backend/internal/audio/broadcaster.go
git commit -m "feat: rewrite broadcaster with Pion WebRTC TrackLocalStaticSample"
```

---

## Task 2: PeerManager

**Files:**
- Create: `backend/internal/audio/peermanager.go`

- [ ] **Step 1: Create peermanager.go**

Create `backend/internal/audio/peermanager.go`:

```go
package audio

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/pion/webrtc/v4"
)

// PeerManager creates and manages WebRTC peer connections for listeners.
type PeerManager struct {
	track      *webrtc.TrackLocalStaticSample
	iceServers []webrtc.ICEServer
	mu         sync.Mutex
	peers      map[string]*webrtc.PeerConnection // keyed by WebSocket client ID
}

func NewPeerManager(track *webrtc.TrackLocalStaticSample, iceServers []webrtc.ICEServer) *PeerManager {
	return &PeerManager{
		track:      track,
		iceServers: iceServers,
		peers:      make(map[string]*webrtc.PeerConnection),
	}
}

// HandleOffer processes an SDP offer from a client and returns an SDP answer.
// sendToClient is a callback to send signaling messages back to the specific client.
func (pm *PeerManager) HandleOffer(clientID string, offerSDP string, sendToClient func(msgType string, data interface{})) error {
	pm.mu.Lock()
	// Close existing peer connection for this client if any
	if existing, ok := pm.peers[clientID]; ok {
		existing.Close()
		delete(pm.peers, clientID)
	}
	pm.mu.Unlock()

	pc, err := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: pm.iceServers,
	})
	if err != nil {
		return fmt.Errorf("failed to create peer connection: %w", err)
	}

	// Add the shared audio track
	rtpSender, err := pc.AddTrack(pm.track)
	if err != nil {
		pc.Close()
		return fmt.Errorf("failed to add track: %w", err)
	}

	// Read incoming RTCP packets (required by Pion)
	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, rtcpErr := rtpSender.Read(rtcpBuf); rtcpErr != nil {
				return
			}
		}
	}()

	// Send ICE candidates to the client as they're gathered
	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		candidateJSON, err := json.Marshal(c.ToJSON())
		if err != nil {
			return
		}
		sendToClient("WEBRTC_ICE_CANDIDATE", json.RawMessage(candidateJSON))
	})

	// Log connection state changes and clean up on disconnect
	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Printf("[webrtc] peer %s ICE state: %s", clientID, state.String())
		if state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateDisconnected || state == webrtc.ICEConnectionStateClosed {
			pm.mu.Lock()
			if pm.peers[clientID] == pc {
				delete(pm.peers, clientID)
			}
			pm.mu.Unlock()
			pc.Close()
		}
	})

	// Set the remote description (the offer)
	offer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerSDP,
	}
	if err := pc.SetRemoteDescription(offer); err != nil {
		pc.Close()
		return fmt.Errorf("failed to set remote description: %w", err)
	}

	// Create and set the answer
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		pc.Close()
		return fmt.Errorf("failed to create answer: %w", err)
	}
	if err := pc.SetLocalDescription(answer); err != nil {
		pc.Close()
		return fmt.Errorf("failed to set local description: %w", err)
	}

	// Store the peer connection
	pm.mu.Lock()
	pm.peers[clientID] = pc
	pm.mu.Unlock()

	// Send the answer back to the client
	sendToClient("WEBRTC_ANSWER", map[string]string{"sdp": answer.SDP})

	return nil
}

// HandleICECandidate adds an ICE candidate from a client to their peer connection.
func (pm *PeerManager) HandleICECandidate(clientID string, candidateJSON string) error {
	pm.mu.Lock()
	pc, ok := pm.peers[clientID]
	pm.mu.Unlock()
	if !ok {
		return fmt.Errorf("no peer connection for client %s", clientID)
	}

	var candidate webrtc.ICECandidateInit
	if err := json.Unmarshal([]byte(candidateJSON), &candidate); err != nil {
		return fmt.Errorf("invalid ICE candidate: %w", err)
	}

	return pc.AddICECandidate(candidate)
}

// RemoveClient closes and removes the peer connection for a client.
func (pm *PeerManager) RemoveClient(clientID string) {
	pm.mu.Lock()
	if pc, ok := pm.peers[clientID]; ok {
		pc.Close()
		delete(pm.peers, clientID)
	}
	pm.mu.Unlock()
}

// PeerCount returns the number of active peer connections.
func (pm *PeerManager) PeerCount() int {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	return len(pm.peers)
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/mccann/development/awks3/backend && go build ./internal/audio/...
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/internal/audio/peermanager.go
git commit -m "feat: add WebRTC peer connection manager"
```

---

## Task 3: Hub SendToClient & WS Handler Signaling

**Files:**
- Modify: `backend/internal/ws/hub.go`
- Modify: `backend/internal/handler/ws.go`

- [ ] **Step 1: Add SendToClient method to Hub**

Add this method to `backend/internal/ws/hub.go` after the `BroadcastRaw` method:

```go
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
```

- [ ] **Step 2: Add PeerManager to WSHandler and handle signaling messages**

Replace `backend/internal/handler/ws.go` entirely:

```go
package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

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

	case "WEBRTC_OFFER":
		var data struct {
			SDP string `json:"sdp"`
		}
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.SDP == "" {
			return
		}
		// Use pointer address as unique client ID for peer manager
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
```

Add `"fmt"` to the imports.

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/mccann/development/awks3/backend && go build ./internal/...
```

Expected: PASS (main.go will fail due to changed constructor — fixed in Task 4)

- [ ] **Step 4: Commit**

```bash
git add backend/internal/ws/hub.go backend/internal/handler/ws.go
git commit -m "feat: add WebRTC signaling to WebSocket handler"
```

---

## Task 4: Config, Cleanup & Wire main.go

**Files:**
- Modify: `backend/internal/config/config.go`
- Modify: `backend/.env`
- Modify: `backend/cmd/server/main.go`
- Modify: `docker-compose.yml`
- Delete: `backend/internal/handler/stream.go`

- [ ] **Step 1: Update config — replace Icecast with WebRTC ICE servers**

Replace `backend/internal/config/config.go` entirely:

```go
package config

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/pion/webrtc/v4"
)

type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	ClerkSecretKey string
	YouTubeAPIKey  string
	CORSOrigin     string
	AudioCacheDir  string
	YtdlpPath      string
	ICEServers     []webrtc.ICEServer
}

func Load() *Config {
	godotenv.Load()

	iceServers := parseICEServers(getEnv("WEBRTC_ICE_SERVERS", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"))

	return &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://awks:awks@localhost:5432/awks?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		ClerkSecretKey: getEnv("CLERK_SECRET_KEY", ""),
		YouTubeAPIKey:  getEnv("YOUTUBE_API_KEY", ""),
		CORSOrigin:     getEnv("CORS_ORIGIN", "http://localhost:5173"),
		AudioCacheDir:  getEnv("AUDIO_CACHE_DIR", "./audio-cache"),
		YtdlpPath:      getEnv("YTDLP_PATH", "yt-dlp"),
		ICEServers:     iceServers,
	}
}

func parseICEServers(raw string) []webrtc.ICEServer {
	if raw == "" {
		return nil
	}
	urls := strings.Split(raw, ",")
	return []webrtc.ICEServer{{URLs: urls}}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 2: Update .env — replace Icecast vars**

Replace the Icecast lines in `backend/.env`:

Remove:
```
ICECAST_URL=http://localhost:8001
ICECAST_SOURCE_PASSWORD=awks_source
ICECAST_MOUNT=/stream
```

Add:
```
WEBRTC_ICE_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
```

- [ ] **Step 3: Remove Icecast from docker-compose.yml**

Replace `docker-compose.yml` with:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: awks
      POSTGRES_PASSWORD: awks
      POSTGRES_DB: awks
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

- [ ] **Step 4: Delete stream.go**

```bash
rm /Users/mccann/development/awks3/backend/internal/handler/stream.go
```

- [ ] **Step 5: Rewrite main.go**

Replace the full `main()` function in `backend/cmd/server/main.go`. The key changes:
- `NewBroadcaster()` returns `(*Broadcaster, error)` now (no Icecast args)
- Create `PeerManager` with broadcaster's track and ICE servers
- Pass `PeerManager` to `NewWSHandler`
- Remove `streamH` and `/stream` route
- Remove Icecast import references

```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mccann/awks3/backend/internal/audio"
	"github.com/mccann/awks3/backend/internal/auth"
	"github.com/mccann/awks3/backend/internal/config"
	"github.com/mccann/awks3/backend/internal/handler"
	"github.com/mccann/awks3/backend/internal/model"
	redisclient "github.com/mccann/awks3/backend/internal/redis"
	"github.com/mccann/awks3/backend/internal/service"
	"github.com/mccann/awks3/backend/internal/store"
	"github.com/mccann/awks3/backend/internal/ws"
)

func main() {
	cfg := config.Load()

	// Verify yt-dlp is available
	if _, err := exec.LookPath(cfg.YtdlpPath); err != nil {
		log.Fatalf("yt-dlp not found at %q: %v\nInstall it: https://github.com/yt-dlp/yt-dlp#installation", cfg.YtdlpPath, err)
	}

	// Ensure audio cache directory exists
	if err := os.MkdirAll(cfg.AudioCacheDir, 0755); err != nil {
		log.Fatalf("failed to create audio cache dir %q: %v", cfg.AudioCacheDir, err)
	}

	// Database
	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Run migrations
	if _, err := pool.Exec(context.Background(), readMigration("001_init.up.sql")); err != nil {
		log.Printf("migration 001 warning (may already exist): %v", err)
	}
	if _, err := pool.Exec(context.Background(), readMigration("002_drop_username_unique.up.sql")); err != nil {
		log.Printf("migration 002 warning: %v", err)
	}
	if _, err := pool.Exec(context.Background(), readMigration("003_audio_status.up.sql")); err != nil {
		log.Printf("migration 003 warning: %v", err)
	}

	// Redis
	rdb, err := redisclient.New(cfg.RedisURL)
	if err != nil {
		log.Fatalf("failed to connect to redis: %v", err)
	}
	defer rdb.Close()

	queries := store.New(pool)

	// Audio Broadcaster (WebRTC)
	broadcaster, err := audio.NewBroadcaster()
	if err != nil {
		log.Fatalf("failed to create broadcaster: %v", err)
	}

	// WebRTC Peer Manager
	peerManager := audio.NewPeerManager(broadcaster.Track(), cfg.ICEServers)

	// WebSocket Hub
	hub := ws.NewHub(nil)
	go hub.Run()

	// Playback Service
	playbackSvc := service.NewPlaybackService(queries, rdb, func(msg model.WSMessage) {
		hub.Broadcast(msg)
	}, broadcaster)

	// Rebuild hub with onChange that broadcasts listener updates
	hub = ws.NewHub(func() {
		listeners := hub.GetListeners()
		hub.Broadcast(model.WSMessage{
			Type: "LISTENER_UPDATE",
			Data: model.ListenerUpdateData{
				Count:     len(listeners),
				Listeners: listeners,
			},
		})
	})
	go hub.Run()

	// Rebuild playback service and peer manager with the new hub
	playbackSvc = service.NewPlaybackService(queries, rdb, func(msg model.WSMessage) {
		hub.Broadcast(msg)
	}, broadcaster)

	// Audio Extractor — onReady triggers AdvanceQueue if idle
	extractor := audio.NewExtractor(cfg.YtdlpPath, cfg.AudioCacheDir, queries, func() {
		state, _ := playbackSvc.GetCurrentState(context.Background())
		if state == nil {
			go playbackSvc.AdvanceQueue(context.Background())
		}
	})

	// Startup: clean orphan audio files and re-extract pending tracks
	extractor.CleanupOrphans(context.Background())
	extractor.ExtractPending(context.Background())

	// Start sync ticker
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	playbackSvc.StartSyncTicker(ctx, hub.ListenerCount)

	// Start broadcaster goroutine
	go broadcaster.Run(ctx, func() (string, float64, error) {
		path, err := playbackSvc.GetCurrentAudioPath(context.Background())
		if err != nil || path == "" {
			return "", 0, nil
		}
		state, _ := playbackSvc.GetCurrentState(context.Background())
		var offset float64
		if state != nil {
			offset = time.Since(state.StartedAt).Seconds()
			if offset < 1 {
				offset = 0
			}
		}
		return path, offset, nil
	}, func(skipped bool) {
		playbackSvc.AdvanceQueue(context.Background())
	})

	// Resume playback on startup
	go func() {
		state, _ := playbackSvc.GetCurrentState(context.Background())
		if state != nil {
			broadcaster.Wake()
		} else {
			playbackSvc.AdvanceQueue(context.Background())
		}
	}()

	// Handlers
	queueH := handler.NewQueueHandler(queries, playbackSvc, hub, cfg.YouTubeAPIKey, extractor)
	playbackH := handler.NewPlaybackHandler(playbackSvc)
	adminH := handler.NewAdminHandler(queries, playbackSvc, hub)
	wsH := handler.NewWSHandler(hub, peerManager)
	historyH := handler.NewHistoryHandler(queries)
	searchH := handler.NewSearchHandler(cfg.YouTubeAPIKey, cfg.YtdlpPath)
	listenerH := handler.NewListenerHandler(hub)
	meH := handler.NewMeHandler(queries)

	// Router
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowOriginFunc: func(r *http.Request, origin string) bool { return true },
		AllowedMethods:  []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:  []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// WebSocket (no auth middleware)
	r.Get("/ws", wsH.HandleWS)

	// API routes with auth
	r.Route("/api", func(r chi.Router) {
		r.Use(auth.ClerkMiddleware(cfg.ClerkSecretKey))

		r.Get("/queue", queueH.GetQueue)
		r.Post("/queue", queueH.AddToQueue)
		r.Delete("/queue/{id}", queueH.DeleteFromQueue)
		r.Post("/queue/{id}/skip-vote", queueH.CastSkipVote)
		r.Delete("/queue/{id}/skip-vote", queueH.RetractSkipVote)
		r.Get("/playback", playbackH.GetPlayback)
		r.Get("/history", historyH.GetHistory)
		r.Get("/listeners", listenerH.GetListeners)
		r.Get("/search", searchH.Search)
		r.Post("/me", meH.SyncMe)
		r.Get("/settings", adminH.GetSettings)

		// Admin routes
		r.Route("/admin", func(r chi.Router) {
			r.Use(auth.AdminOnly)
			r.Put("/settings", adminH.UpdateSettings)
			r.Post("/queue/{id}/move-to-top", adminH.MoveToTop)
			r.Post("/users/{id}/timeout", adminH.TimeoutUser)
			r.Delete("/users/{id}/timeout", adminH.RemoveTimeout)
			r.Get("/users/{id}/timeout", adminH.GetTimeout)
		})
	})

	// Serve
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		log.Printf("AWKS server listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	srv.Shutdown(shutdownCtx)
	log.Println("server shut down gracefully")
}

func readMigration(filename string) string {
	data, err := os.ReadFile("db/migrations/" + filename)
	if err != nil {
		data, err = os.ReadFile("../../db/migrations/" + filename)
		if err != nil {
			log.Printf("could not read migration file %s: %v", filename, err)
			return ""
		}
	}
	return string(data)
}
```

- [ ] **Step 6: Update PlaybackService — Broadcaster interface change**

The `PlaybackService` calls `broadcaster.Skip()` and `broadcaster.Wake()` — these haven't changed. But `NewPlaybackService` takes a `*audio.Broadcaster` — the type is the same, but the constructor changed. Verify the service package still compiles:

```bash
cd /Users/mccann/development/awks3/backend && go build ./...
```

Expected: PASS — full build succeeds.

- [ ] **Step 7: Stop the Icecast container**

```bash
cd /Users/mccann/development/awks3 && docker compose stop icecast && docker compose rm -f icecast
```

- [ ] **Step 8: Commit**

```bash
git rm backend/internal/handler/stream.go
git add backend/internal/config/config.go backend/.env backend/cmd/server/main.go docker-compose.yml backend/go.mod backend/go.sum
git commit -m "feat: wire WebRTC into server, remove Icecast"
```

---

## Task 5: Frontend — WebRTC Hook

**Files:**
- Create: `frontend/src/hooks/useWebRTC.ts`
- Modify: `frontend/src/hooks/useWebSocket.ts`
- Delete: `frontend/src/hooks/useAudioStream.ts`
- Delete: `frontend/src/components/player/AudioStream.tsx`

- [ ] **Step 1: Add message callback support to useWebSocket**

The WebRTC hook needs to listen for `WEBRTC_ANSWER` and `WEBRTC_ICE_CANDIDATE` messages. Add a callback registry to `frontend/src/hooks/useWebSocket.ts`.

Add these module-level variables after the existing `let ws` and `let reconnectTimer` declarations:

```typescript
type MessageCallback = (data: unknown) => void;
const messageCallbacks: Map<string, MessageCallback> = new Map();

/** Register a callback for a specific message type. Used by useWebRTC for signaling. */
export function onWsMessage(type: string, callback: MessageCallback) {
  messageCallbacks.set(type, callback);
}

/** Unregister a callback for a specific message type. */
export function offWsMessage(type: string) {
  messageCallbacks.delete(type);
}
```

Then in the `handleMessage` function, add this at the very top of the function body (before the `switch`):

```typescript
// Dispatch to registered callbacks first
const cb = messageCallbacks.get(type);
if (cb) {
  cb(data);
  return;
}
```

- [ ] **Step 2: Create useWebRTC.ts**

Create `frontend/src/hooks/useWebRTC.ts`:

```typescript
import { useRef, useCallback, useState, useEffect } from 'react';
import { usePlaybackStore } from '../stores/playbackStore';
import { wsSend, onWsMessage, offWsMessage } from './useWebSocket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('awks-volume');
    return saved ? parseInt(saved) : 70;
  });
  const [listening, setListening] = useState(false);
  const hasTrack = usePlaybackStore((s) => !!s.currentTrack);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // We only want to receive audio
    pc.addTransceiver('audio', { direction: 'recvonly' });

    // When we get the remote audio track, play it
    pc.ontrack = (event) => {
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.srcObject = event.streams[0];
      audio.volume = volume / 100;
      audio.play().then(() => {
        setListening(true);
      }).catch(() => {
        // Autoplay blocked — retry on interaction
        const tryPlay = () => {
          audio.play().then(() => {
            setListening(true);
            document.removeEventListener('click', tryPlay);
            document.removeEventListener('keydown', tryPlay);
          }).catch(() => {});
        };
        document.addEventListener('click', tryPlay);
        document.addEventListener('keydown', tryPlay);
      });
    };

    // Send ICE candidates to server
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsSend('WEBRTC_ICE_CANDIDATE', {
          candidate: JSON.stringify(event.candidate.toJSON()),
        });
      }
    };

    // Reconnect on failure
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.log('[webrtc] connection lost, reconnecting...');
        setListening(false);
        setTimeout(connect, 2000);
      }
    };

    // Create offer and send to server
    pc.createOffer().then((offer) => {
      return pc.setLocalDescription(offer);
    }).then(() => {
      wsSend('WEBRTC_OFFER', { sdp: pc.localDescription!.sdp });
    }).catch((err) => {
      console.error('[webrtc] offer error:', err);
    });
  }, [volume]);

  // Listen for signaling responses from server
  useEffect(() => {
    onWsMessage('WEBRTC_ANSWER', (data: unknown) => {
      const { sdp } = data as { sdp: string };
      const pc = pcRef.current;
      if (!pc) return;
      pc.setRemoteDescription({ type: 'answer', sdp }).catch((err) => {
        console.error('[webrtc] answer error:', err);
      });
    });

    onWsMessage('WEBRTC_ICE_CANDIDATE', (data: unknown) => {
      const candidateJSON = data as string;
      const pc = pcRef.current;
      if (!pc) return;
      const candidate = JSON.parse(candidateJSON);
      pc.addIceCandidate(candidate).catch((err) => {
        console.error('[webrtc] ICE candidate error:', err);
      });
    });

    return () => {
      offWsMessage('WEBRTC_ANSWER');
      offWsMessage('WEBRTC_ICE_CANDIDATE');
    };
  }, []);

  // Connect when there's a track, disconnect when idle
  useEffect(() => {
    if (hasTrack) {
      // Small delay to ensure WebSocket is connected first
      const timer = setTimeout(connect, 500);
      return () => clearTimeout(timer);
    } else {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
      setListening(false);
    }
  }, [hasTrack, connect]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    localStorage.setItem('awks-volume', String(vol));
    if (audioRef.current) {
      audioRef.current.volume = vol / 100;
    }
  }, []);

  return { volume, setVolume, listening };
}
```

- [ ] **Step 3: Delete old audio files**

```bash
rm frontend/src/hooks/useAudioStream.ts
rm frontend/src/components/player/AudioStream.tsx
```

- [ ] **Step 4: Commit**

```bash
git rm frontend/src/hooks/useAudioStream.ts frontend/src/components/player/AudioStream.tsx
git add frontend/src/hooks/useWebRTC.ts frontend/src/hooks/useWebSocket.ts
git commit -m "feat: add WebRTC audio hook, replace Icecast audio stream"
```

---

## Task 6: Frontend — Wire useWebRTC into App

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Update App.tsx**

In `frontend/src/App.tsx`:

Replace the import:
```typescript
import { useAudioStream } from './hooks/useAudioStream';
```
with:
```typescript
import { useWebRTC } from './hooks/useWebRTC';
```

Remove the import:
```typescript
import { AudioStream } from './components/player/AudioStream';
```

In the `AppContent` function, replace:
```typescript
const { volume, setVolume, listening } = useAudioStream();
```
with:
```typescript
const { volume, setVolume, listening } = useWebRTC();
```

Remove the `<AudioStream>` JSX component (it should already have been removed — just the `listening` prop passed to Sidebar remains).

- [ ] **Step 2: Remove /stream proxy from vite.config.ts**

Replace `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
})
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd /Users/mccann/development/awks3/frontend && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/Sidebar.tsx frontend/vite.config.ts
git commit -m "feat: wire WebRTC audio into app, remove Icecast references"
```

---

## Task 7: End-to-End Smoke Test

- [ ] **Step 1: Ensure Docker services are running (no Icecast needed)**

```bash
cd /Users/mccann/development/awks3 && docker compose up -d
```

Expected: Only postgres and redis running.

- [ ] **Step 2: Build and start backend**

```bash
cd /Users/mccann/development/awks3/backend && go build -o awks-server ./cmd/server/ && ./awks-server
```

Expected: Server starts, no Icecast connection errors.

- [ ] **Step 3: Start frontend**

```bash
cd /Users/mccann/development/awks3/frontend && npm run dev -- --host
```

- [ ] **Step 4: Test the full flow**

1. Open `http://localhost:5173`, sign in
2. Add a YouTube URL to the queue
3. Wait for extraction (watch backend logs for `[extractor]`)
4. When track starts, watch for `[webrtc] peer ... ICE state: connected` in backend logs
5. Verify audio plays in browser
6. Test skip (vote skip and admin remove)
7. Test from a second device on LAN
8. Verify both devices hear roughly the same audio simultaneously

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete WebRTC audio streaming migration"
```
