import {
  PLANNING_APPLICATION_RULES,
  type SearchArea,
} from "@location-scout/shared";

import {
  ANTHROPIC_TIMEOUT_MS,
  DEFAULT_ANTHROPIC_MODEL,
  createAnthropicModel,
  modelErrorMessage,
} from "../explain/model";
import {
  SOURCE_TIMEOUT_MS,
  type CallSource,
  type SourceResult,
} from "../sources/data-source";
import { createEpcRegister, epcRegister } from "../sources/epc";
import {
  landRegistry,
  salesInLastTwelveMonths,
  yearsUpTo,
} from "../sources/land-registry";
import {
  NOMINATIM_INTERVAL_MS,
  nominatim,
  searchAddress,
} from "../sources/nominatim";
import {
  OVERPASS_INTERVAL_MS,
  osmElements,
  overpass,
} from "../sources/overpass";
import type { QueuedResult } from "../sources/planning-applications";
import { planningConstraints, planningData } from "../sources/planning-data";
import { PLANIT_INTERVAL_MS, createPlanIt, planIt } from "../sources/planit";
import { createPlanWire, planWire } from "../sources/planwire";
import { POLICE_INTERVAL_MS, latestCrimes, police } from "../sources/police";
import {
  lookupPostcode,
  postcodesInSearchArea,
  postcodesIo,
} from "../sources/postcodes-io";
import { createRateLimiter } from "../sources/rate-limiter";

/**
 * `pnpm smoke`: the opt-in smoke script (PRD NFR-3.3). It calls each live
 * Data Source once, as the app would, and checks its answer still maps to
 * our types. Tests never call it live: they run these checks against the
 * recordings the end-to-end tests use.
 */

/** Where every check asks about: NG17 1AA's 0.5 mile Search Area, which the recordings cover. */
export const SMOKE_POSTCODE = "NG17 1AA";
export const SMOKE_AREA: SearchArea = {
  location: { lat: 53.123664, lng: -1.264078 },
  searchRadius: { miles: 0.5, metres: 804.672 },
};

/** The address Nominatim is asked for, which it has always found. */
export const SMOKE_ADDRESS = "12 High Street, Sutton-in-Ashfield";

/** A postcode in the Search Area with homes, so the EPC API has certificates for it. */
export const SMOKE_EPC_POSTCODE = "NG17 1EJ";

/** The settings the checks need, each `null` where it isn't set. */
export interface SmokeSettings {
  /** `NOMINATIM_USER_AGENT`, which Nominatim and Overpass are sent. */
  userAgent: string | null;
  /** `PLANIT_USER_AGENT`, or else `userAgent`, which PlanIt is sent. */
  planItUserAgent: string | null;
  /** `PLANWIRE_API_KEY`, whichever provider `PLANNING_APPLICATIONS_PROVIDER` names. */
  planWireApiKey: string | null;
  epcApiKey: string | null;
  anthropicApiKey: string | null;
  anthropicModel: string;
}

const setting = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/**
 * Reads the checks' settings from the same variables as the API. Unlike the
 * API, it runs without `NOMINATIM_USER_AGENT`, skipping the sources that
 * must be sent one.
 */
export const readSmokeSettings = (
  env: Record<string, string | undefined>,
): SmokeSettings => {
  const userAgent = setting(env.NOMINATIM_USER_AGENT);
  return {
    userAgent,
    planItUserAgent: setting(env.PLANIT_USER_AGENT) ?? userAgent,
    planWireApiKey: setting(env.PLANWIRE_API_KEY),
    epcApiKey: setting(env.EPC_API_KEY),
    anthropicApiKey: setting(env.ANTHROPIC_API_KEY),
    anthropicModel: setting(env.ANTHROPIC_MODEL) ?? DEFAULT_ANTHROPIC_MODEL,
  };
};

/** The answer was missing something it has always had: its format may have changed. */
export class SmokeError extends Error {
  override name = "SmokeError";
}

/** What a check is given. */
export interface SmokeContext {
  settings: SmokeSettings;
  /** Calls a Data Source with the app's 8-second timeout, and no cache. */
  callSource: CallSource;
  /** The data, or throws why the call failed: the adapter's own error. */
  answered: <T>(result: SourceResult<T> | QueuedResult<T>) => T;
  /** Every request goes through it, so it can be counted. */
  fetch: typeof fetch;
  /** Today's date, ISO 8601, as the app asks with it. */
  today: string;
}

/** One live Data Source's check. */
export interface SmokeCheck {
  /** Its Data Source's id, as the API reports it. */
  id: string;
  /** The name users see. */
  name: string;
  /** Why it can't be checked, such as a key that isn't set, or `null` if it can. */
  skip: (settings: SmokeSettings) => string | null;
  /** Calls it once and checks its answer, saying what it found, or throws. */
  run: (context: SmokeContext) => Promise<string>;
}

/** Throws a `SmokeError` saying `what` was missing unless `found`. */
const expectFound = (found: boolean, what: string) => {
  if (!found) {
    throw new SmokeError(
      `${what}, as it always has: its answer may have changed`,
    );
  }
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;

const NEEDS_USER_AGENT =
  "no NOMINATIM_USER_AGENT, which it asks every request to identify us with";

/** Every live Data Source the API calls, in the order they are checked. */
export const SMOKE_CHECKS: readonly SmokeCheck[] = [
  {
    id: postcodesIo.id,
    name: postcodesIo.name,
    skip: () => null,
    run: async ({ callSource, answered }) => {
      const lookup = answered(await lookupPostcode(SMOKE_POSTCODE, callSource));
      expectFound(lookup.kind === "found", `It didn't find ${SMOKE_POSTCODE}`);
      if (lookup.kind !== "found") return "";
      expectFound(
        lookup.country === "England",
        `It didn't put ${SMOKE_POSTCODE} in England`,
      );
      const { localAuthority, ward } = lookup.geography;
      expectFound(
        localAuthority !== null && ward !== null,
        `It didn't name ${SMOKE_POSTCODE}'s local authority and ward`,
      );
      return `${SMOKE_POSTCODE} is in ${String(ward)}, ${String(localAuthority)}, ${lookup.country}`;
    },
  },
  {
    id: nominatim.id,
    name: nominatim.name,
    skip: ({ userAgent }) => (userAgent === null ? NEEDS_USER_AGENT : null),
    run: async ({ settings, callSource, answered }) => {
      const candidates = answered(
        await searchAddress(SMOKE_ADDRESS, callSource, {
          userAgent: settings.userAgent ?? "",
          limiter: createRateLimiter(NOMINATIM_INTERVAL_MS),
        }),
      );
      const [first] = candidates;
      expectFound(
        first !== undefined,
        `It found no place for "${SMOKE_ADDRESS}"`,
      );
      return `"${SMOKE_ADDRESS}" found ${plural(candidates.length, "place")}, first ${String(first?.label)}`;
    },
  },
  {
    id: police.id,
    name: police.name,
    skip: () => null,
    run: async ({ callSource, answered }) => {
      const { counts } = answered(
        await latestCrimes(SMOKE_AREA, callSource, {
          limiter: createRateLimiter(POLICE_INTERVAL_MS),
        }),
      );
      expectFound(
        counts.total > 0,
        `It gave no crimes around ${SMOKE_POSTCODE}`,
      );
      return `${plural(counts.total, "crime")} around ${SMOKE_POSTCODE} in ${counts.month}, the latest month published`;
    },
  },
  {
    id: planningData.id,
    name: planningData.name,
    skip: () => null,
    run: async ({ callSource, answered, today }) => {
      const { features, statistics } = answered(
        await planningConstraints(SMOKE_AREA, callSource, today),
      );
      // NG17 1AA is inside Sutton-in-Ashfield's conservation area.
      expectFound(
        statistics.coveringLocation.length > 0,
        `It gave no Planning Constraint covering ${SMOKE_POSTCODE}`,
      );
      return `${plural(features.length, "Planning Constraint")} around ${SMOKE_POSTCODE}, ${String(statistics.coveringLocation.length)} covering it`;
    },
  },
  {
    id: overpass.id,
    name: overpass.name,
    skip: ({ userAgent }) => (userAgent === null ? NEEDS_USER_AGENT : null),
    run: async ({ settings, callSource, answered }) => {
      const { elements, dataDate } = answered(
        await osmElements(SMOKE_AREA, callSource, {
          userAgent: settings.userAgent ?? "",
          limiter: createRateLimiter(OVERPASS_INTERVAL_MS),
        }),
      );
      expectFound(
        elements.length > 0,
        `It gave no OpenStreetMap elements around ${SMOKE_POSTCODE}`,
      );
      expectFound(
        dataDate !== null,
        "It didn't date its copy of OpenStreetMap",
      );
      return `${plural(elements.length, "OpenStreetMap element")} around ${SMOKE_POSTCODE}, as OpenStreetMap stood on ${String(dataDate)}`;
    },
  },
  {
    id: landRegistry.id,
    name: landRegistry.name,
    skip: () => null,
    run: async ({ callSource, answered, today }) => {
      // Price Paid is asked by postcode, so postcodes.io is asked for the
      // Search Area's first, as the Property Layer does.
      const postcodes = answered(
        await postcodesInSearchArea(SMOKE_AREA, callSource),
      );
      expectFound(
        postcodes.postcodes.length > 0,
        `postcodes.io gave no postcodes around ${SMOKE_POSTCODE} to ask Price Paid about`,
      );
      const sales = answered(
        await salesInLastTwelveMonths(postcodes, callSource, today),
      );
      expectFound(
        sales.length > 0,
        `It gave no sales in the last 12 months around ${SMOKE_POSTCODE}`,
      );
      return `${plural(sales.length, "sale")} in the last 12 months in ${plural(postcodes.postcodes.length, "postcode")} around ${SMOKE_POSTCODE}`;
    },
  },
  {
    id: planIt.id,
    name: planIt.name,
    skip: ({ planItUserAgent }) =>
      planItUserAgent === null
        ? "no PLANIT_USER_AGENT or NOMINATIM_USER_AGENT, one of which it asks for"
        : null,
    run: async ({ settings, callSource, answered, today }) => {
      // A limiter of its own, whose first turn is free, so it asks at once.
      // PlanIt allows about one request a minute: don't run this more often.
      const provider = createPlanIt({
        userAgent: settings.planItUserAgent ?? "",
        limiter: createRateLimiter(PLANIT_INTERVAL_MS),
      });
      const period = yearsUpTo(today, PLANNING_APPLICATION_RULES.years);
      const { features } = answered(
        await provider.find(SMOKE_AREA, period, callSource),
      );
      expectFound(
        features.length > 0,
        `It gave no Planning Applications around ${SMOKE_POSTCODE}`,
      );
      return `${plural(features.length, "Planning Application")} around ${SMOKE_POSTCODE} since ${period.from}`;
    },
  },
  {
    id: planWire.id,
    name: planWire.name,
    skip: ({ planWireApiKey }) =>
      planWireApiKey === null ? "no PLANWIRE_API_KEY" : null,
    run: async ({ settings, callSource, answered, today }) => {
      const provider = createPlanWire({
        apiKey: settings.planWireApiKey ?? "",
      });
      const period = yearsUpTo(today, PLANNING_APPLICATION_RULES.years);
      const { features } = answered(
        await provider.find(SMOKE_AREA, period, callSource),
      );
      expectFound(
        features.length > 0,
        `It gave no Planning Applications around ${SMOKE_POSTCODE}`,
      );
      return `${plural(features.length, "Planning Application")} around ${SMOKE_POSTCODE} since ${period.from}`;
    },
  },
  {
    id: epcRegister.id,
    name: epcRegister.name,
    skip: ({ epcApiKey }) => (epcApiKey === null ? "no EPC_API_KEY" : null),
    run: async ({ settings, callSource, answered }) => {
      const register = createEpcRegister({ apiKey: settings.epcApiKey ?? "" });
      const certificates = answered(
        await register.search(SMOKE_EPC_POSTCODE, callSource),
      );
      const [first] = certificates;
      expectFound(
        first !== undefined,
        `It gave no certificates in ${SMOKE_EPC_POSTCODE}`,
      );
      if (first === undefined) return "";
      // Its address is licensed only for energy-efficiency purposes, so
      // only its bands and floor area are said.
      const details = answered(
        await register.certificate(first.certificateNumber, callSource),
      );
      expectFound(
        details.floorAreaSquareMetres !== null,
        "It gave a certificate no floor area",
      );
      return `${plural(certificates.length, "certificate")} in ${SMOKE_EPC_POSTCODE}, the first band ${first.currentBand ?? "unknown"}, potential ${details.potentialBand ?? "unknown"}, ${String(details.floorAreaSquareMetres)} m²`;
    },
  },
  {
    id: "anthropic",
    name: "Anthropic API",
    skip: ({ anthropicApiKey }) =>
      anthropicApiKey === null ? "no ANTHROPIC_API_KEY" : null,
    run: async ({ settings, fetch }) => {
      const model = createAnthropicModel({
        apiKey: settings.anthropicApiKey ?? "",
        model: settings.anthropicModel,
        fetch,
      });
      // The shortest request it answers, a few dozen tokens.
      let answer = "";
      let tokens = { inputTokens: 0, outputTokens: 0 };
      try {
        for await (const event of model(
          {
            system: "You are checking that you can be reached.",
            user: "Reply with the one word OK.",
          },
          AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
        )) {
          if (event.type === "text") answer += event.text;
          else tokens = event.usage;
        }
      } catch (error) {
        throw new SmokeError(
          modelErrorMessage(error, settings.anthropicModel),
          {
            cause: error,
          },
        );
      }
      expectFound(
        answer.trim() !== "",
        `${settings.anthropicModel} wrote nothing`,
      );
      return `${settings.anthropicModel} answered in ${String(tokens.inputTokens)} tokens in and ${String(tokens.outputTokens)} out`;
    },
  },
];

/**
 * Not checked: Google Street View, whose script the browser loads with
 * `GOOGLE_MAPS_API_KEY`, a key restricted to the frontend's origin. The API
 * never calls Google.
 */
export const NOT_CHECKED =
  "Google Street View isn't checked: the browser loads it with GOOGLE_MAPS_API_KEY, which only works from the frontend's origin, and the API never calls Google. Open the Street View panel to check it.";

/** How one check turned out. */
export interface SmokeResult {
  id: string;
  name: string;
  outcome: "pass" | "fail" | "skip";
  /** What it found, why it failed, or why it was skipped. */
  detail: string;
  /** How many requests it sent. */
  requests: number;
  milliseconds: number;
}

/** What a failed call threw, as said to the user. */
const reason = (error: unknown, timeoutMs: number) => {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") {
      return `It didn't answer within ${String(timeoutMs / 1000)} seconds`;
    }
    return error.cause instanceof Error && error.message === "fetch failed"
      ? `It couldn't be reached: ${error.cause.message}`
      : error.message;
  }
  return String(error);
};

/**
 * Calls Data Sources as the app's `callSource` does, with its 8-second
 * timeout, but without its cache, and keeping what each failed call threw,
 * where the app only logs it.
 */
const smokeCaller = (fetchFn: typeof fetch, timeoutMs: number) => {
  const failures: unknown[] = [];
  const callSource: CallSource = async (
    _source,
    _request,
    load,
    { turn } = {},
  ) => {
    await turn?.wait();
    try {
      const { data, period } = await load({
        fetch: fetchFn,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: "ok", data, period };
    } catch (error) {
      failures.push(error);
      return { status: "unavailable" };
    }
  };
  const answered = <T>(result: SourceResult<T> | QueuedResult<T>): T => {
    if (result.status === "ok") return result.data;
    // A queued request was refused with 429 Too Many Requests and waits for
    // its Retry-After, which this doesn't wait for.
    const failure = failures.at(-1);
    throw failure instanceof Error
      ? failure
      : new SmokeError(`It answered ${result.status}`);
  };
  return { callSource, answered };
};

export interface SmokeRunOptions {
  settings: SmokeSettings;
  fetch: typeof fetch;
  today: string;
  checks?: readonly SmokeCheck[];
  /** How long each call may take: the app's 8 seconds unless a test says. */
  timeoutMs?: number;
  /** Told each result as it comes. */
  onResult?: (result: SmokeResult) => void;
}

/** Runs each check in turn, skipping those whose settings aren't set. */
export const runSmokeChecks = async ({
  settings,
  fetch: fetchFn,
  today,
  checks = SMOKE_CHECKS,
  timeoutMs = SOURCE_TIMEOUT_MS,
  onResult,
}: SmokeRunOptions): Promise<SmokeResult[]> => {
  const results: SmokeResult[] = [];
  for (const check of checks) {
    const { id, name } = check;
    const skipped = check.skip(settings);
    let result: SmokeResult;
    if (skipped !== null) {
      result = {
        id,
        name,
        outcome: "skip",
        detail: skipped,
        requests: 0,
        milliseconds: 0,
      };
    } else {
      let requests = 0;
      const counted: typeof fetch = (input, init) => {
        requests += 1;
        return fetchFn(input, init);
      };
      const { callSource, answered } = smokeCaller(counted, timeoutMs);
      const started = performance.now();
      let outcome: SmokeResult["outcome"] = "pass";
      let detail: string;
      try {
        detail = await check.run({
          settings,
          callSource,
          answered,
          fetch: counted,
          today,
        });
      } catch (error) {
        outcome = "fail";
        detail = reason(error, timeoutMs);
      }
      result = {
        id,
        name,
        outcome,
        detail,
        requests,
        milliseconds: Math.round(performance.now() - started),
      };
    }
    results.push(result);
    onResult?.(result);
  }
  return results;
};
