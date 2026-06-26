import { useAudioStore } from '../stores/audioStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useUIStore } from '../stores/uiStore';

// Surfaces WebRTC audio-stream problems that would otherwise be silent failures.
// Only shown when the WebSocket control plane is connected — if the socket is
// down, ConnectionBanner already explains the outage (and the two never overlap).
export function AudioBanner() {
  const audioStatus = useAudioStore((s) => s.status);
  const wsStatus = useConnectionStore((s) => s.status);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  if (wsStatus !== 'connected') return null;
  if (audioStatus === 'playing') return null;

  type Problem = 'connecting' | 'blocked' | 'error';

  const styles: Record<Problem, string> = {
    connecting: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    blocked: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const content: Record<Problem, { icon: string; label: string; spin?: boolean }> = {
    connecting: { icon: 'progress_activity', label: 'Connecting to audio…', spin: true },
    blocked: { icon: 'touch_app', label: 'Click anywhere to enable audio' },
    error: { icon: 'volume_off', label: "Can't connect to audio — retrying…" },
  };

  const c = content[audioStatus];

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-[90] flex items-center justify-center gap-2 py-2 text-xs font-bold border-b transition-[left] duration-300 ease-in-out ${sidebarCollapsed ? 'lg:left-0' : 'lg:left-64'} ${styles[audioStatus]}`}
    >
      <span className={`material-symbols-outlined text-sm ${c.spin ? 'animate-spin' : ''}`}>{c.icon}</span>
      <span>{c.label}</span>
    </div>
  );
}
