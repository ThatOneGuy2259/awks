import { formatTime } from '../../lib/formatTime';

interface TrackTooltipProps {
  title: string;
  artist: string;
  durationSec: number;
}

export function TrackTooltip({ title, artist, durationSec }: TrackTooltipProps) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 pointer-events-none">
      <div className="bg-surface-container-highest/95 backdrop-blur-lg border border-outline-variant/20 rounded-lg shadow-xl px-4 py-3 max-w-[280px] w-max">
        <p className="text-sm font-bold text-on-surface leading-snug line-clamp-3">{title}</p>
        <p className="text-xs text-secondary mt-1 truncate">{artist}</p>
        {durationSec > 0 && (
          <p className="text-xs text-on-surface-variant mt-1">{formatTime(durationSec)}</p>
        )}
      </div>
      {/* Arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-surface-container-highest/95 border-b border-r border-outline-variant/20 rotate-45" />
    </div>
  );
}
