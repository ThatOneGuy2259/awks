# Custom Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to create, save, edit, delete, export, and import custom themes with a live Theme Studio preview — entirely client-side with localStorage.

**Architecture:** New `customThemeStore.ts` owns CRUD, derivation, and persistence. New `ThemeCreator.tsx` provides the Theme Studio UI with live preview. Existing `themeStore.ts` widens its `ThemeId` type and `applyTheme` to support custom themes. Existing `ThemeModal.tsx` adds a custom themes section.

**Tech Stack:** React 19, Zustand 5, Tailwind CSS 4, TypeScript 5.9, Vite 8

**Spec:** `docs/superpowers/specs/2026-03-26-custom-themes-design.md`

---

### Task 1: Color Derivation Utility

**Files:**
- Create: `frontend/src/lib/colorUtils.ts`

This is a pure utility module with hex color manipulation functions and the `deriveTheme` function that generates a full `ThemeDefinition` from 3 user-chosen colors.

- [ ] **Step 1: Create color utility functions**

Create `frontend/src/lib/colorUtils.ts`:

```typescript
import type { ThemeDefinition } from '../stores/themeStore';

/** Parse "#RRGGBB" to [r, g, b] in 0-255 range */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Convert [r, g, b] (0-255) to "#RRGGBB" */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');
}

/** Mix two hex colors. t=0 returns a, t=1 returns b. */
function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  );
}

/** Lighten a hex color by mixing with white. amount 0-1. */
function lighten(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', amount);
}

/** Darken a hex color by mixing with black. amount 0-1. */
function darken(hex: string, amount: number): string {
  return mixHex(hex, '#000000', amount);
}

export interface CustomThemeInput {
  name: string;
  background: string;
  primary: string;
  secondary: string;
  forkedFrom: string;
}

/** Derive a full ThemeDefinition from 3 user-chosen colors. */
export function deriveTheme(id: string, input: CustomThemeInput): ThemeDefinition {
  const { background, primary, secondary } = input;

  const primaryDim = darken(primary, 0.35);
  const secondaryDim = darken(secondary, 0.35);
  const onPrimary = darken(primary, 0.7);
  const outlineVariant = lighten(background, 0.25);

  const vars: Record<string, string> = {
    '--color-background': background,
    '--color-surface': background,
    '--color-surface-dim': darken(background, 0.1),
    '--color-surface-bright': lighten(background, 0.2),
    '--color-surface-container-lowest': darken(background, 0.2),
    '--color-surface-container-low': lighten(background, 0.03),
    '--color-surface-container': lighten(background, 0.06),
    '--color-surface-container-high': lighten(background, 0.09),
    '--color-surface-container-highest': lighten(background, 0.12),
    '--color-surface-variant': lighten(background, 0.12),
    '--color-on-surface': lighten(background, 0.92),
    '--color-on-surface-variant': lighten(background, 0.6),
    '--color-primary': primary,
    '--color-primary-dim': primaryDim,
    '--color-primary-container': primaryDim,
    '--color-primary-fixed': primaryDim,
    '--color-secondary': secondary,
    '--color-secondary-dim': secondaryDim,
    '--color-secondary-container': darken(secondary, 0.55),
    '--color-on-primary': onPrimary,
    '--color-on-primary-fixed': '#000000',
    '--color-outline-variant': outlineVariant,
    '--signature-gradient': `linear-gradient(135deg, ${primary} 0%, ${primaryDim} 100%)`,
    '--scrollbar-track': background,
    '--scrollbar-thumb': outlineVariant,
  };

  return {
    id,
    name: input.name,
    description: 'Custom theme',
    preview: { bg: background, primary, secondary },
    vars,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/colorUtils.ts
git commit -m "feat: add color derivation utility for custom themes"
```

---

### Task 2: Widen ThemeId and applyTheme for Custom Themes

**Files:**
- Modify: `frontend/src/stores/themeStore.ts`

The existing `ThemeId` is a string literal union. We widen it to also accept arbitrary strings (for custom theme IDs). We modify `applyTheme` to accept a `ThemeDefinition` directly so it can apply themes that aren't in the built-in array.

- [ ] **Step 1: Widen ThemeId type**

In `frontend/src/stores/themeStore.ts`, change:

```typescript
export type ThemeId = 'neon_groove' | 'electric_ember' | 'ultraviolet_dreamscape' | 'digital_cobalt' | 'cyber_industrial';
```

to:

```typescript
export type BuiltinThemeId = 'neon_groove' | 'electric_ember' | 'ultraviolet_dreamscape' | 'digital_cobalt' | 'cyber_industrial';
export type ThemeId = BuiltinThemeId | (string & {});
```

The `(string & {})` trick allows any string while preserving autocomplete for the known IDs.

- [ ] **Step 2: Update ThemeDefinition.id type**

In `frontend/src/stores/themeStore.ts`, change:

```typescript
export interface ThemeDefinition {
  id: ThemeId;
```

to:

```typescript
export interface ThemeDefinition {
  id: string;
```

This lets custom themes use arbitrary string IDs without casting.

- [ ] **Step 3: Overload applyTheme to accept a ThemeDefinition directly**

In `frontend/src/stores/themeStore.ts`, replace the entire `applyTheme` function with:

```typescript
/** Apply theme CSS variables to the document root.
 *  Accepts either a ThemeId (looks up from built-in themes) or a ThemeDefinition directly. */
export function applyTheme(themeOrId: ThemeId | ThemeDefinition) {
  const theme: ThemeDefinition | undefined =
    typeof themeOrId === 'string'
      ? themes.find((t) => t.id === themeOrId)
      : themeOrId;
  if (!theme) return;

  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    if (key === '--signature-gradient' || key === '--scrollbar-track' || key === '--scrollbar-thumb') continue;
    root.style.setProperty(key, value);
  }

  let styleEl = document.getElementById('awks-theme-overrides');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'awks-theme-overrides';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    .signature-gradient { background: ${theme.vars['--signature-gradient']} !important; }
    ::-webkit-scrollbar-track { background: ${theme.vars['--scrollbar-track']} !important; }
    ::-webkit-scrollbar-thumb { background: ${theme.vars['--scrollbar-thumb']} !important; }
  `;
}
```

- [ ] **Step 4: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/themeStore.ts
git commit -m "feat: widen ThemeId and applyTheme to support custom themes"
```

---

### Task 3: Custom Theme Store

**Files:**
- Create: `frontend/src/stores/customThemeStore.ts`

Zustand store that manages CRUD, localStorage persistence, export/import for custom themes.

- [ ] **Step 1: Create the custom theme store**

Create `frontend/src/stores/customThemeStore.ts`:

```typescript
import { create } from 'zustand';
import { themes, applyTheme, useThemeStore, type ThemeDefinition } from './themeStore';
import { deriveTheme, type CustomThemeInput } from '../lib/colorUtils';

export type { CustomThemeInput } from '../lib/colorUtils';

export interface StoredCustomTheme {
  id: string;
  input: CustomThemeInput;
  theme: ThemeDefinition;
}

const STORAGE_KEY = 'awks-custom-themes';

function loadFromStorage(): StoredCustomTheme[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredCustomTheme[];
  } catch {
    return [];
  }
}

function saveToStorage(customThemes: StoredCustomTheme[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customThemes));
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function isValidInput(input: unknown): input is CustomThemeInput {
  if (!input || typeof input !== 'object') return false;
  const o = input as Record<string, unknown>;
  return (
    typeof o.name === 'string' &&
    o.name.length > 0 &&
    typeof o.background === 'string' &&
    HEX_RE.test(o.background) &&
    typeof o.primary === 'string' &&
    HEX_RE.test(o.primary) &&
    typeof o.secondary === 'string' &&
    HEX_RE.test(o.secondary) &&
    typeof o.forkedFrom === 'string'
  );
}

interface CustomThemeState {
  customThemes: StoredCustomTheme[];
  saveTheme: (input: CustomThemeInput, existingId?: string) => string;
  deleteTheme: (id: string) => void;
  exportTheme: (id: string) => string;
  importTheme: (encoded: string) => boolean;
}

export const useCustomThemeStore = create<CustomThemeState>((set, get) => ({
  customThemes: loadFromStorage(),

  saveTheme: (input, existingId) => {
    const id = existingId ?? `custom_${Date.now()}`;
    const theme = deriveTheme(id, input);
    const stored: StoredCustomTheme = { id, input, theme };

    set((state) => {
      const filtered = state.customThemes.filter((t) => t.id !== id);
      const next = [...filtered, stored];
      saveToStorage(next);
      return { customThemes: next };
    });

    return id;
  },

  deleteTheme: (id) => {
    const { currentTheme, setTheme } = useThemeStore.getState();
    if (currentTheme === id) {
      setTheme('neon_groove');
      applyTheme('neon_groove');
    }

    set((state) => {
      const next = state.customThemes.filter((t) => t.id !== id);
      saveToStorage(next);
      return { customThemes: next };
    });
  },

  exportTheme: (id) => {
    const found = get().customThemes.find((t) => t.id === id);
    if (!found) return '';
    return btoa(JSON.stringify(found.input));
  },

  importTheme: (encoded) => {
    try {
      const json = atob(encoded.trim());
      const input = JSON.parse(json);
      if (!isValidInput(input)) return false;
      get().saveTheme(input);
      return true;
    } catch {
      return false;
    }
  },
}));

/** Returns all themes: built-in + custom. */
export function getAllThemes(): ThemeDefinition[] {
  const custom = useCustomThemeStore.getState().customThemes.map((c) => c.theme);
  return [...themes, ...custom];
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/customThemeStore.ts
git commit -m "feat: add custom theme store with CRUD, export/import"
```

---

### Task 4: Update Visualizer to Find Custom Themes

**Files:**
- Modify: `frontend/src/hooks/useVisualizer.ts`

The visualizer currently looks up themes from the built-in `themes` array only. It needs to also check custom themes so the visualizer colors update for custom themes.

- [ ] **Step 1: Update theme lookup to include custom themes**

In `frontend/src/hooks/useVisualizer.ts`, change the import:

```typescript
import { useThemeStore, themes } from '../stores/themeStore';
```

to:

```typescript
import { useThemeStore } from '../stores/themeStore';
import { getAllThemes } from '../stores/customThemeStore';
```

Then change the theme lookup inside the effect from:

```typescript
    const theme = themes.find((t) => t.id === currentTheme);
```

to:

```typescript
    const theme = getAllThemes().find((t) => t.id === currentTheme);
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useVisualizer.ts
git commit -m "feat: visualizer resolves custom themes for color gradient"
```

---

### Task 5: Update applyTheme Startup to Resolve Custom Themes

**Files:**
- Modify: `frontend/src/App.tsx`

On app startup, `applyTheme` is called with the stored theme ID. If that ID is a custom theme, the built-in lookup fails silently. We need to resolve the full ThemeDefinition from `getAllThemes` and pass it to `applyTheme`.

- [ ] **Step 1: Read the current App.tsx**

Read `frontend/src/App.tsx` to find the `applyTheme` call and understand the current structure. The key line to find is:

```typescript
applyTheme(useThemeStore.getState().currentTheme);
```

- [ ] **Step 2: Update the startup theme application**

Replace the startup `applyTheme` call. Change:

```typescript
applyTheme(useThemeStore.getState().currentTheme);
```

to:

```typescript
import { getAllThemes } from './stores/customThemeStore';

// ... at the call site:
const startupThemeId = useThemeStore.getState().currentTheme;
const startupTheme = getAllThemes().find((t) => t.id === startupThemeId);
if (startupTheme) {
  applyTheme(startupTheme);
} else {
  applyTheme('neon_groove');
}
```

Add the `getAllThemes` import at the top of the file alongside the existing themeStore imports.

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: resolve custom themes on app startup"
```

---

### Task 6: Theme Creator Component — Preview Visualizer

**Files:**
- Create: `frontend/src/components/settings/PreviewVisualizer.tsx`

A mini canvas visualizer with 16 bars and a canned sine-wave animation. It uses the same primary→secondary hue gradient as the real visualizer but doesn't need audio input. It receives primary and secondary hex colors as props.

- [ ] **Step 1: Create the preview visualizer component**

Create `frontend/src/components/settings/PreviewVisualizer.tsx`:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';

interface PreviewVisualizerProps {
  primary: string;
  secondary: string;
  background: string;
}

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function PreviewVisualizer({ primary, secondary, background }: PreviewVisualizerProps) {
  const animRef = useRef<number>(0);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => { setCanvas(node); }, []);

  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const barCount = 16;
    const primaryHSL = hexToHSL(primary);
    const secondaryHSL = hexToHSL(secondary);
    let hueDelta = secondaryHSL.h - primaryHSL.h;
    if (hueDelta > 180) hueDelta -= 360;
    if (hueDelta < -180) hueDelta += 360;

    const colorsTop: string[] = [];
    const colorsMid: string[] = [];
    const colorsDim: string[] = [];
    const colorsFade: string[] = [];
    for (let i = 0; i < barCount; i++) {
      const hue = primaryHSL.h + (i / barCount) * hueDelta;
      colorsTop.push(`hsl(${hue}, 90%, 75%)`);
      colorsMid.push(`hsl(${hue}, 85%, 55%)`);
      colorsDim.push(`hsla(${hue}, 85%, 55%, 0.4)`);
      colorsFade.push(`hsla(${hue}, 85%, 55%, 0)`);
    }

    // Pre-compute per-bar frequency and phase offsets for the canned animation
    const freqs = Array.from({ length: barCount }, (_, i) => 0.8 + Math.sin(i * 0.7) * 0.4);
    const phases = Array.from({ length: barCount }, (_, i) => i * 0.4);

    const draw = (time: number) => {
      animRef.current = requestAnimationFrame(draw);
      const t = time / 1000;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const gap = 2;
      const barWidth = (w - gap * (barCount - 1)) / barCount;
      const baseline = h * 0.7;
      const maxBarHeight = baseline - 4;
      const maxReflection = h - baseline;

      for (let i = 0; i < barCount; i++) {
        // Sine-wave simulation with multiple harmonics
        const v1 = Math.sin(t * freqs[i] * 2 + phases[i]) * 0.5 + 0.5;
        const v2 = Math.sin(t * freqs[i] * 3.3 + phases[i] * 1.7) * 0.3 + 0.3;
        const value = Math.min(v1 * 0.6 + v2 * 0.4, 1.0);
        const barHeight = Math.max(value * maxBarHeight, 2);

        const x = i * (barWidth + gap);

        // Main bar
        const grad = ctx.createLinearGradient(0, baseline - barHeight, 0, baseline);
        grad.addColorStop(0, colorsTop[i]);
        grad.addColorStop(1, colorsMid[i]);
        ctx.fillStyle = grad;
        ctx.fillRect(x, baseline - barHeight, barWidth, barHeight);

        // Reflection
        const reflHeight = Math.min(barHeight * 0.5, maxReflection);
        const reflGrad = ctx.createLinearGradient(0, baseline, 0, baseline + reflHeight);
        reflGrad.addColorStop(0, colorsDim[i]);
        reflGrad.addColorStop(1, colorsFade[i]);
        ctx.fillStyle = reflGrad;
        ctx.fillRect(x, baseline, barWidth, reflHeight);
      }
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [canvas, primary, secondary]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={120}
      className="w-full h-[120px] rounded-lg"
      style={{ backgroundColor: background }}
    />
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/settings/PreviewVisualizer.tsx
git commit -m "feat: add preview visualizer for theme studio"
```

---

### Task 7: Theme Creator Component — Full Studio UI

**Files:**
- Create: `frontend/src/components/settings/ThemeCreator.tsx`

The Theme Studio with color controls on left/top, live preview on right/bottom. Includes the preview visualizer, sample text, sample button, sample card, and surface stack.

- [ ] **Step 1: Create the ThemeCreator component**

Create `frontend/src/components/settings/ThemeCreator.tsx`:

```typescript
import { useState, useRef, useMemo } from 'react';
import { themes } from '../../stores/themeStore';
import { useCustomThemeStore, type CustomThemeInput } from '../../stores/customThemeStore';
import { deriveTheme } from '../../lib/colorUtils';
import { PreviewVisualizer } from './PreviewVisualizer';

interface ThemeCreatorProps {
  onClose: () => void;
  /** When editing an existing custom theme, pass its ID and saved input. */
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

  // Determine initial colors: from edit input, or from a built-in theme to fork
  const defaultFork = themes[0];
  const [name, setName] = useState(editInput?.name ?? '');
  const [background, setBackground] = useState(editInput?.background ?? defaultFork.preview.bg);
  const [primary, setPrimary] = useState(editInput?.primary ?? defaultFork.preview.primary);
  const [secondary, setSecondary] = useState(editInput?.secondary ?? defaultFork.preview.secondary);
  const [forkedFrom, setForkedFrom] = useState(editInput?.forkedFrom ?? defaultFork.id);

  // Derive the full theme live for preview
  const derived = useMemo(
    () => deriveTheme('preview', { name: name || 'Preview', background, primary, secondary, forkedFrom }),
    [name, background, primary, secondary, forkedFrom],
  );

  const handleForkChange = (themeId: string) => {
    const t = themes.find((th) => th.id === themeId);
    if (!t) return;
    setForkedFrom(themeId);
    setBackground(t.preview.bg);
    setPrimary(t.preview.primary);
    setSecondary(t.preview.secondary);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const input: CustomThemeInput = { name: name.trim(), background, primary, secondary, forkedFrom };
    saveTheme(input, editId);
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
            {/* Name */}
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

            {/* Fork selector */}
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

            {/* Color pickers */}
            <div>
              <label className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-3 block">
                Colors
              </label>
              <div className="space-y-3">
                <ColorRow label="Background" value={background} onChange={setBackground} />
                <ColorRow label="Primary" value={primary} onChange={setPrimary} />
                <ColorRow label="Secondary" value={secondary} onChange={setSecondary} />
              </div>
            </div>

            {/* Actions */}
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
              {/* Mini visualizer */}
              <PreviewVisualizer primary={primary} secondary={secondary} background={background} />

              {/* Sample text */}
              <div>
                <p className="text-lg font-bold font-headline" style={{ color: derived.vars['--color-on-surface'] }}>
                  Your Theme
                </p>
                <p className="text-sm" style={{ color: derived.vars['--color-on-surface-variant'] }}>
                  Preview how your theme looks
                </p>
              </div>

              {/* Sample button */}
              <button
                className="px-5 py-2 rounded-full text-sm font-bold"
                style={{
                  background: derived.vars['--signature-gradient'],
                  color: derived.vars['--color-on-primary-fixed'],
                }}
              >
                Sample Button
              </button>

              {/* Sample card */}
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

              {/* Surface stack */}
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
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/settings/ThemeCreator.tsx
git commit -m "feat: add Theme Studio creator component with live preview"
```

---

### Task 8: Update ThemeModal — Custom Themes Section

**Files:**
- Modify: `frontend/src/components/settings/ThemeModal.tsx`

Add the custom themes section below the built-in themes: custom theme cards with edit/delete/export, a Create Theme button, and an Import button with inline text input.

- [ ] **Step 1: Rewrite ThemeModal with custom themes section**

Replace the entire contents of `frontend/src/components/settings/ThemeModal.tsx` with:

```typescript
import { useState } from 'react';
import { themes, useThemeStore, applyTheme, type ThemeDefinition } from '../../stores/themeStore';
import { useCustomThemeStore, getAllThemes } from '../../stores/customThemeStore';
import { ThemeCreator } from './ThemeCreator';
import type { CustomThemeInput } from '../../lib/colorUtils';

interface ThemeModalProps {
  onClose: () => void;
}

export function ThemeModal({ onClose }: ThemeModalProps) {
  const { currentTheme, setTheme } = useThemeStore();
  const { customThemes, deleteTheme, exportTheme, importTheme } = useCustomThemeStore();

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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface-container-high rounded-2xl p-6 w-full max-w-md mx-4 border border-outline-variant/10 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold font-headline">Settings</h2>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Built-in themes */}
        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4">Theme</h3>
        <div className="space-y-2">
          {themes.map(renderThemeButton)}
        </div>

        {/* Custom themes */}
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

          {/* Import input */}
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

          {/* Custom theme list */}
          {customThemes.length === 0 && !showImport && (
            <p className="text-sm text-on-surface-variant/50 text-center py-4">
              No custom themes yet
            </p>
          )}

          <div className="space-y-2">
            {customThemes.map((ct) => (
              <div key={ct.id} className="group">
                {renderThemeButton(ct.theme)}
                {/* Action buttons */}
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
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify in browser**

Run: `cd frontend && npm run dev`

Verify:
1. Settings modal opens and shows built-in themes as before
2. "Custom Themes" section appears below with "Create Theme" and "Import" buttons
3. Clicking "Create Theme" opens the Theme Studio
4. Fork dropdown changes the 3 color fields
5. Color swatches open native OS color picker
6. Preview updates live (visualizer bars animate, sample text/button/card update)
7. Saving creates a theme that appears in the custom themes list
8. Selecting a custom theme applies it to the whole app including visualizer
9. Edit re-opens the studio with saved colors
10. Export copies a base64 string; Import accepts it and recreates the theme
11. Delete asks for confirmation, second click removes it
12. Deleting the active custom theme reverts to Neon Groove

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/settings/ThemeModal.tsx
git commit -m "feat: add custom themes section to settings with create/edit/delete/import/export"
```

---

### Task 9: Final Integration Verification

**Files:** None new — verification only.

- [ ] **Step 1: Type check the full project**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Build check**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors

- [ ] **Step 3: Final commit if any fixups were needed**

If any type errors or issues were found and fixed in previous steps:

```bash
git add -A
git commit -m "fix: address type/build issues in custom themes"
```
