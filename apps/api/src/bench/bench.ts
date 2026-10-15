import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createApp } from "../app";
import { ConfigError, readConfig } from "../config";
import { DATA_DIR, openPreparedData } from "../sources/prepared-data";
import { createRateLimiter } from "../sources/rate-limiter";
import { PREPARED_DATA_FIXTURE, testApp } from "../testing/app";
import { recordedFetch } from "../testing/fixture-fetch";
import {
  BENCH_POSTCODE,
  BENCH_RADIUS,
  BROWSER_CONNECTIONS,
  BenchError,
  countingFetch,
  duration,
  runBench,
  serveForBench,
  type BenchResult,
  type PrepareTiming,
  type SearchAreaLoad,
} from "./bench-runs";

/**
 * `pnpm bench`: measures PRD NFR-2.1–NFR-2.5 on this machine. It loads
 * NG17 1AA's 0.5 mile Search Area from the API with the live Data Sources
 * and the settings in .env, as the frontend loads it, uncached and
 * then cached, and searches for Land Opportunities across Ashfield. With
 * `--prepare` it runs `pnpm data:prepare` first and times it. With
 * `--recorded` it answers every Data Source call from the recordings
 * instead, to time our own code. Never run in CI: it reaches the real
 * services.
 */
const USAGE = `Usage: pnpm bench [--prepare] [--recorded]

Loads ${BENCH_POSTCODE}'s ${String(BENCH_RADIUS)} mile Search Area from the API with the live Data
Sources, as the frontend does, uncached and then cached, and searches for
Land Opportunities across Ashfield, timing each against PRD NFR-2.1-NFR-2.5.

  --prepare   Run pnpm data:prepare first, and time it (NFR-2.5): it
              refreshes data/, downloading about 800 MB for Ashfield.
  --recorded  Answer every Data Source call from the recordings the
              end-to-end tests use, to time our own code without the network.
  --help      Show this message.`;

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const OUTCOMES = { pass: "PASS", fail: "FAIL", skip: "SKIP" } as const;

/** Runs `pnpm data:prepare` from the repository, showing its output with the time each line came. */
const timePrepare = async (): Promise<PrepareTiming> => {
  console.log("Running pnpm data:prepare…\n");
  const started = performance.now();
  const stamp = () => `[${duration(performance.now() - started)}]`;
  const child = spawn("pnpm", ["data:prepare"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const output of [child.stdout, child.stderr]) {
    createInterface({ input: output }).on("line", (line) => {
      console.log(`  ${stamp()} ${line}`);
    });
  }
  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
  const ms = performance.now() - started;
  const councils =
    exitCode === 0
      ? (await openPreparedData(DATA_DIR).manifest()).landCoverageAreas.map(
          ({ council }) => council.name,
        )
      : [];
  console.log("");
  return { ms, exitCode, councils };
};

/** One request's line: when it was answered, what it asked for, and how its Layer answered. */
const requestLine = ({
  answeredMs,
  name,
  layerStatus,
  applicationsStatus,
}: SearchAreaLoad["requests"][number]) => {
  const status = [
    layerStatus,
    applicationsStatus === null
      ? null
      : `Planning Applications ${applicationsStatus}`,
  ]
    .filter((part) => part !== null)
    .join(", ");
  return `  ${duration(answeredMs).padStart(10)}  ${name.padEnd(12)} ${status}`.trimEnd();
};

const showLoad = (label: string, load: SearchAreaLoad) => {
  console.log(`${label}:`);
  console.log(requestLine(load.geocode));
  for (const request of load.requests) console.log(requestLine(request));
  console.log("");
};

const report = ({ outcome, nfr, detail }: BenchResult) => {
  console.log(`${OUTCOMES[outcome]}  ${nfr}  ${detail}`);
};

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      prepare: { type: "boolean" },
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
if (options.prepare && options.recorded) {
  console.error(
    `--prepare reaches the live sources, and --recorded none: choose one.\n\n${USAGE}`,
  );
  process.exit(1);
}

const prepared = options.prepare ? await timePrepare() : null;

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

console.log(
  `Loading ${BENCH_POSTCODE}'s ${String(BENCH_RADIUS)} mile Search Area ${options.recorded ? "from the recordings, without the network" : "with the live Data Sources"}, as a browser asks over ${String(BROWSER_CONNECTIONS)} connections…\n`,
);
const { ask, close } = await serveForBench(app);
let results: BenchResult[];
try {
  results = await runBench({
    ask,
    sent: counted.sent,
    prepared,
    onLoad: showLoad,
  });
} catch (error) {
  if (!(error instanceof BenchError)) throw error;
  console.error(`FAIL  ${error.message}`);
  process.exit(1);
} finally {
  await close();
}

for (const result of results) report(result);
const count = (outcome: BenchResult["outcome"]) =>
  String(results.filter((result) => result.outcome === outcome).length);
console.log(
  `\n${count("pass")} passed, ${count("fail")} failed, ${count("skip")} skipped.`,
);
process.exit(results.some(({ outcome }) => outcome === "fail") ? 1 : 0);
