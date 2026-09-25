import { useCallback, useState, type FormEvent } from 'react';
import { useListenWebSocket } from '../hooks/useWebSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useVisualizer } from '../hooks/useVisualizer';
import { usePlaybackSync } from '../hooks/usePlaybackSync';
import { usePlaybackStore } from '../stores/playbackStore';
import { useQueueStore } from '../stores/queueStore';
import { useVisualizerStore } from '../stores/visualizerStore';
import { formatTime } from '../lib/formatTime';
import { api } from '../lib/api';
import { AwksLogo } from '../components/AwksLogo';
import { AudioBanner } from '../components/AudioBanner';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { VolumeSlider } from '../components/player/VolumeSlider';

// How many upcoming tracks fit on a TV screen without scrolling.
const UP_NEXT_LIMIT = 8;

// This screen's device key from pairing. Kept until the pairing is removed.
const TOKEN_KEY = 'awks-listen-token';

/**
 * Listen-only page for TVs and other shared screens: now playing, up next and
 * the visualizer. It can't request, vote or chat. A screen pairs once with a
 * code made by a signed-in user, then reconnects with its saved key.
 */
export function ListenPage() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [notice, setNotice] = useState('');

  const handleRejected = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setNotice('This screen was removed. Enter a new code to listen again.');
    setToken(null);
  }, []);

  if (!token) {
    return (
      <PairScreen
        notice={notice}
        onPaired={(t) => {
          localStorage.setItem(TOKEN_KEY, t);
          setNotice('');
          setToken(t);
        }}
      />
    );
  }
  return <ListenPlayer token={token} onRejected={handleRejected} />;
}

function PairScreen({ notice, onPaired }: { notice: string; onPaired: (token: string) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { token } = await api.pairListen(code.trim());
      onPaired(token);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't pair this screen.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md text-center space-y-6">
        <AwksLogo className="h-14 w-auto mx-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold font-headline">Pair this screen</h1>
          <p className="text-on-surface-variant">
            On a signed-in device, open Settings → TV &amp; screens and make a code. Enter it here.
          </p>
        </div>
        {notice && <p className="text-sm text-amber-400">{notice}</p>}
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={10}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Pairing code"
          placeholder="ABC123"
          className="w-full text-center text-4xl font-black tracking-[0.3em] bg-surface-container-high rounded-2xl py-5 outline-none focus:ring-2 focus:ring-primary/60 placeholder:text-on-surface-variant/30"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="w-full py-4 rounded-full text-lg font-bold bg-primary text-on-primary-fixed disabled:opacity-40 transition-opacity"
        >
          {busy ? 'Pairing…' : 'Connect'}
        </button>
      </form>
    </div>
  );
}

function ListenPlayer({ token, onRejected }: { token: string; onRejected: () => void }) {
  useListenWebSocket(token, onRejected);
  const { volume, setVolume, analyserRef } = useWebRTC();
  const reduceVisuals = useVisualizerStore((s) => s.reduceVisuals);
  const setReduceVisuals = useVisualizerStore((s) => s.setReduceVisuals);

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col">
      <ConnectionBanner noSidebar />
      <AudioBanner noSidebar />

      <header className="flex items-center justify-between px-10 pt-8">
        <AwksLogo className="h-10 w-auto" />
        <div className="flex items-center gap-4">
          <VolumeSlider volume={volume} onChange={setVolume} />
          <button
            onClick={() => setReduceVisuals(!reduceVisuals)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
              reduceVisuals
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'text-on-surface-variant border-outline-variant/20 hover:text-primary'
            }`}
            aria-pressed={reduceVisuals}
          >
            <span className="material-symbols-outlined text-lg">battery_saver</span>
            Low performance mode
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-12 px-10 py-10">
        <NowPlaying />
        <UpNext />
      </main>

      {!reduceVisuals && <ListenVisualizer analyserRef={analyserRef} />}
    </div>
  );
}

function NowPlaying() {
  const track = usePlaybackStore((s) => s.currentTrack);
  const { elapsed, duration } = usePlaybackSync();

  if (!track) {
    return (
      <section className="xl:col-span-7 flex items-center">
        <p className="text-3xl font-bold font-headline text-on-surface-variant">Nothing playing right now</p>
      </section>
    );
  }

  const progress = duration > 0 ? (elapsed / duration) * 100 : 0;

  return (
    <section className="xl:col-span-7 flex flex-col md:flex-row items-start md:items-center gap-10">
      <img
        className="w-64 h-64 xl:w-80 xl:h-80 rounded-2xl object-cover shadow-2xl shadow-primary/20 flex-shrink-0"
        src={track.thumbnail}
        alt={track.title}
      />
      <div className="min-w-0 flex-1 space-y-4">
        <p className="text-xs font-bold uppercase tracking-widest text-secondary">Now Playing</p>
        <h1 className="text-5xl xl:text-6xl font-black font-headline tracking-tighter leading-tight">{track.title}</h1>
        <p className="text-2xl text-primary font-medium">{track.artist}</p>
        {track.requesterName && (
          <p className="text-lg text-on-surface-variant">
            Requested by <span className="text-on-surface font-medium">{track.requesterName}</span>
          </p>
        )}
        <div className="flex items-center gap-3 pt-2 max-w-xl">
          <span className="text-sm text-on-surface-variant font-bold tabular-nums">{formatTime(elapsed)}</span>
          <div className="h-1.5 flex-1 bg-surface-container-high rounded-full overflow-hidden">
            <div className="h-full bg-secondary rounded-full transition-[width] duration-1000 linear" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-sm text-on-surface-variant font-bold tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>
    </section>
  );
}

function UpNext() {
  const tracks = useQueueStore((s) => s.tracks);
  const pending = tracks.filter((t) => t.status === 'pending');

  return (
    <section className="xl:col-span-5 space-y-4">
      <h2 className="text-2xl font-bold font-headline">Up Next</h2>
      {pending.length === 0 ? (
        <p className="text-on-surface-variant">The queue is empty.</p>
      ) : (
        <ol className="space-y-3">
          {pending.slice(0, UP_NEXT_LIMIT).map((t) => (
            <li key={t.id} className="flex items-center gap-4 p-3 rounded-lg bg-surface-container">
              <img
                className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                src={t.thumbnail_url || `https://img.youtube.com/vi/${t.video_id}/mqdefault.jpg`}
                alt={t.title}
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate">{t.title}</p>
                <p className="text-sm text-on-surface-variant truncate">
                  {t.artist}
                  {t.requester_name && <> · {t.requester_name}</>}
                </p>
              </div>
            </li>
          ))}
          {pending.length > UP_NEXT_LIMIT && (
            <li className="text-sm text-on-surface-variant px-3">+{pending.length - UP_NEXT_LIMIT} more</li>
          )}
        </ol>
      )}
    </section>
  );
}

function ListenVisualizer({ analyserRef }: { analyserRef: ReturnType<typeof useWebRTC>['analyserRef'] }) {
  const canvasRef = useVisualizer(analyserRef);
  return (
    <canvas
      ref={canvasRef}
      width={1920}
      height={280}
      className="w-full h-48 xl:h-64 pointer-events-none"
      aria-hidden="true"
    />
  );
}
