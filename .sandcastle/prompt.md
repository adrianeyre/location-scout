# Read first

Before touching anything, read these in full. They are the standard your work is judged against:

- `README.md`
- `docs/guides/`: the guides the README links to. A change to how Location Scout is run, used or developed updates the guide that covers it, not the README
- `GLOSSARY.md`: use its terms exactly (Location, Search Area, Layer, Feature, Category Score, Scout Mode, Land Opportunity, Possibly Unregistered…) and none of the words it lists under _Avoid_
- `docs/product-requirements-document/location-scout-prd.md`
- `docs/architectural-decision-record/0001-local-backend-between-frontend-and-data-sources.md`
- `docs/architectural-decision-record/0002-phase-1-has-no-persistence.md`
- `docs/architectural-decision-record/0003-planning-applications-from-a-third-party-api.md`
- `docs/architectural-decision-record/0004-prepared-local-files-queried-with-duckdb.md`
- `docs/architectural-decision-record/0005-ai-explains-calculated-scores-opt-in.md`

# The brief

!`gh issue view {{ISSUE}} --comments`

Every issue listed under "Blocked by" must already be closed. If one is still open, stop, comment on this issue saying which, and output <promise>COMPLETE</promise>.

# What already exists and must survive

- The root `package.json` holds the Sandcastle harness that is running you (`@ai-hero/sandcastle`, `tsx`, the `sandcastle` script, `engines`/`devEngines`). Extend it; never rewrite it from scratch.
- `.sandcastle/` is the harness configuration. Do not edit it unless the issue says to.
- `docs/` holds the agreed requirements and decisions. Do not change the PRD or an ADR to match your code. If they disagree, say so on the issue.

# Invariants

- **The frontend talks only to our backend.** `apps/web` never calls a Data Source directly. Data Source adapters live in `apps/api` and map raw responses into `packages/shared` types (ADR 0001).
- **No database server and no stored history in Phase 1.** Live calls go through an in-memory cache. Land data comes only from files prepared by `data:prepare` and queried with DuckDB (ADRs 0002, 0004).
- **Scores are deterministic code.** Thresholds, weights and Scout Modes live in typed config. AI only explains figures code has calculated, and is off without `ANTHROPIC_API_KEY` (ADR 0005).
- **Land Opportunities warrant investigation; they never assert ownership or availability.** Keep the required wording (PRD FR-5.7).
- **Degrade, don't fail.** A failed Data Source, a missing key or missing prepared data disables only its own Layer or feature.
- **Respect the public services.** Nominatim at most 1 request/second with an identifying User-Agent; PlanIt and Overpass rate limits respected; no test makes live network calls.
- **England only.**
- Node >= 26 (26.12.0 here), pnpm >= 12 (12.11.2 here), ESM, strict TypeScript, React + Vite + MapLibre GL, Hono, Vitest, Playwright.

# Task

Implement the issue above as a single vertical slice that meets every acceptance criterion. Commit in coherent steps with conventional commit messages. Do not widen the scope beyond "What to build". Anything you notice outside it goes in a comment on the issue.

# Verification

Run every check that exists in the workspace (for example `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` once they exist), plus anything the acceptance criteria name. Paste their **real output** into a comment on the issue, and tick each acceptance criterion you have verified, saying how. Never get to green by skipping, deleting or weakening a test. If something can't be verified in this sandbox (for example a live Data Source call), say so explicitly.

# Done

When every acceptance criterion is met and verified, or you are blocked, output <promise>COMPLETE</promise>.
