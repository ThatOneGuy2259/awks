# UX Features: Rate Limit Feedback, Reactions, Visualizer

**Date:** 2026-03-26
**Status:** Approved

## Summary

Three independent UX features to improve the listening experience:
1. **Rate limit feedback** — show users their queue slot usage
2. **Reactions** — ephemeral emoji reactions on the currently playing track
3. **Audio visualizer** — frequency bars in the PlayerBar synced to WebRTC audio

## Feature 1: Rate Limit Feedback

### Approach
Client-side calculation — no backend changes. The frontend already has the full queue in `queueStore` and the current user ID in `userStore`. Filter queue by `requested_by === myUserId` and count against `max_tracks_per_user` from settings.

### UI
A small pill in the search page header: "2/3 queue slots"
- Default: subtle text color
- 1 slot remaining: amber
- Full (0 remaining): red, and the add button should be disabled with a tooltip

### Files
- Modify: `frontend/src/pages/SearchRequestView.tsx` — add slot counter
- Modify: `frontend/src/components/search/TrackCard.tsx` — disable add when full

### Data Flow
`queueStore.tracks.filter(t => t.requested_by === userStore.id && t.status !== 'played').length` gives current count. `max_tracks_per_user` comes from settings (already fetched on WS connect).

## Feature 2: Reactions

### Approach
Ephemeral WebSocket messages — no database, no persistence. Fire and forget.

### Emoji Set
Five reactions: 🔥 ❤️ 😂 💀 🗑️

### Protocol
**Browser → Server:**
- `REACTION` — `{ "emoji": "🔥" }`

**Server → All Clients:**
- `REACTION` — `{ "emoji": "🔥", "user_id": "...", "username": "..." }`

Server receives REACTION, validates emoji is in the allowed set, broadcasts to all clients.

### UI
- **ReactionBar** component: row of emoji buttons below the Now Playing section on the main page. Clicking sends the reaction.
- **ReactionOverlay** component: renders floating emoji animations. Each received reaction spawns an emoji that floats upward and fades out over ~2 seconds. Positioned over the Now Playing area.
- Client-side rate limit: max 1 reaction per 500ms per user (debounce the buttons).

### Files
- Create: `frontend/src/components/social/ReactionBar.tsx` — emoji buttons
- Create: `frontend/src/components/social/ReactionOverlay.tsx` — floating animations
- Modify: `frontend/src/pages/MusicQueueView.tsx` — add ReactionBar and ReactionOverlay
- Modify: `backend/internal/handler/ws.go` — handle REACTION message type
- Modify: `frontend/src/hooks/useWebSocket.ts` — register callback or handle REACTION in switch

### Animation
CSS `@keyframes` — translate Y upward by 100px, opacity 1→0, with slight random horizontal drift for variety. Each emoji gets a random X offset so they don't all float in the same column.

## Feature 3: Audio Visualizer

### Approach
Web Audio API `AnalyserNode` connected to the WebRTC audio output. A canvas renders frequency bars on every animation frame.

### How It Works
1. The `useWebRTC` hook's `ontrack` callback creates an `AudioContext` and `AnalyserNode`
2. The audio element is connected: `audioContext.createMediaElementSource(audio)` → `analyser` → `audioContext.destination`
3. A new `useVisualizer` hook takes the analyser ref and a canvas ref, runs `requestAnimationFrame` to draw frequency bars

### Visual Style
- Thin horizontal strip in the PlayerBar, between the progress bar and the bottom edge
- ~32-48 frequency bars
- Gradient from purple (low frequencies) to cyan (high frequencies) matching the app's neon theme
- Bars have rounded tops, slight gap between them
- Height: ~24-32px
- When no audio is playing, bars are flat (zero height)

### Files
- Create: `frontend/src/hooks/useVisualizer.ts` — requestAnimationFrame loop reading frequency data
- Modify: `frontend/src/hooks/useWebRTC.ts` — create AnalyserNode, expose ref
- Modify: `frontend/src/components/layout/PlayerBar.tsx` — add canvas element, use visualizer hook

### Performance
- `AnalyserNode.fftSize = 64` (gives 32 frequency bins — enough for a compact visualizer)
- `requestAnimationFrame` naturally throttles to display refresh rate
- Canvas rendering is GPU-accelerated, negligible CPU impact

## What Does NOT Change
- Queue management, skip voting, admin controls
- Audio streaming (WebRTC)
- Chat, listeners, history
- Database schema
