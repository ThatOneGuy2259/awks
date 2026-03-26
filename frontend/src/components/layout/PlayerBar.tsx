import { usePlaybackStore } from '../../stores/playbackStore';
import { useSkipVoteStore } from '../../stores/skipVoteStore';
import { usePlaybackSync, formatTime } from '../../hooks/usePlaybackSync';
import { VolumeSlider } from '../player/VolumeSlider';
import { api } from '../../lib/api';
import { useVisualizer } from '../../hooks/useVisualizer';

interface PlayerBarProps {
  volume: number;
  onVolumeChange: (v: number) => void;
  analyserRef: React.RefObject<AnalyserNode | null>;
}

export function PlayerBar({ volume, onVolumeChange, analyserRef }: PlayerBarProps) {
  const track = usePlaybackStore((s) => s.currentTrack);
  const { votes, votedByMe, getVotesRequired } = useSkipVoteStore();
  const votesRequired = getVotesRequired();
  const { elapsed, duration } = usePlaybackSync();

  const canvasRef = useVisualizer(analyserRef);

  if (!track) return null;

  const progress = duration > 0 ? (elapsed / duration) * 100 : 0;

  const handleSkipVote = async () => {
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
    <footer className="hidden lg:flex fixed bottom-0 left-64 right-0 h-24 bg-[#0e0e13]/80 backdrop-blur-xl px-8 items-center justify-between border-t border-white/5 z-50">
      {/* Left: Track info */}
      <div className="flex items-center gap-4 w-1/3 flex-shrink-0">
        <div className="w-12 h-12 rounded-lg overflow-hidden">
          <img className="w-full h-full object-cover" src={track.thumbnail} alt={track.title} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-on-surface truncate">{track.title}</p>
          <p className="text-xs text-on-surface-variant truncate">{track.artist}</p>
        </div>
      </div>

      {/* Center: Vote to Skip + Progress */}
      <div className="flex flex-col items-center gap-2 w-1/3">
        <div className="flex flex-col items-center gap-3 w-full">
          <button
            onClick={handleSkipVote}
            className={`flex items-center gap-2 px-6 py-2 rounded-full border font-bold text-sm group transition-all ${
              votedByMe
                ? 'bg-secondary/20 text-secondary border-secondary/40'
                : 'bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/20'
            }`}
          >
            <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">skip_next</span>
            <span>Vote to Skip</span>
            {votesRequired > 0 && (
              <span className="text-xs opacity-70">{votes}/{votesRequired}</span>
            )}
          </button>
          <div className="flex items-center gap-3 w-full max-w-md">
            <span className="text-[10px] text-on-surface-variant font-bold">{formatTime(elapsed)}</span>
            <div className="h-1 flex-1 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-secondary rounded-full relative transition-[width] duration-1000 linear"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-on-surface rounded-full shadow-lg" />
              </div>
            </div>
            <span className="text-[10px] text-on-surface-variant font-bold">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Right: Volume */}
      <div className="flex items-center justify-end w-1/3 flex-shrink-0">
        <VolumeSlider volume={volume} onChange={onVolumeChange} />
      </div>
      {/* Visualizer */}
      <canvas
        ref={canvasRef}
        width={1200}
        height={280}
        className="absolute -top-[180px] left-0 right-0 h-[280px] w-full pointer-events-none"
      />
    </footer>
  );
}
