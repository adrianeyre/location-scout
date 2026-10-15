import { describe, expect, it } from "vitest";

import {
  THEMES,
  contrastRatio,
  formatRatio,
  themeStylesheet,
  type Palette,
} from "./themes";

type Token = keyof Palette;

/** WCAG 2.2 SC 1.4.3: text, and the backgrounds it is drawn on. */
const TEXT_PAIRS: [Token, Token[]][] = [
  [
    "text",
    ["bg", "surface", "surfaceSubtle", "warningBg", "explainBg", "landBg"],
  ],
  ["textMuted", ["bg", "surface", "surfaceSubtle", "warningBg", "explainBg"]],
  ["accent", ["bg", "surface", "surfaceSubtle"]],
  ["danger", ["bg", "surface", "surfaceSubtle"]],
  ["highlight", ["bg", "surface", "surfaceSubtle", "explainBg"]],
];

/** WCAG 2.2 SC 1.4.11 and 2.4.7: focus outlines, control edges and coloured edges. */
const NON_TEXT_PAIRS: [Token, Token[]][] = [
  ["focus", ["bg", "surface", "surfaceSubtle"]],
  ["controlBorder", ["bg", "surface"]],
  ["good", ["surface"]],
  ["watch", ["surface"]],
  ["concern", ["surface"]],
  ["warningBorder", ["warningBg"]],
  ["explainBorder", ["explainBg"]],
  ["landBorder", ["landBg", "surface"]],
  ["landUnregistered", ["surface"]],
];

const palettes = THEMES.flatMap((theme) =>
  (["light", "dark"] as const).map((mode) => ({
    name: `${theme.name} ${mode}`,
    palette: theme[mode],
  })),
);

describe("contrastRatio", () => {
  it("gives 21:1 for black on white and 1:1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21);
    expect(contrastRatio("#0550ae", "#0550ae")).toBe(1);
  });

  it("rounds down when formatted, so 4.49 never reads as 4.5", () => {
    expect(formatRatio(4.49)).toBe("4.4:1");
    expect(formatRatio(21)).toBe("21:1");
  });
});

describe("THEMES", () => {
  it("has six themes, each with a unique id", () => {
    expect(THEMES).toHaveLength(6);
    expect(new Set(THEMES.map(({ id }) => id)).size).toBe(6);
  });

  describe.each(palettes)("$name", ({ palette }) => {
    it.each(TEXT_PAIRS)(
      "%s is at least 4.5:1 on its backgrounds",
      (fg, bgs) => {
        for (const bg of bgs) {
          expect(
            contrastRatio(palette[fg], palette[bg]),
            `${fg} on ${bg}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      },
    );

    it.each(NON_TEXT_PAIRS)(
      "%s is at least 3:1 on its backgrounds",
      (fg, bgs) => {
        for (const bg of bgs) {
          expect(
            contrastRatio(palette[fg], palette[bg]),
            `${fg} on ${bg}`,
          ).toBeGreaterThanOrEqual(3);
        }
      },
    );
  });
});

describe("themeStylesheet", () => {
  it("gives every palette its custom properties under its theme and mode", () => {
    const css = themeStylesheet();
    expect(css).toContain(':root[data-theme="scout"][data-mode="dark"] {');
    expect(css).toContain("--surface-subtle: #21262d;");
    expect(css.match(/\{/g)).toHaveLength(12);
  });
});
