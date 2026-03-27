import type { ThemeDefinition } from '../stores/themeStore';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');
}

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  );
}

function lighten(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', amount);
}

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
