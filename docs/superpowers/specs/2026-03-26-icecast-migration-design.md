# Icecast Migration — Audio Streaming

**Date:** 2026-03-26
**Status:** Approved

## Summary

Replace the custom Go HTTP chunked streaming with Icecast as the audio delivery layer. The Go server becomes an Icecast source client (HTTP PUT), piping OGG/Opus audio into a single mountpoint. Icecast handles all listener connections, buffering, burst-on-connect, and slow consumer management. All existing features (skip, remove, queue, chat, admin) remain unchanged.

## Why

The current approach has the Go server managing HTTP response writers per listener with hand-rolled OGG pacing and client channel management. Icecast is purpose-built for this:
- Battle-tested listener management and buffering
- Burst-on-connect (new listeners hear audio instantly, no manual header caching)
- Handles slow consumers gracefully
- Survives Go server restarts without dropping listeners (Icecast stays up)
- Listeners stay roughly in sync (~1-3 seconds apart)

## Architecture

### Current Flow
```
Go Broadcaster → OGG pages → HTTP response writers → Browser <audio>
```

### New Flow
```
Go Broadcaster → OGG stream → Icecast (source client via HTTP PUT) → Icecast (listener endpoint) → Browser <audio>
```

The Go server maintains one persistent HTTP PUT connection to Icecast as a source client. All listener connections go directly to Icecast, bypassing the Go server entirely for audio.

## Icecast Docker Setup

Added to `docker-compose.yml`:

```yaml
icecast:
  image: moul/icecast
  environment:
    ICECAST_SOURCE_PASSWORD: awks_source
    ICECAST_ADMIN_PASSWORD: awks_admin
    ICECAST_RELAY_PASSWORD: awks_relay
    ICECAST_HOSTNAME: localhost
  ports:
    - "8001:8000"
```

- Icecast listens internally on port 8000, exposed as 8001 on the host
- Mountpoint: `/stream`
- Source auth: Basic auth with username `source`, password from `ICECAST_SOURCE_PASSWORD` env var
- Burst-on-connect: enabled by default (~64KB burst, ~1-2s of audio)

### Config additions (`.env`):
- `ICECAST_URL` — default `http://localhost:8001` (the Go server connects here as source)
- `ICECAST_SOURCE_PASSWORD` — default `awks_source`
- `ICECAST_MOUNT` — default `/stream`

### Frontend config (`.env.local`):
- `VITE_ICECAST_URL` — default `http://localhost:8001/stream` (browser connects here)

## Broadcaster Changes

### Deleted
- `StreamClient` struct and client channel map
- `Register()` / `Unregister()` methods
- `broadcast()` fan-out method
- `headerPages` caching
- All client management code

### Kept
- `Skip()` and `Wake()` signals
- `Run()` loop structure (getNextTrack → streamFile → onTrackDone)
- OGG page reading via `OggReader`
- Real-time pacing via granule timestamps

### New: Icecast Source Connection
- On startup, opens HTTP PUT to `http://icecast:8001/stream` with Basic auth
- Content-Type: `application/ogg`
- Writes OGG pages directly into the PUT request body writer
- Connection is persistent — never disconnected between tracks
- Track transitions: write new track's OGG header pages (OpusHead + OpusTags) followed by audio pages into the same connection. OGG is a container format with self-contained pages, so Icecast and listeners decode the transition seamlessly.
- On skip: stop reading current file, start next track on same connection
- If Icecast connection drops: reconnect and resume from current position

### Pacing
Real-time pacing stays the same — read OGG pages and sleep based on granule position timestamps. Icecast requires data to arrive at playback speed (not faster), which is exactly what we already do.

## Deleted Files
- `backend/internal/handler/stream.go` — no more `GET /api/stream` on the Go server

## Modified Files
- `backend/internal/audio/broadcaster.go` — remove client management, add Icecast source writer
- `backend/internal/config/config.go` — add `IcecastURL`, `IcecastSourcePassword`, `IcecastMount`
- `backend/.env` — add Icecast env vars
- `backend/cmd/server/main.go` — remove StreamHandler, update Broadcaster init with Icecast config
- `docker-compose.yml` — add Icecast service
- `frontend/.env.local` — add `VITE_ICECAST_URL`
- `frontend/src/hooks/useAudioStream.ts` — use Icecast URL
- `frontend/vite.config.ts` — remove `/api/stream` proxy (keep `/api` and `/ws`)

## Track Transition Protocol

When switching tracks (natural end or skip):

1. Broadcaster finishes (or abandons) reading current OGG file
2. Opens next track's OGG file
3. Reads and writes the first 2 OGG pages (OpusHead + OpusTags headers) into the Icecast connection
4. Continues reading and writing audio pages at real-time pace

This works because OGG pages are self-contained — each has a capture pattern (`OggS`) and the decoder resyncs on the new headers. Icecast passes the raw bytes through to listeners, and their decoders handle the transition.

## Error Handling

| Scenario | Behavior |
|---|---|
| Icecast not running on startup | Broadcaster retries connection every 2 seconds with log warning |
| Icecast connection drops mid-stream | Broadcaster reconnects, resumes from current position. Listeners reconnect automatically (browser `<audio>` error → retry) |
| Go server restarts | Icecast stays running (Docker). Listeners stay connected but hear silence until Go reconnects as source. |
| Skip/remove track | Same as before — `Skip()` signal stops current file, `AdvanceQueue` starts next |

## Listener Sync

Icecast does not synchronize listeners to each other. Each listener receives the same live stream data. The variance between listeners is determined by their local buffer size, typically 1-3 seconds. This is identical to how internet radio works and meets the requirement of "roughly the same part of the song."

## What Does NOT Change

- Audio extraction pipeline (yt-dlp pre-download)
- PlaybackService (AdvanceQueue, SkipCurrent, GetCurrentAudioPath)
- OGG page reader (`ogg.go`)
- Queue management, skip voting, admin controls
- WebSocket hub and all message types
- Chat, listeners, history
- All frontend UI except the stream URL

Sources:
- [Icecast Protocol Specification](https://gist.github.com/ePirat/adc3b8ba00d85b7e3870)
- [Icecast FAQ](https://icecast.org/faq/)
- [Icecast Config File Docs](https://icecast.org/docs/icecast-2.3.1/config-file.html)
