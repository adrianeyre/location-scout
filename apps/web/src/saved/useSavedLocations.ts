import { useCallback, useEffect, useState } from "react";

import {
  SAVED_LOCATIONS_KEY,
  loadSavedLocations,
  mergeSavedLocations,
  readSavedLocations,
  storeSavedLocations,
  tidyName,
  usableStorage,
  type SavedLocation,
  type SavedView,
} from "./saved-locations";

/** What came of importing a file, to tell the user. */
export type ImportResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; message: string };

/**
 * The Saved Locations, or that saving is off because the browser won't let
 * the page keep anything (PRD FR-7.1).
 */
export type SavedLocationsState =
  | { status: "off" }
  | {
      status: "on";
      savedLocations: SavedLocation[];
      /** Set when the browser refused the last change, which was not made. */
      refused: boolean;
    };

/** The browser's local storage, which merely touching throws when site data is blocked. */
const localStorageOf = () => window.localStorage;

/**
 * A new Saved Location's id: random, so ids from other browsers don't clash
 * on import. `crypto.randomUUID` would do, but only on a secure origin, and
 * the dev server may be opened from another machine over plain HTTP.
 */
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

/**
 * The Saved Locations kept in this browser's local storage, and what can be
 * done with them: save, rename, delete and import (PRD FR-7.1, FR-7.2). Each
 * change is written at once, so it survives a reload, and one made in another
 * tab is followed here. If storage can't be used, saving is off and nothing
 * throws.
 */
export const useSavedLocations = (
  storage: () => Storage | null | undefined = localStorageOf,
) => {
  const [store] = useState(() => usableStorage(storage));
  const [state, setState] = useState<SavedLocationsState>(() =>
    store
      ? {
          status: "on",
          savedLocations: loadSavedLocations(store),
          refused: false,
        }
      : { status: "off" },
  );

  // Another tab saved, renamed or deleted one.
  useEffect(() => {
    if (!store) return;
    const follow = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SAVED_LOCATIONS_KEY) return;
      setState({
        status: "on",
        savedLocations: loadSavedLocations(store),
        refused: false,
      });
    };
    window.addEventListener("storage", follow);
    return () => {
      window.removeEventListener("storage", follow);
    };
  }, [store]);

  /**
   * Makes a change to the Saved Locations, if the browser keeps it. If it
   * refuses, as a full one does, nothing changes and the user is told.
   */
  const change = useCallback(
    (next: (current: SavedLocation[]) => SavedLocation[]): boolean => {
      if (!store) return false;
      const current = loadSavedLocations(store);
      const changed = next(current);
      const kept = storeSavedLocations(store, changed);
      setState({
        status: "on",
        savedLocations: kept ? changed : current,
        refused: !kept,
      });
      return kept;
    },
    [store],
  );

  const save = useCallback(
    (name: string, view: SavedView): boolean => {
      const tidied = tidyName(name);
      if (tidied === "") return false;
      return change((current) => [
        ...current,
        {
          id: newId(),
          name: tidied,
          savedAt: new Date().toISOString(),
          ...view,
        },
      ]);
    },
    [change],
  );

  const rename = useCallback(
    (id: string, name: string): boolean => {
      const tidied = tidyName(name);
      if (tidied === "") return false;
      return change((current) =>
        current.map((saved) =>
          saved.id === id ? { ...saved, name: tidied } : saved,
        ),
      );
    },
    [change],
  );

  const remove = useCallback(
    (id: string): boolean =>
      change((current) => current.filter((saved) => saved.id !== id)),
    [change],
  );

  /** Adds the Saved Locations in an exported file's text. */
  const importText = useCallback(
    (text: string): ImportResult => {
      const read = readSavedLocations(text);
      if (!read.ok) return read;
      const kept = change((current) =>
        mergeSavedLocations(current, read.savedLocations),
      );
      return kept
        ? {
            ok: true,
            imported: read.savedLocations.length,
            skipped: read.skipped,
          }
        : {
            ok: false,
            message:
              "The browser refused to keep them: its storage may be full.",
          };
    },
    [change],
  );

  return { state, save, rename, remove, importText };
};
