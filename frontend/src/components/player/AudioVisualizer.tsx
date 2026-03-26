import { usePlaybackStore } from '../../stores/playbackStore';

const BAR_COUNT = 28;
const heights = [40, 60, 80, 30, 90, 50, 100, 70, 45, 65, 85, 40, 60, 80, 30, 90, 50, 100, 70, 45, 65, 85, 40, 60, 80, 30, 90, 50];
const colors = ['primary', 'primary', 'primary', 'primary', 'secondary', 'secondary', 'primary', 'primary', 'primary', 'secondary', 'secondary', 'primary', 'primary', 'primary', 'primary', 'secondary', 'secondary', 'primary', 'primary', 'primary', 'secondary', 'secondary', 'primary', 'primary', 'primary', 'primary', 'secondary', 'secondary'];

export function AudioVisualizer() {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  return (
    <div className="flex items-end justify-between gap-1 mb-6 h-16">
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const h = heights[i % heights.length];
        const c = colors[i % colors.length];
        const opacity = [30, 40, 45, 50, 60, 70, 80][i % 7];
        return (
          <div
            key={i}
            className={`w-1.5 rounded-full transition-all duration-500 ${
              i >= 16 ? 'hidden md:block' : ''
            } ${isPlaying ? 'animate-pulse' : ''}`}
            style={{
              height: isPlaying ? `${h}%` : '10%',
              backgroundColor: `var(--color-${c})`,
              opacity: opacity / 100,
              animationDelay: `${(i * 0.1) % 1}s`,
              animationDuration: `${0.5 + (i % 5) * 0.2}s`,
            }}
          />
        );
      })}
    </div>
  );
}
