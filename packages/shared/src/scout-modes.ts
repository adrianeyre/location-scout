/**
 * A Scout Mode's id, such as `buy-to-let`: lower-case words joined by
 * hyphens. The Scout Modes are config (PRD FR-4.5), so any id the backend's
 * config gives is one; `GET /api/modes` lists them.
 */
export type ScoutModeId = string;

export const SCOUT_MODE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isScoutModeId = (value: unknown): value is ScoutModeId =>
  typeof value === "string" && SCOUT_MODE_ID_PATTERN.test(value);

/** General is the Scout Mode until the user picks another (FR-4.1). */
export const DEFAULT_SCOUT_MODE: ScoutModeId = "general";
