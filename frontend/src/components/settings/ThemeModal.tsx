import { useState } from 'react';
import { themes, useThemeStore, applyTheme, type ThemeDefinition } from '../../stores/themeStore';
import { useCustomThemeStore } from '../../stores/customThemeStore';
import { useVisualizerStore, type BackgroundEffect } from '../../stores/visualizerStore';
import { ThemeCreator } from './ThemeCreator';
import type { CustomThemeInput } from '../../lib/colorUtils';

interface ThemeModalProps {
  onClose: () => void;
}

const BG_EFFECTS: { value: BackgroundEffect; label: string; icon: string }[] = [
  { value: 'none', label: 'None', icon: 'block' },
  { value: 'color-pulse', label: 'Color Pulse', icon: 'favorite' },
  { value: 'gradient-wave', label: 'Gradient Wave', icon: 'waves' },
  { value: 'ambient-blobs', label: 'Ambient Blobs', icon: 'blur_on' },
  { value: 'particles', label: 'Particles', icon: 'auto_awesome' },
];

export function ThemeModal({ onClose }: ThemeModalProps) {
  const { currentTheme, setTheme } = useThemeStore();
  const { customThemes, deleteTheme, exportTheme, importTheme } = useCustomThemeStore();
  const { backgroundEffect, backgroundIntensity, setBackgroundEffect, setBackgroundIntensity } = useVisualizerStore();

  const [showCreator, setShowCreator] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; input: CustomThemeInput } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleSelect = (theme: ThemeDefinition) => {
    setTheme(theme.id);
    applyTheme(theme);
  };

  const handleExport = (id: string) => {
    const encoded = exportTheme(id);
    if (encoded) {
      navigator.clipboard.writeText(encoded);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleImport = () => {
    setImportError('');
    if (!importValue.trim()) return;
    const ok = importTheme(importValue);
    if (ok) {
      setImportValue('');
      setShowImport(false);
    } else {
      setImportError('Invalid theme string');
    }
  };

  const handleDelete = (id: string) => {
    if (deleteConfirmId === id) {
      deleteTheme(id);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const handleEdit = (id: string, input: CustomThemeInput) => {
    setEditTarget({ id, input });
    setShowCreator(true);
  };

  if (showCreator) {
    return (
      <ThemeCreator
        onClose={() => {
          setShowCreator(false);
          setEditTarget(null);
        }}
        editId={editTarget?.id}
        editInput={editTarget?.input}
      />
    );
  }

  const renderThemeButton = (theme: ThemeDefinition) => (
    <button
      key={theme.id}
      onClick={() => handleSelect(theme)}
      className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${
        currentTheme === theme.id
          ? 'bg-primary/10 border border-primary/30'
          : 'hover:bg-white/5 border border-transparent'
      }`}
    >
      <div
        className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center gap-1"
        style={{ backgroundColor: theme.preview.bg }}
      >
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.preview.primary }} />
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.preview.secondary }} />
      </div>
      <div className="text-left flex-1">
        <p className="text-sm font-bold text-on-surface">{theme.name}</p>
        <p className="text-xs text-on-surface-variant">{theme.description}</p>
      </div>
      {currentTheme === theme.id && (
        <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
          check_circle
        </span>
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative bg-surface-container-high rounded-2xl p-6 w-full max-w-lg mx-4 border border-outline-variant/10 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold font-headline">Settings</h2>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4">Theme</h3>
        <div className="space-y-2">
          {themes.map(renderThemeButton)}
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">Custom Themes</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowImport(!showImport)}
                className="text-xs px-3 py-1.5 rounded-full border border-outline-variant/20 text-on-surface-variant hover:bg-white/5 transition-all font-bold"
              >
                Import
              </button>
              <button
                onClick={() => { setEditTarget(null); setShowCreator(true); }}
                className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all font-bold"
              >
                Create Theme
              </button>
            </div>
          </div>

          {showImport && (
            <div className="mb-4 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={importValue}
                  onChange={(e) => { setImportValue(e.target.value); setImportError(''); }}
                  placeholder="Paste theme string..."
                  className="flex-1 bg-surface-container-low text-on-surface rounded-lg px-3 py-2 text-sm border border-transparent focus:border-primary/30 focus:outline-none placeholder:text-on-surface-variant/40"
                />
                <button
                  onClick={handleImport}
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary-fixed text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  Add
                </button>
              </div>
              {importError && (
                <p className="text-xs text-red-400">{importError}</p>
              )}
            </div>
          )}

          {customThemes.length === 0 && !showImport && (
            <p className="text-sm text-on-surface-variant/50 text-center py-4">
              No custom themes yet
            </p>
          )}

          <div className="space-y-2">
            {customThemes.map((ct) => (
              <div key={ct.id} className="group">
                {renderThemeButton(ct.theme)}
                <div className="flex gap-1 px-3 pb-2 -mt-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(ct.id, ct.input); }}
                    className="text-xs text-on-surface-variant/50 hover:text-primary transition-colors px-2 py-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleExport(ct.id); }}
                    className="text-xs text-on-surface-variant/50 hover:text-primary transition-colors px-2 py-1"
                  >
                    {copiedId === ct.id ? 'Copied!' : 'Export'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(ct.id); }}
                    className={`text-xs transition-colors px-2 py-1 ${
                      deleteConfirmId === ct.id
                        ? 'text-red-400 font-bold'
                        : 'text-on-surface-variant/50 hover:text-red-400'
                    }`}
                  >
                    {deleteConfirmId === ct.id ? 'Confirm?' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Background Effects */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4">Background Effect</h3>
          <div className="grid grid-cols-2 gap-2">
            {BG_EFFECTS.map((fx) => (
              <button
                key={fx.value}
                onClick={() => setBackgroundEffect(fx.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  backgroundEffect === fx.value
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'bg-surface-container-lowest text-on-surface-variant border border-transparent hover:bg-white/5'
                }`}
              >
                <span className="material-symbols-outlined text-base">{fx.icon}</span>
                {fx.label}
              </button>
            ))}
          </div>
          {backgroundEffect !== 'none' && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-on-surface-variant">Intensity</span>
                <span className="text-xs text-on-surface-variant font-mono">{Math.round(backgroundIntensity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="2.0"
                step="0.05"
                value={backgroundIntensity}
                onChange={(e) => setBackgroundIntensity(parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 rounded-full appearance-none bg-surface-container-lowest cursor-pointer"
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
