import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { prepareData } from "./prepare";
import { FIXTURE_PREPARED_AT } from "./recorded-boundaries";
import {
  RECORDED_LAND_REGISTRY_API_KEY,
  recordedSources,
} from "./recorded-sources";

/**
 * The API's tiny prepared-data fixture, which its tests and the end-to-end
 * tests read instead of `data/` (PRD NFR-3.3).
 */
export const API_PREPARED_DATA_FIXTURE = fileURLToPath(
  new URL("../../../apps/api/src/testing/prepared-data/", import.meta.url),
);

/**
 * `pnpm --filter @location-scout/data-prepare fixture:prepare` makes it again
 * from the recorded council boundaries, exactly as `pnpm data:prepare` makes
 * `data/` the first time, with Ashfield its one Land Coverage Area, and with
 * an API key for CCOD and OCOD. It makes no network call.
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await rm(API_PREPARED_DATA_FIXTURE, { recursive: true, force: true });
  await prepareData({
    dataDir: API_PREPARED_DATA_FIXTURE,
    fetch: recordedSources,
    areas: [],
    all: false,
    landRegistryApiKey: RECORDED_LAND_REGISTRY_API_KEY,
    now: () => FIXTURE_PREPARED_AT,
  });
  console.log(`Prepared the API's fixture in ${API_PREPARED_DATA_FIXTURE}`);
}
