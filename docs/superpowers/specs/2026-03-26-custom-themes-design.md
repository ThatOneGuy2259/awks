# Custom Themes Feature Design

## Overview

Allow users to create, save, edit, delete, export, and import custom themes — entirely client-side with localStorage persistence. Users pick 3 core colors (background, primary, secondary) and the system derives the full ~28 CSS variable theme. A live "Theme Studio" preview gives instant visual feedback during creation.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| User color control | 3 core colors, rest auto-derived | Keeps UI clean, prevents broken themes |
| Architecture | Separate custom theme store + creator component | Clean separation of concerns |
| Starting point | Fork an existing theme | Fastest path to a good result |
| Color picker | Native picker behind styled trigger swatch | On-brand UI, native OS picker UX, minimal code |
| Export format | Base64-encoded JSON | Compact, not inviting to hand-edit |
| Preview | Live Theme Studio with mini visualizer + sample UI | Instant feedback while editing |

## Data Model

### CustomThemeInput (what the user provides)

```typescript
interface CustomThemeInput {
  name: string;
  background: string;  // hex
  primary: string;     // hex
  secondary: string;   // hex
  forkedFrom: string;  // ThemeId of the theme used as starting point
}
```

### StoredCustomTheme (what gets persisted)

```typescript
interface StoredCustomTheme {
  id: string;               // "custom_" + timestamp
  input: CustomThemeInput;  // original choices (for editing)
  theme: ThemeDefinition;   // full derived theme ready to apply
}
```

Persisted to `localStorage` under key `awks-custom-themes` as a JSON array.

### Export payload

Base64-encoded JSON of `CustomThemeInput` only (name + 3 colors + forkedFrom). Keeps the string short; the full theme is re-derived on import.

## Color Derivation

Pure function `deriveTheme(input: CustomThemeInput): ThemeDefinition`

From the 3 user colors, derives all ~28 CSS variables:

- **Surface hierarchy**: lighten background in 5 steps by mixing in ~3-7% white per step (container-lowest through container-highest)
- **Surface-bright**: background lightened ~25%
- **Surface-dim**: background darkened slightly or equal to background
- **Text colors**: `on-surface` is near-white adjusted for contrast; `on-surface-variant` is a muted version (~70% lightness)
- **Primary variants**: `primary-dim` darkens primary ~30%; `primary-container` and `primary-fixed` set to `primary-dim`; `on-primary` is a very dark version of primary; `on-primary-fixed` is black
- **Secondary variants**: same derivation pattern as primary
- **Outline**: `outline-variant` is background lightened ~25-30%
- **Signature gradient**: `linear-gradient(135deg, <primary> 0%, <primary-dim> 100%)`
- **Scrollbar**: track = background, thumb = outline-variant

## Custom Theme Store (`customThemeStore.ts`)

Zustand store with localStorage persistence.

### State

- `customThemes: StoredCustomTheme[]` — loaded from localStorage on init

### Actions

- `saveTheme(input: CustomThemeInput, existingId?: string)` — derives full ThemeDefinition, generates ID or updates existing, persists
- `deleteTheme(id: string)` — removes theme. If it was the active theme, falls back to `neon_groove`
- `exportTheme(id: string): string` — base64-encodes the CustomThemeInput
- `importTheme(encoded: string): boolean` — decodes, validates (valid JSON, required fields, valid hex), derives, saves. Returns false if invalid.

### Helper

- `getAllThemes(): ThemeDefinition[]` — merges built-in `themes` array + custom themes. Used by ThemeModal for rendering the full list.

## Integration with Existing System

### themeStore.ts changes

- `ThemeId` widens to `string` (custom IDs like `custom_1711468800000` need to work)
- `applyTheme` modified to look up themes from both built-in and custom arrays (via `getAllThemes()` or by accepting a ThemeDefinition directly)
- `setTheme` unchanged — it just stores the string ID

### Visualizer

No changes needed. The visualizer already subscribes to `currentTheme` from the store and reads `preview.primary` / `preview.secondary` from the theme definition. Custom themes will have these fields populated by the derivation function.

## Theme Studio UI

### ThemeModal.tsx changes

Below the existing "Theme" section with built-in themes, add:

- **"Custom Themes" section header** with a "Create Theme" button
- **Custom theme list** — same card style as built-in themes (preview swatch + name + description), but with additional action buttons:
  - Edit (opens creator with existing values)
  - Delete (with confirmation)
  - Export (copies base64 string to clipboard, shows brief toast/feedback)
- **Import button** — next to "Create Theme", opens a small input field for pasting a base64 string

### ThemeCreator.tsx (new component)

A modal/panel that opens on top of or replaces the ThemeModal content. Layout:

**Left/Top: Controls**
- Theme name text input
- "Starting from: [theme name]" dropdown — lists all built-in themes. Selecting one populates the 3 color fields with that theme's preview colors. Defaults to the currently active theme when opening the creator. When editing an existing custom theme, pre-populates from the saved input instead.
- 3 color rows, each with:
  - Label (Background / Primary / Secondary)
  - Styled color swatch (shows current color, rounded, on-brand)
  - Hidden `<input type="color">` triggered by clicking the swatch
- Save button (disabled if name is empty)
- Cancel button

**Right/Bottom: Live Preview**
- Scoped to a container with inline CSS variables (derived in real-time from current color selections)
- **Mini visualizer**: 16 bars with canned sine-wave animation, primary-to-secondary hue gradient, reflections below baseline. Pure CSS animation, no audio.
- **Sample heading**: "Your Theme" in `on-surface` color
- **Sample subtitle**: "Preview how your theme looks" in `on-surface-variant`
- **Sample button**: pill shape with signature gradient
- **Sample card**: `surface-container-high` background with ghost border, containing a line of text
- **Surface stack**: nested rectangles showing background -> container-low -> container-high depth

Preview updates live as the user changes any color — derivation runs on every color change and updates the scoped inline styles.

### Responsive layout

- Desktop: controls on left, preview on right (side by side)
- Mobile: controls on top, preview below (stacked)

## Flow Summary

```
ThemeModal
├── Built-in Themes (existing)
└── Custom Themes section
    ├── [Custom theme cards with edit/delete/export]
    ├── [Create Theme] → opens ThemeCreator
    │   ├── Pick starting theme
    │   ├── Adjust 3 colors with live preview
    │   ├── Name it
    │   └── Save → derives + persists + applies
    └── [Import] → paste base64 → validates + derives + saves
```

## Error Handling

- **Import validation**: check base64 decodes, JSON parses, has required fields (name, background, primary, secondary), all colors are valid hex. Show inline error message if invalid.
- **Duplicate names**: allowed (ID is timestamp-based, not name-based)
- **localStorage full**: unlikely for theme data but catch the exception on save and show an error
- **Delete active theme**: reset to neon_groove before removing

## Testing

- `deriveTheme` is a pure function — unit testable for correct contrast ratios and surface hierarchy
- Export/import round-trip: encode then decode should produce identical input
- Invalid import strings should return false without side effects
- Delete of active theme should trigger fallback
