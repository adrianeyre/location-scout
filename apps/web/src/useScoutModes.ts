import { useEffect, useState } from "react";

import type { ScoutMode } from "@location-scout/shared";

import { getModes } from "./api";

/** The Scout Modes, that they are on their way, or that they failed to load. */
export type ScoutModesState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ok"; modes: ScoutMode[] };

/**
 * Loads the Scout Modes once. They are config in the backend (PRD FR-4.5), so
 * the frontend knows only the ones it is sent.
 */
export const useScoutModes = () => {
  const [state, setState] = useState<ScoutModesState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getModes(controller.signal).then(
      (modes) => {
        setState(
          modes.ok
            ? { status: "ok", modes: modes.body.modes }
            : { status: "unavailable" },
        );
      },
      // Only an abort throws: the page has gone.
      () => undefined,
    );
    return () => {
      controller.abort();
    };
  }, []);

  return state;
};
