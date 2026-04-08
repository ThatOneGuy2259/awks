// Curated subset of butterchurn-presets. We intentionally keep this small to
// limit bundle size and avoid presets that strobe or flash aggressively.

export const CYCLE_INTERVAL_MS = 30_000;
export const BLEND_DURATION_SEC = 2.7;

export const CURATED_PRESET_COUNT = 30;

// Patterns we filter OUT — preset names containing these are excluded
// because they're known strobers, too dark, or too jarring for a chill theme.
export const EXCLUDED_PATTERNS = [
  'strobe',
  'flash',
  'seizure',
];

export function pickCuratedPresets(
  allPresets: Record<string, unknown>,
): Array<[string, unknown]> {
  const entries = Object.entries(allPresets).filter(
    ([name]) =>
      !EXCLUDED_PATTERNS.some((p) => name.toLowerCase().includes(p)),
  );
  // Deterministic shuffle using the string length sum as a cheap seed
  const seed = entries.reduce((s, [name]) => s + name.length, 0);
  const shuffled = [...entries].sort((a, b) => {
    const ax = (a[0].charCodeAt(0) * seed) % 997;
    const bx = (b[0].charCodeAt(0) * seed) % 997;
    return ax - bx;
  });
  return shuffled.slice(0, CURATED_PRESET_COUNT);
}
