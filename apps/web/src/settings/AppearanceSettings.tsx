import { MODE_PREFERENCES, type Appearance } from "../theme/appearance";
import {
  THEMES,
  contrastRatio,
  formatRatio,
  type Palette,
  type ThemeMode,
} from "../theme/themes";

/** The contrasts each theme card lists, for the mode being drawn. */
const MEASURED: { name: string; fg: keyof Palette; bg: keyof Palette }[] = [
  { name: "Text", fg: "text", bg: "bg" },
  { name: "Secondary text", fg: "textMuted", bg: "bg" },
  { name: "Links", fg: "accent", bg: "bg" },
  { name: "Focus outline", fg: "focus", bg: "bg" },
];

/** The swatches each theme card shows, as decoration beside its contrasts. */
const SWATCHES: (keyof Palette)[] = ["bg", "surfaceSubtle", "text", "accent"];

export interface AppearanceSettingsProps {
  appearance: Appearance;
  /** The mode drawn now: the one chosen, or the device's for "System". */
  resolved: ThemeMode;
  onChange: (next: Partial<Appearance>) => void;
}

/**
 * Settings' appearance choices: light, dark or system mode, and one of six
 * colour themes, each card listing its measured contrast ratios.
 */
export const AppearanceSettings = ({
  appearance,
  resolved,
  onChange,
}: AppearanceSettingsProps) => (
  <div className="appearance-settings">
    <fieldset className="mode-choice">
      <legend>Mode</legend>
      <div className="mode-options">
        {MODE_PREFERENCES.map(({ id, name }) => (
          <label key={id} className="choice">
            <input
              type="radio"
              name="appearance-mode"
              value={id}
              checked={appearance.mode === id}
              onChange={() => {
                onChange({ mode: id });
              }}
            />
            {name}
          </label>
        ))}
      </div>
      <p className="settings-hint">
        {appearance.mode === "system"
          ? `Following your device, which is set to ${resolved} now.`
          : `Always ${resolved}, whatever your device is set to.`}
      </p>
    </fieldset>

    <fieldset className="theme-choice">
      <legend>Theme</legend>
      <p className="settings-hint">
        Every theme meets WCAG 2.2 AA in light and dark. Ratios below are for{" "}
        {resolved} mode; AA needs 4.5:1 for text and 3:1 for focus outlines.
      </p>
      <ul className="theme-options">
        {THEMES.map((theme) => {
          const palette: Palette = theme[resolved];
          const descriptionId = `theme-${theme.id}-description`;
          return (
            <li key={theme.id}>
              <label className="theme-option">
                <input
                  type="radio"
                  name="appearance-theme"
                  value={theme.id}
                  checked={appearance.theme === theme.id}
                  aria-describedby={descriptionId}
                  onChange={() => {
                    onChange({ theme: theme.id });
                  }}
                />
                <span className="theme-option-name">{theme.name}</span>
                <span className="theme-swatches" aria-hidden="true">
                  {SWATCHES.map((token) => (
                    <span
                      key={token}
                      className="theme-swatch"
                      style={{ background: palette[token] }}
                    />
                  ))}
                </span>
              </label>
              <div id={descriptionId} className="theme-option-details">
                <p>{theme.description}</p>
                <dl className="theme-contrasts">
                  {MEASURED.map(({ name, fg, bg }) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>
                        {formatRatio(contrastRatio(palette[fg], palette[bg]))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  </div>
);
