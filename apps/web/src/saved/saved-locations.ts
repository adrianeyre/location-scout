import {
  CATEGORY_IDS,
  isLocation,
  isScoutModeId,
  isSearchRadiusMiles,
  type Location,
  type ScoutModeId,
  type SearchRadiusMiles,
} from "@location-scout/shared";

import type { ScoutModesState } from "../useScoutModes";
import { foundFrom, type Found } from "../useSearchArea";
import { parseWeights, type CustomWeights } from "../weights";

/*
 * Saved Locations (PRD FR-7.1, FR-7.2): a Location, its Search Radius, the
 * Scout Mode and the user's own weights for it, kept under a name in the
 * browser's local storage. There are no accounts and nothing is sent to the
 * backend (ADR 0002): they stay in this browser unless exported as JSON.
 */

/** What a Saved Location opens: the view it was saved from. */
export interface SavedView {
  location: Location;
  radius: SearchRadiusMiles;
  mode: ScoutModeId;
  /** The user's own weights for the Scout Mode, or `null` for its defaults. */
  weights: CustomWeights | null;
  /**
   * The postcode or address the Location was found from, or `null` for a map
   * click, so opening it names the same local geography (PRD FR-1.8).
   */
  found: Found | null;
}

export interface SavedLocation extends SavedView {
  /** Unique among the Saved Locations, and kept through export and import. */
  id: string;
  name: string;
  /** When it was saved, as an ISO 8601 timestamp. */
  savedAt: string;
}

/** The local storage key Saved Locations are kept under. */
export const SAVED_LOCATIONS_KEY = "location-scout.saved-locations";

/** What an exported file says it is, so importing can tell it from other JSON. */
export const SAVED_LOCATIONS_FORMAT = "location-scout.saved-locations";
export const SAVED_LOCATIONS_VERSION = 1;

/** The longest name kept, in characters. */
export const NAME_MAX_LENGTH = 100;

/** An exported file, and what local storage holds. */
export interface SavedLocationsFile {
  format: typeof SAVED_LOCATIONS_FORMAT;
  version: typeof SAVED_LOCATIONS_VERSION;
  savedLocations: SavedLocation[];
}

/** A name as it is kept: spaces trimmed and runs of them made one, and cut to its longest. */
export const tidyName = (name: string) =>
  name.trim().replaceAll(/\s+/g, " ").slice(0, NAME_MAX_LENGTH).trim();

/** Weights as saved, `{ "safety": 40, … }`, or `null` unless they total 100%. */
const weightsFrom = (value: unknown): CustomWeights | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.some(([, weight]) => !Number.isInteger(weight))) return undefined;
  // Read as the URL's weights are, so both refuse the same ones.
  const weights = parseWeights(
    entries.map(([id, weight]) => `${id}:${String(weight)}`).join(","),
  );
  return weights ?? undefined;
};

/** One Saved Location, or `null` if anything in it is missing or invalid. */
const savedLocationFrom = (value: unknown): SavedLocation | null => {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const { id, name, savedAt, location, radius, mode, found } = record;
  const weights = weightsFrom(record.weights ?? null);
  const tidied = typeof name === "string" ? tidyName(name) : "";
  if (
    typeof id !== "string" ||
    id === "" ||
    tidied === "" ||
    typeof savedAt !== "string" ||
    Number.isNaN(Date.parse(savedAt)) ||
    !isLocation(location) ||
    !isSearchRadiusMiles(radius) ||
    !isScoutModeId(mode) ||
    weights === undefined
  ) {
    return null;
  }
  return {
    id,
    name: tidied,
    savedAt,
    location: { lat: location.lat, lng: location.lng },
    radius,
    mode,
    weights,
    found: found === undefined || found === null ? null : foundFrom({ found }),
  };
};

/** What reading a file of Saved Locations found. */
export type ReadSavedLocations =
  | { ok: true; savedLocations: SavedLocation[]; skipped: number }
  | { ok: false; message: string };

/**
 * Reads Saved Locations from JSON, as exported or as local storage holds
 * them. Any that are invalid are skipped and counted, as is any with the id
 * of one before it.
 */
export const readSavedLocations = (text: string): ReadSavedLocations => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "It isn't a JSON file." };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("format" in parsed) ||
    parsed.format !== SAVED_LOCATIONS_FORMAT ||
    !("savedLocations" in parsed) ||
    !Array.isArray(parsed.savedLocations)
  ) {
    return {
      ok: false,
      message: "It isn't a file of Saved Locations exported by Location Scout.",
    };
  }
  if (!("version" in parsed) || parsed.version !== SAVED_LOCATIONS_VERSION) {
    return {
      ok: false,
      message:
        "It was exported by a version of Location Scout this one can't read.",
    };
  }
  const savedLocations: SavedLocation[] = [];
  const ids = new Set<string>();
  for (const value of parsed.savedLocations as unknown[]) {
    const saved = savedLocationFrom(value);
    if (saved && !ids.has(saved.id)) {
      ids.add(saved.id);
      savedLocations.push(saved);
    }
  }
  return {
    ok: true,
    savedLocations,
    skipped: parsed.savedLocations.length - savedLocations.length,
  };
};

/** Saved Locations as JSON, to export or keep in local storage. */
export const writeSavedLocations = (
  savedLocations: readonly SavedLocation[],
): string => {
  const file: SavedLocationsFile = {
    format: SAVED_LOCATIONS_FORMAT,
    version: SAVED_LOCATIONS_VERSION,
    savedLocations: savedLocations.map((saved) => ({
      id: saved.id,
      name: saved.name,
      savedAt: saved.savedAt,
      location: saved.location,
      radius: saved.radius,
      mode: saved.mode,
      // In `CATEGORY_IDS` order, as the URL gives them.
      weights: saved.weights && orderedWeights(saved.weights),
      found: saved.found,
    })),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
};

const orderedWeights = (weights: CustomWeights): CustomWeights =>
  Object.fromEntries(
    CATEGORY_IDS.flatMap((id) =>
      weights[id] === undefined ? [] : [[id, weights[id]]],
    ),
  );

/**
 * Imported Saved Locations added to those already saved. One with the id of
 * one already saved, as when a file exported from this browser is imported
 * back, replaces it where it is; the rest are added at the end.
 */
export const mergeSavedLocations = (
  saved: readonly SavedLocation[],
  imported: readonly SavedLocation[],
): SavedLocation[] => {
  const byId = new Map(imported.map((each) => [each.id, each]));
  const kept = saved.map((each) => byId.get(each.id) ?? each);
  const keptIds = new Set(saved.map(({ id }) => id));
  return [...kept, ...imported.filter(({ id }) => !keptIds.has(id))];
};

/** The name of an exported file, with the day it was exported. */
export const exportFileName = (now: Date) =>
  `location-scout-saved-locations-${now.toISOString().slice(0, 10)}.json`;

/**
 * The browser's local storage, if it can be written to, or `null`. It may not
 * be: a browser blocking site data throws as soon as it is touched, and a full
 * one, or one in some private windows, refuses anything written to it.
 */
export const usableStorage = (
  storage: () => Storage | null | undefined,
): Storage | null => {
  try {
    const store = storage();
    if (!store) return null;
    const probe = `${SAVED_LOCATIONS_KEY}.probe`;
    store.setItem(probe, probe);
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
};

/**
 * The Saved Locations kept in `storage`. Any it holds that can't be read are
 * left out, and none at all if it holds something else.
 */
export const loadSavedLocations = (storage: Storage): SavedLocation[] => {
  try {
    const text = storage.getItem(SAVED_LOCATIONS_KEY);
    if (text === null) return [];
    const read = readSavedLocations(text);
    return read.ok ? read.savedLocations : [];
  } catch {
    return [];
  }
};

/** Keeps Saved Locations in `storage`, returning whether it took them. */
export const storeSavedLocations = (
  storage: Storage,
  savedLocations: readonly SavedLocation[],
): boolean => {
  try {
    storage.setItem(SAVED_LOCATIONS_KEY, writeSavedLocations(savedLocations));
    return true;
  } catch {
    return false;
  }
};

/** "53.123664, -1.264078": a Location to the precision the URL keeps. */
const formatLocation = ({ lat, lng }: SavedView["location"]) =>
  `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

/** A Saved Location's Search Area, in words: "0.5 mile around NG17 1AA". */
export const describeSearchArea = ({
  location,
  radius,
  found,
}: Pick<SavedView, "location" | "radius" | "found">) =>
  `${String(radius)} mile around ${found?.label ?? formatLocation(location)}`;

/**
 * What a Saved Location keeps, in words: "0.5 mile around NG17 1AA, in the
 * General Scout Mode, with its default weights".
 */
export const describeView = (view: SavedView, modes: ScoutModesState) => {
  const { mode, weights } = view;
  const modeName =
    (modes.status === "ok"
      ? modes.modes.find(({ id }) => id === mode)?.name
      : undefined) ?? mode;
  return `${describeSearchArea(view)}, in the ${modeName} Scout Mode, with ${weights ? "your own weights" : "its default weights"}`;
};
