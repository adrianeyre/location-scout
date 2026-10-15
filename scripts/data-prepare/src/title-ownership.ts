import type { DuckDBConnection } from "@duckdb/node-api";
import {
  CCOD_DATASET,
  PUBLIC_BODY_PROPRIETORSHIP_CATEGORIES,
  type Council,
} from "@location-scout/shared";

import { sqlString } from "./duckdb";
import { INSPIRE } from "./inspire";
import {
  TRUSTED_STEPS,
  knownNames,
  loadOsmAddresses,
  loadTitles,
  matchTitles,
  registerNormalisers,
  type Title,
} from "./title-matching";

/**
 * A Land Coverage Area's companies' and councils' titles, from CCOD and
 * OCOD, matched to its INSPIRE Index Polygons by their addresses (PRD
 * FR-5.4a), as OQ-7's spike matched them
 * (docs/spikes/oq-7-ccod-ocod-title-matching.md). Only a title its house
 * number and street, or the building it names, places on exactly one polygon
 * is matched (`TRUSTED_STEPS`): those matches were right, or within 25 m, in
 * every case the spike could check. Land described only by its street, and
 * a postcode's point, place a title on the wrong polygon too often, so they
 * match nothing, and most titles aren't matched.
 */

/** The tables matching leaves behind, which are dropped once it is done. */
const MATCHING_TABLES = [
  "council_titles",
  "inspire",
  "titles",
  "title_candidates",
  "title_matches",
  "osm_addresses",
  "osm_named",
  "osm_streets",
  "osm_places",
];

/**
 * Matches the council's freehold titles in `company_titles` (its Districts',
 * by `title_districts`) to its INSPIRE Index Polygons in
 * `inspire_index_polygons`, reading OpenStreetMap's addresses, names and
 * streets from the extracts `pbfs` and each postcode's point from
 * `postcodes`. Writes `inspire_titles`: each title matched to one polygon,
 * with its `inspire_id`, `title_number`, `property_address`,
 * `proprietorship_category`, `ownership_category` (`company` or
 * `council-or-public-body`), `dataset`, `source_date` and `matched_by`.
 *
 * Returns how many freehold titles the council has and how many were
 * matched. A council with none has no Ownership Categories.
 */
export const matchCouncilTitles = async (
  connection: DuckDBConnection,
  council: Council,
  pbfs: readonly string[],
) => {
  await registerNormalisers(connection);
  const code = sqlString(council.code);
  // A title held by a UK company and an overseas one is in both datasets:
  // it is taken from CCOD.
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE council_titles AS
       SELECT DISTINCT ON (t.title_number) t.*
       FROM company_titles t JOIN title_districts d USING (district)
       WHERE d.code = ${code} AND lower(t.tenure) = 'freehold'
       ORDER BY t.title_number, t.dataset`,
  );
  const rows = (
    await connection.runAndReadAll(
      `SELECT title_number, tenure, property_address, postcode, proprietorship_category
       FROM council_titles ORDER BY title_number`,
    )
  ).getRowObjectsJson();
  const titles: Title[] = rows.flatMap((row) =>
    typeof row.title_number === "string" &&
    typeof row.property_address === "string"
      ? [
          {
            titleNumber: row.title_number,
            tenure: typeof row.tenure === "string" ? row.tenure : "",
            propertyAddress: row.property_address,
            postcode: typeof row.postcode === "string" ? row.postcode : null,
            category:
              typeof row.proprietorship_category === "string"
                ? row.proprietorship_category
                : "",
            truth: null,
          },
        ]
      : [],
  );
  await connection.run(
    `CREATE OR REPLACE TABLE inspire_titles (
       inspire_id BIGINT, title_number VARCHAR, property_address VARCHAR,
       proprietorship_category VARCHAR, ownership_category VARCHAR,
       dataset VARCHAR, source_date VARCHAR, matched_by VARCHAR)`,
  );
  if (titles.length === 0) {
    await connection.run("DROP TABLE council_titles");
    return { titles: 0, matched: 0 };
  }

  // The polygons, as published, in British National Grid.
  await connection.run(
    `CREATE OR REPLACE TABLE inspire AS
       SELECT inspire_id,
         ST_Transform(geometry, 'EPSG:4326', ${sqlString(INSPIRE.crs)}, always_xy := true) AS geometry
       FROM inspire_index_polygons`,
  );
  const [box] = (
    await connection.runAndReadAll(
      `SELECT xmin, ymin, xmax, ymax FROM land_areas WHERE code = ${code}`,
    )
  ).getRowObjectsJson();
  await loadOsmAddresses(connection, pbfs, [
    Number(box?.xmin),
    Number(box?.ymin),
    Number(box?.xmax),
    Number(box?.ymax),
  ]);
  await loadTitles(connection, titles, await knownNames(connection));
  await matchTitles(connection);

  const publicBody = PUBLIC_BODY_PROPRIETORSHIP_CATEGORIES.map((category) =>
    sqlString(category.toLowerCase()),
  ).join(", ");
  await connection.run(
    `INSERT INTO inspire_titles
       SELECT m.inspire_id, m.title_number, t.property_address,
         t.proprietorship_category,
         CASE WHEN t.dataset = ${sqlString(CCOD_DATASET)}
             AND lower(t.proprietorship_category) IN (${publicBody})
           THEN 'council-or-public-body' ELSE 'company' END,
         t.dataset, t.source_date, m.step
       FROM title_matches m JOIN council_titles t USING (title_number)
       WHERE m.candidates = 1 AND m.step IN (${TRUSTED_STEPS.map(sqlString).join(", ")})
       ORDER BY m.inspire_id, m.title_number`,
  );
  const [matched] = (
    await connection.runAndReadAll("SELECT count(*) AS n FROM inspire_titles")
  ).getRowObjectsJson();
  for (const table of MATCHING_TABLES) {
    await connection.run(`DROP TABLE IF EXISTS ${table}`);
  }
  return { titles: titles.length, matched: Number(matched?.n ?? 0) };
};
