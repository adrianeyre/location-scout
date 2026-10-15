import { serve } from "@hono/node-server";

import { readConfig } from "../config";
import { openPreparedData } from "../sources/prepared-data";
import { createRateLimiter } from "../sources/rate-limiter";
import { PREPARED_DATA_FIXTURE, TEST_USER_AGENT, testApp } from "./app";
import { recordedFetch } from "./fixture-fetch";

/**
 * The API as the server runs it, except that every Data Source call is
 * answered from recorded fixtures and none reaches the network (PRD NFR-3.2,
 * NFR-3.3). The end-to-end tests run against it:
 *
 *   PORT=8797 pnpm --filter @location-scout/api start:fixtures
 *
 * It needs no settings: it identifies itself to the stubbed Nominatim with the
 * tests' User-Agent. Its PlanIt requests wait for no turn, so that one test's
 * Search Area never holds up another's Planning Applications. Its prepared data is the tiny fixture in
 * `prepared-data/`, unless `PREPARED_DATA_DIR` names another folder, such as
 * one with nothing in it, to run as if `pnpm data:prepare` never had. Its
 * Planning Applications come from PlanIt, or from PlanWire with
 * `PLANNING_APPLICATIONS_PROVIDER=planwire` and `PLANWIRE_API_KEY`, as the
 * server's do; the stubbed PlanWire answers only `TEST_PLANWIRE_API_KEY`.
 * With `EPC_API_KEY`, its Property Layer gives EPCs, as the server's does;
 * the stubbed EPC API answers only `TEST_EPC_API_KEY`. With
 * `GOOGLE_MAPS_API_KEY`, `/api/street-view` gives it to the frontend, as the
 * server's does: Google's script is the browser's to load, and the tests
 * stub it there. With `ANTHROPIC_API_KEY`, AI Explanations are on, as the
 * server's are, written by a stubbed model that answers only
 * `TEST_ANTHROPIC_API_KEY`.
 */
const port = Number(process.env.PORT ?? 8787);
const preparedDataDir = process.env.PREPARED_DATA_DIR;
const {
  planWireApiKey,
  epcApiKey,
  googleMapsApiKey,
  anthropicApiKey,
  anthropicModel,
  warnings,
} = readConfig({
  NOMINATIM_USER_AGENT: TEST_USER_AGENT,
  PLANNING_APPLICATIONS_PROVIDER: process.env.PLANNING_APPLICATIONS_PROVIDER,
  PLANWIRE_API_KEY: process.env.PLANWIRE_API_KEY,
  EPC_API_KEY: process.env.EPC_API_KEY,
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
});
for (const warning of warnings) console.warn(warning);
const app = testApp({
  fetch: recordedFetch,
  planItLimiter: createRateLimiter(0),
  planWireApiKey,
  epcApiKey,
  googleMapsApiKey,
  anthropicApiKey,
  anthropicModel,
  preparedData: preparedDataDir
    ? openPreparedData(preparedDataDir)
    : PREPARED_DATA_FIXTURE,
});

serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(
    `Location Scout API (recorded fixtures, no network) listening on http://localhost:${String(port)}`,
  );
});
