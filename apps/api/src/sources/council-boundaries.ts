import {
  COUNCIL_BOUNDARIES_DATASET,
  type Council,
  type CouncilReport,
  type Location,
} from "@location-scout/shared";

import {
  NotPreparedError,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";
import { RUN_DATA_PREPARE, type PreparedData } from "./prepared-data";

/**
 * The council boundaries ONS Open Geography publishes, as `pnpm data:prepare`
 * prepared them (PRD FR-6.1, FR-6.3).
 */
export const onsCouncilBoundaries: DataSource = {
  id: "ons-council-boundaries",
  name: "ONS Open Geography",
  // Read afresh every time, which takes milliseconds, so a re-run of
  // `pnpm data:prepare` shows at once.
  cacheTtlMs: 0,
};

/** The council a Location is in, and whether it is a Land Coverage Area. */
export interface CouncilAt {
  council: Council | null;
  inLandCoverageArea: boolean;
}

/**
 * Answers which council a Location is in from the prepared council
 * boundaries, and whether that council is a Land Coverage Area. Its period is
 * the date the boundaries are as at. Before `pnpm data:prepare` it is
 * `not-prepared`.
 */
export const councilAt = (
  { lat, lng }: Location,
  callSource: CallSource,
  prepared: PreparedData,
): Promise<SourceResult<CouncilAt>> =>
  callSource(
    onsCouncilBoundaries,
    `${String(lat)},${String(lng)}`,
    async () => {
      const manifest = await prepared.manifest();
      const boundaries = manifest.datasets.find(
        ({ id }) => id === COUNCIL_BOUNDARIES_DATASET,
      );
      if (!boundaries) {
        throw new NotPreparedError(
          `The manifest lists no council boundaries. ${RUN_DATA_PREPARE}`,
        );
      }
      // A point is (x, y): longitude first.
      const [found] = await prepared.query(
        boundaries,
        `SELECT code, name FROM read_parquet($1)
       WHERE ST_Contains(geometry, ST_Point($2, $3))
       ORDER BY code
       LIMIT 1`,
        [lng, lat],
      );
      const council =
        typeof found?.code === "string" && typeof found.name === "string"
          ? { code: found.code, name: found.name }
          : null;
      return {
        data: {
          council,
          inLandCoverageArea: manifest.landCoverageAreas.some(
            (area) => area.council.code === council?.code,
          ),
        },
        period: { from: boundaries.sourceDate, to: boundaries.sourceDate },
      };
    },
  );

/** How the council a Location is in is reported in its Search Area. */
export const councilReport = (
  result: SourceResult<CouncilAt>,
): CouncilReport =>
  result.status === "ok"
    ? { status: "ok", ...result.data }
    : { status: result.status, council: null, inLandCoverageArea: false };
