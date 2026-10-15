import { join } from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";
import {
  PLANNING_CONSTRAINT_DATASETS,
  type PlanningConstraintDataset,
} from "@location-scout/shared";

import { LARGE_DOWNLOAD_TIMEOUT_MS } from "./arcgis";
import { downloadFile, quoted, requireColumns } from "./demographics";

/**
 * The Planning Constraints of each Land Coverage Area, from
 * planning.data.gov.uk's bulk files (PRD FR-6.1), clipped to its boundary,
 * so a Land Parcel can be tagged with those it intersects (FR-5.4).
 *
 * Each dataset is published whole for England, afresh most nights, as
 * GeoJSON, CSV and Parquet. The Parquet is read, as DuckDB reads it directly
 * and it is a fifth of the size: 613 MB for the six, where the GeoJSON is
 * 3.4 GB, 2.8 GB of it flood zones. Each is downloaded once a run, however
 * many councils are prepared, and dated by when planning.data.gov.uk last
 * wrote it.
 */
export const PLANNING_CONSTRAINTS = {
  source: "planning.data.gov.uk",
  url: (dataset: PlanningConstraintDataset) =>
    `https://files.planning.data.gov.uk/dataset/${dataset}.parquet`,
  names: {
    "conservation-area": "Conservation areas",
    "listed-building": "Listed buildings",
    "listed-building-outline": "Listed building outlines",
    "article-4-direction-area": "Article 4 direction areas",
    "tree-preservation-zone": "Tree preservation zones",
    "flood-risk-zone": "Flood risk zones",
  } satisfies Record<PlanningConstraintDataset, string>,
  /** The columns every dataset has, which are read. */
  columns: ["entity", "name", "reference", "geometry", "point", "end-date"],
  /** Columns that repeat the shape in another form, which are left out. */
  dropped: ["geojson"],
} as const;

/** The columns the Planning Layer reads from some datasets, which must be there too. */
const DATASET_COLUMNS: Partial<
  Record<PlanningConstraintDataset, readonly string[]>
> = {
  "listed-building": ["listed-building-grade"],
  "flood-risk-zone": ["flood-risk-level"],
};

/** A downloaded dataset: its file, where it came from, and its date. */
export interface DownloadedConstraints {
  dataset: PlanningConstraintDataset;
  name: string;
  file: string;
  url: string;
  sourceDate: string;
}

/**
 * Downloads each dataset into `workDir`, checking its columns. Its date is
 * the day planning.data.gov.uk last wrote the file, or, if it doesn't say,
 * the day it was downloaded.
 */
export const downloadPlanningConstraints = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
  today: string,
  log: (message: string) => void,
): Promise<DownloadedConstraints[]> => {
  const downloaded: DownloadedConstraints[] = [];
  for (const dataset of PLANNING_CONSTRAINT_DATASETS) {
    const name = PLANNING_CONSTRAINTS.names[dataset];
    const url = PLANNING_CONSTRAINTS.url(dataset);
    const file = join(workDir, `${dataset}.parquet`);
    log(
      `Downloading ${name.toLowerCase()} from ${PLANNING_CONSTRAINTS.source}…`,
    );
    const headers = await downloadFile(
      fetchFn,
      PLANNING_CONSTRAINTS.source,
      url,
      file,
      { timeoutMs: LARGE_DOWNLOAD_TIMEOUT_MS },
    );
    await requireColumns(
      connection,
      "read_parquet($1)",
      [file],
      [...PLANNING_CONSTRAINTS.columns, ...(DATASET_COLUMNS[dataset] ?? [])],
      `${PLANNING_CONSTRAINTS.source}'s ${dataset} dataset`,
    );
    const modified = Date.parse(headers.get("last-modified") ?? "");
    downloaded.push({
      dataset,
      name,
      file,
      url,
      sourceDate: Number.isNaN(modified)
        ? today
        : new Date(modified).toISOString().slice(0, 10),
    });
  }
  return downloaded;
};

/** A dataset's table, while its councils are prepared. */
export const constraintsTable = (dataset: PlanningConstraintDataset) =>
  `planning_${dataset.replaceAll("-", "_")}`;

/**
 * Loads a downloaded dataset into its table (`constraintsTable`), keeping
 * the constraints still in force on `today` whose shape reaches into the box
 * from `xmin`, `ymin` to `xmax`, `ymax`. Every column is kept as
 * planning.data.gov.uk names it, but its `geometry`, which is read from WKT,
 * or is the constraint's `point` where it has no shape, as a listed building
 * has none; its `point`, read from WKT too; and their bounds.
 */
export const loadPlanningConstraints = async (
  connection: DuckDBConnection,
  { dataset, file }: DownloadedConstraints,
  box: { xmin: number; ymin: number; xmax: number; ymax: number },
  today: string,
) => {
  const dropped = [...PLANNING_CONSTRAINTS.dropped, "geometry", "point"]
    .map(quoted)
    .join(", ");
  await connection.run(
    `CREATE OR REPLACE TABLE ${constraintsTable(dataset)} AS
       WITH read AS (
         SELECT * EXCLUDE (${dropped}),
           ST_GeomFromText(NULLIF(point, '')) AS point,
           coalesce(ST_GeomFromText(NULLIF(geometry, '')), ST_GeomFromText(NULLIF(point, ''))) AS geometry
         FROM read_parquet($1)
         WHERE coalesce("end-date", '') = '' OR "end-date" > $2
       )
       SELECT * EXCLUDE (geometry),
         ST_XMin(geometry) AS xmin, ST_YMin(geometry) AS ymin,
         ST_XMax(geometry) AS xmax, ST_YMax(geometry) AS ymax,
         geometry
       FROM read
       WHERE geometry IS NOT NULL
         AND ST_XMax(geometry) >= $3 AND ST_XMin(geometry) <= $4
         AND ST_YMax(geometry) >= $5 AND ST_YMin(geometry) <= $6`,
    [file, today, box.xmin, box.xmax, box.ymin, box.ymax],
  );
};
