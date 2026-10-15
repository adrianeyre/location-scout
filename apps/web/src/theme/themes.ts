/**
 * The colour themes chosen on the Admin page. Each has a light and a dark
 * palette, and every palette is held to WCAG 2.2 AA (`themes.test.ts`): text
 * at least 4.5:1 against every background it sits on, and focus outlines,
 * control borders and the coloured edges that carry meaning at least 3:1.
 *
 * The map's own colours (Layers, markers, shading) stay the same in every
 * theme, as the base map's tiles do.
 *
 * To add a theme, add it to `THEMES` with both palettes, then run
 * `pnpm --filter @location-scout/web test`, which checks its contrast.
 */

export interface Palette {
  /** The page behind everything. */
  bg: string;
  /** Panels, popups and dialogs. */
  surface: string;
  /** A hovered or pressed row, and quiet backgrounds. */
  surfaceSubtle: string;
  text: string;
  /** Secondary text, such as notes and units. */
  textMuted: string;
  /** Dividers and panel edges, which are decoration only. */
  border: string;
  /** The edge of a control we draw ourselves, such as a Highlight button. */
  controlBorder: string;
  /** Links, the "beta" badge, sliders, checkboxes and radio buttons. */
  accent: string;
  focus: string;
  danger: string;
  warningBg: string;
  warningBorder: string;
  /** What a Scout Mode highlights (PRD FR-4.3a). */
  highlight: string;
  explainBg: string;
  explainBorder: string;
  good: string;
  watch: string;
  concern: string;
  landBg: string;
  landBorder: string;
  landUnregistered: string;
  /** Behind a dialog. */
  scrim: string;
}

export type ThemeMode = "light" | "dark";

export interface Theme {
  id: string;
  name: string;
  description: string;
  light: Palette;
  dark: Palette;
}

/** The status colours every light palette starts from. */
const LIGHT_STATUS = {
  danger: "#b3261e",
  warningBg: "#fff8c5",
  warningBorder: "#9a6700",
  highlight: "#6639ba",
  explainBg: "#fbf8ff",
  explainBorder: "#8250df",
  good: "#1a7f37",
  watch: "#bc4c00",
  concern: "#cf222e",
  landBg: "#f9f9e6",
  landBorder: "#827717",
  landUnregistered: "#c43e00",
  scrim: "rgb(15 20 25 / 55%)",
} satisfies Partial<Palette>;

/** The status colours every dark palette starts from. */
const DARK_STATUS = {
  danger: "#ff8a80",
  warningBg: "#3a2c06",
  warningBorder: "#d29922",
  highlight: "#d2a8ff",
  explainBg: "#251a3a",
  explainBorder: "#a371f7",
  good: "#3fb950",
  watch: "#f0883e",
  concern: "#ff7b72",
  landBg: "#24250e",
  landBorder: "#c0ca33",
  landUnregistered: "#ff9e5e",
  scrim: "rgb(0 0 0 / 70%)",
} satisfies Partial<Palette>;

export const THEMES = [
  {
    id: "scout",
    name: "Scout",
    description: "Clear blues on white or near-black. The default.",
    light: {
      ...LIGHT_STATUS,
      bg: "#ffffff",
      surface: "#ffffff",
      surfaceSubtle: "#f6f8fa",
      text: "#1f2328",
      textMuted: "#59636e",
      border: "#d0d7de",
      controlBorder: "#818b98",
      accent: "#0550ae",
      focus: "#0969da",
    },
    dark: {
      ...DARK_STATUS,
      bg: "#0d1117",
      surface: "#161b22",
      surfaceSubtle: "#21262d",
      text: "#e6edf3",
      textMuted: "#9ea7b3",
      border: "#30363d",
      controlBorder: "#768390",
      accent: "#79c0ff",
      focus: "#4493f8",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Calm teals and sea greys.",
    light: {
      ...LIGHT_STATUS,
      bg: "#fbfeff",
      surface: "#ffffff",
      surfaceSubtle: "#eaf5f6",
      text: "#102a2e",
      textMuted: "#46626a",
      border: "#c4dadd",
      controlBorder: "#6f8f95",
      accent: "#005f6b",
      focus: "#00808c",
    },
    dark: {
      ...DARK_STATUS,
      bg: "#071a1e",
      surface: "#0c2428",
      surfaceSubtle: "#133238",
      text: "#e0f2f1",
      textMuted: "#9cbec1",
      border: "#24464c",
      controlBorder: "#5f8a90",
      accent: "#6ad8e0",
      focus: "#3fc1cb",
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Deep greens, like an Ordnance Survey woodland.",
    light: {
      ...LIGHT_STATUS,
      bg: "#fcfdfb",
      surface: "#ffffff",
      surfaceSubtle: "#eef5ef",
      text: "#15241a",
      textMuted: "#4b5f50",
      border: "#c9d9cc",
      controlBorder: "#73907a",
      accent: "#17652e",
      focus: "#2a7a3b",
    },
    dark: {
      ...DARK_STATUS,
      bg: "#0a160f",
      surface: "#102017",
      surfaceSubtle: "#172b1f",
      text: "#e3f1e6",
      textMuted: "#a0bba7",
      border: "#27412f",
      controlBorder: "#628a6d",
      accent: "#84e39f",
      focus: "#55c06f",
    },
  },
  {
    id: "heather",
    name: "Heather",
    description: "Moorland purples with soft lilac.",
    light: {
      ...LIGHT_STATUS,
      bg: "#fdfcff",
      surface: "#ffffff",
      surfaceSubtle: "#f4effa",
      text: "#241b2f",
      textMuted: "#5f566b",
      border: "#dcd2e8",
      controlBorder: "#8c7fa0",
      accent: "#5b2fa0",
      focus: "#7a45d1",
    },
    dark: {
      ...DARK_STATUS,
      bg: "#140f1c",
      surface: "#1c1627",
      surfaceSubtle: "#271f35",
      text: "#efe9f7",
      textMuted: "#b4aac2",
      border: "#3a3049",
      controlBorder: "#80739a",
      accent: "#cdb0ff",
      focus: "#a982f2",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm terracotta and sandstone.",
    light: {
      ...LIGHT_STATUS,
      bg: "#fffdfb",
      surface: "#ffffff",
      surfaceSubtle: "#faf1ea",
      text: "#2b1d14",
      textMuted: "#68574b",
      border: "#e6d6c9",
      controlBorder: "#a08573",
      accent: "#933a00",
      focus: "#b8460f",
    },
    dark: {
      ...DARK_STATUS,
      bg: "#19110b",
      surface: "#221811",
      surfaceSubtle: "#2e2118",
      text: "#f7ebe1",
      textMuted: "#c4ae9c",
      border: "#45342a",
      controlBorder: "#957a66",
      accent: "#ffb27a",
      focus: "#f0894a",
    },
  },
  {
    id: "high-contrast",
    name: "High contrast",
    description: "Black and white with the strongest contrast, for low vision.",
    light: {
      ...LIGHT_STATUS,
      bg: "#ffffff",
      surface: "#ffffff",
      surfaceSubtle: "#f0f0f0",
      text: "#000000",
      textMuted: "#2b2b2b",
      border: "#595959",
      controlBorder: "#000000",
      accent: "#00309c",
      focus: "#000000",
      danger: "#8f0000",
      highlight: "#4a1d96",
      warningBorder: "#6b4700",
      explainBorder: "#4a1d96",
      good: "#0b5a24",
      watch: "#8a3700",
      concern: "#a0001a",
      landBorder: "#4d4700",
      landUnregistered: "#9c3000",
      scrim: "rgb(0 0 0 / 75%)",
    },
    dark: {
      ...DARK_STATUS,
      bg: "#000000",
      surface: "#000000",
      surfaceSubtle: "#1c1c1c",
      text: "#ffffff",
      textMuted: "#e6e6e6",
      border: "#a6a6a6",
      controlBorder: "#ffffff",
      accent: "#ffeb3b",
      focus: "#ffeb3b",
      danger: "#ffb4ab",
      highlight: "#e4ccff",
      warningBg: "#2b2000",
      warningBorder: "#ffd54f",
      explainBg: "#1d1030",
      explainBorder: "#e4ccff",
      good: "#69f0ae",
      watch: "#ffab40",
      concern: "#ff8a80",
      landBg: "#1c1d00",
      landBorder: "#eeff41",
      landUnregistered: "#ffab40",
      scrim: "rgb(0 0 0 / 85%)",
    },
  },
] as const satisfies readonly Theme[];

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME_ID: ThemeId = "scout";

export const isThemeId = (id: unknown): id is ThemeId =>
  THEMES.some((theme) => theme.id === id);

export const themeById = (id: ThemeId): Theme =>
  THEMES.find((theme) => theme.id === id) ?? THEMES[0];

/** `surfaceSubtle` → `--surface-subtle`. */
const propertyOf = (token: string) =>
  `--${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

/**
 * Every theme's palettes as CSS custom properties, each under the
 * `data-theme` and `data-mode` that `applyAppearance` sets on `<html>`.
 */
export const themeStylesheet = (): string =>
  THEMES.flatMap((theme) =>
    (["light", "dark"] as const).map((mode) => {
      const palette: Palette = theme[mode];
      const properties = (Object.entries(palette) as [string, string][])
        .map(([token, value]) => `  ${propertyOf(token)}: ${value};`)
        .join("\n");
      return `:root[data-theme="${theme.id}"][data-mode="${mode}"] {\n  color-scheme: ${mode};\n${properties}\n}`;
    }),
  ).join("\n\n");

/** A `#rrggbb` colour's relative luminance, as WCAG 2.2 defines it. */
const luminance = (hex: string) => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const [r = 0, g = 0, b = 0] = match.slice(1).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The WCAG contrast ratio of two `#rrggbb` colours, from 1 to 21. */
export const contrastRatio = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

/** A ratio as WCAG writes it, rounded down so it never overstates: "4.5:1". */
export const formatRatio = (ratio: number) =>
  `${String(Math.floor(ratio * 10) / 10)}:1`;
