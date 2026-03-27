import { create } from 'zustand';

export type BuiltinThemeId = 'neon_groove' | 'electric_ember' | 'ultraviolet_dreamscape' | 'digital_cobalt' | 'cyber_industrial';
export type ThemeId = BuiltinThemeId | (string & {});

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  preview: { bg: string; primary: string; secondary: string };
  vars: Record<string, string>;
}

export const themes: ThemeDefinition[] = [
  {
    id: 'neon_groove',
    name: 'Neon Groove',
    description: 'Electric purple & cyan',
    preview: { bg: '#0e0e13', primary: '#cf96ff', secondary: '#00f4fe' },
    vars: {
      '--color-background': '#0e0e13',
      '--color-surface': '#0e0e13',
      '--color-surface-dim': '#0e0e13',
      '--color-surface-bright': '#2c2b33',
      '--color-surface-container-lowest': '#000000',
      '--color-surface-container-low': '#131319',
      '--color-surface-container': '#19191f',
      '--color-surface-container-high': '#1f1f26',
      '--color-surface-container-highest': '#25252d',
      '--color-surface-variant': '#25252d',
      '--color-on-surface': '#f9f5fd',
      '--color-on-surface-variant': '#acaab1',
      '--color-primary': '#cf96ff',
      '--color-primary-dim': '#a533ff',
      '--color-primary-container': '#c683ff',
      '--color-primary-fixed': '#c683ff',
      '--color-secondary': '#00f4fe',
      '--color-secondary-dim': '#00e5ee',
      '--color-secondary-container': '#00696e',
      '--color-on-primary': '#480079',
      '--color-on-primary-fixed': '#000000',
      '--color-outline-variant': '#48474d',
      '--signature-gradient': 'linear-gradient(135deg, #cf96ff 0%, #c683ff 100%)',
      '--scrollbar-track': '#0e0e13',
      '--scrollbar-thumb': '#48474d',
    },
  },
  {
    id: 'electric_ember',
    name: 'Electric Ember',
    description: 'Cyberpunk orange & violet',
    preview: { bg: '#141318', primary: '#FFB599', secondary: '#DFB7FF' },
    vars: {
      '--color-background': '#141318',
      '--color-surface': '#141318',
      '--color-surface-dim': '#141318',
      '--color-surface-bright': '#3a3840',
      '--color-surface-container-lowest': '#0a0a0e',
      '--color-surface-container-low': '#1C1B20',
      '--color-surface-container': '#201F24',
      '--color-surface-container-high': '#2B292F',
      '--color-surface-container-highest': '#36343a',
      '--color-surface-variant': '#36343a',
      '--color-on-surface': '#E5E1E8',
      '--color-on-surface-variant': '#E4BFB1',
      '--color-primary': '#FFB599',
      '--color-primary-dim': '#FF5F00',
      '--color-primary-container': '#FF5F00',
      '--color-primary-fixed': '#FF5F00',
      '--color-secondary': '#DFB7FF',
      '--color-secondary-dim': '#9D05FF',
      '--color-secondary-container': '#9D05FF',
      '--color-on-primary': '#3a1500',
      '--color-on-primary-fixed': '#000000',
      '--color-outline-variant': '#5B4137',
      '--signature-gradient': 'linear-gradient(135deg, #FF5F00 0%, #FFB599 100%)',
      '--scrollbar-track': '#141318',
      '--scrollbar-thumb': '#5B4137',
    },
  },
  {
    id: 'ultraviolet_dreamscape',
    name: 'Ultraviolet Dream',
    description: 'Deep violet & magenta glow',
    preview: { bg: '#171023', primary: '#fface8', secondary: '#d1bcff' },
    vars: {
      '--color-background': '#171023',
      '--color-surface': '#171023',
      '--color-surface-dim': '#120b1d',
      '--color-surface-bright': '#3e354b',
      '--color-surface-container-lowest': '#120b1d',
      '--color-surface-container-low': '#1f182c',
      '--color-surface-container': '#261e34',
      '--color-surface-container-high': '#2e263b',
      '--color-surface-container-highest': '#393143',
      '--color-surface-variant': '#393143',
      '--color-on-surface': '#eaddf9',
      '--color-on-surface-variant': '#cbc4cc',
      '--color-primary': '#fface8',
      '--color-primary-dim': '#df00c8',
      '--color-primary-container': '#df00c8',
      '--color-primary-fixed': '#df00c8',
      '--color-secondary': '#d1bcff',
      '--color-secondary-dim': '#9a7be0',
      '--color-secondary-container': '#5a3d8a',
      '--color-on-primary': '#4a0040',
      '--color-on-primary-fixed': '#000000',
      '--color-outline-variant': '#4a4352',
      '--signature-gradient': 'linear-gradient(135deg, #fface8 0%, #df00c8 100%)',
      '--scrollbar-track': '#171023',
      '--scrollbar-thumb': '#4a4352',
    },
  },
  {
    id: 'digital_cobalt',
    name: 'Digital Cobalt',
    description: 'Navy blue & acid green',
    preview: { bg: '#13131b', primary: '#b8c3ff', secondary: '#a8ff60' },
    vars: {
      '--color-background': '#13131b',
      '--color-surface': '#13131b',
      '--color-surface-dim': '#0d0d16',
      '--color-surface-bright': '#32323c',
      '--color-surface-container-lowest': '#0d0d16',
      '--color-surface-container-low': '#1b1b23',
      '--color-surface-container': '#1f1f28',
      '--color-surface-container-high': '#2a2a33',
      '--color-surface-container-highest': '#34343d',
      '--color-surface-variant': '#34343d',
      '--color-on-surface': '#e4e1ed',
      '--color-on-surface-variant': '#c4c1cd',
      '--color-primary': '#b8c3ff',
      '--color-primary-dim': '#2e5bff',
      '--color-primary-container': '#2e5bff',
      '--color-primary-fixed': '#2e5bff',
      '--color-secondary': '#a8ff60',
      '--color-secondary-dim': '#6bbf00',
      '--color-secondary-container': '#3a6600',
      '--color-on-primary': '#001a66',
      '--color-on-primary-fixed': '#000000',
      '--color-outline-variant': '#44444e',
      '--signature-gradient': 'linear-gradient(135deg, #b8c3ff 0%, #2e5bff 100%)',
      '--scrollbar-track': '#13131b',
      '--scrollbar-thumb': '#44444e',
    },
  },
  {
    id: 'cyber_industrial',
    name: 'Cyber Industrial',
    description: 'Charcoal, lime & teal',
    preview: { bg: '#0E0E11', primary: '#CAFD00', secondary: '#00F4FE' },
    vars: {
      '--color-background': '#0E0E11',
      '--color-surface': '#0E0E11',
      '--color-surface-dim': '#0a0a0d',
      '--color-surface-bright': '#2d2d32',
      '--color-surface-container-lowest': '#000000',
      '--color-surface-container-low': '#131316',
      '--color-surface-container': '#19191c',
      '--color-surface-container-high': '#1F1F23',
      '--color-surface-container-highest': '#25252A',
      '--color-surface-variant': '#25252A',
      '--color-on-surface': '#e8e8ec',
      '--color-on-surface-variant': '#c4c4c8',
      '--color-primary': '#CAFD00',
      '--color-primary-dim': '#96bc00',
      '--color-primary-container': '#CAFD00',
      '--color-primary-fixed': '#CAFD00',
      '--color-secondary': '#00F4FE',
      '--color-secondary-dim': '#00c4cc',
      '--color-secondary-container': '#005c60',
      '--color-on-primary': '#516700',
      '--color-on-primary-fixed': '#3A4A00',
      '--color-outline-variant': '#48474B',
      '--signature-gradient': 'linear-gradient(135deg, #F3FFCA 0%, #CAFD00 100%)',
      '--scrollbar-track': '#0E0E11',
      '--scrollbar-thumb': '#48474B',
    },
  },
];

interface ThemeState {
  currentTheme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  currentTheme: (localStorage.getItem('awks-theme') as ThemeId) || 'neon_groove',
  setTheme: (id) => {
    localStorage.setItem('awks-theme', id);
    set({ currentTheme: id });
  },
}));

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
