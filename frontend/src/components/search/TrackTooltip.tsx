import { useRef, useLayoutEffect, useState } from 'react';
import { formatTime } from '../../lib/formatTime';

interface TrackTooltipProps {
  title: string;
  artist: string;
  durationSec: number;
}

export function TrackTooltip({ title, artist, durationSec }: TrackTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(true);

  useLayoutEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      // If tooltip would go above the viewport, flip to below
      setAbove(rect.top >= 0);
    }
  }, []);

  return (
    <div
      ref={ref}
      className={`absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none ${
        above ? 'bottom-full mb-3' : 'top-full mt-3'
      }`}
    >
      <div className="bg-surface-container-highest/95 backdrop-blur-lg border border-outline-variant/20 rounded-lg shadow-xl px-4 py-3 max-w-[280px] w-max">
        <p className="text-sm font-bold text-on-surface leading-snug line-clamp-3">{title}</p>
        <p className="text-xs text-secondary mt-1 truncate">{artist}</p>
        {durationSec > 0 && (
          <p className="text-xs text-on-surface-variant mt-1">{formatTime(durationSec)}</p>
        )}
      </div>
      {/* Arrow */}
      <div className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-surface-container-highest/95 border-outline-variant/20 ${
        above
          ? '-bottom-1.5 border-b border-r rotate-45'
          : '-top-1.5 border-t border-l rotate-45'
      }`} />
    </div>
  );
}
