import { usePlaybackStore } from '../../stores/playbackStore';
import { useSkipVoteStore } from '../../stores/skipVoteStore';
import { api } from '../../lib/api';

export function VoteSkipButton() {
  const track = usePlaybackStore((s) => s.currentTrack);
  const { votes, votedByMe, getVotesRequired } = useSkipVoteStore();
  const votesRequired = getVotesRequired();

  if (!track) return null;

  const handleClick = async () => {
    try {
      if (votedByMe) {
        await api.retractSkipVote(track.queueId);
        useSkipVoteStore.getState().setVotedByMe(false);
      } else {
        await api.castSkipVote(track.queueId);
        useSkipVoteStore.getState().setVotedByMe(true);
      }
    } catch (err) {
      console.error('vote skip error:', err);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`group flex items-center gap-4 border px-8 py-4 rounded-full transition-all active:scale-95 ${
        votedByMe
          ? 'bg-primary/10 border-primary/50 text-primary'
          : 'bg-surface-container-lowest border-primary/20 hover:border-primary/50 text-on-surface'
      }`}
    >
      <span className="material-symbols-outlined text-primary group-hover:animate-pulse">skip_next</span>
      <span className="font-bold">Vote to Skip</span>
      <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-black">
        {votes} / {votesRequired}
      </span>
    </button>
  );
}
