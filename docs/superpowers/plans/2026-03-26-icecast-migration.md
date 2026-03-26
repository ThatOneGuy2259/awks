# Icecast Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom Go HTTP audio streaming with Icecast as the audio delivery layer.

**Architecture:** The Go server opens a persistent HTTP PUT connection to Icecast as a source client and pipes OGG/Opus pages into it. Icecast handles all listener connections. The frontend `<audio>` element points directly at Icecast's listener URL instead of the Go server.

**Tech Stack:** Icecast (Docker), Go (source client), OGG/Opus, React/TypeScript

**Spec:** `docs/superpowers/specs/2026-03-26-icecast-migration-design.md`

---

## File Map

### Modified Files
- `docker-compose.yml` — add Icecast service
- `backend/internal/config/config.go` — add Icecast config fields
- `backend/.env` — add Icecast env vars
- `backend/internal/audio/broadcaster.go` — replace client management with Icecast source writer
- `backend/cmd/server/main.go` — remove StreamHandler, pass Icecast config to Broadcaster
- `frontend/.env.local` — add `VITE_ICECAST_URL`
- `frontend/src/hooks/useAudioStream.ts` — use Icecast URL
- `frontend/vite.config.ts` — remove `/api/stream` proxy entry (it's nested under `/api` which catches it)

### Deleted Files
- `backend/internal/handler/stream.go`

---

## Task 1: Docker Compose & Icecast Config

**Files:**
- Modify: `docker-compose.yml`
- Modify: `backend/internal/config/config.go`
- Modify: `backend/.env`

- [ ] **Step 1: Add Icecast service to docker-compose.yml**

Add the `icecast` service after the `redis` service in `docker-compose.yml`:

```yaml
  icecast:
    image: moul/icecast
    environment:
      ICECAST_SOURCE_PASSWORD: awks_source
      ICECAST_ADMIN_PASSWORD: awks_admin
      ICECAST_PASSWORD: awks_listener
      ICECAST_RELAY_PASSWORD: awks_relay
      ICECAST_HOSTNAME: localhost
    ports:
      - "8001:8000"
```

The full file should be:

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

  icecast:
    image: moul/icecast
    environment:
      ICECAST_SOURCE_PASSWORD: awks_source
      ICECAST_ADMIN_PASSWORD: awks_admin
      ICECAST_PASSWORD: awks_listener
      ICECAST_RELAY_PASSWORD: awks_relay
      ICECAST_HOSTNAME: localhost
    ports:
      - "8001:8000"

volumes:
  pgdata:
```

- [ ] **Step 2: Start the Icecast container**

Run:
```bash
cd /Users/mccann/development/awks3 && docker compose up -d icecast
```

Expected: Container starts. Verify with:
```bash
curl -s http://localhost:8001/status-json.xsl | head -c 100
```

Should return JSON with Icecast status.

- [ ] **Step 3: Add Icecast config fields**

In `backend/internal/config/config.go`, add three fields to the `Config` struct:

```go
type Config struct {
	Port                  string
	DatabaseURL           string
	RedisURL              string
	ClerkSecretKey        string
	YouTubeAPIKey         string
	CORSOrigin            string
	AudioCacheDir         string
	YtdlpPath             string
	IcecastURL            string
	IcecastSourcePassword string
	IcecastMount          string
}
```

And add to `Load()`:

```go
IcecastURL:            getEnv("ICECAST_URL", "http://localhost:8001"),
IcecastSourcePassword: getEnv("ICECAST_SOURCE_PASSWORD", "awks_source"),
IcecastMount:          getEnv("ICECAST_MOUNT", "/stream"),
```

- [ ] **Step 4: Add env vars to .env**

Append to `backend/.env`:

```
ICECAST_URL=http://localhost:8001
ICECAST_SOURCE_PASSWORD=awks_source
ICECAST_MOUNT=/stream
```

- [ ] **Step 5: Verify backend compiles**

Run:
```bash
cd /Users/mccann/development/awks3/backend && go build ./...
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml backend/internal/config/config.go backend/.env
git commit -m "feat: add Icecast Docker service and config"
```

---

## Task 2: Rewrite Broadcaster for Icecast

**Files:**
- Modify: `backend/internal/audio/broadcaster.go`

This is the core change. The Broadcaster no longer manages client channels. Instead, it maintains a persistent HTTP PUT connection to Icecast and writes OGG pages into it.

- [ ] **Step 1: Replace broadcaster.go entirely**

Replace `backend/internal/audio/broadcaster.go` with:

```go
package audio

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// Broadcaster reads audio files at real-time pace and pipes OGG pages
// into an Icecast server as a source client via HTTP PUT.
type Broadcaster struct {
	icecastURL string
	mount      string
	password   string
	writer     io.Writer    // the PUT request body writer
	skipCh     chan struct{} // signal to stop current track
	wakeCh     chan struct{} // signal that a new track is available
}

func NewBroadcaster(icecastURL, mount, sourcePassword string) *Broadcaster {
	return &Broadcaster{
		icecastURL: icecastURL,
		mount:      mount,
		password:   sourcePassword,
		skipCh:     make(chan struct{}, 1),
		wakeCh:     make(chan struct{}, 1),
	}
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

// connect opens a persistent HTTP PUT connection to Icecast as a source client.
// Returns a pipe writer that the caller writes OGG data into.
func (b *Broadcaster) connect(ctx context.Context) (io.WriteCloser, error) {
	pr, pw := io.Pipe()

	url := fmt.Sprintf("%s%s", b.icecastURL, b.mount)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, pr)
	if err != nil {
		pr.Close()
		pw.Close()
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.SetBasicAuth("source", b.password)
	req.Header.Set("Content-Type", "application/ogg")
	req.Header.Set("Ice-Name", "AWKS Radio")
	req.Header.Set("Ice-Description", "Fill the Awkward Silence")
	req.Header.Set("Ice-Genre", "Various")
	req.Header.Set("Ice-Public", "0")

	// Fire the request in a goroutine — it blocks until the pipe is closed
	go func() {
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("[broadcaster] icecast connection error: %v", err)
			pr.Close()
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			log.Printf("[broadcaster] icecast rejected source: %d %s", resp.StatusCode, string(body))
		}
		pr.Close()
	}()

	// Give Icecast a moment to accept the connection
	time.Sleep(200 * time.Millisecond)

	return pw, nil
}

// Run is the main broadcaster loop.
func (b *Broadcaster) Run(ctx context.Context, getNextTrack func() (string, float64, error), onTrackDone func(skipped bool)) {
	for {
		// Ensure we have an Icecast connection
		if b.writer == nil {
			pw, err := b.connect(ctx)
			if err != nil {
				log.Printf("[broadcaster] failed to connect to icecast: %v", err)
				time.Sleep(2 * time.Second)
				continue
			}
			b.writer = pw
			log.Println("[broadcaster] connected to icecast")
		}

		audioPath, startOffset, err := getNextTrack()
		if err != nil {
			log.Printf("[broadcaster] error getting next track: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		if audioPath == "" {
			select {
			case <-ctx.Done():
				if closer, ok := b.writer.(io.Closer); ok {
					closer.Close()
				}
				return
			case <-b.wakeCh:
				continue
			}
		}

		skipped := b.streamFile(ctx, audioPath, startOffset)
		onTrackDone(skipped)
	}
}

// write writes data to the Icecast connection. Returns false if the write failed
// (connection lost), signaling the caller to reconnect.
func (b *Broadcaster) write(data []byte) bool {
	if b.writer == nil {
		return false
	}
	_, err := b.writer.Write(data)
	if err != nil {
		log.Printf("[broadcaster] icecast write error: %v", err)
		if closer, ok := b.writer.(io.Closer); ok {
			closer.Close()
		}
		b.writer = nil
		return false
	}
	return true
}

// streamFile reads an OGG file and writes it to Icecast at real-time pace.
func (b *Broadcaster) streamFile(ctx context.Context, path string, startOffsetSec float64) bool {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("[broadcaster] failed to open %s: %v", path, err)
		return false
	}
	defer f.Close()

	reader := NewOggReader(f)

	// Read and send the Opus header pages (ID header + comment header).
	// These must be sent at the start of each track so decoders can resync.
	for i := 0; i < 2; i++ {
		page, err := reader.ReadPage()
		if err != nil {
			log.Printf("[broadcaster] failed to read header page %d: %v", i, err)
			return false
		}
		if !b.write(page.Data) {
			return false
		}
	}

	var lastGranule int64

	// If resuming mid-track, skip pages until we reach the target position
	if startOffsetSec > 0 {
		for {
			page, err := reader.ReadPage()
			if err != nil {
				log.Printf("[broadcaster] seek failed: %v", err)
				return false
			}
			if page.GranulePosition > 0 && GranuleToSeconds(page.GranulePosition) >= startOffsetSec {
				if !b.write(page.Data) {
					return false
				}
				lastGranule = page.GranulePosition
				break
			}
		}
		log.Printf("[broadcaster] seeked to %.1fs in %s", startOffsetSec, path)
	}

	startTime := time.Now()
	granuleOffset := GranuleToSeconds(lastGranule)

	for {
		select {
		case <-ctx.Done():
			return false
		case <-b.skipCh:
			return true
		default:
		}

		page, err := reader.ReadPage()
		if err == io.EOF {
			return false
		}
		if err != nil {
			log.Printf("[broadcaster] OGG read error: %v", err)
			return false
		}

		if !b.write(page.Data) {
			return false
		}

		if page.GranulePosition > 0 {
			pageTime := GranuleToSeconds(page.GranulePosition) - granuleOffset
			elapsed := time.Since(startTime).Seconds()
			ahead := pageTime - elapsed
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
			lastGranule = page.GranulePosition
		}
	}
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd /Users/mccann/development/awks3/backend && go build ./...
```

Expected: Compile errors in `main.go` because `NewBroadcaster()` signature changed (now takes 3 args) and `handler.NewStreamHandler(broadcaster)` references deleted code. That's expected — Task 3 fixes main.go.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/audio/broadcaster.go
git commit -m "feat: rewrite broadcaster as Icecast source client"
```

---

## Task 3: Update main.go & Delete StreamHandler

**Files:**
- Delete: `backend/internal/handler/stream.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Delete stream.go**

```bash
rm /Users/mccann/development/awks3/backend/internal/handler/stream.go
```

- [ ] **Step 2: Update main.go**

In `backend/cmd/server/main.go`, make these changes:

**a)** Update the `NewBroadcaster()` call (around line 75) from:
```go
broadcaster := audio.NewBroadcaster()
```
to:
```go
broadcaster := audio.NewBroadcaster(cfg.IcecastURL, cfg.IcecastMount, cfg.IcecastSourcePassword)
```

**b)** Remove the `streamH` handler line:
```go
streamH := handler.NewStreamHandler(broadcaster)
```

**c)** Remove the stream route:
```go
// Audio stream (no auth — <audio> element can't send headers easily)
r.Get("/api/stream", streamH.HandleStream)
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd /Users/mccann/development/awks3/backend && go build ./...
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git rm backend/internal/handler/stream.go
git add backend/cmd/server/main.go
git commit -m "feat: wire Icecast config into broadcaster, remove stream handler"
```

---

## Task 4: Frontend — Point Audio at Icecast

**Files:**
- Modify: `frontend/.env.local`
- Modify: `frontend/src/hooks/useAudioStream.ts`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Add Icecast URL to .env.local**

Append to `frontend/.env.local`:

```
VITE_ICECAST_URL=http://localhost:8001/stream
```

- [ ] **Step 2: Update useAudioStream.ts to use Icecast URL**

Replace the `STREAM_URL` constant at the top of `frontend/src/hooks/useAudioStream.ts` from:

```typescript
const STREAM_URL = (import.meta.env.VITE_API_URL || '') + '/api/stream';
```

to:

```typescript
const STREAM_URL = import.meta.env.VITE_ICECAST_URL || `http://${window.location.hostname}:8001/stream`;
```

The fallback uses `window.location.hostname` so LAN clients automatically connect to Icecast on the correct host.

- [ ] **Step 3: Remove /api/stream proxy from vite.config.ts**

The vite proxy config has `/api` which would match `/api/stream`. Since the stream endpoint no longer exists on the Go server, this is fine — the proxy just won't match `/api/stream` requests anymore since the frontend no longer makes them. No change needed to vite.config.ts.

Actually, verify there's no issue: the `/api` proxy catches all `/api/*` requests and forwards them to the Go server. Since we deleted the `/api/stream` route, any accidental request would get a 404 from Go — which is correct. No change needed.

- [ ] **Step 4: Verify frontend compiles**

Run:
```bash
cd /Users/mccann/development/awks3/frontend && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/.env.local frontend/src/hooks/useAudioStream.ts
git commit -m "feat: point frontend audio stream at Icecast"
```

---

## Task 5: End-to-End Smoke Test

- [ ] **Step 1: Ensure Icecast is running**

```bash
cd /Users/mccann/development/awks3 && docker compose up -d icecast
```

Verify:
```bash
curl -s http://localhost:8001/status-json.xsl | python3 -m json.tool | head -5
```

Expected: JSON status output from Icecast.

- [ ] **Step 2: Restart backend**

```bash
cd /Users/mccann/development/awks3/backend && go build -o awks-server ./cmd/server/ && lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 1; ./awks-server &
```

Expected: Logs show `[broadcaster] connected to icecast`.

- [ ] **Step 3: Restart frontend**

```bash
cd /Users/mccann/development/awks3/frontend && lsof -ti:5173 | xargs kill -9 2>/dev/null; sleep 1; npm run dev -- --host &
```

- [ ] **Step 4: Test the full flow**

1. Open `http://localhost:5173`, sign in
2. Add a YouTube URL to the queue
3. Wait for extraction to complete (watch backend logs for `[extractor]`)
4. Verify backend logs show `[broadcaster] connected to icecast`
5. Verify audio plays in the browser
6. Verify the Icecast admin page shows the mountpoint: `http://localhost:8001/admin/`
7. Test skip (vote skip and admin remove)
8. Test adding another track — verify seamless transition
9. Test from a second device on the LAN: `http://<lan-ip>:5173`
10. Verify both devices hear roughly the same audio

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: complete Icecast migration for audio streaming"
```
