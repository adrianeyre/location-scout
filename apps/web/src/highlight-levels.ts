import type { HighlightLevel } from "@location-scout/shared";

/**
 * How each level reads: in words, beside the shape `LevelIcon` draws for it,
 * never by colour alone (PRD FR-9.5).
 */
export const HIGHLIGHT_LEVEL_LABELS: Readonly<
  Record<HighlightLevel, { name: string }>
> = {
  good: { name: "Good" },
  watch: { name: "Watch" },
  concern: { name: "Concern" },
};
