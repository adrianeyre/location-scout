import { readConfig } from "../config";
import { TEST_USER_AGENT } from "../testing/app";
import { passed, runAiCheck, type AiCheckResult } from "./ai-check";

/**
 * `pnpm test:ai`: the opt-in AI check (PRD NFR-3.5). It asks Anthropic, with
 * your own `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`, each question offered
 * about the recorded inputs in `AI_CHECK_CASES`, and fails if any answer has
 * a number that isn't in what the model was sent. Every other source
 * answers from its recording. Each question is one paid request.
 */
const { anthropicApiKey, anthropicModel } = readConfig({
  NOMINATIM_USER_AGENT: TEST_USER_AGENT,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
});

if (anthropicApiKey === null) {
  console.error(`pnpm test:ai asks Anthropic's API, so it needs ANTHROPIC_API_KEY.

Add your key to .env, as for AI Explanations, and run it again:

  ANTHROPIC_API_KEY=sk-ant-...

It asks 19 questions, each a request to Anthropic: about 75,000 tokens in and 6,000 out in all.`);
  process.exit(1);
}

const report = (result: AiCheckResult) => {
  const verdict = passed(result) ? "PASS" : "FAIL";
  console.log(`${verdict}  ${result.case}: ${result.question}`);
  if (result.error !== null) console.log(`      ${result.error}`);
  if (result.unverifiedNumbers.length > 0) {
    console.log(
      `      Numbers not in its input: ${result.unverifiedNumbers.join(", ")}`,
    );
  }
  if (result.wordingMissing) {
    console.log("      It leaves out the Land Opportunity wording.");
  }
  if (!passed(result)) {
    console.log(`      Its answer: ${result.answer.replaceAll("\n", " ")}`);
  }
};

console.log(`Asking ${anthropicModel} about the recorded inputs…\n`);
const results = await runAiCheck({
  apiKey: anthropicApiKey,
  model: anthropicModel,
  modelFetch: fetch,
  onResult: report,
});
const failed = results.filter((result) => !passed(result));
const tokens = results.reduce(
  (sum, { inputTokens, outputTokens }) => ({
    input: sum.input + inputTokens,
    output: sum.output + outputTokens,
  }),
  { input: 0, output: 0 },
);
console.log(
  `\n${String(results.length - failed.length)} of ${String(results.length)} answers passed. ${String(tokens.input)} tokens in, ${String(tokens.output)} out.`,
);
process.exit(failed.length === 0 ? 0 : 1);
