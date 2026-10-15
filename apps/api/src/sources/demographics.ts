import {
  AGE_GROUPS,
  AGE_GROUP_BANDS,
  CENSUS_2021_DATASET,
  CENSUS_AGE_BANDS,
  INCOME_ESTIMATES_DATASET,
  INDICES_OF_DEPRIVATION_DATASET,
  OUTPUT_AREA_BOUNDARIES_DATASET,
  distanceMetres,
  oneDecimal,
  searchAreaRing,
  type ConstraintShape,
  type DataPeriod,
  type DemographicsStatistics,
  type OutputAreaFeature,
  type Position,
  type SearchArea,
  type SourceReport,
} from "@location-scout/shared";
import type { Json } from "@duckdb/node-api";

import {
  NotPreparedError,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";
import { RUN_DATA_PREPARE, type PreparedData } from "./prepared-data";

/*
 * The Demographics Layer's prepared datasets (PRD FR-2.7a, FR-6.0): Census
 * 2021 by output area with the output areas' boundaries, ONS's household
 * income estimates by MSOA and the English Indices of Deprivation by LSOA.
 * Each is a Data Source of its own, so a response names each and the date
 * its data dates from. They are read together, in one query.
 */

// Each is read afresh every time, which takes milliseconds, so a re-run of
// `pnpm data:prepare` shows at once.
export const onsOutputAreas: DataSource = {
  id: "ons-output-areas",
  name: "ONS Open Geography",
  cacheTtlMs: 0,
};

export const onsCensus2021: DataSource = {
  id: "ons-census-2021",
  name: "ONS Census 2021",
  cacheTtlMs: 0,
};

export const onsIncomeEstimates: DataSource = {
  id: "ons-income-estimates",
  name: "ONS small area income estimates",
  cacheTtlMs: 0,
};

export const indicesOfDeprivation: DataSource = {
  id: "indices-of-deprivation",
  name: "English Indices of Deprivation",
  cacheTtlMs: 0,
};

/** Each of the Demographics Layer's Data Sources, and the prepared dataset it is. */
export const DEMOGRAPHICS_SOURCES = [
  { source: onsOutputAreas, dataset: OUTPUT_AREA_BOUNDARIES_DATASET },
  { source: onsCensus2021, dataset: CENSUS_2021_DATASET },
  { source: onsIncomeEstimates, dataset: INCOME_ESTIMATES_DATASET },
  { source: indicesOfDeprivation, dataset: INDICES_OF_DEPRIVATION_DATASET },
] as const;

/** One output area that reaches into a Search Area, as the prepared files give it. */
export interface OutputAreaRow {
  code: string;
  lsoaCode: string | null;
  lsoaName: string | null;
  msoaCode: string | null;
  population: number;
  households: number;
  populationDensity: number;
  /** Its residents in each of `CENSUS_AGE_BANDS`. */
  ages: number[];
  /** Its MSOA's average total annual household income, in pounds. */
  income: number | null;
  /** Its LSOA's Index of Multiple Deprivation decile and rank. */
  decile: number | null;
  rank: number | null;
  /** The share of it inside the Search Area, from 0 to 1. */
  overlap: number;
  coversLocation: boolean;
  /** A point of it inside the Search Area. */
  lat: number;
  lng: number;
  shape: ConstraintShape;
}

/** The output areas that reach into a Search Area, and when each dataset dates from. */
export interface OutputAreasIn {
  rows: OutputAreaRow[];
  /**
   * The median of every English MSOA's average household income, in
   * pounds, or `null` if the income estimates have none.
   */
  englandMedianIncome: number | null;
  /** The date each dataset's data dates from, by its id. */
  periods: Record<string, DataPeriod>;
}

/**
 * The Search Area's outline, as WKT, the same 64-cornered circle the map
 * draws. It holds 99.8% of the circle's area.
 */
const searchAreaWkt = ({ location, searchRadius }: SearchArea) =>
  `POLYGON((${searchAreaRing(location, searchRadius.metres)
    .map(([lng, lat]) => `${String(lng)} ${String(lat)}`)
    .join(", ")}))`;

/**
 * The output areas whose boundaries reach into the Search Area, with the
 * share of each inside it, its Census 2021 figures, its MSOA's income and its
 * LSOA's deprivation. Output areas are found first by their bounds, which the
 * files keep beside their outlines, so DuckDB reads only the few row groups
 * near the Search Area. Areas are measured in degrees: over an output area,
 * a degree of longitude is the same length everywhere, so the share is right.
 */
const OUTPUT_AREAS_SQL = `
  WITH search_area AS (SELECT ST_GeomFromText($5) AS shape),
  reaching AS (
    SELECT b.*, ST_Intersection(b.geometry, s.shape) AS inside
    FROM read_parquet($1) b, search_area s
    WHERE b.xmax >= $6 AND b.xmin <= $8 AND b.ymax >= $7 AND b.ymin <= $9
      AND ST_Intersects(b.geometry, s.shape)
  )
  SELECT r.code, r.lsoa_code, r.lsoa_name, r.msoa_code,
    c.population, c.households, c.population_density, c.ages,
    i.income, d.decile, d.rank,
    ST_Area(r.inside) / ST_Area(r.geometry) AS overlap,
    ST_Contains(r.geometry, ST_Point($10, $11)) AS covers_location,
    ST_X(ST_PointOnSurface(r.inside)) AS lng,
    ST_Y(ST_PointOnSurface(r.inside)) AS lat,
    ST_AsGeoJSON(r.geometry) AS shape
  FROM reaching r
  JOIN read_parquet($2) c ON c.code = r.code
  LEFT JOIN read_parquet($3) i ON i.msoa_code = r.msoa_code
  LEFT JOIN read_parquet($4) d ON d.lsoa_code = r.lsoa_code
  WHERE ST_Area(r.inside) > 0
  ORDER BY r.code`;

/**
 * The median of the average household incomes of every MSOA in the income
 * estimates, which `pnpm data:prepare` keeps to England's.
 */
const ENGLAND_MEDIAN_INCOME_SQL = `
  SELECT median(income) AS median FROM read_parquet($1)`;

export class DemographicsError extends Error {
  override name = "DemographicsError";
}

const text = (value: Json | undefined) =>
  typeof value === "string" ? value : null;

/** A number DuckDB gives as a number, or as text for a big integer. */
const number = (value: Json | undefined) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

const required = (value: Json | undefined, what: string) => {
  const parsed = number(value);
  if (parsed === null) throw new DemographicsError(`No ${what} in a row`);
  return parsed;
};

/** An outline as a MultiPolygon, from DuckDB's GeoJSON of a Polygon or MultiPolygon. */
export const outlineOf = (geoJson: string): ConstraintShape => {
  const geometry: unknown = JSON.parse(geoJson);
  if (typeof geometry === "object" && geometry !== null) {
    if ("type" in geometry && "coordinates" in geometry) {
      const coordinates = geometry.coordinates as Position[][] | Position[][][];
      if (geometry.type === "Polygon") {
        return {
          type: "MultiPolygon",
          coordinates: [coordinates as Position[][]],
        };
      }
      if (geometry.type === "MultiPolygon") {
        return {
          type: "MultiPolygon",
          coordinates: coordinates as Position[][][],
        };
      }
    }
  }
  throw new DemographicsError(`An output area's outline is not a polygon`);
};

/** Reads one row of `OUTPUT_AREAS_SQL`. */
export const readOutputAreaRow = (row: Record<string, Json>): OutputAreaRow => {
  const code = text(row.code);
  const shape = text(row.shape);
  const { ages } = row;
  if (!code || !shape || !Array.isArray(ages)) {
    throw new DemographicsError("An output area's row is incomplete");
  }
  return {
    code,
    lsoaCode: text(row.lsoa_code),
    lsoaName: text(row.lsoa_name),
    msoaCode: text(row.msoa_code),
    population: required(row.population, "population"),
    households: required(row.households, "households"),
    populationDensity: required(row.population_density, "population density"),
    ages: ages.map((count) => required(count, "age band")),
    income: number(row.income),
    decile: number(row.decile),
    rank: number(row.rank),
    overlap: Math.min(1, required(row.overlap, "overlap")),
    coversLocation: row.covers_location === true,
    lat: required(row.lat, "point"),
    lng: required(row.lng, "point"),
    shape: outlineOf(shape),
  };
};

/**
 * Finds the output areas that reach into a Search Area in the prepared files,
 * with what each says of them, and the median of England's MSOAs' household
 * incomes. Its period is Census day. Before `pnpm
 * data:prepare` has prepared all four datasets, it is `not-prepared`.
 */
export const outputAreasIn = (
  area: SearchArea,
  callSource: CallSource,
  prepared: PreparedData,
): Promise<SourceResult<OutputAreasIn>> => {
  const { location, searchRadius } = area;
  return callSource(
    onsCensus2021,
    `${String(location.lat)},${String(location.lng)},${String(searchRadius.metres)}`,
    async () => {
      const manifest = await prepared.manifest();
      const datasets = DEMOGRAPHICS_SOURCES.map(({ source, dataset }) => {
        const found = manifest.datasets.find(({ id }) => id === dataset);
        if (!found) {
          throw new NotPreparedError(
            `The manifest lists no ${source.name} (${dataset}). ${RUN_DATA_PREPARE}`,
          );
        }
        return found;
      });
      const ring = searchAreaRing(location, searchRadius.metres);
      const lngs = ring.map(([lng]) => lng);
      const lats = ring.map(([, lat]) => lat);
      const income = datasets.find(({ id }) => id === INCOME_ESTIMATES_DATASET);
      const [found, [median]] = await Promise.all([
        prepared.query(datasets, OUTPUT_AREAS_SQL, [
          searchAreaWkt(area),
          Math.min(...lngs),
          Math.min(...lats),
          Math.max(...lngs),
          Math.max(...lats),
          location.lng,
          location.lat,
        ]),
        income
          ? prepared.query(income, ENGLAND_MEDIAN_INCOME_SQL)
          : Promise.resolve([]),
      ]);
      const periods = Object.fromEntries(
        datasets.map(({ id, sourceDate }) => [
          id,
          { from: sourceDate, to: sourceDate },
        ]),
      );
      return {
        data: {
          rows: found.map(readOutputAreaRow),
          englandMedianIncome: number(median?.median),
          periods,
        },
        period: periods[CENSUS_2021_DATASET] ?? null,
      };
    },
  );
};

/** One of the Layer's Data Sources, reported with the date its own dataset dates from. */
export const demographicsSourceResult = (
  result: SourceResult<OutputAreasIn>,
  dataset: string,
): SourceResult<OutputAreasIn> =>
  result.status === "ok"
    ? { ...result, period: result.data.periods[dataset] ?? null }
    : result;

/** How each of the Layer's Data Sources answered (PRD NFR-1.3). */
export const demographicsSourceReports = (
  result: SourceResult<OutputAreasIn>,
): SourceReport[] =>
  DEMOGRAPHICS_SOURCES.map(({ source, dataset }) => {
    const answered = demographicsSourceResult(result, dataset);
    return {
      id: source.id,
      name: source.name,
      status: answered.status,
      period: answered.status === "ok" ? answered.period : null,
    };
  });

/** A band's width in years. The last band, 85 and over, is taken to be ten years wide. */
const OPEN_BAND_YEARS = 10;

/**
 * The median age of residents counted in `CENSUS_AGE_BANDS`, to one decimal
 * place, assuming their ages are spread evenly through each band, as ONS
 * finds a median from bands. `null` if there are none.
 */
export const medianAge = (ages: readonly number[]): number | null => {
  const total = ages.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return null;
  const half = total / 2;
  let before = 0;
  for (const [index, band] of CENSUS_AGE_BANDS.entries()) {
    const count = ages[index] ?? 0;
    if (count > 0 && before + count >= half) {
      const years =
        band.to === null ? OPEN_BAND_YEARS : band.to - band.from + 1;
      return oneDecimal(band.from + ((half - before) / count) * years);
    }
    before += count;
  }
  return null;
};

/** Rounds to `places` decimal places. */
const round = (value: number, places: number) =>
  Math.round(value * 10 ** places) / 10 ** places;

/** Each output area as a Feature of the Demographics Layer. */
export const mapOutputAreas = (
  rows: readonly OutputAreaRow[],
  area: SearchArea,
): OutputAreaFeature[] =>
  rows.map((row) => {
    const location = { lat: round(row.lat, 6), lng: round(row.lng, 6) };
    return {
      id: row.code,
      location,
      distanceMetres: Math.round(distanceMetres(area.location, location)),
      lsoa:
        row.lsoaCode && row.lsoaName
          ? { code: row.lsoaCode, name: row.lsoaName }
          : null,
      msoaCode: row.msoaCode,
      population: row.population,
      households: row.households,
      populationDensity: row.populationDensity,
      medianAge: medianAge(row.ages),
      householdIncome: row.income,
      deprivationDecile: row.decile,
      overlap: round(row.overlap, 3),
      coversLocation: row.coversLocation,
      shape: row.shape,
    };
  });

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

/**
 * The Search Area's estimates (PRD FR-2.7a): each output area's residents,
 * households and residents of each age counted in proportion to the share of
 * it inside the Search Area, so an output area half inside counts half. Its
 * MSOAs' incomes are averaged by the households estimated to be in the
 * Search Area in each, and given with `englandMedianIncome` to compare with.
 * Its deprivation is the LSOA the Location is in, and the range of every
 * LSOA it reaches into. A pure function: the same rows always give the same
 * estimates.
 */
export const demographicsStatistics = (
  rows: readonly OutputAreaRow[],
  englandMedianIncome: number | null,
): DemographicsStatistics => {
  const bands = CENSUS_AGE_BANDS.map((_, index) =>
    sum(rows.map(({ ages, overlap }) => (ages[index] ?? 0) * overlap)),
  );
  const counted = sum(bands);
  const ageProfile = AGE_GROUPS.map((group) => {
    const { from, to } = AGE_GROUP_BANDS[group];
    const inGroup = sum(
      bands.filter((_, index) => {
        const band = CENSUS_AGE_BANDS[index];
        return (
          band !== undefined &&
          band.from >= from &&
          (to === null || (band.to !== null && band.to <= to))
        );
      }),
    );
    return {
      group,
      population: Math.round(inGroup),
      percent: counted > 0 ? oneDecimal((inGroup / counted) * 100) : 0,
    };
  });

  const withIncome = rows.flatMap(
    ({ income, households, overlap, msoaCode }) =>
      income === null
        ? []
        : [{ income, weight: households * overlap, msoaCode }],
  );
  const incomeWeight = sum(withIncome.map(({ weight }) => weight));

  const withDecile = rows.flatMap(
    ({ decile, rank, lsoaCode, lsoaName, coversLocation }) =>
      decile === null
        ? []
        : [{ decile, rank, lsoaCode, lsoaName, coversLocation }],
  );
  const deciles = withDecile.map(({ decile }) => decile);
  const atLocation = withDecile.find(({ coversLocation }) => coversLocation);

  return {
    outputAreas: rows.length,
    population: Math.round(
      sum(rows.map(({ population, overlap }) => population * overlap)),
    ),
    households: Math.round(
      sum(rows.map(({ households, overlap }) => households * overlap)),
    ),
    ageProfile,
    medianAge: medianAge(bands),
    householdIncome:
      incomeWeight > 0 && englandMedianIncome !== null
        ? {
            averagePounds: Math.round(
              sum(withIncome.map(({ income, weight }) => income * weight)) /
                incomeWeight,
            ),
            msoas: new Set(withIncome.map(({ msoaCode }) => msoaCode)).size,
            englandMedianPounds: Math.round(englandMedianIncome),
          }
        : null,
    deprivation:
      deciles.length > 0
        ? {
            atLocation:
              atLocation?.lsoaCode && atLocation.lsoaName && atLocation.rank
                ? {
                    code: atLocation.lsoaCode,
                    name: atLocation.lsoaName,
                    decile: atLocation.decile,
                    rank: atLocation.rank,
                  }
                : null,
            lowestDecile: Math.min(...deciles),
            highestDecile: Math.max(...deciles),
            lsoas: new Set(withDecile.map(({ lsoaCode }) => lsoaCode)).size,
          }
        : null,
  };
};
