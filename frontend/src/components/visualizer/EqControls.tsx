import { useState } from 'react';
import { BandSliders } from './BandSliders';

interface EqControlsProps {
  /** Section label, e.g. "Audio EQ" or "Sensitivity". */
  title: string;
  subtitle?: string;
  gains: number[];
  onChange: (band: number, gain: number) => void;
  onReset: () => void;
  onExport: () => string;
  onImport: (encoded: string) => boolean;
}

/** Self-contained EQ block: header with import/export/reset + the 8 band
 * sliders. Reused by the settings modal (audio) and the Visualizer Studio (viz). */
export function EqControls({ title, subtitle, gains, onChange, onReset, onExport, onImport }: EqControlsProps) {
  const [importing, setImporting] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const doExport = () => {
    const s = onExport();
    if (!s) return;
    navigator.clipboard.writeText(s);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const doImport = () => {
    setError('');
    if (!value.trim()) return;
    if (onImport(value)) {
      setValue('');
      setImporting(false);
    } else {
      setError('Invalid preset string');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="min-w-0">
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{title}</span>
          {subtitle && <p className="text-[11px] text-on-surface-variant/60">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setImporting((v) => !v); setValue(''); setError(''); }}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-all font-bold ${
              importing ? 'border-primary/30 text-primary bg-primary/10' : 'border-outline-variant/20 text-on-surface-variant hover:bg-white/5'
            }`}
          >
            Import
          </button>
          <button onClick={doExport} className="text-[10px] px-2 py-0.5 rounded-full border border-outline-variant/20 text-on-surface-variant hover:bg-white/5 transition-all font-bold">
            {copied ? 'Copied!' : 'Export'}
          </button>
          <button onClick={onReset} className="text-[10px] px-2 py-0.5 rounded-full border border-outline-variant/20 text-on-surface-variant hover:bg-white/5 transition-all font-bold">
            Reset
          </button>
        </div>
      </div>

      {importing && (
        <div className="mb-2 space-y-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              placeholder="Paste preset string..."
              className="flex-1 bg-surface-container-low text-on-surface rounded-lg px-3 py-1.5 text-xs border border-transparent focus:border-primary/30 focus:outline-none placeholder:text-on-surface-variant/40"
              onKeyDown={(e) => e.key === 'Enter' && doImport()}
            />
            <button onClick={doImport} className="px-3 py-1.5 rounded-lg bg-primary text-on-primary-fixed text-xs font-bold hover:opacity-90 transition-opacity">
              Apply
            </button>
          </div>
          {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
      )}

      <BandSliders gains={gains} onChange={onChange} />
    </div>
  );
}
