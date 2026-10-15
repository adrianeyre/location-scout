import {
  distanceMetres,
  isLocation,
  searchAreaRing,
  type CrimeCategoryChange,
  type CrimeCategoryCount,
  type CrimeChange,
  type CrimeFeature,
  type CrimeStatistics,
  type CrimeTrend,
  type Location,
  type SearchArea,
} from "@location-scout/shared";

import {
  DAY_MS,
  type CallSource,
  type DataSource,
  type SourceContext,
  type SourceResult,
} from "./data-source";
import { createRateLimiter, type RateLimiter } from "./rate-limiter";

/**
 * data.police.uk: street-level crime (PRD §6.17). Free, no key. It allows 15
 * requests a second, in bursts of up to 30; a Crime Layer makes 25 (NFR-1.5).
 */
export const police: DataSource = {
  id: "police",
  name: "data.police.uk",
  // Crime is cached for 24 hours (PRD NFR-1.4).
  cacheTtlMs: DAY_MS,
};

const BASE_URL = "https://data.police.uk/api";

/** The latest month data.police.uk has published crimes for. */
export const LAST_UPDATED_URL = `${BASE_URL}/crime-last-updated`;

/** Street-level crimes of every category inside a polygon, sent as a POST. */
export const STREET_CRIMES_URL = `${BASE_URL}/crimes-street/all-crime`;

/**
 * Requests to data.police.uk go at least 100 ms apart: at most 10 a second,
 * well under its limit of 15 (PRD NFR-1.5). A Crime Layer's 25 requests then
 * take about 2.5 seconds, inside the 8-second timeout.
 */
export const POLICE_INTERVAL_MS = 100;

/**
 * The one limiter for every data.police.uk request this process makes, however
 * many apps it creates, so the limit holds across the whole process.
 */
export const POLICE_LIMITER = createRateLimiter(POLICE_INTERVAL_MS);

export interface PoliceOptions {
  /** Spaces out the requests. Each one waits its turn inside its timeout. */
  limiter: RateLimiter;
}

/** The trend compares the last 12 months with the 12 before (PRD FR-2.1). */
export const TREND_MONTHS = 24;

/**
 * The corners of the polygon sent for a Search Area. More would follow the
 * circle more closely for no real gain: police locations are approximate.
 */
const POLY_CORNERS = 32;

/** data.police.uk's names for its categories, from `GET /crime-categories`. */
export const CRIME_CATEGORY_NAMES: Readonly<Record<string, string>> = {
  "anti-social-behaviour": "Anti-social behaviour",
  "bicycle-theft": "Bicycle theft",
  burglary: "Burglary",
  "criminal-damage-arson": "Criminal damage and arson",
  drugs: "Drugs",
  "other-theft": "Other theft",
  "possession-of-weapons": "Possession of weapons",
  "public-order": "Public order",
  robbery: "Robbery",
  shoplifting: "Shoplifting",
  "theft-from-the-person": "Theft from the person",
  "vehicle-crime": "Vehicle crime",
  "violent-crime": "Violence and sexual offences",
  "other-crime": "Other crime",
};

/** A category data.police.uk adds later is named from its id, `new-thing` → "New thing". */
export const crimeCategoryName = (category: string) => {
  const known = CRIME_CATEGORY_NAMES[category];
  if (known !== undefined) return known;
  const words = category.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export class PoliceError extends Error {
  override name = "PoliceError";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Maps a raw `GET /crime-last-updated` response, for example
 * `{ "date": "2026-08-01" }`, to the latest month: `2026-08`.
 */
export const mapLastUpdated = (status: number, body: unknown): string => {
  const date = isRecord(body) ? body.date : undefined;
  const month =
    typeof date === "string" ? /^(\d{4}-\d{2})-\d{2}/.exec(date)?.[1] : null;
  if (status !== 200 || !month) {
    throw new PoliceError(
      `data.police.uk answered ${String(status)} without its latest month`,
    );
  }
  return month;
};

/**
 * The Search Area as data.police.uk's `poly`: `lat,lng` corners joined by
 * colons. The polygon closes itself, so the first corner is not repeated.
 */
export const searchAreaPoly = ({ location, searchRadius }: SearchArea) =>
  searchAreaRing(location, searchRadius.metres, POLY_CORNERS)
    .slice(0, -1)
    .map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`)
    .join(":");

/** The form body of the street-level crimes request for one month. */
export const streetCrimesBody = (area: SearchArea, month: string) =>
  new URLSearchParams({ poly: searchAreaPoly(area), date: month }).toString();

/** A coordinate data.police.uk sends as text, or `NaN` if it is blank or missing. */
const coordinate = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;

/** One crime from a raw response, or `null` if it has no usable location. */
const toCrime = (crime: unknown, from: Location): CrimeFeature | null => {
  if (!isRecord(crime) || !isRecord(crime.location)) return null;
  const { id, category, month } = crime;
  const { latitude, longitude, street } = crime.location;
  if (typeof id !== "number" && typeof id !== "string") return null;
  if (typeof category !== "string" || typeof month !== "string") return null;
  const location = { lat: coordinate(latitude), lng: coordinate(longitude) };
  if (!isLocation(location)) return null;
  const streetName =
    isRecord(street) && typeof street.name === "string" ? street.name : null;
  return {
    id: String(id),
    location,
    distanceMetres: Math.round(distanceMetres(from, location)),
    category,
    categoryName: crimeCategoryName(category),
    month,
    street: streetName,
  };
};

/**
 * Maps a raw `POST /crimes-street/all-crime` response to Crime Features, each
 * with its distance from the Location. data.police.uk answers 503 when a
 * polygon holds more than 10,000 crimes; that, like any failure, throws.
 */
export const mapStreetCrimes = (
  status: number,
  body: unknown,
  from: Location,
): CrimeFeature[] => {
  if (status !== 200 || !Array.isArray(body)) {
    throw new PoliceError(
      `data.police.uk answered ${String(status)} without a list of crimes`,
    );
  }
  return body
    .map((crime) => toCrime(crime, from))
    .filter((crime) => crime !== null);
};

/** One month's crimes, counted by category. */
export type MonthCounts = Pick<
  CrimeStatistics,
  "month" | "total" | "byCategory"
>;

/** Counts crimes by category, most reported first, then by name. */
export const countCrimes = (
  crimes: readonly CrimeFeature[],
  month: string,
): MonthCounts => {
  const counts = new Map<string, { name: string; count: number }>();
  for (const { category, categoryName } of crimes) {
    const counted = counts.get(category);
    if (counted) counted.count += 1;
    else counts.set(category, { name: categoryName, count: 1 });
  }
  return {
    month,
    total: crimes.length,
    byCategory: [...counts]
      .map(([category, { name, count }]) => ({ category, name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
};

/** The month `by` months after `month`, or before it if negative: `2026-08`, -12 → `2025-08`. */
export const addMonths = (month: string, by: number) => {
  const [year = Number.NaN, number = Number.NaN] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
};

/** The `count` months up to and including `latest`, oldest first. */
export const monthsUpTo = (latest: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    addMonths(latest, index - count + 1),
  );

/**
 * The change from `previous` to `last` in per cent, to one decimal place, or
 * `null` if there is nothing to compare with.
 */
export const percentChange = (last: number, previous: number) => {
  if (previous === 0) return null;
  const change = Math.round(((last - previous) / previous) * 1000) / 10;
  // A fall too small to show rounds to -0, which is no change.
  return change === 0 ? 0 : change;
};

/**
 * Compares the last 12 months' crimes, up to and including `latest`, with the
 * 12 months before (PRD FR-2.1), from each month's count by category. A month
 * missing from `counted` is one data.police.uk didn't answer for. The counts
 * leave it out, and with any month missing there are no changes: a comparison
 * that is missing months would be wrong, so the trend says it is incomplete.
 */
export const crimeTrend = (
  latest: string,
  counted: ReadonlyMap<string, readonly CrimeCategoryCount[]>,
): CrimeTrend => {
  const months = monthsUpTo(latest, TREND_MONTHS);
  const firstOfLast12 = addMonths(latest, -(TREND_MONTHS / 2 - 1));
  const categories = new Map<string, CrimeCategoryChange>();
  const missingMonths: string[] = [];

  for (const month of months) {
    const byCategory = counted.get(month);
    if (byCategory === undefined) {
      missingMonths.push(month);
      continue;
    }
    const period = month >= firstOfLast12 ? "last12Months" : "previous12Months";
    for (const { category, name, count } of byCategory) {
      const change = categories.get(category) ?? {
        category,
        name,
        last12Months: 0,
        previous12Months: 0,
        change: null,
      };
      change[period] += count;
      categories.set(category, change);
    }
  }

  const complete = missingMonths.length === 0;
  const withChange = <T extends CrimeChange>(counts: T): T => ({
    ...counts,
    change: complete
      ? percentChange(counts.last12Months, counts.previous12Months)
      : null,
  });
  const byCategory = [...categories.values()].map(withChange);
  const sum = (period: "last12Months" | "previous12Months") =>
    byCategory.reduce((total, counts) => total + counts[period], 0);

  return {
    last12Months: { from: firstOfLast12, to: latest },
    previous12Months: {
      from: addMonths(latest, -(TREND_MONTHS - 1)),
      to: addMonths(firstOfLast12, -1),
    },
    complete,
    missingMonths,
    total: withChange({
      last12Months: sum("last12Months"),
      previous12Months: sum("previous12Months"),
      change: null,
    }),
    byCategory: byCategory.sort(
      (a, b) =>
        b.last12Months - a.last12Months ||
        b.previous12Months - a.previous12Months ||
        a.name.localeCompare(b.name),
    ),
  };
};

/** The street-level crimes in a Search Area for the latest published month. */
export interface LatestCrimes {
  features: CrimeFeature[];
  counts: MonthCounts;
}

const latestMonth = (callSource: CallSource, { limiter }: PoliceOptions) =>
  callSource(police, LAST_UPDATED_URL, async ({ fetch, signal }) => {
    await limiter.wait(signal);
    const response = await fetch(LAST_UPDATED_URL, {
      headers: { accept: "application/json" },
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    const month = mapLastUpdated(response.status, body);
    return { data: month, period: { from: month, to: month } };
  });

/** Asks for the crimes in the Search Area in one month, once it is its turn. */
const fetchStreetCrimes = async (
  area: SearchArea,
  body: string,
  { fetch, signal }: SourceContext,
  { limiter }: PoliceOptions,
) => {
  await limiter.wait(signal);
  const response = await fetch(STREET_CRIMES_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal,
  });
  const crimes: unknown = await response.json().catch(() => null);
  return mapStreetCrimes(response.status, crimes, area.location);
};

/** The crimes in the Search Area in `month`, as Features and counted. */
const crimesIn = (
  area: SearchArea,
  month: string,
  callSource: CallSource,
  options: PoliceOptions,
) => {
  const body = streetCrimesBody(area, month);
  return callSource(police, `${STREET_CRIMES_URL} ${body}`, async (context) => {
    const features = await fetchStreetCrimes(area, body, context, options);
    return {
      data: { features, counts: countCrimes(features, month) },
      period: { from: month, to: month },
    };
  });
};

/**
 * The crimes in the Search Area in an earlier `month`, only counted: the
 * cache keeps the counts, not every crime. Its key is not the Features' key,
 * so a month that was the latest yesterday is never answered with Features.
 */
const crimesCountedIn = (
  area: SearchArea,
  month: string,
  callSource: CallSource,
  options: PoliceOptions,
) => {
  const body = streetCrimesBody(area, month);
  return callSource(
    police,
    `counted ${STREET_CRIMES_URL} ${body}`,
    async (context) => {
      const features = await fetchStreetCrimes(area, body, context, options);
      return {
        data: countCrimes(features, month),
        period: { from: month, to: month },
      };
    },
  );
};

/**
 * Fetches the street-level crimes inside the Search Area for the latest month
 * data.police.uk has published (PRD FR-2.1): first the month, then the crimes
 * in the Search Area's polygon for it. If either call fails, so does this.
 */
export const latestCrimes = async (
  area: SearchArea,
  callSource: CallSource,
  options: PoliceOptions,
): Promise<SourceResult<LatestCrimes>> => {
  const month = await latestMonth(callSource, options);
  if (month.status !== "ok") return month;
  return crimesIn(area, month.data, callSource, options);
};

/** The Crime Layer's Features and statistics. */
export interface CrimesWithTrend {
  features: CrimeFeature[];
  statistics: CrimeStatistics;
}

/**
 * The latest month's crimes, as `latestCrimes` gives them, with the trend over
 * the 24 months up to it (PRD FR-2.1): then one call for each of the 23
 * earlier months, spaced out by the limiter, and each cached for 24 hours. If
 * the latest month fails, so does this, without asking for the others: they
 * would most likely fail the same way. If an earlier one fails, the trend says
 * it is incomplete.
 */
export const crimesWithTrend = async (
  area: SearchArea,
  callSource: CallSource,
  options: PoliceOptions,
): Promise<SourceResult<CrimesWithTrend>> => {
  const crimes = await latestCrimes(area, callSource, options);
  if (crimes.status !== "ok") return crimes;
  const latest = crimes.data.counts.month;
  const earlier = await Promise.all(
    monthsUpTo(latest, TREND_MONTHS)
      .slice(0, -1)
      .map((month) => crimesCountedIn(area, month, callSource, options)),
  );

  const { features, counts } = crimes.data;
  const counted = new Map<string, readonly CrimeCategoryCount[]>([
    [latest, counts.byCategory],
  ]);
  for (const result of earlier) {
    if (result.status === "ok") {
      counted.set(result.data.month, result.data.byCategory);
    }
  }

  return {
    status: "ok",
    data: {
      features,
      statistics: { ...counts, trend: crimeTrend(latest, counted) },
    },
    period: crimes.period,
  };
};
