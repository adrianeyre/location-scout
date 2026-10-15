import {
  CATEGORY_IDS,
  CATEGORY_NAMES,
  HM_LAND_REGISTRY_SEARCHES,
  LAND_OPPORTUNITY_WORDING,
  SERVED_LAYER_IDS,
  isAreaResponse,
  isGeocodeResponse,
  isHighlightsResponse,
  isLandLayerResponse,
  isLayerResponse,
  isModesResponse,
  isScoresResponse,
  DEFAULT_SCOUT_MODE,
  type CategoryId,
  type CategoryScore,
  type Highlight,
  type LandOpportunityFeature,
  type ScoutMode,
  type SearchRadiusMiles,
  type ServedLayerId,
} from "@location-scout/shared";

import {
  LAYER_NAMES,
  NFR_LIMITS,
  duration,
  searchAreaRequests,
  type Answer,
  type Ask,
} from "../bench/bench-runs";
import type { SurveyLocation } from "./locations";

/**
 * `pnpm survey`: PRD §6.19's seventh success criterion, made repeatable. It
 * loads each of the 20 real Locations' Search Areas from the API as the
 * frontend does, records every Layer's status, every Scout Mode's scores
 * and Highlights, and samples Possibly Unregistered Land Opportunities for
 * a person to check against HM Land Registry's index map (criterion 4).
 * What it finds is for a person to judge, and to tune `SCORING_CONFIG` by:
 * it judges nothing itself. Tests run it against the recordings the
 * end-to-end tests use; only `pnpm survey` reaches the live Data Sources.
 */

/** Each Location is surveyed at the frontend's default Search Radius (PRD FR-1.4). */
export const SURVEY_RADIUS: SearchRadiusMiles = 0.5;

/** How many Possibly Unregistered Land Opportunities to check against the index map (PRD §6.19). */
export const UNREGISTERED_SAMPLE = 10;

/** One Category Score's figures, without the rules' text, which the config gives. */
export interface SurveyedScore {
  id: CategoryId;
  status: CategoryScore["status"];
  score: number | null;
  parts: {
    input: string;
    value: number | boolean | null;
    unit: string | null;
    points: number;
  }[];
}

/** What one Location's Search Area gave. */
export interface LocationSurvey {
  location: SurveyLocation;
  /** Why it couldn't be surveyed, or `null` if it was. */
  error: string | null;
  lat: number | null;
  lng: number | null;
  ward: string | null;
  localAuthority: string | null;
  /** The prepared council it is in, or `null`. */
  council: string | null;
  /** From the search until the Search Area, every Layer, the scores and the Highlights had answered, uncached. */
  loadMs: number | null;
  /** The slowest of those requests, by name. */
  slowest: string | null;
  layers: Partial<Record<ServedLayerId, string>>;
  /** The Planning Applications' status once they were waited for: `ok`, `queued` or `unavailable`. */
  applications: string | null;
  /** Every Category Score but Competition, which each mode counts by its own competitors. */
  categories: SurveyedScore[];
  /** Each Scout Mode's Location Score. */
  locationScores: Record<string, number | null>;
  /** Each Retail and Business mode's Competition. */
  competition: Record<string, SurveyedScore>;
  /** Each Scout Mode's Highlights. */
  highlights: Record<string, Highlight[]>;
  /**
   * The months data.police.uk didn't answer for, which the Crime Layer
   * scales the rest up to a year for, and gives no year-on-year change.
   */
  missingCrimeMonths: string[];
  /**
   * Whether only the General Scout Mode was asked, because a Layer or the
   * Planning Applications were unavailable, or data.police.uk didn't answer
   * for some months: a Data Source's failure isn't cached, so asking every
   * mode would ask it again for each, and each could count different crimes.
   */
  onlyGeneral: boolean;
  /** The Land Opportunities in the Search Area, if it reaches into a Land Coverage Area. */
  land: { count: number; possiblyUnregistered: number } | null;
}

/** A Possibly Unregistered Land Opportunity to check against HM Land Registry's index map. */
export interface UnregisteredCheck {
  id: string;
  name: string | null;
  landUse: string[];
  areaAcres: number;
  /** The share of its area INSPIRE Index Polygons cover, from 0 to 1. */
  inspireCoverage: number;
  lat: number;
  lng: number;
}

/** The Possibly Unregistered Land Opportunities across one Land Coverage Area, and those sampled. */
export interface UnregisteredSample {
  council: string;
  /** How many there are across it, with FR-5.3's default filters. */
  total: number;
  /** How many Land Opportunities there are in all, Possibly Unregistered or not. */
  opportunities: number;
  /** How many the API listed to sample from: the largest, up to `LAND_LIST_LIMIT`. */
  listed: number;
  sample: UnregisteredCheck[];
}

export interface SurveyResult {
  /** The day it was run, as `YYYY-MM-DD`. */
  date: string;
  /** Whether it answered from the recordings rather than the live Data Sources. */
  recorded: boolean;
  modes: Pick<ScoutMode, "id" | "name" | "competitors">[];
  locations: LocationSurvey[];
  /**
   * The Locations kept, by postcode, from an earlier run in which they were
   * surveyed in full, and the day it was run on; or `null`.
   */
  kept: { date: string; postcodes: string[] } | null;
  unregistered: UnregisteredSample[];
}

/** How the survey waits: between asks for queued Planning Applications, and for how long at most. */
export interface SurveyTiming {
  pollMs: number;
  /** PlanIt answers about once a minute (ADR 0003), so a little longer. */
  applicationsTimeoutMs: number;
  sleep: (ms: number) => Promise<void>;
}

export const SURVEY_TIMING: SurveyTiming = {
  pollMs: 5000,
  applicationsTimeoutMs: 150_000,
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

const errorOf = ({ status, body }: Answer) =>
  typeof body === "object" &&
  body !== null &&
  "error" in body &&
  typeof body.error === "string"
    ? body.error
    : `it answered ${String(status)}`;

const surveyedScore = ({
  id,
  status,
  score,
  breakdown,
}: CategoryScore): SurveyedScore => ({
  id,
  status,
  score,
  parts: breakdown.map(({ input, value, unit, points }) => ({
    input,
    value,
    unit,
    points,
  })),
});

const notSurveyed = (
  location: SurveyLocation,
  error: string,
): LocationSurvey => ({
  location,
  error,
  lat: null,
  lng: null,
  ward: null,
  localAuthority: null,
  council: null,
  loadMs: null,
  slowest: null,
  layers: {},
  applications: null,
  categories: [],
  locationScores: {},
  competition: {},
  highlights: {},
  missingCrimeMonths: [],
  onlyGeneral: false,
  land: null,
});

/** The Scout Modes the API offers, General first. */
export const askModes = async (ask: Ask) => {
  const answer = await ask("/api/modes");
  if (!isModesResponse(answer.body)) {
    throw new Error(`/api/modes failed: ${errorOf(answer)}`);
  }
  return answer.body.modes;
};

/**
 * Asks for the Planning Layer again, as the frontend does every 5 seconds,
 * until its Planning Applications are no longer waiting for PlanIt's turn,
 * or the timing's limit is reached, and gives their status.
 */
const waitForApplications = async (
  ask: Ask,
  path: string,
  first: string | null,
  timing: SurveyTiming,
) => {
  let status = first;
  const started = performance.now();
  while (
    status === "queued" &&
    performance.now() - started < timing.applicationsTimeoutMs
  ) {
    await timing.sleep(timing.pollMs);
    const { body } = await ask(path);
    status =
      isLayerResponse(body) && body.layer === "planning"
        ? (body.applications?.status ?? null)
        : null;
  }
  return status;
};

/** Whether a Layer, or the Planning Applications, were unavailable. */
const anyUnavailable = (
  layers: LocationSurvey["layers"],
  applications: string | null,
) =>
  applications === "unavailable" ||
  Object.values(layers).some((status) => status === "unavailable");

/**
 * Searches for a Location's postcode, loads its Search Area as the frontend
 * does, timing it, waits for its Planning Applications, then asks for its
 * scores and Highlights in every Scout Mode, all from the cache.
 */
export const surveyLocation = async (
  ask: Ask,
  location: SurveyLocation,
  modes: readonly Pick<ScoutMode, "id" | "competitors">[],
  timing: SurveyTiming = SURVEY_TIMING,
): Promise<LocationSurvey> => {
  const started = performance.now();
  const since = () => Math.round(performance.now() - started);
  const geocoded = await ask(
    `/api/geocode?${new URLSearchParams({ q: location.postcode }).toString()}`,
  );
  const [found] = isGeocodeResponse(geocoded.body)
    ? geocoded.body.candidates
    : [];
  if (found === undefined) {
    return notSurveyed(
      location,
      `/api/geocode didn't find ${location.postcode}: ${errorOf(geocoded)}`,
    );
  }

  const query = new URLSearchParams({
    lat: String(found.location.lat),
    lng: String(found.location.lng),
    radius: String(SURVEY_RADIUS),
    postcode: found.label,
  }).toString();
  const answered = await Promise.all(
    searchAreaRequests(query).map(async (request) => {
      const answer = await ask(request.path);
      return { ...request, answer, answeredMs: since() };
    }),
  );
  const loadMs = since();
  const failed = answered.find(({ answer }) => answer.status !== 200);
  if (failed !== undefined) {
    return {
      ...notSurveyed(
        location,
        `${failed.path} failed: ${errorOf(failed.answer)}`,
      ),
      lat: found.location.lat,
      lng: found.location.lng,
    };
  }
  const slowest = answered.reduce((a, b) =>
    b.answeredMs > a.answeredMs ? b : a,
  );

  const area = answered.find(({ name }) => name === "Search Area")?.answer.body;
  const layers: Partial<Record<ServedLayerId, string>> = {};
  let applications: string | null = null;
  let missingCrimeMonths: string[] = [];
  let land: LocationSurvey["land"] = null;
  for (const { layer, answer } of answered) {
    if (layer === null || !isLayerResponse(answer.body)) continue;
    layers[layer] = answer.body.status;
    if (answer.body.layer === "planning") {
      applications = answer.body.applications?.status ?? null;
    }
    if (answer.body.layer === "crime" && answer.body.statistics !== null) {
      missingCrimeMonths = answer.body.statistics.trend.missingMonths;
    }
    if (isLandLayerResponse(answer.body) && answer.body.statistics !== null) {
      land = {
        count: answer.body.statistics.count,
        possiblyUnregistered: answer.body.statistics.possiblyUnregistered,
      };
    }
  }
  applications = await waitForApplications(
    ask,
    `/api/area/planning?${query}`,
    applications,
    timing,
  );

  const onlyGeneral =
    anyUnavailable(layers, applications) || missingCrimeMonths.length > 0;
  const categories = new Map<CategoryId, SurveyedScore>();
  const locationScores: Record<string, number | null> = {};
  const competition: Record<string, SurveyedScore> = {};
  const highlights: Record<string, Highlight[]> = {};
  for (const { id, competitors } of onlyGeneral
    ? modes.filter((mode) => mode.id === DEFAULT_SCOUT_MODE)
    : modes) {
    const scores = await ask(`/api/scores?${query}&mode=${id}`);
    if (isScoresResponse(scores.body)) {
      locationScores[id] = scores.body.location.score;
      for (const category of scores.body.categories) {
        if (category.id === "competition") {
          if (competitors !== null) competition[id] = surveyedScore(category);
        } else if (!categories.has(category.id)) {
          categories.set(category.id, surveyedScore(category));
        }
      }
    }
    const given = await ask(`/api/highlights?${query}&mode=${id}`);
    if (isHighlightsResponse(given.body)) {
      highlights[id] = given.body.highlights;
    }
  }

  return {
    location,
    error: null,
    lat: found.location.lat,
    lng: found.location.lng,
    ward: isAreaResponse(area) ? area.geography.ward : null,
    localAuthority: isAreaResponse(area) ? area.geography.localAuthority : null,
    council:
      isAreaResponse(area) && area.council.status === "ok"
        ? (area.council.council?.name ?? null)
        : null,
    loadMs,
    slowest: slowest.name,
    layers,
    applications,
    categories: CATEGORY_IDS.flatMap((id) => categories.get(id) ?? []),
    locationScores,
    competition,
    highlights,
    missingCrimeMonths,
    onlyGeneral,
    land,
  };
};

/**
 * Whether a Location was surveyed in full: found, with every Layer and its
 * Planning Applications answering, and data.police.uk for every month, and
 * so in every Scout Mode.
 */
export const surveyedInFull = (survey: LocationSurvey) =>
  survey.error === null &&
  survey.applications !== "queued" &&
  !anyUnavailable(survey.layers, survey.applications) &&
  survey.missingCrimeMonths.length === 0;

/**
 * `count` items spread evenly through `items`, from the first towards the
 * last, so a sample of a list in order of size has small and large alike.
 */
export const spreadSample = <T>(items: readonly T[], count: number): T[] => {
  if (items.length <= count) return [...items];
  return Array.from(
    { length: count },
    (_, index) => items[Math.floor((index * items.length) / count)] as T,
  );
};

const unregisteredCheck = ({
  id,
  name,
  landUse,
  areaAcres,
  inspireCoverage,
  location,
}: LandOpportunityFeature): UnregisteredCheck => ({
  id,
  name,
  landUse,
  areaAcres,
  inspireCoverage,
  lat: location.lat,
  lng: location.lng,
});

/**
 * For each Land Coverage Area a surveyed Location is in, finds the Possibly
 * Unregistered Land Opportunities across it with FR-5.3's default filters,
 * largest first, and samples `UNREGISTERED_SAMPLE` of them from largest to
 * smallest, to check against HM Land Registry's index map.
 */
export const sampleUnregistered = async (
  ask: Ask,
  surveys: readonly LocationSurvey[],
): Promise<UnregisteredSample[]> => {
  const samples: UnregisteredSample[] = [];
  for (const survey of surveys) {
    if (
      survey.land === null ||
      survey.council === null ||
      survey.lat === null ||
      survey.lng === null ||
      samples.some(({ council }) => council === survey.council)
    ) {
      continue;
    }
    const query = new URLSearchParams({
      lat: String(survey.lat),
      lng: String(survey.lng),
      radius: String(SURVEY_RADIUS),
      scope: "land-coverage-area",
    });
    const all = await ask(`/api/land?${query.toString()}`);
    query.set("possiblyUnregisteredOnly", "true");
    const unregistered = await ask(`/api/land?${query.toString()}`);
    if (
      !isLandLayerResponse(all.body) ||
      !isLandLayerResponse(unregistered.body) ||
      unregistered.body.statistics === null
    ) {
      continue;
    }
    samples.push({
      council: survey.council,
      total: unregistered.body.statistics.count,
      opportunities: all.body.statistics?.count ?? 0,
      listed: unregistered.body.features.length,
      sample: spreadSample(unregistered.body.features, UNREGISTERED_SAMPLE).map(
        unregisteredCheck,
      ),
    });
  }
  return samples;
};

export interface SurveyOptions {
  ask: Ask;
  locations: readonly SurveyLocation[];
  today: string;
  recorded: boolean;
  timing?: SurveyTiming;
  /**
   * An earlier run, whose Locations surveyed in full are kept rather than
   * asked about again: only those not found, or with a Layer unavailable,
   * are surveyed again.
   */
  previous?: SurveyResult | undefined;
  /** Called as each Location has been surveyed, or kept. */
  onLocation?: (survey: LocationSurvey, index: number, kept: boolean) => void;
}

/**
 * Surveys each Location in turn, so no Data Source is asked for two at once,
 * keeping those an earlier run surveyed in full, then samples the Possibly
 * Unregistered land.
 */
export const runSurvey = async ({
  ask,
  locations,
  today,
  recorded,
  timing,
  previous,
  onLocation,
}: SurveyOptions): Promise<SurveyResult> => {
  const modes = await askModes(ask);
  const surveys: LocationSurvey[] = [];
  const kept: string[] = [];
  for (const [index, location] of locations.entries()) {
    const earlier = previous?.locations.find(
      (survey) =>
        survey.location.postcode === location.postcode &&
        surveyedInFull(survey),
    );
    const survey =
      earlier ?? (await surveyLocation(ask, location, modes, timing));
    if (earlier !== undefined) kept.push(location.postcode);
    surveys.push(survey);
    onLocation?.(survey, index, earlier !== undefined);
  }
  return {
    date: today,
    recorded,
    modes: modes.map(({ id, name, competitors }) => ({
      id,
      name,
      competitors,
    })),
    locations: surveys,
    kept:
      previous === undefined || kept.length === 0
        ? null
        : { date: previous.date, postcodes: kept },
    unregistered: await sampleUnregistered(ask, surveys),
  };
};

/** A Category Score as a table gives it: its score, or why it has none. */
const scoreCell = (score: SurveyedScore | undefined) => {
  if (score === undefined) return "–";
  if (score.score !== null) return String(score.score);
  return { unavailable: "U", "not-prepared": "NP", queued: "Q", ok: "?" }[
    score.status
  ];
};

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** How one Category Score spread over the Locations surveyed. */
export interface CategorySpread {
  id: CategoryId;
  scored: number;
  notScored: number;
  min: number | null;
  median: number | null;
  max: number | null;
  atZero: number;
  atHundred: number;
}

/** How each Category Score spread over the Locations surveyed, which is what tuning a threshold looks at. */
export const categorySpread = (
  surveys: readonly LocationSurvey[],
): CategorySpread[] =>
  CATEGORY_IDS.filter((id) => id !== "competition").map((id) => {
    const scores = surveys.flatMap(({ categories }) =>
      categories.filter((category) => category.id === id),
    );
    const values = scores.flatMap(({ score }) => (score === null ? [] : score));
    return {
      id,
      scored: values.length,
      notScored: scores.length - values.length,
      min: values.length === 0 ? null : Math.min(...values),
      median: values.length === 0 ? null : median(values),
      max: values.length === 0 ? null : Math.max(...values),
      atZero: values.filter((value) => value === 0).length,
      atHundred: values.filter((value) => value === 100).length,
    };
  });

const LEVEL_MARKS = { concern: "🔴", watch: "🟠", good: "🟢" } as const;

const figure = ({ value, unit }: SurveyedScore["parts"][number]) => {
  if (value === null) return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  const rounded = Math.round(value * 10) / 10;
  return unit === null ? String(rounded) : `${String(rounded)} ${unit}`;
};

const row = (cells: readonly (string | number)[]) =>
  `| ${cells.map(String).join(" | ")} |`;

const osmLink = (lat: number, lng: number) =>
  `[map](https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=17/${lat.toFixed(5)}/${lng.toFixed(5)})`;

/** The survey as Markdown: what each Location gave, how each score spread, and the land to check by hand. */
export const surveyMarkdown = (result: SurveyResult) => {
  const { locations, modes, unregistered } = result;
  const shownModes = modes.filter(({ competitors }) => competitors === null);
  const businessModes = modes.filter(({ competitors }) => competitors !== null);
  const categories = CATEGORY_IDS.filter((id) => id !== "competition");
  const lines: string[] = [
    "# Survey of 20 Locations",
    "",
    `Written by \`pnpm survey\` on ${result.date}, ${result.recorded ? "from the recordings the end-to-end tests use" : "with the live Data Sources"}, at the ${String(SURVEY_RADIUS)} mile Search Radius. Run it again rather than editing this file. [Phase 1 success checks](README.md) says what it found and what changed because of it.`,
    ...(result.kept === null
      ? []
      : [
          "",
          `${String(result.kept.postcodes.length)} of the Locations (${result.kept.postcodes.join(", ")}) are kept from a run on ${result.kept.date}, in which every Layer answered; the rest were surveyed again.`,
        ]),
    "",
    "## Locations",
    "",
    "Loaded in is from the search until the Search Area, every Layer, the scores and the Highlights had answered, uncached, as `pnpm bench` times NFR-2.1. A Layer not `ok` is named with its status: unavailable (U) or not prepared (NP).",
    "",
    row([
      "#",
      "Kind",
      "Location",
      "Postcode",
      "Local authority",
      "Loaded in",
      "Slowest",
      "Layers not ok",
      "Land Opportunities (Possibly Unregistered)",
    ]),
    row(Array.from({ length: 9 }, () => "---")),
  ];
  for (const [index, survey] of locations.entries()) {
    const notOk = SERVED_LAYER_IDS.flatMap((layer) => {
      const status = survey.layers[layer];
      return status === undefined || status === "ok"
        ? []
        : `${LAYER_NAMES[layer]} ${status === "not-prepared" ? "NP" : "U"}`;
    });
    if (survey.applications !== null && survey.applications !== "ok") {
      notOk.push(`Planning Applications ${survey.applications}`);
    }
    lines.push(
      row([
        index + 1,
        survey.location.kind,
        survey.location.name,
        survey.location.postcode,
        survey.localAuthority ?? "–",
        survey.loadMs === null
          ? (survey.error ?? "–")
          : `${duration(survey.loadMs)}${survey.loadMs < NFR_LIMITS.uncachedMs ? "" : " ⚠"}`,
        survey.slowest ?? "–",
        survey.error !== null
          ? "–"
          : notOk.length === 0
            ? "none"
            : notOk.join(", "),
        survey.land === null
          ? "–"
          : `${String(survey.land.count)} (${String(survey.land.possiblyUnregistered)})`,
      ]),
    );
  }

  lines.push(
    "",
    "## Location Scores",
    "",
    "Each Scout Mode's Location Score, its weights renormalised over the Category Scores available.",
    "",
    row(["#", "Location", ...modes.map(({ name }) => name)]),
    row(Array.from({ length: modes.length + 2 }, () => "---")),
  );
  for (const [index, survey] of locations.entries()) {
    lines.push(
      row([
        index + 1,
        survey.location.name,
        ...modes.map(({ id }) => {
          const score = survey.locationScores[id];
          return score === undefined || score === null ? "–" : score;
        }),
      ]),
    );
  }

  lines.push(
    "",
    "## Category Scores",
    "",
    "The same in every Scout Mode that weighs them. Competition, which counts each mode's own competitors, is in the next table. U: unavailable; NP: not prepared; Q: still waiting for PlanIt.",
    "",
    row(["#", "Location", ...categories.map((id) => CATEGORY_NAMES[id])]),
    row(Array.from({ length: categories.length + 2 }, () => "---")),
  );
  for (const [index, survey] of locations.entries()) {
    lines.push(
      row([
        index + 1,
        survey.location.name,
        ...categories.map((id) =>
          scoreCell(survey.categories.find((category) => category.id === id)),
        ),
      ]),
    );
  }

  lines.push(
    "",
    "## Competition",
    "",
    row(["#", "Location", ...businessModes.map(({ name }) => name)]),
    row(Array.from({ length: businessModes.length + 2 }, () => "---")),
  );
  for (const [index, survey] of locations.entries()) {
    lines.push(
      row([
        index + 1,
        survey.location.name,
        ...businessModes.map(({ id }) => scoreCell(survey.competition[id])),
      ]),
    );
  }

  lines.push(
    "",
    "## How each Category Score spread",
    "",
    "A score that is 0 or 100 at most Locations tells them apart no better than a coin: its thresholds are where tuning starts.",
    "",
    row([
      "Category Score",
      "Scored",
      "Not scored",
      "Min",
      "Median",
      "Max",
      "At 0",
      "At 100",
    ]),
    row(Array.from({ length: 8 }, () => "---")),
    ...categorySpread(locations).map((spread) =>
      row([
        CATEGORY_NAMES[spread.id],
        spread.scored,
        spread.notScored,
        spread.min ?? "–",
        spread.median ?? "–",
        spread.max ?? "–",
        spread.atZero,
        spread.atHundred,
      ]),
    ),
  );

  lines.push(
    "",
    "## Highlights",
    "",
    "How many Highlights each Scout Mode gave: 🔴 Concern / 🟠 Watch / 🟢 Good.",
    "",
    row([
      "#",
      "Location",
      ...shownModes.map(({ name }) => name),
      "Retail and Business (fewest–most)",
    ]),
    row(Array.from({ length: shownModes.length + 3 }, () => "---")),
  );
  const counts = (highlights: readonly Highlight[] | undefined) =>
    highlights === undefined
      ? "–"
      : (["concern", "watch", "good"] as const)
          .map((level) =>
            String(highlights.filter((h) => h.level === level).length),
          )
          .join(" / ");
  for (const [index, survey] of locations.entries()) {
    const business = businessModes.map(
      ({ id }) => survey.highlights[id]?.length ?? 0,
    );
    lines.push(
      row([
        index + 1,
        survey.location.name,
        ...shownModes.map(({ id }) => counts(survey.highlights[id])),
        business.length === 0
          ? "–"
          : `${String(Math.min(...business))}–${String(Math.max(...business))}`,
      ]),
    );
  }

  lines.push(
    "",
    "## Each Location",
    "",
    "Its General Scout Mode's Highlights, then each Category Score's figures and the points they earned.",
  );
  for (const [index, survey] of locations.entries()) {
    lines.push(
      "",
      `### ${String(index + 1)}. ${survey.location.name} (${survey.location.kind}, ${survey.location.postcode})`,
      "",
    );
    if (survey.error !== null) {
      lines.push(`Not surveyed: ${survey.error}`);
      continue;
    }
    lines.push(
      `${survey.ward ?? "No ward"}, ${survey.localAuthority ?? "no local authority"}. General Location Score ${String(survey.locationScores.general ?? "–")}.${survey.missingCrimeMonths.length > 0 ? ` data.police.uk didn't answer for ${String(survey.missingCrimeMonths.length)} of the 24 months (${survey.missingCrimeMonths.join(", ")}), so the rest are scaled up to a year and there is no year-on-year change.` : ""}${survey.onlyGeneral ? " Only the General Scout Mode was asked, as a Data Source failed and asking each mode would ask it again." : ""}`,
      "",
    );
    const general = survey.highlights.general ?? [];
    lines.push(
      ...(general.length === 0
        ? ["- No Highlights in the General Scout Mode."]
        : general.map(({ level, text }) => `- ${LEVEL_MARKS[level]} ${text}`)),
      "",
    );
    for (const category of survey.categories) {
      const parts = category.parts
        .map(
          (part) => `${part.input}: ${figure(part)} (${String(part.points)})`,
        )
        .join("; ");
      lines.push(
        `- **${CATEGORY_NAMES[category.id]} ${scoreCell(category)}**${parts === "" ? "" : `: ${parts}`}`,
      );
    }
  }

  lines.push(
    "",
    "## Possibly Unregistered land to check",
    "",
    `PRD §6.19's fourth criterion: check ${String(UNREGISTERED_SAMPLE)} Possibly Unregistered results against HM Land Registry's index map. These are spread evenly through each Land Coverage Area's Possibly Unregistered Land Opportunities, with FR-5.3's default filters, from the largest to the smallest. For each, find it on [${HM_LAND_REGISTRY_SEARCHES[0].name}](${HM_LAND_REGISTRY_SEARCHES[0].url})'s map, or ask for an official [${HM_LAND_REGISTRY_SEARCHES[1].name.toLowerCase()}](${HM_LAND_REGISTRY_SEARCHES[1].url}), and note whether registered titles cover most of it, part of it or none of it. ${LAND_OPPORTUNITY_WORDING}`,
  );
  if (unregistered.length === 0) {
    lines.push(
      "",
      "No surveyed Location is in a Land Coverage Area: run `pnpm data:prepare`.",
    );
  }
  for (const {
    council,
    total,
    opportunities,
    listed,
    sample,
  } of unregistered) {
    lines.push(
      "",
      `### ${council}`,
      "",
      `${String(total)} of its ${String(opportunities)} Land Opportunities are Possibly Unregistered.${listed < total ? ` The API lists the largest ${String(listed)}, which these are spread through.` : ""}`,
      "",
      row([
        "#",
        "Land Parcel",
        "Name",
        "Land use",
        "Acres",
        "INSPIRE coverage",
        "Where",
        "Index map says",
      ]),
      row(Array.from({ length: 8 }, () => "---")),
      ...sample.map((check, index) =>
        row([
          index + 1,
          `\`${check.id}\``,
          check.name ?? "–",
          check.landUse.join(", "),
          check.areaAcres.toFixed(2),
          `${(check.inspireCoverage * 100).toFixed(0)}%`,
          `${check.lat.toFixed(5)}, ${check.lng.toFixed(5)} (${osmLink(check.lat, check.lng)})`,
          "",
        ]),
      ),
    );
  }
  return `${lines.join("\n")}\n`;
};
