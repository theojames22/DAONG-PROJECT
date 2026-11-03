/**
 * Central appearance / theme engine.
 *
 * This module is intentionally framework-free so the exact same rules run in
 * three places:
 *   1. the server (root layout) to render the first paint without a flash,
 *   2. the API route to validate and sanitise saved preferences,
 *   3. the browser (ThemeProvider + Appearance settings) for live previews.
 *
 * Nothing here ever reads a user id. Ownership is enforced by the API route
 * from the authenticated Supabase session.
 */

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
/** The concrete palette in use after `system` is resolved. */
export type ResolvedTheme = "light" | "dark";

export const COLOR_KEYS = [
  "primary",
  "secondary",
  "accent",
  "pageBackground",
  "cardBackground",
  "elevatedSurface",
  "mainText",
  "secondaryText",
  "mutedText",
  "border",
  "success",
  "warning",
  "danger",
  "info",
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];
export type AppearanceColors = Record<ColorKey, string>;

export const COLOR_GROUPS: Array<{
  id: string;
  title: string;
  description: string;
  keys: ColorKey[];
}> = [
  {
    id: "surfaces",
    title: "Surfaces & background",
    description: "Page canvas, cards and floating panels.",
    keys: ["pageBackground", "cardBackground", "elevatedSurface", "border"],
  },
  {
    id: "brand",
    title: "Brand & interface",
    description: "Primary actions, secondary controls and decorative accents.",
    keys: ["primary", "secondary", "accent"],
  },
  {
    id: "text",
    title: "Text",
    description: "Headings, descriptions and less prominent information.",
    keys: ["mainText", "secondaryText", "mutedText"],
  },
  {
    id: "status",
    title: "Status colors",
    description: "Approvals, pending items, errors and informational messages.",
    keys: ["success", "warning", "danger", "info"],
  },
];

export const COLOR_LABELS: Record<ColorKey, { label: string; hint: string }> = {
  primary: {
    label: "Primary",
    hint: "Main buttons, active navigation, links and primary actions.",
  },
  secondary: {
    label: "Secondary",
    hint: "Secondary buttons and supporting interface elements.",
  },
  accent: {
    label: "Accent",
    hint: "Highlights, selected controls and decorative details.",
  },
  pageBackground: {
    label: "Page background",
    hint: "The main application background.",
  },
  cardBackground: {
    label: "Card background",
    hint: "Cards, panels, tables and content surfaces.",
  },
  elevatedSurface: {
    label: "Elevated surface",
    hint: "Dropdowns, dialogs, drawers and floating panels.",
  },
  mainText: {
    label: "Main text",
    hint: "Headings and primary content.",
  },
  secondaryText: {
    label: "Secondary text",
    hint: "Descriptions, labels and subtitles.",
  },
  mutedText: {
    label: "Muted text",
    hint: "Less prominent information and placeholders.",
  },
  border: {
    label: "Border",
    hint: "Borders, dividers and input outlines.",
  },
  success: {
    label: "Success",
    hint: "Approved outputs and completed actions.",
  },
  warning: {
    label: "Warning",
    hint: "Pending items and attention-required states.",
  },
  danger: {
    label: "Danger",
    hint: "Rejected items, errors and critical warnings.",
  },
  info: {
    label: "Information",
    hint: "Notifications and informational messages.",
  },
};

// ---------------------------------------------------------------------------
// Default palettes
// ---------------------------------------------------------------------------

export const DEFAULT_LIGHT_COLORS: AppearanceColors = {
  primary: "#2563EB",
  secondary: "#475569",
  accent: "#0EA5E9",
  pageBackground: "#F5F9FF",
  cardBackground: "#FFFFFF",
  elevatedSurface: "#FFFFFF",
  mainText: "#172033",
  secondaryText: "#64748B",
  mutedText: "#94A3B8",
  border: "#D5E0F5",
  success: "#15803D",
  warning: "#B45309",
  danger: "#B91C1C",
  info: "#0369A1",
};

export const DEFAULT_DARK_COLORS: AppearanceColors = {
  primary: "#3B82F6",
  secondary: "#94A3B8",
  accent: "#38BDF8",
  pageBackground: "#0F172A",
  cardBackground: "#1E293B",
  elevatedSurface: "#263449",
  mainText: "#F1F5F9",
  secondaryText: "#CBD5E1",
  mutedText: "#94A3B8",
  border: "#334155",
  success: "#4ADE80",
  warning: "#FB923C",
  danger: "#F87171",
  info: "#38BDF8",
};

export type PresetId =
  | "daong-blue"
  | "ocean-blue"
  | "midnight-blue"
  | "emerald"
  | "lavender"
  | "rose"
  | "warm-amber"
  | "slate"
  | "minimal-gray"
  | "dark-midnight"
  | "custom";

export interface ThemePreset {
  id: Exclude<PresetId, "custom">;
  name: string;
  description: string;
  light: AppearanceColors;
  dark: AppearanceColors;
}

/**
 * Coordinated presets. Each one changes the complete palette (surfaces,
 * borders, text and status colours) rather than only the primary button.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "daong-blue",
    name: "Default Daong Blue",
    description: "The original Daong blue with clean ice-white surfaces.",
    light: DEFAULT_LIGHT_COLORS,
    dark: DEFAULT_DARK_COLORS,
  },
  {
    id: "ocean-blue",
    name: "Ocean Blue",
    description: "Sea blues, teal accents and cool open water surfaces.",
    light: {
      primary: "#0369A1",
      secondary: "#0F766E",
      accent: "#0891B2",
      pageBackground: "#F0F9FF",
      cardBackground: "#FFFFFF",
      elevatedSurface: "#FFFFFF",
      mainText: "#0C2233",
      secondaryText: "#486581",
      mutedText: "#7B8FA6",
      border: "#CFE8F5",
      success: "#047857",
      warning: "#B45309",
      danger: "#B91C1C",
      info: "#0369A1",
    },
    dark: {
      primary: "#38BDF8",
      secondary: "#2DD4BF",
      accent: "#22D3EE",
      pageBackground: "#071A2B",
      cardBackground: "#0D2438",
      elevatedSurface: "#123049",
      mainText: "#ECF8FF",
      secondaryText: "#B6D6E8",
      mutedText: "#8FB3C7",
      border: "#1E4560",
      success: "#34D399",
      warning: "#FBBF24",
      danger: "#FB7185",
      info: "#38BDF8",
    },
  },
  {
    id: "midnight-blue",
    name: "Midnight Blue",
    description: "Deep navy and indigo with a calm, focused contrast.",
    light: {
      primary: "#1E3A8A",
      secondary: "#3730A3",
      accent: "#4F46E5",
      pageBackground: "#F4F6FF",
      cardBackground: "#FFFFFF",
      elevatedSurface: "#FFFFFF",
      mainText: "#111A3A",
      secondaryText: "#4B5675",
      mutedText: "#7C86A3",
      border: "#D8DEF7",
      success: "#15803D",
      warning: "#B45309",
      danger: "#B91C1C",
      info: "#1D4ED8",
    },
    dark: {
      primary: "#818CF8",
      secondary: "#60A5FA",
      accent: "#A78BFA",
      pageBackground: "#080D1C",
      cardBackground: "#111A33",
      elevatedSurface: "#1A2747",
      mainText: "#EEF2FF",
      secondaryText: "#C7D2FE",
      mutedText: "#94A3C4",
      border: "#283760",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#FB7185",
      info: "#60A5FA",
    },
  },
  {
    id: "emerald",
    name: "Emerald Green",
    description: "Fresh green accents on softly tinted paper surfaces.",
    light: {
      primary: "#047857",
      secondary: "#0F766E",
      accent: "#10B981",
      pageBackground: "#F4FCF8",
      cardBackground: "#FFFFFF",
      elevatedSurface: "#FFFFFF",
      mainText: "#0C221B",
      secondaryText: "#3F6258",
      mutedText: "#748B83",
      border: "#CFE8DE",
      success: "#047857",
      warning: "#B45309",
      danger: "#B91C1C",
      info: "#0E7490",
    },
    dark: {
      primary: "#34D399",
      secondary: "#2DD4BF",
      accent: "#6EE7B7",
      pageBackground: "#071711",
      cardBackground: "#0E241C",
      elevatedSurface: "#143027",
      mainText: "#ECFDF5",
      secondaryText: "#B7E4D2",
      mutedText: "#85B3A0",
      border: "#1E4438",
      success: "#34D399",
      warning: "#FBBF24",
      danger: "#FB7185",
      info: "#22D3EE",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    description: "Soft violet surfaces with a confident purple action color.",
    light: {
      primary: "#6D28D9",
      secondary: "#7E22CE",
      accent: "#A855F7",
      pageBackground: "#FAF7FF",
      cardBackground: "#FFFFFF",
      elevatedSurface: "#FFFFFF",
      mainText: "#211633",
      secondaryText: "#5B4A75",
      mutedText: "#8B7DA5",
      border: "#E3D6F7",
      success: "#15803D",
      warning: "#B45309",
      danger: "#B91C1C",
      info: "#7C3AED",
    },
    dark: {
      primary: "#C4B5FD",
      secondary: "#D8B4FE",
      accent: "#E9D5FF",
      pageBackground: "#120A20",
      cardBackground: "#1C1130",
      elevatedSurface: "#281842",
      mainText: "#F7F2FF",
      secondaryText: "#D8C9EE",
      mutedText: "#A894C6",
      border: "#382557",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#FB7185",
      info: "#C4B5FD",
    },
  },
  {
    id: "rose",
    name: "Rose",
    description: "Warm rose primary tones balanced by soft blush surfaces.",
    light: {
      primary: "#BE123C",
      secondary: "#9F1239",
      accent: "#F43F5E",
      pageBackground: "#FFF7F8",
      cardBackground: "#FFFFFF",
      elevatedSurface: "#FFFFFF",
      mainText: "#2A1118",
      secondaryText: "#6B4550",
      mutedText: "#9A7A83",
      border: "#F6D3DB",
      success: "#15803D",
      warning: "#B45309",
      danger: "#BE123C",
      info: "#0E7490",
    },
    dark: {
      primary: "#FDA4AF",
      secondary: "#F9A8D4",
      accent: "#FB7185",
      pageBackground: "#1B0B10",
      cardBackground: "#281017",
      elevatedSurface: "#391722",
      mainText: "#FFF1F2",
      secondaryText: "#F3C4CC",
      mutedText: "#C99AA4",
      border: "#4C222E",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#FDA4AF",
      info: "#67E8F9",
    },
  },
  {
    id: "warm-amber",
    name: "Warm Amber",
    description: "Golden highlights with a warm, paper-like light palette.",
    light: {
      primary: "#B45309",
      secondary: "#92400E",
      accent: "#D97706",
      pageBackground: "#FFFBF2",
      cardBackground: "#FFFFFF",
      elevatedSurface: "#FFFFFF",
      mainText: "#2B1B08",
      secondaryText: "#6B4E2E",
      mutedText: "#9A805E",
      border: "#F0DEC2",
      success: "#15803D",
      warning: "#B45309",
      danger: "#B91C1C",
      info: "#0369A1",
    },
    dark: {
      primary: "#FBBF24",
      secondary: "#FDBA74",
      accent: "#F59E0B",
      pageBackground: "#1B1205",
      cardBackground: "#271B0A",
      elevatedSurface: "#38260F",
      mainText: "#FFF8E7",
      secondaryText: "#E8D0A7",
      mutedText: "#B9A07A",
      border: "#4C3718",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#FB7185",
      info: "#67E8F9",
    },
  },
  {
    id: "slate",
    name: "Slate",
    description: "Neutral slate UI with a single bright sky-blue highlight.",
    light: {
      primary: "#334155",
      secondary: "#475569",
      accent: "#0EA5E9",
      pageBackground: "#F8FAFC",
      cardBackground: "#FFFFFF",
      elevatedSurface: "#FFFFFF",
      mainText: "#0F172A",
      secondaryText: "#526173",
      mutedText: "#7D8A9A",
      border: "#D8E0EA",
      success: "#15803D",
      warning: "#B45309",
      danger: "#B91C1C",
      info: "#0369A1",
    },
    dark: {
      primary: "#94A3B8",
      secondary: "#CBD5E1",
      accent: "#38BDF8",
      pageBackground: "#0B1120",
      cardBackground: "#151E2E",
      elevatedSurface: "#1F2A3D",
      mainText: "#F1F5F9",
      secondaryText: "#C3CEDC",
      mutedText: "#92A0B3",
      border: "#2A3648",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#FB7185",
      info: "#38BDF8",
    },
  },
  {
    id: "minimal-gray",
    name: "Minimal Gray",
    description: "Quiet monochrome surfaces that let content lead.",
    light: {
      primary: "#374151",
      secondary: "#6B7280",
      accent: "#6B7280",
      pageBackground: "#FFFFFF",
      cardBackground: "#FAFAFA",
      elevatedSurface: "#FFFFFF",
      mainText: "#111827",
      secondaryText: "#4B5563",
      mutedText: "#6B7280",
      border: "#D1D5DB",
      success: "#15803D",
      warning: "#B45309",
      danger: "#B91C1C",
      info: "#0369A1",
    },
    dark: {
      primary: "#D1D5DB",
      secondary: "#9CA3AF",
      accent: "#9CA3AF",
      pageBackground: "#111111",
      cardBackground: "#1A1A1A",
      elevatedSurface: "#242424",
      mainText: "#F5F5F5",
      secondaryText: "#BDBDBD",
      mutedText: "#999999",
      border: "#333333",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#FB7185",
      info: "#67E8F9",
    },
  },
  {
    id: "dark-midnight",
    name: "Midnight",
    description: "Near-black surfaces with electric indigo and violet.",
    light: {
      primary: "#4338CA",
      secondary: "#312E81",
      accent: "#6366F1",
      pageBackground: "#F5F5FF",
      cardBackground: "#FFFFFF",
      elevatedSurface: "#FFFFFF",
      mainText: "#12122A",
      secondaryText: "#4D4D6E",
      mutedText: "#7F7F9E",
      border: "#DADAF5",
      success: "#15803D",
      warning: "#B45309",
      danger: "#B91C1C",
      info: "#1D4ED8",
    },
    dark: {
      primary: "#6366F1",
      secondary: "#818CF8",
      accent: "#A5B4FC",
      pageBackground: "#05050E",
      cardBackground: "#0D0D1A",
      elevatedSurface: "#161628",
      mainText: "#EEEEFF",
      secondaryText: "#B5B5D6",
      mutedText: "#8585A8",
      border: "#262640",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#FB7185",
      info: "#22D3EE",
    },
  },
];

export const PRESET_BY_ID = new Map(THEME_PRESETS.map((preset) => [preset.id, preset]));

export type Density = "comfortable" | "compact";
export type RadiusStyle = "sharp" | "rounded" | "extra-rounded";
export type CardStyle = "border" | "shadow" | "elevated";
export type SidebarStyle = "default" | "subtle" | "elevated";
export type MotionPreference = "full" | "reduced";

export interface AppearanceOptions {
  density: Density;
  radius: RadiusStyle;
  cardStyle: CardStyle;
  sidebarStyle: SidebarStyle;
  motion: MotionPreference;
  /** Enabled by default: text colours are adjusted only when a pair would
   *  otherwise fail WCAG AA. */
  autoAdjustText: boolean;
}

export const DEFAULT_OPTIONS: AppearanceOptions = {
  density: "comfortable",
  radius: "rounded",
  cardStyle: "border",
  sidebarStyle: "default",
  motion: "full",
  autoAdjustText: true,
};

export interface AppearancePalette {
  preset: PresetId;
  colors: AppearanceColors;
}

export interface AppearancePreferences {
  version: 1;
  mode: ThemeMode;
  light: AppearancePalette;
  dark: AppearancePalette;
  options: AppearanceOptions;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  version: 1,
  mode: "light",
  light: { preset: "daong-blue", colors: { ...DEFAULT_LIGHT_COLORS } },
  dark: { preset: "daong-blue", colors: { ...DEFAULT_DARK_COLORS } },
  options: { ...DEFAULT_OPTIONS },
};

// ---------------------------------------------------------------------------
// Small colour utilities
// ---------------------------------------------------------------------------

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Accepts #abc / #aabbcc (with or without `#`) and returns #AABBCC. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return null;
  let hex = trimmed.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((part) => `${part}${part}`)
      .join("");
  }
  return `#${hex.toUpperCase()}`;
}

export function isValidHex(value: unknown): value is string {
  return normalizeHex(value) !== null;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex) ?? "#000000";
  const raw = normalized.slice(1);
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha.toFixed(2)})`;
}

export function hexToRgbChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

function channelToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

/** WCAG 2.2 contrast ratio, always >= 1. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Mix `amount` of `overlay` into `base` (0..1). */
export function mixHex(base: string, overlay: string, amount: number): string {
  const a = hexToRgb(base);
  const b = hexToRgb(overlay);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

export function darken(hex: string, amount: number): string {
  return mixHex(hex, "#000000", amount);
}

export function lighten(hex: string, amount: number): string {
  return mixHex(hex, "#FFFFFF", amount);
}

function colorDistance(a: string, b: string): number {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return (
    Math.pow(ca.r - cb.r, 2) +
    Math.pow(ca.g - cb.g, 2) +
    Math.pow(ca.b - cb.b, 2)
  );
}

/**
 * Returns a foreground that meets `minRatio` against `background`.
 * The preferred colour is kept when it already passes; otherwise the closest
 * accessible variation (same hue) is chosen, then black/white as a last
 * resort. This is only used for the derived `text-on-*` tokens — the user's
 * original swatch is never overwritten.
 */
export function pickReadableForeground(
  preferred: string,
  background: string,
  minRatio = 4.5
): string {
  if (contrastRatio(preferred, background) >= minRatio) return preferred;

  const candidates: string[] = [];
  for (let step = 5; step <= 95; step += 5) {
    candidates.push(mixHex(preferred, "#000000", step / 100));
    candidates.push(mixHex(preferred, "#FFFFFF", step / 100));
  }
  candidates.push("#0B1220", "#111827", "#FFFFFF", "#F8FAFC", "#000000");

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (contrastRatio(candidate, background) < minRatio) continue;
    const distance = colorDistance(preferred, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (best) return best;

  return contrastRatio("#FFFFFF", background) >= contrastRatio("#000000", background)
    ? "#FFFFFF"
    : "#000000";
}

export function pickReadableForegroundOnAll(
  preferred: string,
  backgrounds: string[],
  minRatio = 4.5
): string {
  if (backgrounds.every((bg) => contrastRatio(preferred, bg) >= minRatio)) {
    return preferred;
  }

  const candidates: string[] = [];
  for (let step = 5; step <= 95; step += 5) {
    candidates.push(mixHex(preferred, "#000000", step / 100));
    candidates.push(mixHex(preferred, "#FFFFFF", step / 100));
  }
  candidates.push("#0B1220", "#111827", "#FFFFFF", "#F8FAFC", "#000000");

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (
      !backgrounds.every((bg) => contrastRatio(candidate, bg) >= minRatio)
    ) {
      continue;
    }
    const distance = colorDistance(preferred, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (best) return best;

  // No single candidate passes every surface; pick the one with the best
  // worst-case ratio rather than an unreadable colour.
  let fallback = "#FFFFFF";
  let fallbackWorst = -1;
  for (const candidate of ["#FFFFFF", "#0B1220", "#000000"]) {
    const worst = Math.min(
      ...backgrounds.map((bg) => contrastRatio(candidate, bg))
    );
    if (worst > fallbackWorst) {
      fallback = candidate;
      fallbackWorst = worst;
    }
  }
  return fallback;
}

/** Label colour for a solid fill (button, badge, avatar). */
export function pickLabelOn(fill: string): string {
  const white = contrastRatio("#FFFFFF", fill);
  const ink = contrastRatio("#0B1220", fill);
  return white >= ink ? "#FFFFFF" : "#0B1220";
}

// ---------------------------------------------------------------------------
// Resolved tokens
// ---------------------------------------------------------------------------

export interface AppearanceAdjustment {
  key: ColorKey;
  label: string;
  surface: string;
  from: string;
  to: string;
}

export interface ResolvedAppearance {
  mode: ResolvedTheme;
  colors: AppearanceColors;
  tokens: Record<string, string>;
  adjustments: AppearanceAdjustment[];
}

const RADIUS_SCALES: Record<RadiusStyle, Record<string, string>> = {
  sharp: {
    "--radius-sm": "3px",
    "--radius-md": "4px",
    "--radius-lg": "6px",
    "--radius-xl": "8px",
    "--radius-2xl": "10px",
    "--radius-3xl": "12px",
    "--radius-card": "12px",
    "--radius-container": "14px",
  },
  rounded: {
    "--radius-sm": "8px",
    "--radius-md": "12px",
    "--radius-lg": "16px",
    "--radius-xl": "20px",
    "--radius-2xl": "24px",
    "--radius-3xl": "28px",
    "--radius-card": "20px",
    "--radius-container": "24px",
  },
  "extra-rounded": {
    "--radius-sm": "12px",
    "--radius-md": "16px",
    "--radius-lg": "20px",
    "--radius-xl": "26px",
    "--radius-2xl": "30px",
    "--radius-3xl": "36px",
    "--radius-card": "28px",
    "--radius-container": "32px",
  },
};

const DENSITY_SCALES: Record<Density, Record<string, string>> = {
  comfortable: {
    "--density-card-pad": "20px",
    "--density-stack-gap": "16px",
    "--density-control-y": "10px",
    "--density-control-x": "16px",
    "--density-row-y": "12px",
    "--density-font": "1",
  },
  compact: {
    "--density-card-pad": "14px",
    "--density-stack-gap": "10px",
    "--density-control-y": "7px",
    "--density-control-x": "12px",
    "--density-row-y": "8px",
    "--density-font": "0.96",
  },
};

function statusTokens(
  name: "success" | "warning" | "danger" | "info",
  solid: string,
  mode: ResolvedTheme,
  card: string,
  page: string
): Record<string, string> {
  const soft = mixHex(card, solid, mode === "dark" ? 0.2 : 0.12);
  const text = pickReadableForegroundOnAll(solid, [page, card, soft], 4.5);
  const border = mixHex(soft, solid, mode === "dark" ? 0.45 : 0.35);
  return {
    [`--${name}`]: text,
    [`--${name}-text`]: text,
    [`--${name}-solid`]: solid,
    [`--${name}-soft`]: soft,
    [`--${name}-border`]: border,
    [`--${name}-hover`]: mode === "dark" ? lighten(solid, 0.1) : darken(solid, 0.1),
    [`--on-${name}`]: pickLabelOn(solid),
  };
}

export function resolveAppearance(
  preferences: AppearancePreferences,
  mode: ResolvedTheme
): ResolvedAppearance {
  const palette = mode === "dark" ? preferences.dark : preferences.light;
  const colors = palette.colors;
  const options = preferences.options;
  const adjustments: AppearanceAdjustment[] = [];

  const auto = options.autoAdjustText;
  const choose = (
    key: ColorKey,
    surface: string,
    surfaceLabel: string
  ): string => {
    const preferred = colors[key];
    if (!auto) return preferred;
    const resolved = pickReadableForeground(preferred, surface, 4.5);
    if (resolved !== preferred) {
      adjustments.push({
        key,
        label: COLOR_LABELS[key].label,
        surface: surfaceLabel,
        from: preferred,
        to: resolved,
      });
    }
    return resolved;
  };

  const page = colors.pageBackground;
  const card = colors.cardBackground;
  const elevated = colors.elevatedSurface;

  const textOnBackground = choose("mainText", page, "page background");
  const textOnCard = choose("mainText", card, "card background");
  const textOnElevated = choose("mainText", elevated, "elevated surface");

  const secondaryOnBackground = choose(
    "secondaryText",
    page,
    "page background"
  );
  const secondaryOnCard = choose("secondaryText", card, "card background");
  const secondaryOnElevated = choose(
    "secondaryText",
    elevated,
    "elevated surface"
  );

  const mutedOnBackground = choose("mutedText", page, "page background");
  const mutedOnCard = choose("mutedText", card, "card background");
  const mutedOnElevated = choose("mutedText", elevated, "elevated surface");

  const primary = colors.primary;
  const secondary = colors.secondary;
  const accent = colors.accent;

  const primarySoft = mixHex(card, primary, mode === "dark" ? 0.2 : 0.1);
  const primaryText = pickReadableForegroundOnAll(
    primary,
    [page, card, primarySoft],
    4.5
  );
  const primaryHover = mode === "dark" ? lighten(primary, 0.12) : darken(primary, 0.12);
  const primaryLight =
    mode === "dark" ? lighten(primary, 0.22) : lighten(primary, 0.18);
  const primaryBorder = mixHex(primarySoft, primary, mode === "dark" ? 0.5 : 0.35);

  const secondarySoft = mixHex(card, secondary, mode === "dark" ? 0.2 : 0.1);
  const secondaryText = pickReadableForegroundOnAll(
    secondary,
    [page, card, secondarySoft],
    4.5
  );
  const secondaryHover =
    mode === "dark" ? lighten(secondary, 0.12) : darken(secondary, 0.12);
  const secondaryBorder = mixHex(
    secondarySoft,
    secondary,
    mode === "dark" ? 0.5 : 0.35
  );

  const accentSoft = mixHex(card, accent, mode === "dark" ? 0.2 : 0.12);
  const accentText = pickReadableForegroundOnAll(
    accent,
    [page, card, accentSoft],
    4.5
  );
  const accentHover =
    mode === "dark" ? lighten(accent, 0.12) : darken(accent, 0.12);
  const accentBorder = mixHex(accentSoft, accent, mode === "dark" ? 0.5 : 0.35);

  const focusRing = pickReadableForeground(primary, page, 3);
  const border = colors.border;
  const borderStrong = mixHex(border, colors.mainText, 0.32);
  const surface2 = mixHex(card, page, mode === "dark" ? 0.35 : 0.5);
  const divider = mixHex(border, surface2, 0.35);

  const baseLight =
    mode === "dark" ? mixHex(card, "#FFFFFF", 0.08) : mixHex(card, "#FFFFFF", 0.8);
  const baseDark =
    mode === "dark" ? mixHex(page, "#000000", 0.55) : mixHex(page, "#000000", 0.12);

  const cardShadow =
    mode === "dark"
      ? "0 1px 2px rgba(0, 0, 0, 0.35), 0 18px 42px -20px rgba(0, 0, 0, 0.72)"
      : "0 1px 2px rgba(15, 23, 42, 0.05), 0 16px 36px -20px rgba(15, 23, 42, 0.24)";
  const cardShadowSoft =
    mode === "dark"
      ? "0 10px 30px -18px rgba(0, 0, 0, 0.8)"
      : "0 10px 28px -20px rgba(15, 23, 42, 0.28)";
  const cardShadowElevated =
    mode === "dark"
      ? "0 2px 6px rgba(0, 0, 0, 0.4), 0 26px 54px -22px rgba(0, 0, 0, 0.85)"
      : "0 2px 5px rgba(15, 23, 42, 0.06), 0 26px 52px -24px rgba(15, 23, 42, 0.3)";

  const sidebarBg =
    options.sidebarStyle === "elevated"
      ? elevated
      : options.sidebarStyle === "subtle"
        ? mixHex(card, page, mode === "dark" ? 0.35 : 0.5)
        : card;

  const radius = RADIUS_SCALES[options.radius];
  const density = DENSITY_SCALES[options.density];

  const status = {
    ...statusTokens("success", colors.success, mode, card, page),
    ...statusTokens("warning", colors.warning, mode, card, page),
    ...statusTokens("danger", colors.danger, mode, card, page),
    ...statusTokens("info", colors.info, mode, card, page),
  };

  const tokens: Record<string, string> = {
    // New semantic tokens
    "--page-bg": page,
    "--card-bg": card,
    "--elevated-surface": elevated,
    "--border-color": border,
    "--border-strong": borderStrong,
    "--focus-ring": focusRing,
    "--primary": primary,
    "--primary-hover": primaryHover,
    "--primary-light": primaryLight,
    "--primary-soft": primarySoft,
    "--primary-text": primaryText,
    "--primary-border": primaryBorder,
    "--on-primary": pickLabelOn(primary),
    "--secondary": secondary,
    "--secondary-hover": secondaryHover,
    "--secondary-soft": secondarySoft,
    "--secondary-text": secondaryText,
    "--secondary-border": secondaryBorder,
    "--on-secondary": pickLabelOn(secondary),
    "--accent-solid": accent,
    "--accent-hover": accentHover,
    "--accent-soft-2": accentSoft,
    "--accent-text": accentText,
    "--accent-border": accentBorder,
    "--on-accent": pickLabelOn(accent),
    "--text-on-background": textOnBackground,
    "--text-on-card": textOnCard,
    "--text-on-elevated-surface": textOnElevated,
    "--text-on-primary": pickLabelOn(primary),
    "--text-on-secondary": pickLabelOn(secondary),
    "--text-on-accent": pickLabelOn(accent),
    "--text-muted-on-background": mutedOnBackground,
    "--text-muted-on-card": mutedOnCard,
    "--text-muted-on-elevated-surface": mutedOnElevated,
    "--text-secondary-on-background": secondaryOnBackground,
    "--text-secondary-on-card": secondaryOnCard,
    "--text-secondary-on-elevated-surface": secondaryOnElevated,
    "--text-link": primaryText,
    "--card-shadow": cardShadow,
    "--card-shadow-soft": cardShadowSoft,
    "--card-shadow-elevated": cardShadowElevated,
    "--sidebar-bg": sidebarBg,
    "--sidebar-border": options.sidebarStyle === "elevated" ? border : divider,
    "--motion-duration": options.motion === "reduced" ? "0.001ms" : "200ms",
    ...radius,
    ...density,
    ...status,

    // Existing design-system aliases (used by Tailwind and legacy classes)
    "--base": page,
    "--surface": card,
    "--surface-2": surface2,
    "--surface-elevated": elevated,
    "--base-light": baseLight,
    "--base-dark": baseDark,
    "--ink": textOnBackground,
    "--ink-muted": secondaryOnBackground,
    "--ink-subtle": mutedOnBackground,
    "--accent": primary,
    "--accent-dark": primaryHover,
    "--accent-light": accentHover,
    "--accent-soft": accentSoft,
    "--border": border,
    "--divider": divider,
    "--success-soft": status["--success-soft"],
    "--warning-soft": status["--warning-soft"],
    "--danger-soft": status["--danger-soft"],
    "--info-soft": status["--info-soft"],
    "--bg-overlay": hexToRgba(page, mode === "dark" ? 0.92 : 0.9),
    "--shadow-light": hexToRgba("#FFFFFF", mode === "dark" ? 0.05 : 0.85),
    "--shadow-dark": hexToRgba("#000000", mode === "dark" ? 0.55 : 0.12),

    // Staff-page tokens
    "--staff-ink": textOnCard,
    "--staff-body": secondaryOnCard,
    "--staff-muted": mutedOnCard,
    "--staff-card": card,
    "--staff-card-2": surface2,
    "--staff-chip": surface2,
    "--staff-border": border,
    "--staff-border-strong": borderStrong,
    "--staff-soft": primarySoft,
    "--staff-success": status["--success-text"],
    "--staff-success-soft": status["--success-soft"],
    "--staff-success-border": status["--success-border"],
    "--staff-warning": status["--warning-text"],
    "--staff-warning-soft": status["--warning-soft"],
    "--staff-warning-border": status["--warning-border"],
    "--staff-danger": status["--danger-text"],
    "--staff-danger-soft": status["--danger-soft"],
    "--staff-danger-border": status["--danger-border"],
    "--staff-danger-solid": status["--danger-solid"],
    "--staff-blue": hexToRgbChannels(primary),
    "--staff-blue-dark": hexToRgbChannels(primaryHover),
    "--staff-blue-ink": primaryText,
  };

  return { mode, colors, tokens, adjustments };
}

export function appearanceToCssVars(
  preferences: AppearancePreferences,
  mode: ResolvedTheme
): Record<string, string> {
  return resolveAppearance(preferences, mode).tokens;
}

// ---------------------------------------------------------------------------
// Contrast report / validation
// ---------------------------------------------------------------------------

export type ContrastLevel = "good" | "attention" | "poor";

export interface ContrastPair {
  id: string;
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  passes: boolean;
  level: ContrastLevel;
  suggestion: string | null;
  kind: "text" | "component";
}

export interface ContrastReport {
  mode: ResolvedTheme;
  pairs: ContrastPair[];
  adjustments: AppearanceAdjustment[];
  blocking: ContrastPair[];
  warnings: ContrastPair[];
}

function levelFor(ratio: number, required: number): ContrastLevel {
  if (ratio >= required) return "good";
  if (ratio >= Math.max(3, required * 0.8)) return "attention";
  return "poor";
}

function pair(
  id: string,
  label: string,
  foreground: string,
  background: string,
  required: number,
  kind: "text" | "component"
): ContrastPair {
  const ratio = contrastRatio(foreground, background);
  const passes = ratio + 0.0001 >= required;
  return {
    id,
    label,
    foreground,
    background,
    ratio,
    required,
    passes,
    level: levelFor(ratio, required),
    suggestion: passes
      ? null
      : pickReadableForeground(foreground, background, required),
    kind,
  };
}

export function getContrastReport(
  preferences: AppearancePreferences,
  mode: ResolvedTheme
): ContrastReport {
  const resolved = resolveAppearance(preferences, mode);
  const t = resolved.tokens;
  const c = resolved.colors;

  const pairs: ContrastPair[] = [
    pair(
      "main-on-page",
      "Main text on page",
      t["--text-on-background"],
      c.pageBackground,
      4.5,
      "text"
    ),
    pair(
      "main-on-card",
      "Main text on cards",
      t["--text-on-card"],
      c.cardBackground,
      4.5,
      "text"
    ),
    pair(
      "main-on-elevated",
      "Main text on elevated surfaces",
      t["--text-on-elevated-surface"],
      c.elevatedSurface,
      4.5,
      "text"
    ),
    pair(
      "secondary-on-page",
      "Secondary text on page",
      t["--text-secondary-on-background"],
      c.pageBackground,
      4.5,
      "text"
    ),
    pair(
      "muted-on-card",
      "Muted text on cards",
      t["--text-muted-on-card"],
      c.cardBackground,
      4.5,
      "text"
    ),
    pair(
      "primary-label",
      "Primary button label",
      t["--on-primary"],
      c.primary,
      4.5,
      "text"
    ),
    pair(
      "secondary-label",
      "Secondary button label",
      t["--on-secondary"],
      c.secondary,
      4.5,
      "text"
    ),
    pair(
      "accent-label",
      "Accent control label",
      t["--on-accent"],
      c.accent,
      4.5,
      "text"
    ),
    pair(
      "success-badge",
      "Success badge label",
      t["--success-text"],
      t["--success-soft"],
      4.5,
      "text"
    ),
    pair(
      "warning-badge",
      "Warning badge label",
      t["--warning-text"],
      t["--warning-soft"],
      4.5,
      "text"
    ),
    pair(
      "danger-badge",
      "Danger badge label",
      t["--danger-text"],
      t["--danger-soft"],
      4.5,
      "text"
    ),
    pair(
      "info-badge",
      "Information badge label",
      t["--info-text"],
      t["--info-soft"],
      4.5,
      "text"
    ),
    pair(
      "border-page",
      "Borders and input outlines",
      t["--border-color"],
      c.pageBackground,
      3,
      "component"
    ),
    pair(
      "focus-ring",
      "Keyboard focus ring",
      t["--focus-ring"],
      c.pageBackground,
      3,
      "component"
    ),
  ];

  const blocking: ContrastPair[] = [];
  const warnings: ContrastPair[] = [];

  for (const item of pairs) {
    if (item.passes) continue;
    if (item.kind === "text" && !preferences.options.autoAdjustText) {
      blocking.push(item);
    } else {
      warnings.push(item);
    }
  }

  return {
    mode,
    pairs,
    adjustments: resolved.adjustments,
    blocking,
    warnings,
  };
}

export function getContrastReports(
  preferences: AppearancePreferences
): Record<ResolvedTheme, ContrastReport> {
  return {
    light: getContrastReport(preferences, "light"),
    dark: getContrastReport(preferences, "dark"),
  };
}

export interface AppearanceValidation {
  ok: boolean;
  errors: string[];
  /** Human-readable contrast problems that prevent saving. */
  blocking: Array<ContrastPair & { mode: ResolvedTheme }>;
}

export function validateAppearancePreferences(
  preferences: AppearancePreferences
): AppearanceValidation {
  const reports = getContrastReports(preferences);
  const blocking = (["light", "dark"] as ResolvedTheme[]).flatMap((mode) =>
    reports[mode].blocking.map((item) => ({ ...item, mode }))
  );

  const errors: string[] = [];
  if (blocking.length > 0) {
    for (const item of blocking) {
      errors.push(
        `${item.mode === "light" ? "Light" : "Dark"}: ${item.label} has ` +
          `${item.ratio.toFixed(2)}:1 contrast (needs ${item.required}:1). ` +
          `Use ${item.suggestion ?? "a darker or lighter color"} or enable ` +
          `Auto-adjust text colors.`
      );
    }
  }

  return { ok: errors.length === 0, errors, blocking };
}

// ---------------------------------------------------------------------------
// Presets / sanitising
// ---------------------------------------------------------------------------

export function paletteForPreset(
  presetId: Exclude<PresetId, "custom">,
  mode: ResolvedTheme
): AppearanceColors {
  const preset = PRESET_BY_ID.get(presetId) ?? THEME_PRESETS[0];
  return { ...(mode === "dark" ? preset.dark : preset.light) };
}

export function palettesEqual(a: AppearanceColors, b: AppearanceColors): boolean {
  return COLOR_KEYS.every((key) => normalizeHex(a[key]) === normalizeHex(b[key]));
}

export function inferPreset(colors: AppearanceColors, mode: ResolvedTheme): PresetId {
  for (const preset of THEME_PRESETS) {
    const candidate = mode === "dark" ? preset.dark : preset.light;
    if (palettesEqual(colors, candidate)) return preset.id;
  }
  return "custom";
}

function validPresetId(value: unknown): PresetId | null {
  if (value === "custom") return "custom";
  if (typeof value !== "string") return null;
  return PRESET_BY_ID.has(value as Exclude<PresetId, "custom">)
    ? (value as Exclude<PresetId, "custom">)
    : null;
}

function sanitizeColors(
  raw: unknown,
  fallback: AppearanceColors
): { colors: AppearanceColors; invalid: ColorKey[] } {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const colors = { ...fallback };
  const invalid: ColorKey[] = [];
  for (const key of COLOR_KEYS) {
    if (!(key in source)) continue;
    const normalized = normalizeHex(source[key]);
    if (normalized) {
      colors[key] = normalized;
    } else {
      invalid.push(key);
    }
  }
  return { colors, invalid };
}

function sanitizePalette(
  raw: unknown,
  mode: ResolvedTheme
): AppearancePalette {
  const fallback = mode === "dark" ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS;
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const { colors } = sanitizeColors(source.colors, fallback);
  const storedPreset = validPresetId(source.preset);
  const inferred = inferPreset(colors, mode);

  // A preset only stays selected while every one of its colours still
  // matches. Any manual edit is reported as Custom Theme.
  if (storedPreset && storedPreset !== "custom") {
    const expected = paletteForPreset(storedPreset, mode);
    if (!palettesEqual(colors, expected)) {
      return { colors, preset: "custom" };
    }
    return { colors, preset: storedPreset };
  }

  return { colors, preset: inferred };
}

function sanitizeOptions(raw: unknown): AppearanceOptions {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const oneOf = <T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: T
  ): T => (typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback);

  return {
    density: oneOf(source.density, ["comfortable", "compact"] as const, DEFAULT_OPTIONS.density),
    radius: oneOf(
      source.radius,
      ["sharp", "rounded", "extra-rounded"] as const,
      DEFAULT_OPTIONS.radius
    ),
    cardStyle: oneOf(
      source.cardStyle,
      ["border", "shadow", "elevated"] as const,
      DEFAULT_OPTIONS.cardStyle
    ),
    sidebarStyle: oneOf(
      source.sidebarStyle,
      ["default", "subtle", "elevated"] as const,
      DEFAULT_OPTIONS.sidebarStyle
    ),
    motion: oneOf(
      source.motion,
      ["full", "reduced"] as const,
      DEFAULT_OPTIONS.motion
    ),
    autoAdjustText:
      typeof source.autoAdjustText === "boolean"
        ? source.autoAdjustText
        : DEFAULT_OPTIONS.autoAdjustText,
  };
}

/**
 * Defensive read path. Never throws: a malformed row (old data, partial write,
 * hand-edited JSON) falls back to a valid default palette.
 */
export function sanitizeAppearancePreferences(
  raw: unknown,
  legacyMode?: unknown
): AppearancePreferences {
  let source: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        source = parsed as Record<string, unknown>;
      }
    } catch {
      source = {};
    }
  } else if (raw && typeof raw === "object") {
    source = raw as Record<string, unknown>;
  }

  const mode = THEME_MODES.includes(source.mode as ThemeMode)
    ? (source.mode as ThemeMode)
    : THEME_MODES.includes(legacyMode as ThemeMode)
      ? (legacyMode as ThemeMode)
      : DEFAULT_APPEARANCE.mode;

  const light = sanitizePalette(source.light, "light");
  const dark = sanitizePalette(source.dark, "dark");
  const options = sanitizeOptions(source.options);

  return { version: 1, mode, light, dark, options };
}

export interface AppearanceParseResult {
  preferences: AppearancePreferences;
  invalidColors: string[];
}

/**
 * Strict write path used by the API. Unknown enum values fall back, but an
 * explicitly supplied malformed colour is reported so the client cannot
 * silently "save" something different from what it showed.
 */
export function parseAppearancePreferences(
  raw: unknown,
  legacyMode?: unknown
): AppearanceParseResult {
  const base = sanitizeAppearancePreferences(raw, legacyMode);
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const invalidColors: string[] = [];

  for (const mode of ["light", "dark"] as ResolvedTheme[]) {
    const paletteRaw = source[mode];
    if (!paletteRaw || typeof paletteRaw !== "object") continue;
    const colorsRaw = (paletteRaw as Record<string, unknown>).colors;
    if (!colorsRaw || typeof colorsRaw !== "object") continue;
    const { invalid } = sanitizeColors(
      colorsRaw,
      mode === "dark" ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS
    );
    for (const key of invalid) invalidColors.push(`${mode}.${key}`);
  }

  return { preferences: base, invalidColors };
}

export function cloneAppearance(preferences: AppearancePreferences): AppearancePreferences {
  return {
    version: 1,
    mode: preferences.mode,
    light: {
      preset: preferences.light.preset,
      colors: { ...preferences.light.colors },
    },
    dark: {
      preset: preferences.dark.preset,
      colors: { ...preferences.dark.colors },
    },
    options: { ...preferences.options },
  };
}

export function markCustom(
  preferences: AppearancePreferences,
  mode: ResolvedTheme
): AppearancePreferences {
  const next = cloneAppearance(preferences);
  next[mode].preset = "custom";
  return next;
}

export function applyPreset(
  preferences: AppearancePreferences,
  mode: ResolvedTheme,
  presetId: Exclude<PresetId, "custom">
): AppearancePreferences {
  const next = cloneAppearance(preferences);
  next[mode] = {
    preset: presetId,
    colors: paletteForPreset(presetId, mode),
  };
  return next;
}

export function resetPaletteToDefault(
  preferences: AppearancePreferences,
  mode: ResolvedTheme
): AppearancePreferences {
  const next = cloneAppearance(preferences);
  next[mode] = {
    preset: "daong-blue",
    colors: {
      ...(mode === "dark" ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS),
    },
  };
  return next;
}

export function resetAllToDefault(): AppearancePreferences {
  return cloneAppearance(DEFAULT_APPEARANCE);
}
