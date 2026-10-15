import { fileURLToPath } from "node:url";

import { createApp, type AppOptions } from "../app";
import { NOMINATIM_INTERVAL_MS } from "../sources/nominatim";
import { OVERPASS_INTERVAL_MS } from "../sources/overpass";
import { PLANIT_INTERVAL_MS } from "../sources/planit";
import { POLICE_INTERVAL_MS } from "../sources/police";
import { NotPreparedError } from "../sources/data-source";
import { openPreparedData, type PreparedData } from "../sources/prepared-data";
import { createRateLimiter } from "../sources/rate-limiter";
import { PROPERTY_RECORDED_ON } from "./property-recordings";

/**
 * A tiny prepared-data fixture, made by `pnpm --filter
 * @location-scout/data-prepare fixture:prepare` from recorded council
 * boundaries: England's are Ashfield's and Mansfield's, and Ashfield is the
 * one Land Coverage Area.
 */
export const PREPARED_DATA_FIXTURE_DIR = fileURLToPath(
  new URL("./prepared-data/", import.meta.url),
);

export const PREPARED_DATA_FIXTURE = openPreparedData(
  PREPARED_DATA_FIXTURE_DIR,
);

/**
 * As if `pnpm data:prepare` had never run, without opening DuckDB, so it
 * answers at once, even under fake timers. To read a folder with nothing in
 * it, as the real app does, use `openPreparedData`.
 */
export const NOTHING_PREPARED: PreparedData = {
  manifest: () => Promise.reject(new NotPreparedError("Nothing is prepared.")),
  query: () => Promise.reject(new NotPreparedError("Nothing is prepared.")),
};

/** The User-Agent tests send to (stubbed) Nominatim. */
export const TEST_USER_AGENT = "location-scout-test (tests@example.com)";

/** The User-Agent tests send to (stubbed) PlanIt. */
export const TEST_PLANIT_USER_AGENT =
  "location-scout-test (planit@example.com)";

/**
 * An app as the server makes it, but with limiters of its own, so one test's
 * requests never hold up another's, on the day the Property Layer's
 * fixtures were recorded, and with nothing prepared, whatever is in `data/`.
 * Pass `fetch` a stub from `fetch-stubs.ts`.
 */
export const testApp = (options: Partial<AppOptions> = {}) =>
  createApp({
    nominatimUserAgent: TEST_USER_AGENT,
    nominatimLimiter: createRateLimiter(NOMINATIM_INTERVAL_MS),
    policeLimiter: createRateLimiter(POLICE_INTERVAL_MS),
    overpassLimiter: createRateLimiter(OVERPASS_INTERVAL_MS),
    planItUserAgent: TEST_PLANIT_USER_AGENT,
    planItLimiter: createRateLimiter(PLANIT_INTERVAL_MS),
    today: () => PROPERTY_RECORDED_ON,
    preparedData: NOTHING_PREPARED,
    ...options,
  });
