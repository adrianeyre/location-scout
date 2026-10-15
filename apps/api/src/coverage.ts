import {
  INSPIRE_INDEX_POLYGONS_DATASET,
  type CoverageResponse,
  type ManifestDataset,
  type PreparedDataset,
} from "@location-scout/shared";

import { NotPreparedError } from "./sources/data-source";
import type { PreparedData } from "./sources/prepared-data";

/** A dataset as the API describes it: its file is the backend's business. */
const described = ({
  id,
  name,
  source,
  sourceUrl,
  sourceDate,
  preparedAt,
  attribution,
}: ManifestDataset): PreparedDataset => ({
  id,
  name,
  source,
  sourceUrl,
  sourceDate,
  preparedAt,
  attribution: attribution ?? null,
});

/**
 * A Land Coverage Area's INSPIRE Index Polygons older than this many months
 * are out of date, and running `pnpm data:prepare` again is suggested (PRD
 * FR-6.5). HM Land Registry publishes them monthly.
 */
export const INSPIRE_OUT_OF_DATE_MONTHS = 2;

/** An ISO 8601 date (or month, taken as its first day) `months` later, on the same day of the month or its last. */
export const monthsAfter = (date: string, months: number) => {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
};

/**
 * Whether a Land Coverage Area's INSPIRE Index Polygons were published more
 * than `INSPIRE_OUT_OF_DATE_MONTHS` before `today`, or aren't prepared, as
 * in a Land Coverage Area prepared before they were.
 */
export const isOutOfDate = (
  datasets: readonly Pick<ManifestDataset, "id" | "sourceDate">[],
  today: string,
) => {
  const inspire = datasets.find(
    ({ id }) => id === INSPIRE_INDEX_POLYGONS_DATASET,
  );
  return (
    !inspire ||
    today > monthsAfter(inspire.sourceDate, INSPIRE_OUT_OF_DATE_MONTHS)
  );
};

/**
 * The prepared datasets and Land Coverage Areas, with their dates, from the
 * manifest `pnpm data:prepare` wrote (PRD FR-6.5), and whether each Land
 * Coverage Area's INSPIRE Index Polygons are out of date on `today`, an ISO
 * 8601 date. It never throws: before `pnpm data:prepare` it is
 * `not-prepared`, and if the manifest can't be read it is `unavailable`.
 */
export const loadCoverage = async (
  prepared: PreparedData,
  today: string,
): Promise<CoverageResponse> => {
  try {
    const manifest = await prepared.manifest();
    return {
      status: "ok",
      preparedAt: manifest.preparedAt,
      datasets: manifest.datasets.map(described),
      landCoverageAreas: manifest.landCoverageAreas.map(
        ({ council, datasets }) => ({
          council,
          datasets: datasets.map(described),
          outOfDate: isOutOfDate(datasets, today),
        }),
      ),
    };
  } catch (error) {
    const notPrepared = error instanceof NotPreparedError;
    if (!notPrepared) console.error("The prepared data is unavailable", error);
    return {
      status: notPrepared ? "not-prepared" : "unavailable",
      preparedAt: null,
      datasets: [],
      landCoverageAreas: [],
    };
  }
};
