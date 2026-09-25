import { useState } from 'react';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useUserStore } from '../../stores/userStore';
import { api } from '../../lib/api';
import { toast } from '../../stores/toastStore';
import { ConfirmModal } from '../ConfirmModal';

// The requester can always pull their own playing song; the server allows it
// without a skip vote.
export function RemoveOwnSongButton({ compact = false }: { compact?: boolean }) {
  const track = usePlaybackStore((s) => s.currentTrack);
  const userId = useUserStore((s) => s.id);
  const [confirming, setConfirming] = useState(false);

  if (!track || !userId || track.requestedBy !== userId) return null;

  const handleRemove = async () => {
    try {
      await api.deleteFromQueue(track.queueId);
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : "Couldn't remove your song.");
    }
  };

  return (
    <>
      {confirming && (
        <ConfirmModal
          title="Remove your song?"
          message={`This stops "${track.title}" for everyone and skips to the next track.`}
          confirmLabel="Remove"
          danger
          onConfirm={handleRemove}
          onClose={() => setConfirming(false)}
        />
      )}
      <button
        onClick={() => setConfirming(true)}
        className={`flex items-center gap-1.5 rounded-full border font-bold group transition-all active:scale-95 ${
          compact ? 'px-3 py-1 text-xs' : 'px-6 py-2 text-sm gap-2'
        } bg-error/10 border-error/50 text-error hover:bg-error/20`}
      >
        <span className={`material-symbols-outlined group-hover:animate-pulse ${compact ? 'text-sm' : ''}`}>skip_next</span>
        <span>{compact ? 'Remove' : 'Remove Song'}</span>
      </button>
    </>
  );
}
