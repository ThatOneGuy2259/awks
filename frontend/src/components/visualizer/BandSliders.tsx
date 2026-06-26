import { EQ_BANDS } from '../../stores/visualizerStore';

interface BandSlidersProps {
  gains: number[];
  onChange: (band: number, gain: number) => void;
}

// gain ranges 0..2 with 1.0 = flat (0 dB). The fill height maps the gain so the
// midline marks the flat reference: below = cut, above = boost.
const FADER_H = 'h-20';

/** 8 visible EQ faders — a lit track with a level fill + draggable thumb.
 * Shared by the Audio EQ (settings modal) and the Visualizer sensitivity (studio). */
export function BandSliders({ gains, onChange }: BandSlidersProps) {
  return (
    <div className="flex items-end justify-between gap-2">
      {EQ_BANDS.map((band, i) => {
        const pct = Math.max(0, Math.min(1, gains[i] / 2)) * 100;
        return (
          <div key={band.label} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
            <span className="text-[10px] text-on-surface-variant font-mono tabular-nums">{gains[i].toFixed(1)}</span>

            <div className={`relative ${FADER_H} w-3 rounded-full bg-surface-container-highest overflow-hidden`}>
              {/* level fill */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-primary/70 to-secondary"
                style={{ height: `${pct}%` }}
              />
              {/* 0 dB reference line */}
              <div className="absolute left-0 right-0 h-px bg-white/20" style={{ bottom: '50%' }} />
              {/* thumb cap at the fill top */}
              <div
                className="absolute left-1/2 -translate-x-1/2 w-4 h-1.5 rounded-full bg-white shadow pointer-events-none"
                style={{ bottom: `calc(${pct}% - 3px)` }}
              />
              {/* transparent native control captures the drag over the whole fader */}
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={gains[i]}
                onChange={(e) => onChange(i, parseFloat(e.target.value))}
                aria-label={`${band.label} gain`}
                className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
              />
            </div>

            <span className="text-[10px] font-bold text-on-surface-variant">{band.label}</span>
          </div>
        );
      })}
    </div>
  );
}
