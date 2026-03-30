import { useState } from 'react';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useSkipVoteStore } from '../../stores/skipVoteStore';
import { usePlaybackSync, formatTime } from '../../hooks/usePlaybackSync';
import { VolumeSlider } from '../player/VolumeSlider';
import { VisualizerEQ } from '../player/VisualizerEQ';
import { api } from '../../lib/api';
import { useVisualizer } from '../../hooks/useVisualizer';
import { useUIStore } from '../../stores/uiStore';

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
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const [showEQ, setShowEQ] = useState(false);

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

  const skipButton = (compact: boolean) => (
    <button
      onClick={handleSkipVote}
      className={`flex items-center gap-1.5 rounded-full border font-bold group transition-all ${
        compact ? 'px-3 py-1 text-xs' : 'px-6 py-2 text-sm gap-2'
      } ${
        votedByMe
          ? 'bg-secondary/20 text-secondary border-secondary/40'
          : 'bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/20'
      }`}
    >
      <span className={`material-symbols-outlined group-hover:rotate-12 transition-transform ${compact ? 'text-sm' : ''}`}>skip_next</span>
      <span>{compact ? 'Skip' : 'Vote to Skip'}</span>
      {votesRequired > 0 && (
        <span className="text-xs opacity-70">{votes}/{votesRequired}</span>
      )}
    </button>
  );

  const progressBar = (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] text-on-surface-variant font-bold">{formatTime(elapsed)}</span>
      <div className="h-1 flex-1 bg-surface-container-high rounded-full overflow-hidden">
        <div
          className="h-full bg-secondary rounded-full relative transition-[width] duration-1000 linear"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-on-surface rounded-full shadow-lg" />
        </div>
      </div>
      <span className="text-[10px] text-on-surface-variant font-bold">{formatTime(duration)}</span>
    </div>
  );

  const eqButton = (
    <button
      onClick={() => setShowEQ(!showEQ)}
      className={`p-1.5 rounded-full transition-all ${
        showEQ ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-primary'
      }`}
      title="Visualizer EQ"
    >
      <span className="material-symbols-outlined text-lg">equalizer</span>
    </button>
  );

  return (
    <>
      {/* Shared visualizer canvas — reflections overlap the player bar */}
      <canvas
        ref={canvasRef}
        width={1920}
        height={280}
        className={`hidden lg:block fixed right-0 pointer-events-none z-[51] h-[220px] -bottom-[22px] xl:h-[280px] xl:-bottom-[4px] transition-[left,width] duration-300 ease-in-out ${sidebarCollapsed ? 'left-0 w-full' : 'left-64 w-[calc(100%-16rem)]'}`}
      />

      {/* ── Compact layout: lg to xl ── */}
      <footer className={`hidden lg:flex xl:hidden fixed bottom-0 right-0 h-16 bg-surface/80 backdrop-blur-xl px-4 items-center gap-3 border-t border-white/5 z-50 transition-[left] duration-300 ease-in-out ${sidebarCollapsed ? 'left-0' : 'left-64'}`}>
        <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
          <img className="w-full h-full object-cover" src={track.thumbnail} alt={track.title} />
        </div>

        <div className="min-w-0 w-32 flex-shrink-0">
          <p className="text-xs font-bold text-on-surface truncate">{track.title}</p>
          <p className="text-[10px] text-on-surface-variant truncate">{track.artist}</p>
        </div>

        <div className="flex-1 max-w-sm">
          {progressBar}
        </div>

        {skipButton(true)}

        <div className="flex items-center gap-2 flex-shrink-0">
          {eqButton}
          <VolumeSlider volume={volume} onChange={onVolumeChange} />
        </div>
      </footer>

      {/* ── Full layout: xl and up ── */}
      <footer className={`hidden xl:flex fixed bottom-0 right-0 h-24 bg-surface/80 backdrop-blur-xl px-8 items-center justify-between border-t border-white/5 z-50 transition-[left] duration-300 ease-in-out ${sidebarCollapsed ? 'left-0' : 'left-64'}`}>
        <div className="flex items-center gap-4 w-1/3 flex-shrink-0">
          <div className="w-12 h-12 rounded-lg overflow-hidden">
            <img className="w-full h-full object-cover" src={track.thumbnail} alt={track.title} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface truncate">{track.title}</p>
            <p className="text-xs text-on-surface-variant truncate">{track.artist}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 w-1/3">
          <div className="flex flex-col items-center gap-3 w-full">
            {skipButton(false)}
            <div className="w-full max-w-md">
              {progressBar}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 w-1/3 flex-shrink-0">
          {eqButton}
          <VolumeSlider volume={volume} onChange={onVolumeChange} />
        </div>
      </footer>

      {/* EQ Panel — shared, renders above whichever footer is visible */}
      {showEQ && <VisualizerEQ onClose={() => setShowEQ(false)} />}
    </>
  );
}
