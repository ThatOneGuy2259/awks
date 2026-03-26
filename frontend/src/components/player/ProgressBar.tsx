import { usePlaybackSync, formatTime } from '../../hooks/usePlaybackSync';

export function ProgressBar() {
  const { elapsed, duration } = usePlaybackSync();
  const progress = duration > 0 ? (elapsed / duration) * 100 : 0;

  return (
    <section className="mb-16">
      <div className="relative w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-secondary rounded-full neon-glow-secondary transition-[width] duration-1000 linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between mt-3 text-xs font-label text-on-surface-variant uppercase tracking-widest font-bold">
        <span>{formatTime(elapsed)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </section>
  );
}
