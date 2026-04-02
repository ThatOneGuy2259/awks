import { usePlaybackStore } from '../../stores/playbackStore';
import { useSkipVoteStore } from '../../stores/skipVoteStore';
import { useUserStore } from '../../stores/userStore';
import { api } from '../../lib/api';

export function RemoveOwnSongButton({ compact = false }: { compact?: boolean }) {
  const track = usePlaybackStore((s) => s.currentTrack);
  const votedByMe = useSkipVoteStore((s) => s.votedByMe);
  const userId = useUserStore((s) => s.id);

  if (!track || track.requestedBy !== userId || !votedByMe) return null;

  const handleRemove = async () => {
    try {
      await api.deleteFromQueue(track.queueId);
    } catch (err) {
      console.error('remove own song error:', err);
    }
  };

  return (
    <button
      onClick={handleRemove}
      className={`flex items-center gap-1.5 rounded-full border font-bold group transition-all active:scale-95 ${
        compact ? 'px-3 py-1 text-xs' : 'px-6 py-2 text-sm gap-2'
      } bg-error/10 border-error/50 text-error hover:bg-error/20`}
    >
      <span className={`material-symbols-outlined group-hover:animate-pulse ${compact ? 'text-sm' : ''}`}>skip_next</span>
      <span>{compact ? 'Remove' : 'Remove Song'}</span>
    </button>
  );
}
