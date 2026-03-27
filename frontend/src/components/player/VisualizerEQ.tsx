import { useState } from 'react';
import { useVisualizerStore, EQ_BANDS, type VisualizerOrientation } from '../../stores/visualizerStore';

interface VisualizerEQProps {
  onClose: () => void;
}

export function VisualizerEQ({ onClose }: VisualizerEQProps) {
  const { bandGains, mirrored, orientation, setBandGain, resetBandGains, setMirrored, setOrientation, exportEQ, importEQ } =
    useVisualizerStore();

  const [showImport, setShowImport] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleExport = () => {
    const encoded = exportEQ();
    navigator.clipboard.writeText(encoded);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = () => {
    setImportError('');
    if (!importValue.trim()) return;
    const ok = importEQ(importValue);
    if (ok) {
      setImportValue('');
      setShowImport(false);
    } else {
      setImportError('Invalid EQ string');
    }
  };

  return (
    <div className="fixed bottom-28 right-8 z-[60]">
      <div className="bg-surface-container-high/95 backdrop-blur-xl rounded-2xl border border-outline-variant/10 p-4 shadow-2xl shadow-black/40 w-[420px] max-h-[50vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">Visualizer EQ</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(!showImport)}
              className="text-xs px-3 py-1 rounded-full border border-outline-variant/20 text-on-surface-variant hover:bg-white/5 transition-all font-bold"
            >
              Import
            </button>
            <button
              onClick={handleExport}
              className="text-xs px-3 py-1 rounded-full border border-outline-variant/20 text-on-surface-variant hover:bg-white/5 transition-all font-bold"
            >
              {copied ? 'Copied!' : 'Export'}
            </button>
            <button
              onClick={resetBandGains}
              className="text-xs px-3 py-1 rounded-full border border-outline-variant/20 text-on-surface-variant hover:bg-white/5 transition-all font-bold"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="p-1 text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </div>

        {/* Import input */}
        {showImport && (
          <div className="mb-4 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={importValue}
                onChange={(e) => { setImportValue(e.target.value); setImportError(''); }}
                placeholder="Paste EQ string..."
                className="flex-1 bg-surface-container-low text-on-surface rounded-lg px-3 py-2 text-sm border border-transparent focus:border-primary/30 focus:outline-none placeholder:text-on-surface-variant/40"
                onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              />
              <button
                onClick={handleImport}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary-fixed text-sm font-bold hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            </div>
            {importError && (
              <p className="text-xs text-red-400">{importError}</p>
            )}
          </div>
        )}

        {/* EQ Sliders */}
        <div className="flex items-end justify-between gap-1">
          {EQ_BANDS.map((band, i) => (
            <div key={band.label} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[10px] text-on-surface-variant font-mono">
                {bandGains[i].toFixed(1)}
              </span>
              <div className="h-20 lg:h-28 flex items-center justify-center">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={bandGains[i]}
                  onChange={(e) => setBandGain(i, parseFloat(e.target.value))}
                  className="appearance-none h-16 lg:h-24 w-1.5 rounded-full bg-surface-container-lowest cursor-pointer accent-primary"
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                  }}
                />
              </div>
              <span className="text-[10px] font-bold text-on-surface-variant">{band.label}</span>
              <span className="text-[8px] text-on-surface-variant/50 hidden lg:block">{band.range}</span>
            </div>
          ))}
        </div>

        {/* Layout controls — inline row below sliders */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">Mirror</span>
            <button
              onClick={() => setMirrored(!mirrored)}
              className={`w-9 h-5 rounded-full transition-colors relative ${
                mirrored ? 'bg-primary' : 'bg-surface-container-lowest'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${
                mirrored ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`} />
            </button>
          </div>

          <div className="w-px h-5 bg-outline-variant/10" />

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-on-surface-variant mr-1">Layout</span>
            {([
              { value: 'normal' as VisualizerOrientation, label: 'Bass Center' },
              { value: 'flipped' as VisualizerOrientation, label: 'Bass Outer' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setOrientation(opt.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  orientation === opt.value
                    ? 'bg-primary/10 text-primary'
                    : 'text-on-surface-variant hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
