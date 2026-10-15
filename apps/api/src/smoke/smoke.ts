import {
  NOT_CHECKED,
  SMOKE_POSTCODE,
  readSmokeSettings,
  runSmokeChecks,
  type SmokeResult,
} from "./smoke-checks";

/**
 * `pnpm smoke`: calls each live Data Source once, with the settings in
 * .env, and says whether its answer still maps to our types (PRD
 * NFR-3.3). A source whose key or User-Agent isn't set is skipped. It
 * fails if any source does. Never run in CI: it reaches the real services.
 */
const settings = readSmokeSettings(process.env);

const OUTCOMES = { pass: "PASS", fail: "FAIL", skip: "SKIP" } as const;

const report = ({
  outcome,
  name,
  detail,
  requests,
  milliseconds,
}: SmokeResult) => {
  const sent =
    outcome === "skip"
      ? ""
      : ` (${String(requests)} ${requests === 1 ? "request" : "requests"}, ${String(milliseconds)} ms)`;
  console.log(`${OUTCOMES[outcome]}  ${name}: ${detail}${sent}`);
};

console.log(
  `Calling each live Data Source once, about ${SMOKE_POSTCODE}'s 0.5 mile Search Area…\n`,
);
const results = await runSmokeChecks({
  settings,
  fetch,
  today: new Date().toISOString().slice(0, 10),
  onResult: report,
});
const count = (outcome: SmokeResult["outcome"]) =>
  String(results.filter((result) => result.outcome === outcome).length);
console.log(`\n${NOT_CHECKED}`);
console.log(
  `\n${count("pass")} passed, ${count("fail")} failed, ${count("skip")} skipped.`,
);
process.exit(results.some(({ outcome }) => outcome === "fail") ? 1 : 0);
