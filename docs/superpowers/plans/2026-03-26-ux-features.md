# UX Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rate limit feedback, emoji reactions, and an audio visualizer to improve the listening experience.

**Architecture:** Rate limit feedback is purely client-side (no backend). Reactions use a new WebSocket message type. The visualizer uses Web Audio API AnalyserNode on the WebRTC audio stream.

**Tech Stack:** React/TypeScript, Web Audio API, CSS animations, Go WebSocket handler

**Spec:** `docs/superpowers/specs/2026-03-26-ux-features-design.md`

---

## File Map

### New Files
- `frontend/src/components/social/ReactionBar.tsx` — emoji buttons
- `frontend/src/components/social/ReactionOverlay.tsx` — floating emoji animations
- `frontend/src/hooks/useVisualizer.ts` — canvas frequency bar renderer

### Modified Files
- `frontend/src/pages/SearchRequestView.tsx` — add queue slot counter
- `frontend/src/components/search/TrackCard.tsx` — disable add when full
- `frontend/src/pages/MusicQueueView.tsx` — add ReactionBar and ReactionOverlay
- `frontend/src/hooks/useWebSocket.ts` — handle REACTION messages
- `frontend/src/hooks/useWebRTC.ts` — create AnalyserNode, expose ref
- `frontend/src/components/layout/PlayerBar.tsx` — add visualizer canvas
- `backend/internal/handler/ws.go` — handle REACTION message type

---

## Task 1: Rate Limit Feedback

**Files:**
- Modify: `frontend/src/pages/SearchRequestView.tsx`
- Modify: `frontend/src/components/search/TrackCard.tsx`

- [ ] **Step 1: Add queue slot counter to SearchRequestView**

In `frontend/src/pages/SearchRequestView.tsx`, add imports and the slot counter:

Add these imports at the top:
```typescript
import { useQueueStore } from '../stores/queueStore';
import { useUserStore } from '../stores/userStore';
import { useSkipVoteStore } from '../stores/skipVoteStore';
```

Add this inside the component, before the `return`:
```typescript
const tracks = useQueueStore((s) => s.tracks);
const userId = useUserStore((s) => s.id);
const maxTracks = 3; // TODO: read from settings — for now hardcode default

const myPendingCount = tracks.filter(
  (t) => t.requested_by === userId && (t.status === 'pending' || t.status === 'playing')
).length;
const slotsRemaining = Math.max(0, maxTracks - myPendingCount);
const atLimit = slotsRemaining === 0;
```

Then add the slot pill after the `<SearchInput>` line, inside the same `<div className="max-w-4xl mx-auto mb-16">`:

```typescript
{/* Queue Slot Counter */}
<div className="mt-4 flex items-center gap-2">
  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
    atLimit
      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
      : slotsRemaining === 1
        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/15'
  }`}>
    {myPendingCount}/{maxTracks} queue slots used
  </span>
  {atLimit && (
    <span className="text-xs text-red-400">Wait for a track to finish before adding more</span>
  )}
</div>
```

- [ ] **Step 2: Pass atLimit to TrackCard**

In `SearchRequestView.tsx`, update the TrackCard rendering to pass the limit state:

Replace:
```typescript
<TrackCard key={result.video_id} track={result} featured={i === 0} />
```
with:
```typescript
<TrackCard key={result.video_id} track={result} featured={i === 0} disabled={atLimit} />
```

- [ ] **Step 3: Update TrackCard to respect disabled prop**

In `frontend/src/components/search/TrackCard.tsx`, add `disabled` to the props:

```typescript
interface TrackCardProps {
  track: SearchResult;
  featured?: boolean;
  disabled?: boolean;
}

export function TrackCard({ track, featured, disabled }: TrackCardProps) {
```

Then update both request buttons to also disable when `disabled` is true:

For the featured card button:
```typescript
disabled={requesting || requested || disabled}
```

For the regular card button:
```typescript
disabled={requesting || requested || disabled}
```

- [ ] **Step 4: Verify frontend compiles**

```bash
cd /Users/mccann/development/awks3/frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SearchRequestView.tsx frontend/src/components/search/TrackCard.tsx
git commit -m "feat: show queue slot usage in search view, disable add at limit"
```

---

## Task 2: Reactions — Backend

**Files:**
- Modify: `backend/internal/handler/ws.go`

- [ ] **Step 1: Add REACTION handler to ws.go**

In `backend/internal/handler/ws.go`, add a new case in the `handleMessage` switch, after `CHAT_SEND`:

```go
	case "REACTION":
		var data struct {
			Emoji string `json:"emoji"`
		}
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.Emoji == "" {
			return
		}
		// Validate emoji is in allowed set
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
```

- [ ] **Step 2: Verify backend compiles**

```bash
cd /Users/mccann/development/awks3/backend && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/handler/ws.go
git commit -m "feat: handle REACTION WebSocket messages"
```

---

## Task 3: Reactions — Frontend

**Files:**
- Create: `frontend/src/components/social/ReactionBar.tsx`
- Create: `frontend/src/components/social/ReactionOverlay.tsx`
- Modify: `frontend/src/pages/MusicQueueView.tsx`
- Modify: `frontend/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Add REACTION handler to useWebSocket.ts**

In `frontend/src/hooks/useWebSocket.ts`, the `handleMessage` function's switch already has a callback dispatch at the top that will handle `REACTION` messages if registered via `onWsMessage`. No changes needed to the switch — the `ReactionOverlay` component will register its own callback.

Actually, since reactions need to be handled by a component (not a store), using `onWsMessage` is the right approach. No changes to useWebSocket.ts needed.

- [ ] **Step 2: Create ReactionBar.tsx**

Create `frontend/src/components/social/ReactionBar.tsx`:

```typescript
import { useRef } from 'react';
import { wsSend } from '../../hooks/useWebSocket';

const EMOJIS = ['🔥', '❤️', '😂', '💀', '🗑️'];

export function ReactionBar() {
  const lastSent = useRef(0);

  const handleReaction = (emoji: string) => {
    const now = Date.now();
    if (now - lastSent.current < 500) return; // rate limit: 1 per 500ms
    lastSent.current = now;
    wsSend('REACTION', { emoji });
  };

  return (
    <div className="flex items-center gap-2">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleReaction(emoji)}
          className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-white/10 flex items-center justify-center text-lg transition-all hover:scale-110 active:scale-95"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create ReactionOverlay.tsx**

Create `frontend/src/components/social/ReactionOverlay.tsx`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { onWsMessage, offWsMessage } from '../../hooks/useWebSocket';

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number; // random horizontal offset in %
}

let nextId = 0;

export function ReactionOverlay() {
  const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);

  const handleReaction = useCallback((data: unknown) => {
    const { emoji } = data as { emoji: string };
    const id = nextId++;
    const x = 10 + Math.random() * 80; // 10% to 90% horizontal
    setEmojis((prev) => [...prev, { id, emoji, x }]);
    // Remove after animation completes
    setTimeout(() => {
      setEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    onWsMessage('REACTION', handleReaction);
    return () => offWsMessage('REACTION');
  }, [handleReaction]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {emojis.map((e) => (
        <span
          key={e.id}
          className="absolute text-3xl animate-float-up"
          style={{ left: `${e.x}%`, bottom: '0%' }}
        >
          {e.emoji}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add the float-up animation to globals.css**

In `frontend/src/styles/globals.css`, add:

```css
@keyframes float-up {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(-120px) scale(1.2);
    opacity: 0;
  }
}

.animate-float-up {
  animation: float-up 2s ease-out forwards;
}
```

- [ ] **Step 5: Add ReactionBar and ReactionOverlay to MusicQueueView**

In `frontend/src/pages/MusicQueueView.tsx`, add imports:

```typescript
import { ReactionBar } from '../components/social/ReactionBar';
import { ReactionOverlay } from '../components/social/ReactionOverlay';
```

Wrap the Now Playing section in a `relative` container and add the overlay and reaction bar. Replace the Now Playing `{track && (` section with:

```typescript
{track && (
  <section className="relative group">
    <ReactionOverlay />
    <div className="flex flex-col md:flex-row items-end md:items-center gap-8">
      <div className="relative flex-shrink-0">
        <div className="w-48 h-48 md:w-64 md:h-64 rounded-xl overflow-hidden shadow-2xl shadow-primary/20 rotate-[-2deg] group-hover:rotate-0 transition-transform duration-500">
          <img
            className="w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-700"
            src={track.thumbnail}
            alt={track.title}
          />
        </div>
        <div className="absolute -bottom-4 -right-4 p-4 rounded-full signature-gradient shadow-xl text-black flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            pause
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/20 text-[10px] font-bold uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
          Now Playing
        </div>
        <div>
          <h2 className="text-4xl md:text-6xl font-black font-headline tracking-tighter text-on-surface">
            {track.title}
          </h2>
          <p className="text-xl md:text-2xl text-primary font-medium">{track.artist}</p>
        </div>
        <ReactionBar />
      </div>
    </div>
  </section>
)}
```

- [ ] **Step 6: Verify frontend compiles**

```bash
cd /Users/mccann/development/awks3/frontend && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/social/ReactionBar.tsx frontend/src/components/social/ReactionOverlay.tsx frontend/src/pages/MusicQueueView.tsx frontend/src/styles/globals.css
git commit -m "feat: add emoji reactions with floating animations"
```

---

## Task 4: Audio Visualizer

**Files:**
- Create: `frontend/src/hooks/useVisualizer.ts`
- Modify: `frontend/src/hooks/useWebRTC.ts`
- Modify: `frontend/src/components/layout/PlayerBar.tsx`

- [ ] **Step 1: Expose AnalyserNode from useWebRTC**

In `frontend/src/hooks/useWebRTC.ts`, add an `analyserRef`:

Add after the existing `audioRef` declaration:
```typescript
const analyserRef = useRef<AnalyserNode | null>(null);
```

In the `pc.ontrack` callback, after `audio.srcObject = event.streams[0]`, add AudioContext setup:

Replace the `pc.ontrack` callback body with:
```typescript
    pc.ontrack = (event) => {
      console.log('[webrtc] got remote track:', event.track.kind);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.srcObject = event.streams[0];
      audio.volume = volumeRef.current / 100;

      // Set up Web Audio API analyser for visualizer
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
      } catch (e) {
        // AudioContext may fail in some browsers — visualizer just won't work
        console.warn('[webrtc] failed to create analyser:', e);
      }

      audio.play().then(() => {
        console.log('[webrtc] audio playing');
        connectedRef.current = true;
        setListening(true);
      }).catch(() => {
        const tryPlay = () => {
          audio.play().then(() => {
            connectedRef.current = true;
            setListening(true);
            document.removeEventListener('click', tryPlay);
            document.removeEventListener('keydown', tryPlay);
          }).catch(() => {});
        };
        document.addEventListener('click', tryPlay);
        document.addEventListener('keydown', tryPlay);
      });
    };
```

Update the return to expose the analyser:
```typescript
return { volume, setVolume, listening, analyserRef };
```

- [ ] **Step 2: Create useVisualizer hook**

Create `frontend/src/hooks/useVisualizer.ts`:

```typescript
import { useEffect, useRef, type RefObject } from 'react';

export function useVisualizer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  analyserRef: RefObject<AnalyserNode | null>,
) {
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount; // fftSize/2 = 32
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const barCount = bufferLength;
      const gap = 2;
      const barWidth = (width - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i] / 255;
        const barHeight = value * height;

        // Gradient from purple (low freq) to cyan (high freq)
        const hue = 270 + (i / barCount) * 90; // 270 (purple) → 180 (cyan)
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.6 + value * 0.4})`;

        const x = i * (barWidth + gap);
        const y = height - barHeight;

        // Rounded top
        const radius = Math.min(barWidth / 2, 3);
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, height);
        ctx.fill();
      }
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [canvasRef, analyserRef, analyserRef.current]); // re-run when analyser becomes available
}
```

- [ ] **Step 3: Add visualizer canvas to PlayerBar**

In `frontend/src/components/layout/PlayerBar.tsx`:

Add import:
```typescript
import { useRef } from 'react';
import { useVisualizer } from '../../hooks/useVisualizer';
```

Update the props interface to include the analyser:
```typescript
interface PlayerBarProps {
  volume: number;
  onVolumeChange: (v: number) => void;
  analyserRef: React.RefObject<AnalyserNode | null>;
}

export function PlayerBar({ volume, onVolumeChange, analyserRef }: PlayerBarProps) {
```

Add inside the component, before the `if (!track)` check:
```typescript
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useVisualizer(canvasRef, analyserRef);
```

Add the canvas just before the closing `</footer>` tag, after the volume section:

```typescript
      {/* Visualizer */}
      <canvas
        ref={canvasRef}
        width={800}
        height={28}
        className="absolute bottom-0 left-0 right-0 h-7 w-full opacity-60"
      />
```

Also add `relative` to the footer's className so the absolute canvas is positioned correctly:

Change:
```
className="hidden lg:flex fixed bottom-0 left-64 right-0 h-24 bg-[#0e0e13]/80 backdrop-blur-xl px-8 items-center justify-between border-t border-white/5 z-50"
```
to:
```
className="hidden lg:flex fixed bottom-0 left-64 right-0 h-24 bg-[#0e0e13]/80 backdrop-blur-xl px-8 items-center justify-between border-t border-white/5 z-50 relative"
```

- [ ] **Step 4: Pass analyserRef from App to PlayerBar**

In `frontend/src/App.tsx`, update the useWebRTC destructuring:

Replace:
```typescript
const { volume, setVolume, listening } = useWebRTC();
```
with:
```typescript
const { volume, setVolume, listening, analyserRef } = useWebRTC();
```

Update the PlayerBar:
```typescript
<PlayerBar volume={volume} onVolumeChange={setVolume} analyserRef={analyserRef} />
```

- [ ] **Step 5: Verify frontend compiles**

```bash
cd /Users/mccann/development/awks3/frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useVisualizer.ts frontend/src/hooks/useWebRTC.ts frontend/src/components/layout/PlayerBar.tsx frontend/src/App.tsx
git commit -m "feat: add frequency bar audio visualizer in PlayerBar"
```
