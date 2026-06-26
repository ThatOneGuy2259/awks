import { useState } from 'react';
import { useVisualizerStore, EQ_BANDS, type VisualizerOrientation } from '../../stores/visualizerStore';
import { useEscapeClose } from '../../hooks/useEscapeClose';

interface VisualizerEQProps {
  onClose: () => void;
}

function useClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };
  return { copiedKey, copy };
}

interface BandSlidersProps {
  gains: number[];
  onChange: (band: number, gain: number) => void;
}

function BandSliders({ gains, onChange }: BandSlidersProps) {
  return (
    <div className="flex items-end justify-between gap-1">
      {EQ_BANDS.map((band, i) => (
        <div key={band.label} className="flex flex-col items-center gap-0.5 flex-1">
          <span className="text-[10px] text-on-surface-variant font-mono">{gains[i].toFixed(1)}</span>
          <div className="h-16 lg:h-20 flex items-center justify-center">
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={gains[i]}
              onChange={(e) => onChange(i, parseFloat(e.target.value))}
              aria-label={`${band.label} gain`}
              className="appearance-none h-12 lg:h-16 w-1.5 rounded-full bg-surface-container-lowest cursor-pointer accent-primary"
              style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            />
          </div>
          <span className="text-[10px] font-bold text-on-surface-variant">{band.label}</span>
        </div>
      ))}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  importKey: string;
  activeImport: string | null;
  onToggleImport: () => void;
  onExport: () => void;
  onReset: () => void;
  copiedKey: string | null;
}

function SectionHeader({ title, importKey, activeImport, onToggleImport, onExport, onReset, copiedKey }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{title}</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleImport}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-all font-bold ${
            activeImport === importKey ? 'border-primary/30 text-primary bg-primary/10' : 'border-outline-variant/20 text-on-surface-variant hover:bg-white/5'
          }`}
        >
          Import
        </button>
        <button onClick={onExport} className="text-[10px] px-2 py-0.5 rounded-full border border-outline-variant/20 text-on-surface-variant hover:bg-white/5 transition-all font-bold">
          {copiedKey === importKey ? 'Copied!' : 'Export'}
        </button>
        <button onClick={onReset} className="text-[10px] px-2 py-0.5 rounded-full border border-outline-variant/20 text-on-surface-variant hover:bg-white/5 transition-all font-bold">
          Reset
        </button>
      </div>
    </div>
  );
}

export function VisualizerEQ({ onClose }: VisualizerEQProps) {
  const store = useVisualizerStore();
  const [importTarget, setImportTarget] = useState<string | null>(null);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState('');
  const { copiedKey, copy } = useClipboard();
  useEscapeClose(onClose);

  const toggleImport = (key: string) => {
    setImportTarget(importTarget === key ? null : key);
    setImportValue('');
    setImportError('');
  };

  const handleImport = () => {
    setImportError('');
    if (!importValue.trim()) return;
    const ok = importTarget === 'audio'
      ? store.importAudioEQ(importValue)
      : store.importVizEQ(importValue);
    if (ok) {
      setImportValue('');
      setImportTarget(null);
    } else {
      setImportError('Invalid preset string');
    }
  };

  const importRow = importTarget && (
    <div className="mb-2 space-y-1">
      <div className="flex gap-2">
        <input
          type="text"
          value={importValue}
          onChange={(e) => { setImportValue(e.target.value); setImportError(''); }}
          placeholder={`Paste ${importTarget === 'audio' ? 'Audio EQ' : 'Visualizer'} preset...`}
          className="flex-1 bg-surface-container-low text-on-surface rounded-lg px-3 py-1.5 text-xs border border-transparent focus:border-primary/30 focus:outline-none placeholder:text-on-surface-variant/40"
          onKeyDown={(e) => e.key === 'Enter' && handleImport()}
        />
        <button onClick={handleImport} className="px-3 py-1.5 rounded-lg bg-primary text-on-primary-fixed text-xs font-bold hover:opacity-90 transition-opacity">
          Apply
        </button>
      </div>
      {importError && <p className="text-[10px] text-red-400">{importError}</p>}
    </div>
  );

  return (
    <div className="fixed bottom-28 right-8 z-[60]">
      <div className="bg-surface-container-high/95 backdrop-blur-xl rounded-2xl border border-outline-variant/10 p-4 shadow-2xl shadow-black/40 w-[440px] max-h-[60vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">EQ & Visualizer</h3>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        {/* ── Audio EQ ── */}
        <SectionHeader
          title="Audio EQ"
          importKey="audio"
          activeImport={importTarget}
          onToggleImport={() => toggleImport('audio')}
          onExport={() => copy('audio', store.exportAudioEQ())}
          onReset={store.resetAudioGains}
          copiedKey={copiedKey}
        />
        {importTarget === 'audio' && importRow}
        <BandSliders gains={store.audioGains} onChange={store.setAudioGain} />

        {/* ── Visualizer Sensitivity ── */}
        <div className="mt-3 pt-3 border-t border-outline-variant/10">
          <SectionHeader
            title="Visualizer"
            importKey="viz"
            activeImport={importTarget}
            onToggleImport={() => toggleImport('viz')}
            onExport={() => copy('viz', store.exportVizEQ())}
            onReset={store.resetVizGains}
            copiedKey={copiedKey}
          />
          {importTarget === 'viz' && importRow}
          <BandSliders gains={store.vizGains} onChange={store.setVizGain} />

          {/* Layout controls */}
          <div className="flex items-center gap-4 mt-2 pt-2 border-t border-outline-variant/10">
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant">Mirror</span>
              <button
                onClick={() => store.setMirrored(!store.mirrored)}
                className={`w-9 h-5 rounded-full transition-colors relative ${
                  store.mirrored ? 'bg-primary' : 'bg-surface-container-lowest'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${
                  store.mirrored ? 'translate-x-[18px]' : 'translate-x-[3px]'
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
                  onClick={() => store.setOrientation(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    store.orientation === opt.value ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
