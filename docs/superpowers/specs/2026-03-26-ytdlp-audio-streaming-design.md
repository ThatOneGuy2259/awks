# yt-dlp Server-Side Audio Streaming

**Date:** 2026-03-26
**Status:** Approved

## Summary

Replace the YouTube IFrame player with server-side audio streaming. The backend uses yt-dlp to pre-extract audio when tracks are added to the queue, and streams audio to all listeners via a single HTTP endpoint. Listeners have no playback control — the server dictates what plays (radio-style). Listeners can only adjust their local volume and vote to skip.

## Constraints

- Under 50 concurrent listeners — no need for Icecast or a dedicated streaming server
- yt-dlp must be installed on the server (checked at startup)
- Existing queue, skip vote, admin, chat, and WebSocket UI features remain unchanged
- Audio format: Opus in OGG container (128kbps). Natively supported by all modern browsers.

## Architecture

### 1. Audio Extraction Pipeline

When a track is added to the queue (`POST /api/queue`), after validating the URL and resolving metadata:

1. yt-dlp runs asynchronously to extract audio:
   ```
   yt-dlp -x --audio-format opus --audio-quality 128K -o <output_path> <youtube_url>
   ```
2. Audio files stored in a configurable directory (`AUDIO_CACHE_DIR`, default `./audio-cache/`) named `{queue_id}.opus`
3. Track is added to the queue immediately. A new `audio_status` field tracks extraction progress: `pending` -> `extracting` -> `ready` | `failed`
4. `AdvanceQueue` skips tracks where `audio_status != "ready"`. If a track finishes extracting while it's next in line, `AdvanceQueue` is triggered again.
5. Audio files are cleaned up 30 seconds after a track is marked as `played`.

**Startup behavior:**
- Verify `yt-dlp` is on PATH (`YTDLP_PATH` env var, default `yt-dlp`). Fatal error if not found.
- Re-queue extraction for any pending/extracting tracks that have `status = 'pending'`.
- Delete orphaned `.opus` files in the cache directory that don't correspond to active queue items.

### 2. Audio Broadcaster

A single `AudioBroadcaster` goroutine reads the current track's audio file and pushes chunks to all connected stream clients.

**Pacing:** Reads OGG pages and sleeps based on the granule position (timestamp embedded in the OGG format), outputting at 1x playback speed. All clients stay in sync without drift correction.

**Track transitions:** When the broadcaster reaches end-of-file, it calls `AdvanceQueue`, gets the next track's file, and continues writing to the same client connections. No reconnection needed. If the queue is empty, the broadcaster stops writing and waits. When a new track is queued, it wakes up.

**Client registration:** Each `GET /api/stream` client registers a buffered channel with the broadcaster. The broadcaster writes chunks to all registered channels. If a client's channel is full (slow consumer), the client is dropped.

**Skip/remove:** The broadcaster immediately stops reading the current file, calls `AdvanceQueue`, and starts the next track.

**No listeners:** The broadcaster keeps reading at real-time pace regardless, maintaining timeline consistency.

**Server restart mid-track:** The broadcaster starts reading the audio file from the elapsed position (calculated from `startedAt` in Redis).

### 3. Stream Endpoint

**`GET /api/stream`** (no auth required for simplicity with `<audio>` element):
- Response headers: `Content-Type: audio/ogg`, `Transfer-Encoding: chunked`, `Cache-Control: no-cache`
- Registers the response writer with the broadcaster, blocks until client disconnects
- Clients joining mid-track hear from wherever the broadcaster currently is (radio behavior)

### 4. Frontend Changes

**Replace YouTube player with `<audio>` element:**
- `<audio src="http://localhost:8080/api/stream" autoplay />` (URL from `VITE_API_URL`)
- Volume control binds to `audioElement.volume` (0.0-1.0)
- No play/pause/seek controls exposed — element is hidden or styled without controls
- On `error` event, auto-reconnect by re-setting `src`

**Remove:**
- `useYouTubePlayer.ts` hook
- `YouTubePlayer.tsx` component
- YouTube IFrame API script loading
- Drift correction / sync-to-YouTube logic
- `expectedPositionSec` from playback store

**Keep unchanged:**
- `PlayerBar` — shows track info, progress bar, skip vote (driven by WebSocket, not audio element)
- `usePlaybackSync` — progress bar uses `startedAt` + local clock as before
- All WebSocket messages (`TRACK_CHANGE`, `SYNC`, `QUEUE_UPDATE`, etc.) — still needed for UI metadata
- `useWebSocket` hook
- All stores except removing `expectedPositionSec` from playbackStore

### 5. Data Model Changes

**`queue` table — new columns:**
- `audio_status TEXT NOT NULL DEFAULT 'pending'` — values: `pending`, `extracting`, `ready`, `failed`
- `audio_path TEXT` — filesystem path to extracted audio file

**New migration (`003_audio_status.up.sql`):**
```sql
ALTER TABLE queue ADD COLUMN audio_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE queue ADD COLUMN audio_path TEXT;
```

**Config additions (`.env`):**
- `AUDIO_CACHE_DIR` — default `./audio-cache`
- `YTDLP_PATH` — default `yt-dlp`

### 6. Error Handling

| Scenario | Behavior |
|---|---|
| yt-dlp extraction fails | `audio_status` set to `failed`. Track skipped by `AdvanceQueue`. Visible in queue UI. User can delete and re-add. |
| Client joins empty queue | Stream connection stays open, broadcaster sends nothing. Audio begins when a track starts. |
| Slow consumer | Client dropped from broadcaster. Frontend auto-reconnects `<audio>` on error. |
| Server restart mid-track | Broadcaster seeks to elapsed position in audio file. Clients reconnect stream. |
| Disk space | 5-min track at 128kbps = ~5MB. 10-track queue = ~50MB. Cleanup after playback. |

## What Does NOT Change

- Queue management (add, remove, reorder, position logic)
- Skip voting (democratic + admin)
- Admin dashboard (settings, timeouts, move-to-top)
- Chat system
- Listener tracking
- History recording
- User authentication (Clerk)
- WebSocket hub and message types (TRACK_CHANGE, SYNC, QUEUE_UPDATE, etc.)
- Database tables: users, skip_votes, play_history, user_timeouts, admin_settings
