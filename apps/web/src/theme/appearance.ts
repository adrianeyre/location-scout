import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  DEFAULT_THEME_ID,
  isThemeId,
  themeById,
  type ThemeId,
  type ThemeMode,
} from "./themes";

/** Light, dark, or whichever the device is set to. */
export type ModePreference = ThemeMode | "system";

export const MODE_PREFERENCES: readonly {
  id: ModePreference;
  name: string;
}[] = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "system", name: "System" },
];

export interface Appearance {
  mode: ModePreference;
  theme: ThemeId;
}

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system",
  theme: DEFAULT_THEME_ID,
};

/**
 * Where the choice is kept in the browser. `index.html` reads the same key
 * before the page is drawn, so it never flashes the wrong colours.
 */
export const APPEARANCE_STORAGE_KEY = "location-scout:appearance";

const DARK_QUERY = "(prefers-color-scheme: dark)";

const isModePreference = (mode: unknown): mode is ModePreference =>
  MODE_PREFERENCES.some(({ id }) => id === mode);

/** The choice kept last time, or the default if there is none or storage is blocked. */
export const readAppearance = (): Appearance => {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    const kept: unknown = raw ? JSON.parse(raw) : null;
    if (typeof kept !== "object" || kept === null) return DEFAULT_APPEARANCE;
    const { mode, theme } = kept as Record<string, unknown>;
    return {
      mode: isModePreference(mode) ? mode : DEFAULT_APPEARANCE.mode,
      theme: isThemeId(theme) ? theme : DEFAULT_APPEARANCE.theme,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
};

const writeAppearance = (appearance: Appearance) => {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // Storage blocked, as in some private windows: the choice lasts this visit.
  }
};

const systemPrefersDark = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia(DARK_QUERY).matches;

/** The mode drawn: the one chosen, or the device's for "system". */
export const resolveMode = (mode: ModePreference): ThemeMode =>
  mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;

/** Puts the palette on `<html>`, and the browser's own toolbar colour to match. */
export const applyAppearance = ({ mode, theme }: Appearance) => {
  const resolved = resolveMode(mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.mode = resolved;
  const themeColour = themeById(theme)[resolved].bg;
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    meta.content = themeColour;
    meta.removeAttribute("media");
  }
};

/** Whether the device is set to dark, followed as it changes. */
const subscribeToSystemMode = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
};

/**
 * The appearance chosen in Settings, kept in the browser, applied to the
 * page, and followed as the device switches between light and dark while
 * "System" is chosen.
 */
export const useAppearance = () => {
  const [appearance, setAppearance] = useState(readAppearance);
  const systemDark = useSyncExternalStore(
    subscribeToSystemMode,
    systemPrefersDark,
  );
  const resolved: ThemeMode =
    appearance.mode === "system"
      ? systemDark
        ? "dark"
        : "light"
      : appearance.mode;

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance, systemDark]);

  const change = useCallback((next: Partial<Appearance>) => {
    setAppearance((current) => {
      const updated = { ...current, ...next };
      writeAppearance(updated);
      return updated;
    });
  }, []);

  return { appearance, resolved, change };
};
