import { useEffect, useState, type ReactNode } from 'react';
import { useVisualizerStore, type BackgroundEffect, type VisualizerMode, type VisualizerOrientation } from '../../stores/visualizerStore';
import { EqControls } from './EqControls';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { audioMetrics } from '../../lib/audioMetrics';

interface VisualizerStudioProps {
  onClose: () => void;
}

const BG_EFFECTS: { value: BackgroundEffect; label: string; icon: string }[] = [
  { value: 'none', label: 'None', icon: 'block' },
  { value: 'color-pulse', label: 'Pulse', icon: 'favorite' },
  { value: 'gradient-wave', label: 'Wave', icon: 'waves' },
  { value: 'ambient-blobs', label: 'Blobs', icon: 'blur_on' },
  { value: 'particles', label: 'Particles', icon: 'auto_awesome' },
];

const MODES: { value: VisualizerMode; label: string; icon: string }[] = [
  { value: 'bars', label: 'Bars', icon: 'equalizer' },
  { value: 'oscilloscope', label: 'Scope', icon: 'monitoring' },
  { value: 'radial', label: 'Radial', icon: 'radar' },
];

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-outline-variant/10 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {title}
        <span className={`material-symbols-outlined text-base transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

// Live tempo readout. audioMetrics is a mutable singleton (not reactive), so we
// poll it a few times a second rather than re-rendering the whole studio.
function BpmBadge() {
  const [bpm, setBpm] = useState(0);
  const [confident, setConfident] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setBpm(audioMetrics.bpm);
      setConfident(audioMetrics.bpmConfidence > 0.25);
    }, 250);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant" title="Estimated tempo">
      <span className="material-symbols-outlined text-xs leading-none">music_note</span>
      {confident && bpm > 0 ? `${bpm} BPM` : '— BPM'}
    </span>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-surface-container-lowest'}`}
      role="switch"
      aria-checked={on}
    >
      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

export function VisualizerStudio({ onClose }: VisualizerStudioProps) {
  const s = useVisualizerStore();
  const [presetName, setPresetName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEscapeClose(onClose);

  const doImport = () => {
    setImportError('');
    if (!importValue.trim()) return;
    if (s.importPreset(importValue)) {
      setImportValue('');
      setImporting(false);
    } else {
      setImportError('Invalid preset string');
    }
  };

  const doExport = (id: string) => {
    const str = s.exportPreset(id);
    if (!str) return;
    navigator.clipboard.writeText(str);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <aside className="hidden lg:flex flex-col fixed right-0 top-20 bottom-28 z-[60] w-[360px] bg-surface-container-high/95 backdrop-blur-xl border-l border-t border-b border-outline-variant/10 rounded-l-2xl shadow-2xl shadow-black/40">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold font-headline text-on-surface">Visualizer Studio</h3>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            Live
          </span>
          <BpmBadge />
        </div>
        <button onClick={onClose} className="p-1 text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Close studio">
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Mode */}
        <div className="flex gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => s.setVisualizerMode(m.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-all ${
                s.visualizerMode === m.value
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'bg-surface-container-lowest text-on-surface-variant border border-transparent hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>

        {/* Scene */}
        <Section title="Scene">
          <div className="grid grid-cols-3 gap-1.5">
            {BG_EFFECTS.map((fx) => (
              <button
                key={fx.value}
                onClick={() => s.setBackgroundEffect(fx.value)}
                className={`flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-xl text-[11px] font-medium transition-all ${
                  s.backgroundEffect === fx.value
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'bg-surface-container-lowest text-on-surface-variant border border-transparent hover:bg-white/5'
                }`}
              >
                <span className="material-symbols-outlined text-xl">{fx.icon}</span>
                {fx.label}
              </button>
            ))}
          </div>
          {s.backgroundEffect !== 'none' && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-on-surface-variant">Intensity</span>
                <span className="text-[10px] text-on-surface-variant font-mono">{Math.round(s.backgroundIntensity * 100)}%</span>
              </div>
              <input
                type="range" min="0.05" max="2.0" step="0.05"
                value={s.backgroundIntensity}
                onChange={(e) => s.setBackgroundIntensity(parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 rounded-full appearance-none bg-surface-container-lowest cursor-pointer"
              />
            </div>
          )}
        </Section>

        {/* Reactivity */}
        <Section title="Reactivity">
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-on-surface-variant">Beat pulse</span>
                <span className="text-[10px] text-on-surface-variant font-mono">{Math.round(s.beatReactivity * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.05"
                value={s.beatReactivity}
                onChange={(e) => s.setBeatReactivity(parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 rounded-full appearance-none bg-surface-container-lowest cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Trails</span>
              <Toggle on={s.trails} onChange={s.setTrails} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Hue drift</span>
              <Toggle on={s.hueDrift} onChange={s.setHueDrift} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs text-on-surface-variant">Constellations</span>
                <p className={`text-[10px] leading-tight ${s.backgroundEffect === 'particles' ? 'text-on-surface-variant/50' : 'text-amber-400/70'}`}>
                  {s.backgroundEffect === 'particles' ? 'Links nearby particles' : 'Needs the Particles scene'}
                </p>
              </div>
              <Toggle on={s.constellations} onChange={s.setConstellations} />
            </div>
          </div>
        </Section>

        {/* Sensitivity (visual EQ) */}
        <Section title="Sensitivity">
          <EqControls
            title="Per-band"
            gains={s.vizGains}
            onChange={s.setVizGain}
            onReset={s.resetVizGains}
            onExport={s.exportVizEQ}
            onImport={s.importVizEQ}
          />
        </Section>

        {/* Layout */}
        <Section title="Layout">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Mirror</span>
              <Toggle on={s.mirrored} onChange={s.setMirrored} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Mini-viz in player bar</span>
              <Toggle on={s.miniViz} onChange={s.setMiniViz} />
            </div>
            <div className="flex items-center gap-1.5">
              {([
                { value: 'normal' as VisualizerOrientation, label: 'Bass Center' },
                { value: 'flipped' as VisualizerOrientation, label: 'Bass Outer' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => s.setOrientation(opt.value)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    s.orientation === opt.value ? 'bg-primary/10 text-primary' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Presets */}
        <Section title="Presets">
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Name this look..."
                className="flex-1 bg-surface-container-lowest text-on-surface rounded-lg px-3 py-1.5 text-xs border border-transparent focus:border-primary/30 focus:outline-none placeholder:text-on-surface-variant/40"
                onKeyDown={(e) => { if (e.key === 'Enter' && presetName.trim()) { s.savePreset(presetName); setPresetName(''); } }}
              />
              <button
                onClick={() => { if (presetName.trim()) { s.savePreset(presetName); setPresetName(''); } }}
                className="px-3 py-1.5 rounded-lg bg-primary text-on-primary-fixed text-xs font-bold hover:opacity-90 transition-opacity"
              >
                Save
              </button>
            </div>

            {s.presets.length > 0 && (
              <div className="space-y-1">
                {s.presets.map((p) => (
                  <div key={p.id} className="flex items-center gap-1 rounded-lg bg-surface-container-lowest/60 pl-3 pr-1 py-1 group">
                    <button onClick={() => s.applyPreset(p.id)} className="flex-1 min-w-0 text-left text-xs font-medium text-on-surface truncate hover:text-primary transition-colors" title={`Apply ${p.name}`}>
                      {p.name}
                    </button>
                    <button onClick={() => doExport(p.id)} className="text-[10px] px-1.5 py-0.5 rounded text-on-surface-variant/60 hover:text-primary transition-colors" title="Copy share string">
                      {copiedId === p.id ? '✓' : 'Share'}
                    </button>
                    <button
                      onClick={() => { if (confirmDelete === p.id) { s.deletePreset(p.id); setConfirmDelete(null); } else { setConfirmDelete(p.id); setTimeout(() => setConfirmDelete((c) => (c === p.id ? null : c)), 3000); } }}
                      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${confirmDelete === p.id ? 'text-red-400 font-bold' : 'text-on-surface-variant/60 hover:text-red-400'}`}
                    >
                      {confirmDelete === p.id ? 'Sure?' : '✕'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => { setImporting((v) => !v); setImportValue(''); setImportError(''); }} className="text-[11px] text-on-surface-variant/70 hover:text-primary transition-colors">
              {importing ? 'Cancel import' : 'Import a shared preset'}
            </button>
            {importing && (
              <div className="space-y-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={importValue}
                    onChange={(e) => { setImportValue(e.target.value); setImportError(''); }}
                    placeholder="Paste preset string..."
                    className="flex-1 bg-surface-container-lowest text-on-surface rounded-lg px-3 py-1.5 text-xs border border-transparent focus:border-primary/30 focus:outline-none placeholder:text-on-surface-variant/40"
                    onKeyDown={(e) => e.key === 'Enter' && doImport()}
                  />
                  <button onClick={doImport} className="px-3 py-1.5 rounded-lg bg-primary text-on-primary-fixed text-xs font-bold hover:opacity-90 transition-opacity">Add</button>
                </div>
                {importError && <p className="text-[10px] text-red-400">{importError}</p>}
              </div>
            )}
          </div>
        </Section>
      </div>
    </aside>
  );
}
