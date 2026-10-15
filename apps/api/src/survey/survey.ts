import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createApp } from "../app";
import { countingFetch, duration, serveForBench } from "../bench/bench-runs";
import { ConfigError, readConfig } from "../config";
import { createRateLimiter } from "../sources/rate-limiter";
import { PREPARED_DATA_FIXTURE, testApp } from "../testing/app";
import { recordedFetch } from "../testing/fixture-fetch";
import { SURVEY_LOCATIONS } from "./locations";
import {
  SURVEY_RADIUS,
  runSurvey,
  surveyMarkdown,
  type LocationSurvey,
  type SurveyResult,
} from "./survey-runs";

/**
 * `pnpm survey`: loads each of the 20 real Locations of PRD §6.19's seventh
 * success criterion from the API with the live Data Sources and the settings
 * in .env, as the frontend loads them, records what each gave in
 * every Scout Mode, and samples Possibly Unregistered Land Opportunities to
 * check against HM Land Registry's index map. It writes
 * `survey-of-20-locations.md` for a person to judge and tune the scores
 * by. With `--recorded` it answers every Data Source call from the
 * recordings instead. Never run in CI: it reaches the real services.
 */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DEFAULT_OUT = "docs/phase-1-success-checks";
const REPORT_FILE = "survey-of-20-locations.md";

const USAGE = `Usage: pnpm survey [--out <folder>] [--json <file>] [--retry <file>] [--recorded]

Loads each of the ${String(SURVEY_LOCATIONS.length)} Locations in apps/api/src/survey/locations.ts at the
${String(SURVEY_RADIUS)} mile Search Radius from the API with the live Data Sources, as the
frontend does, one after another, and writes what each gave in every Scout
Mode, and Possibly Unregistered land to check by hand, to ${REPORT_FILE}.

  --out <folder>  Where to write ${REPORT_FILE}, from the repository's
                  root: ${DEFAULT_OUT} unless given.
  --json <file>   Also write everything it found as JSON, to analyse.
  --retry <file>  Keep the Locations an earlier run's JSON surveyed in
                  full, and survey again only those not found or with a
                  Layer unavailable, so the services aren't asked again.
  --recorded      Answer every Data Source call from the recordings the
                  end-to-end tests use, without the network.
  --help          Show this message.`;

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      out: { type: "string", default: DEFAULT_OUT },
      json: { type: "string" },
      retry: { type: "string" },
      recorded: { type: "boolean" },
      help: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  }));
} catch (error) {
  console.error(
    `${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`,
  );
  process.exit(1);
}
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}

const counted = countingFetch(options.recorded ? recordedFetch : fetch);
let app;
if (options.recorded) {
  // As the end-to-end tests' fixture-backed API is (testing/fixture-server.ts).
  app = testApp({
    fetch: counted.fetch,
    planItLimiter: createRateLimiter(0),
    preparedData: PREPARED_DATA_FIXTURE,
  });
} else {
  try {
    const { nominatimUserAgent, planItUserAgent, planWireApiKey, epcApiKey } =
      readConfig(process.env);
    // As the server makes it (server.ts), with no AI Explanations or Street View.
    app = createApp({
      nominatimUserAgent,
      planItUserAgent,
      planWireApiKey,
      epcApiKey,
      fetch: counted.fetch,
    });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

const progress = (survey: LocationSurvey, index: number, kept: boolean) => {
  const number = `${String(index + 1).padStart(2)}/${String(SURVEY_LOCATIONS.length)}`;
  const { name, postcode } = survey.location;
  if (kept) {
    console.log(
      `${number}  ${name} (${postcode}): kept from ${options.retry ?? "before"}`,
    );
    return;
  }
  if (survey.error !== null) {
    console.log(`${number}  ${name} (${postcode}): ${survey.error}`);
    return;
  }
  const notOk = Object.entries(survey.layers)
    .filter(([, status]) => status !== "ok")
    .map(([layer, status]) => `${layer} ${status}`);
  console.log(
    `${number}  ${name} (${postcode}): ${duration(survey.loadMs ?? 0)}, General ${String(survey.locationScores.general ?? "–")}${notOk.length === 0 ? "" : `; ${notOk.join(", ")}`}`,
  );
};

console.log(
  `Surveying ${String(SURVEY_LOCATIONS.length)} Locations ${options.recorded ? "from the recordings, without the network" : "with the live Data Sources"}, one after another. PlanIt answers about once a minute, so this takes about ${String(SURVEY_LOCATIONS.length)} minutes…\n`,
);
/**
 * An earlier run's JSON. One written before the survey kept the months
 * data.police.uk missed has none for each Location, and is judged by its
 * Layers alone.
 */
const readPrevious = async (file: string): Promise<SurveyResult> => {
  const read = JSON.parse(
    await readFile(resolve(process.cwd(), file), "utf8"),
  ) as SurveyResult;
  return {
    ...read,
    locations: read.locations.map((survey) => ({
      ...survey,
      missingCrimeMonths:
        (survey as Partial<LocationSurvey>).missingCrimeMonths ?? [],
    })),
  };
};
const previous =
  options.retry === undefined ? undefined : await readPrevious(options.retry);
const { ask, close } = await serveForBench(app);
let result;
try {
  result = await runSurvey({
    ask,
    locations: SURVEY_LOCATIONS,
    today: new Date().toISOString().slice(0, 10),
    recorded: options.recorded ?? false,
    previous,
    onLocation: progress,
  });
} finally {
  await close();
}

const outDir = resolve(REPO_ROOT, options.out);
await mkdir(outDir, { recursive: true });
const report = resolve(outDir, REPORT_FILE);
await writeFile(report, surveyMarkdown(result));
console.log(
  `\nSent ${String(counted.sent())} Data Source requests. Wrote ${report}.`,
);
if (options.json !== undefined) {
  const json = resolve(process.cwd(), options.json);
  await writeFile(json, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${json}.`);
}
