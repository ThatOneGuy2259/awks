# WebRTC Audio Streaming Migration

**Date:** 2026-03-26
**Status:** Approved

## Summary

Replace Icecast HTTP streaming with WebRTC peer connections using Pion (Go-native WebRTC library). The Go server reads OGG/Opus files, extracts Opus packets via Pion's `oggreader`, and writes them to a shared `TrackLocalStaticSample`. Each listener gets their own WebRTC peer connection that receives audio from this shared track. Signaling happens over the existing WebSocket connection. Sub-second latency, all listeners tightly synchronized.

## Why

Icecast delivers audio over HTTP with 1-3 second buffering variance between listeners. WebRTC provides:
- Sub-second latency (50-200ms)
- Listeners hear nearly the same audio at the same time
- Native browser support (no `<audio>` element quirks, autoplay issues, or HTTP/1.0 proxy problems)
- Built-in NAT traversal for future internet deployment (STUN/TURN)

## Architecture

### Current Flow (Icecast)
```
Go reads OGG → raw TCP PUT → Icecast → HTTP stream → Go proxy → Vite proxy → Browser <audio>
```

### New Flow (WebRTC)
```
Go reads OGG → Pion oggreader extracts Opus packets → WriteSample to shared track → Per-peer RTP → Browser RTCPeerConnection
```

### Components

**1. Broadcaster** (rewritten)
- Owns a single `*webrtc.TrackLocalStaticSample` (Opus codec, 48kHz)
- Reads OGG files using Pion's `oggreader` package
- Extracts raw Opus packets and writes them via `track.WriteSample()`
- Real-time pacing via granule position timestamps (same approach as before)
- `Skip()` / `Wake()` signals unchanged
- `Run()` loop unchanged: getNextTrack → streamFile → onTrackDone

**2. PeerManager** (new)
- Manages one `webrtc.PeerConnection` per listener
- On `WEBRTC_OFFER`: creates peer connection, adds shared audio track, generates answer
- Handles ICE candidate exchange
- Cleans up peer connection when WebSocket disconnects
- ICE servers configurable via env var (STUN now, TURN later)

**3. Signaling** (via existing WebSocket)
- No new signaling server — uses the existing WebSocket connection
- New message types added to the WebSocket protocol

## Signaling Protocol

### Browser → Server
- `WEBRTC_OFFER` — `{ "sdp": "<SDP offer string>" }`
- `WEBRTC_ICE_CANDIDATE` — `{ "candidate": "<ICE candidate JSON>" }`

### Server → Browser
- `WEBRTC_ANSWER` — `{ "sdp": "<SDP answer string>" }`
- `WEBRTC_ICE_CANDIDATE` — `{ "candidate": "<ICE candidate JSON>" }`

### Flow
1. Browser creates `RTCPeerConnection` with `addTransceiver('audio', {direction: 'recvonly'})`
2. Browser creates SDP offer, sends `WEBRTC_OFFER` over WebSocket
3. Server creates peer connection with ICE config, adds shared audio track
4. Server sets remote description (the offer), creates answer
5. Server sends `WEBRTC_ANSWER` over WebSocket
6. ICE candidates trickle in both directions via `WEBRTC_ICE_CANDIDATE`
7. Connection establishes, audio flows
8. On track change/skip — audio switches seamlessly (same track object, new Opus samples)

## ICE Configuration

```go
webrtc.Configuration{
    ICEServers: []webrtc.ICEServer{
        {URLs: []string{"stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"}},
    },
}
```

Configurable via `WEBRTC_ICE_SERVERS` env var (comma-separated URLs). For future internet deployment, add TURN servers here without code changes.

## File Changes

### New Files
- `backend/internal/audio/peermanager.go` — WebRTC peer connection lifecycle management
- `frontend/src/hooks/useWebRTC.ts` — browser-side RTCPeerConnection management

### Modified Files
- `backend/internal/audio/broadcaster.go` — replace Icecast writer with Pion TrackLocalStaticSample
- `backend/internal/handler/ws.go` — handle WEBRTC_OFFER and WEBRTC_ICE_CANDIDATE messages
- `backend/internal/ws/hub.go` — add method to send message to specific client (for signaling responses)
- `backend/cmd/server/main.go` — create PeerManager, pass to WS handler, remove Icecast config, remove stream proxy
- `backend/internal/config/config.go` — replace Icecast config with WebRTC ICE servers config
- `backend/.env` — replace Icecast env vars with `WEBRTC_ICE_SERVERS`
- `docker-compose.yml` — remove Icecast service
- `frontend/src/hooks/useAudioStream.ts` — replace Audio element with WebRTC connection
- `frontend/src/hooks/useWebSocket.ts` — handle WEBRTC_ANSWER and WEBRTC_ICE_CANDIDATE messages
- `frontend/vite.config.ts` — remove `/stream` proxy

### Deleted Files
- `backend/internal/handler/stream.go` — Icecast proxy handler no longer needed
- `backend/internal/audio/ogg.go` — replaced by Pion's `oggreader` package

## Peer Connection Lifecycle

### Creation
1. WebSocket receives `WEBRTC_OFFER` from client
2. PeerManager creates `webrtc.PeerConnection` with ICE config
3. Adds `broadcaster.Track()` (the shared TrackLocalStaticSample)
4. Starts RTCP reader goroutine (required by Pion for feedback)
5. Sets remote description, creates answer
6. Sends answer back to the specific client via WebSocket

### Cleanup
- `OnICEConnectionStateChange`: if state is `disconnected` or `failed`, close the peer connection
- When WebSocket disconnects, PeerManager closes all peer connections for that client
- PeerManager tracks connections by WebSocket client ID

## Track Sharing

The Broadcaster creates one `TrackLocalStaticSample`:
```go
track, _ := webrtc.NewTrackLocalStaticSample(
    webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus},
    "audio",
    "awks-radio",
)
```

Every peer connection gets this same track via `peerConnection.AddTrack(track)`. When the Broadcaster calls `track.WriteSample()`, Pion internally packetizes and sends the Opus data to all connected peers. No manual fan-out needed.

## Frontend Changes

### New: `useWebRTC` hook
- Creates `RTCPeerConnection`
- Adds receive-only audio transceiver
- Generates SDP offer, sends via `wsSend('WEBRTC_OFFER', ...)`
- Listens for `WEBRTC_ANSWER` and `WEBRTC_ICE_CANDIDATE` via a callback registered with the WebSocket
- On `track` event: attaches remote stream to a hidden `<audio>` element for playback
- Volume control binds to the `<audio>` element
- Reconnects if the peer connection fails

### Modified: `useAudioStream`
Replaced entirely by `useWebRTC`. The hook still exposes `{ volume, setVolume, listening }` so the rest of the app doesn't change.

### Modified: `useWebSocket`
Needs to support routing specific message types to callbacks (so `useWebRTC` can listen for `WEBRTC_ANSWER` and `WEBRTC_ICE_CANDIDATE` without modifying the main message handler).

## Error Handling

| Scenario | Behavior |
|---|---|
| Listener joins with no track playing | Peer connection created, audio track added but silent. When track starts, samples flow automatically. |
| Track change / skip | Broadcaster writes new OGG headers then audio samples to the same track. All peers hear the transition seamlessly. |
| Peer connection fails | Frontend detects via `oniceconnectionstatechange`, re-initiates signaling. |
| WebSocket disconnects | PeerManager closes all peer connections for that client. Frontend reconnects WebSocket, then re-initiates WebRTC. |
| Server restart | All peer connections drop. Frontend detects, reconnects WebSocket, re-initiates WebRTC. |

## What Does NOT Change

- yt-dlp extraction pipeline
- PlaybackService (AdvanceQueue, SkipCurrent, GetCurrentAudioPath)
- Queue management, skip voting, admin controls
- Chat, listeners, history
- All WebSocket messages for UI (TRACK_CHANGE, SYNC, QUEUE_UPDATE, etc.)
- All frontend UI components (PlayerBar, Sidebar, etc.)
- Database schema

## What Gets Removed

- Icecast Docker container and config
- Raw TCP broadcaster connection code
- Stream proxy handler
- Custom OGG page reader (`ogg.go`)
- `<audio src>` approach in frontend
- Vite `/stream` proxy config

Sources:
- [Pion WebRTC](https://github.com/pion/webrtc)
- [Pion play-from-disk example](https://github.com/pion/webrtc/blob/master/examples/play-from-disk/main.go)
- [Pion examples README](https://github.com/pion/webrtc/blob/master/examples/README.md)
