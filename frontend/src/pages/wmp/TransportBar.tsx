import { usePlaybackStore } from '../../stores/playbackStore';
import { useSkipVoteStore } from '../../stores/skipVoteStore';
import { api } from '../../lib/api';

interface TransportBarProps {
  volume: number;
  setVolume: (v: number) => void;
}

export function TransportBar({ volume, setVolume }: TransportBarProps) {
  const track = usePlaybackStore((s) => s.currentTrack);
  const { votes, votedByMe, getVotesRequired } = useSkipVoteStore();
  const votesRequired = getVotesRequired();

  const handleSkipVote = async () => {
    if (!track) return;
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
    <div className="wmp-transport">
      <button type="button" className="wmp-transport__btn" title="Playback is controlled by the station" aria-label="Shuffle">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 4 L7 4 L13 12 L14 12 M2 12 L7 12 L13 4 L14 4" stroke="currentColor" fill="none" strokeWidth="1.5" />
        </svg>
      </button>
      <button type="button" className="wmp-transport__btn" title="Playback is controlled by the station" aria-label="Previous">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 3 L4 13 M5 8 L13 3 L13 13 Z" stroke="currentColor" fill="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button type="button" className="wmp-transport__btn wmp-transport__btn--play" title="Playback is controlled by the station" aria-label="Play">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 3 L16 10 L5 17 Z" fill="currentColor" />
        </svg>
      </button>
      <button type="button" className="wmp-transport__btn" title="Playback is controlled by the station" aria-label="Stop">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="3" width="10" height="10" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className={`wmp-transport__btn ${votedByMe ? 'wmp-transport__btn--active' : ''}`}
        onClick={handleSkipVote}
        disabled={!track}
        title={track ? `Vote to skip (${votes}/${votesRequired})` : 'No track playing'}
        aria-label="Skip vote"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 3 L11 8 L2 13 Z M12 3 L14 3 L14 13 L12 13 Z" stroke="currentColor" fill="currentColor" strokeWidth="1" />
        </svg>
        {votedByMe && <span className="wmp-transport__vote-badge">{votes}</span>}
      </button>

      <div className="wmp-transport__volume">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 5 L5 5 L9 2 L9 12 L5 9 L2 9 Z M11 4 L12 6 L11 8" stroke="currentColor" fill="none" strokeWidth="1" />
        </svg>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="wmp-transport__volume-slider"
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
