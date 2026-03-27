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

export function getAllThemes(): ThemeDefinition[] {
  const custom = useCustomThemeStore.getState().customThemes.map((c) => c.theme);
  return [...themes, ...custom];
}
