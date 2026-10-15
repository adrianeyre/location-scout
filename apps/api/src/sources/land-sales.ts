import {
  NEARBY_LAND_SALES_RULES,
  LAND_PARCELS_DATASET,
  POSTCODES_DATASET,
  type Council,
  type DataPeriod,
  type LandParcel,
  type LandSale,
  type Location,
  type ManifestDataset,
  type NearbyLandSales,
  type SourceReport,
  type SourceStatus,
} from "@location-scout/shared";
import type { Json } from "@duckdb/node-api";

import { sourceReport } from "./area-sources";
import {
  NotPreparedError,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";
import {
  landRegistry,
  landSalesIn,
  priceSummary,
  yearsUpTo,
  type PricePaidLandSale,
} from "./land-registry";
import { RUN_DATA_PREPARE, type PreparedData } from "./prepared-data";

/*
 * The land sales near Land Opportunities (PRD FR-5.4b): HM Land Registry's
 * Price Paid sales of property of type "Other" within 1 mile of each, in the
 * last 5 years. Price Paid is searched by postcode, so the postcodes within
 * a mile of each Land Opportunity are found first, in the postcodes `pnpm
 * data:prepare` kept for its Land Coverage Area from Code-Point Open, and
 * each sale is placed at the middle of its postcode. Each is indicative: it
 * may not be land.
 */

// Read afresh every time, which takes milliseconds, so a re-run of
// `pnpm data:prepare` shows at once.
export const landPostcodes: DataSource = {
  id: "postcodes",
  name: "Postcodes",
  cacheTtlMs: 0,
};

/** A postcode within 1 mile of a Land Parcel, at its middle. */
export interface PostcodeNear {
  postcode: string;
  location: Location;
  /** How far its middle is from the Land Parcel, in metres: 0 inside it. */
  distanceMetres: number;
}

/**
 * How far a postcode may be from a Land Parcel's bounds, in degrees of
 * latitude and of longitude, as far north as England reaches, so the
 * postcodes are found first by the bounds the files keep beside them.
 */
const MARGIN_DEGREES = {
  lat: (NEARBY_LAND_SALES_RULES.withinMetres / 110_574) * 1.1,
  lng:
    (NEARBY_LAND_SALES_RULES.withinMetres /
      (111_320 * Math.cos((56 * Math.PI) / 180))) *
    1.1,
};

/** A shape in WGS 84, in British National Grid, where distances are in metres. */
const bng = (geometry: string) =>
  `ST_Transform(${geometry}, 'EPSG:4326', 'EPSG:27700', always_xy := true)`;

/**
 * The postcodes within `$7` metres of each of the Land Parcels `$3`, their
 * ids separated by commas, from the Land Parcels file `$1` and the postcodes
 * file `$2`, each with its distance from the parcel, the nearest first.
 */
const POSTCODES_NEAR_SQL = `
  WITH parcels AS (
    SELECT parcel_id, ${bng("geometry")} AS shape, xmin, ymin, xmax, ymax
    FROM read_parquet($1) WHERE list_contains(string_split($3, ','), parcel_id)
  )
  SELECT parcel_id, postcode, lat, lng, distance_m FROM (
    SELECT p.parcel_id, c.postcode, c.lat, c.lng,
      ST_Distance(p.shape, ${bng("c.geometry")}) AS distance_m
    FROM parcels p JOIN read_parquet($2) c
      ON c.lng BETWEEN p.xmin - $4 AND p.xmax + $4
        AND c.lat BETWEEN p.ymin - $5 AND p.ymax + $5
  )
  WHERE distance_m <= $6
  ORDER BY parcel_id, distance_m, postcode`;

const text = (value: Json | undefined) =>
  typeof value === "string" && value !== "" ? value : null;

const number = (value: Json | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A dataset a Land Coverage Area must have, or else it is not prepared. */
const dataset = (
  datasets: readonly ManifestDataset[],
  id: string,
  council: Council,
  what: string,
) => {
  const found = datasets.find((each) => each.id === id);
  if (!found) {
    throw new NotPreparedError(
      `${council.name}'s ${what} weren't prepared: it was prepared before they were added. ${RUN_DATA_PREPARE}`,
    );
  }
  return found;
};

/**
 * The postcodes within 1 mile of each of `parcels`, by its id, the nearest
 * first, from the postcodes `pnpm data:prepare` kept for each one's Land
 * Coverage Area. Its period is the month of Code-Point Open's release. A
 * Land Coverage Area prepared before its postcodes were kept is
 * `not-prepared`.
 */
export const postcodesNear = (
  parcels: readonly LandParcel[],
  callSource: CallSource,
  prepared: PreparedData,
): Promise<SourceResult<Map<string, PostcodeNear[]>>> =>
  callSource(
    landPostcodes,
    parcels
      .map(({ id }) => id)
      .sort()
      .join(","),
    async () => {
      const manifest = await prepared.manifest();
      const byCouncil = new Map<string, LandParcel[]>();
      for (const parcel of parcels) {
        byCouncil.set(parcel.council.code, [
          ...(byCouncil.get(parcel.council.code) ?? []),
          parcel,
        ]);
      }
      const near = new Map<string, PostcodeNear[]>(
        parcels.map(({ id }) => [id, []]),
      );
      const dates: string[] = [];
      for (const [code, inCouncil] of byCouncil) {
        const area = manifest.landCoverageAreas.find(
          ({ council }) => council.code === code,
        );
        const council = area?.council ?? inCouncil[0]?.council;
        if (!area || !council) {
          throw new NotPreparedError(
            `No Land Coverage Area is ${code}. ${RUN_DATA_PREPARE}`,
          );
        }
        const postcodes = dataset(
          area.datasets,
          POSTCODES_DATASET,
          council,
          "postcodes",
        );
        const rows = await prepared.query(
          [
            dataset(
              area.datasets,
              LAND_PARCELS_DATASET,
              council,
              "Land Parcels",
            ),
            postcodes,
          ],
          POSTCODES_NEAR_SQL,
          [
            inCouncil.map(({ id }) => id).join(","),
            MARGIN_DEGREES.lng,
            MARGIN_DEGREES.lat,
            NEARBY_LAND_SALES_RULES.withinMetres,
          ],
        );
        for (const row of rows) {
          const id = text(row.parcel_id);
          const postcode = text(row.postcode);
          const lat = number(row.lat);
          const lng = number(row.lng);
          const distance = number(row.distance_m);
          if (!id || !postcode || lat === null || lng === null) continue;
          if (distance === null) continue;
          near.get(id)?.push({
            postcode,
            location: { lat, lng },
            distanceMetres: Math.round(distance),
          });
        }
        dates.push(postcodes.sourceDate);
      }
      const sorted = dates.sort();
      const [from] = sorted;
      const to = sorted.at(-1);
      return { data: near, period: from && to ? { from, to } : null };
    },
  );

/** The land sales near one Land Opportunity, or near any of several. */
export interface LandSalesNear {
  /** Each Land Parcel's, by its id, every one of them listed. */
  byParcel: Map<string, NearbyLandSales>;
  /** Near any of them, each as far as the nearest, every one of them listed. */
  all: NearbyLandSales;
  /** The postcodes, and Price Paid if it was asked, and how each answered. */
  sources: SourceReport[];
}

/** No land sales known, and why: Price Paid unavailable, or the postcodes not prepared. */
const unknown = (
  status: SourceStatus,
  period: DataPeriod,
): NearbyLandSales => ({
  status,
  period,
  found: null,
});

/** Land sales, the newest first, counted with their median price. */
const found = (
  sales: readonly LandSale[],
  period: DataPeriod,
): NearbyLandSales => ({
  status: "ok",
  period,
  found: {
    count: sales.length,
    medianPrice: priceSummary(sales.map(({ price }) => price)).median,
    sales: [...sales].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.distanceMetres - b.distanceMetres ||
        a.id.localeCompare(b.id),
    ),
  },
});

/** A sale placed at its postcode, as far from a Land Parcel as its postcode is. */
const placed = (sale: PricePaidLandSale, at: PostcodeNear): LandSale => ({
  ...sale,
  location: at.location,
  distanceMetres: at.distanceMetres,
});

/**
 * The land sales within 1 mile of each of `parcels`, and of any of them, in
 * the last 5 years up to `today` (PRD FR-5.4b): Price Paid's sales of
 * property of type "Other", in one query for every postcode within a mile
 * of any of them. If the postcodes aren't prepared, Price Paid isn't asked,
 * and they are `not-prepared`; if Price Paid doesn't answer, `unavailable`.
 */
export const landSalesNear = async (
  parcels: readonly LandParcel[],
  today: string,
  callSource: CallSource,
  prepared: PreparedData,
): Promise<LandSalesNear> => {
  const period = yearsUpTo(today, NEARBY_LAND_SALES_RULES.years);
  const postcodes = await postcodesNear(parcels, callSource, prepared);
  if (postcodes.status !== "ok") {
    return {
      byParcel: new Map(
        parcels.map(({ id }) => [id, unknown(postcodes.status, period)]),
      ),
      all: unknown(postcodes.status, period),
      sources: [sourceReport(landPostcodes, postcodes)],
    };
  }
  const near = postcodes.data;
  const sales = await landSalesIn(
    [...new Set([...near.values()].flat().map(({ postcode }) => postcode))],
    period,
    callSource,
  );
  const sources = [
    sourceReport(landPostcodes, postcodes),
    sourceReport(landRegistry, sales),
  ];
  if (sales.status !== "ok") {
    return {
      byParcel: new Map(
        parcels.map(({ id }) => [id, unknown(sales.status, period)]),
      ),
      all: unknown(sales.status, period),
      sources,
    };
  }

  const byPostcode = new Map<string, PricePaidLandSale[]>();
  for (const sale of sales.data) {
    byPostcode.set(sale.postcode, [
      ...(byPostcode.get(sale.postcode) ?? []),
      sale,
    ]);
  }
  const nearest = new Map<string, LandSale>();
  const byParcel = new Map(
    parcels.map(({ id }) => {
      const placedNear = (near.get(id) ?? []).flatMap((at) =>
        (byPostcode.get(at.postcode) ?? []).map((sale) => placed(sale, at)),
      );
      for (const sale of placedNear) {
        const known = nearest.get(sale.id);
        if (!known || sale.distanceMetres < known.distanceMetres) {
          nearest.set(sale.id, sale);
        }
      }
      return [id, found(placedNear, period)];
    }),
  );
  return { byParcel, all: found([...nearest.values()], period), sources };
};

/** Land sales with at most `limit` of them listed, the newest: all of them are counted. */
export const listing = (
  sales: NearbyLandSales,
  limit: number = NEARBY_LAND_SALES_RULES.listed,
): NearbyLandSales =>
  sales.found
    ? {
        ...sales,
        found: { ...sales.found, sales: sales.found.sales.slice(0, limit) },
      }
    : sales;
