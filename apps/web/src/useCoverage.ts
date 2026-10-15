import { useEffect, useState } from "react";

import type { CoverageResponse } from "@location-scout/shared";

import { getCoverage } from "./api";

/** What has been prepared, that it is on its way, or that it failed to load. */
export type CoverageState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ok"; coverage: CoverageResponse };

/**
 * Loads once what `pnpm data:prepare` has prepared, for the dates of the
 * Land Coverage Areas and the datasets (PRD FR-6.5).
 */
export const useCoverage = () => {
  const [state, setState] = useState<CoverageState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getCoverage(controller.signal).then(
      (coverage) => {
        setState(
          coverage.ok
            ? { status: "ok", coverage: coverage.body }
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
