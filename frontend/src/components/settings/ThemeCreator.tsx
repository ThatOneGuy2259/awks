import { useState, useRef, useMemo } from 'react';
import { useThemeStore, applyTheme, themes } from '../../stores/themeStore';
import { useCustomThemeStore, getAllThemes, type CustomThemeInput } from '../../stores/customThemeStore';
import { deriveTheme } from '../../lib/colorUtils';
import { PreviewVisualizer } from './PreviewVisualizer';

interface ThemeCreatorProps {
  onClose: () => void;
  editId?: string;
  editInput?: CustomThemeInput;
}

interface ColorRowProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

function ColorRow({ label, value, onChange }: ColorRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-on-surface-variant w-24 font-label">{label}</span>
      <button
        type="button"
        className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer flex-shrink-0 transition-transform hover:scale-110"
        style={{ backgroundColor: value }}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
      <span className="text-xs text-on-surface-variant font-mono">{value.toUpperCase()}</span>
    </div>
  );
}

export function ThemeCreator({ onClose, editId, editInput }: ThemeCreatorProps) {
  const saveTheme = useCustomThemeStore((s) => s.saveTheme);

  const defaultFork = themes[0];
  const [name, setName] = useState(editInput?.name ?? '');
  const [background, setBackground] = useState(editInput?.background ?? defaultFork.preview.bg);
  const [surface, setSurface] = useState(editInput?.surface ?? '');
  const [primary, setPrimary] = useState(editInput?.primary ?? defaultFork.preview.primary);
  const [secondary, setSecondary] = useState(editInput?.secondary ?? defaultFork.preview.secondary);
  const [tertiary, setTertiary] = useState(editInput?.tertiary ?? '');
  const [forkedFrom, setForkedFrom] = useState(editInput?.forkedFrom ?? defaultFork.id);

  const derived = useMemo(
    () => deriveTheme('preview', {
      name: name || 'Preview', background, primary, secondary, forkedFrom,
      surface: surface || undefined,
      tertiary: tertiary || undefined,
    }),
    [name, background, surface, primary, secondary, tertiary, forkedFrom],
  );

  const handleForkChange = (themeId: string) => {
    const t = themes.find((th) => th.id === themeId);
    if (!t) return;
    setForkedFrom(themeId);
    setBackground(t.preview.bg);
    setSurface('');
    setPrimary(t.preview.primary);
    setSecondary(t.preview.secondary);
    setTertiary('');
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const input: CustomThemeInput = {
      name: name.trim(), background, primary, secondary, forkedFrom,
      surface: surface || undefined,
      tertiary: tertiary || undefined,
    };
    const id = saveTheme(input, editId);
    const saved = getAllThemes().find((t) => t.id === id);
    if (saved) {
      useThemeStore.getState().setTheme(id);
      applyTheme(saved);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-surface-container-high rounded-2xl p-6 w-full max-w-2xl mx-4 border border-outline-variant/10 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold font-headline">
            {editId ? 'Edit Theme' : 'Theme Studio'}
          </h2>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Controls */}
          <div className="flex-1 space-y-5">
            <div>
              <label className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-2 block">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Theme"
                className="w-full bg-surface-container-low text-on-surface rounded-xl px-4 py-2.5 text-sm border border-transparent focus:border-primary/30 focus:outline-none placeholder:text-on-surface-variant/40"
              />
            </div>

            {!editId && (
              <div>
                <label className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-2 block">
                  Starting From
                </label>
                <select
                  value={forkedFrom}
                  onChange={(e) => handleForkChange(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface rounded-xl px-4 py-2.5 text-sm border border-transparent focus:border-primary/30 focus:outline-none appearance-none cursor-pointer"
                >
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-3 block">
                Colors
              </label>
              <div className="space-y-3">
                <ColorRow label="Background" value={background} onChange={setBackground} />
                <ColorRow label="Surface" value={surface || background} onChange={setSurface} />
                <ColorRow label="Primary" value={primary} onChange={setPrimary} />
                <ColorRow label="Secondary" value={secondary} onChange={setSecondary} />
                <ColorRow label="Tertiary" value={tertiary || derived.vars['--color-tertiary']} onChange={setTertiary} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={!name.trim()}
                className="flex-1 py-2.5 rounded-full font-bold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-primary text-on-primary-fixed hover:opacity-90"
              >
                {editId ? 'Save Changes' : 'Create Theme'}
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-full font-bold text-sm text-on-surface-variant border border-outline-variant/20 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Live Preview */}
          <div className="flex-1 space-y-4">
            <label className="text-sm font-bold text-on-surface-variant uppercase tracking-widest block">
              Preview
            </label>

            <div
              className="rounded-xl p-4 space-y-4 border border-white/5"
              style={{ backgroundColor: derived.vars['--color-background'] }}
            >
              <PreviewVisualizer primary={primary} secondary={secondary} background={background} />

              <div>
                <p className="text-lg font-bold font-headline" style={{ color: derived.vars['--color-on-surface'] }}>
                  Your Theme
                </p>
                <p className="text-sm" style={{ color: derived.vars['--color-on-surface-variant'] }}>
                  Preview how your theme looks
                </p>
              </div>

              <button
                className="px-5 py-2 rounded-full text-sm font-bold"
                style={{
                  background: derived.vars['--signature-gradient'],
                  color: derived.vars['--color-on-primary-fixed'],
                }}
              >
                Sample Button
              </button>

              {/* Tertiary accent sample */}
              <div className="flex gap-2">
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: derived.vars['--color-tertiary'] + '1a',
                    color: derived.vars['--color-tertiary'],
                  }}
                >
                  Tertiary Tag
                </span>
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: derived.vars['--color-secondary'] + '1a',
                    color: derived.vars['--color-secondary'],
                  }}
                >
                  Secondary Tag
                </span>
              </div>

              <div
                className="rounded-lg p-3 border"
                style={{
                  backgroundColor: derived.vars['--color-surface-container-high'],
                  borderColor: derived.vars['--color-outline-variant'] + '26',
                }}
              >
                <p className="text-sm" style={{ color: derived.vars['--color-on-surface'] }}>
                  Sample card content
                </p>
                <p className="text-xs mt-1" style={{ color: derived.vars['--color-on-surface-variant'] }}>
                  Metadata or description text
                </p>
              </div>

              <div className="flex gap-2 h-10">
                <div className="flex-1 rounded-md" style={{ backgroundColor: derived.vars['--color-surface-container-low'] }} />
                <div className="flex-1 rounded-md" style={{ backgroundColor: derived.vars['--color-surface-container'] }} />
                <div className="flex-1 rounded-md" style={{ backgroundColor: derived.vars['--color-surface-container-high'] }} />
                <div className="flex-1 rounded-md" style={{ backgroundColor: derived.vars['--color-surface-container-highest'] }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
