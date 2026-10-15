import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (PRD NFR-3.2). They drive the real frontend against the
 * real API, whose Data Sources answer from recorded fixtures, so no test
 * reaches a Data Source (NFR-3.3).
 *
 * Both servers get ports of their own, away from `pnpm dev`'s 5173 and 8787,
 * and are never reused: a dev server already running would call live sources.
 *
 * The API reads a tiny prepared-data fixture instead of `data/`. A second
 * pair of servers runs as if `pnpm data:prepare` never had, for the tests in
 * `*.not-prepared.spec.ts` (PRD FR-6.6, NFR-3.4). A third runs the API with
 * `PLANNING_APPLICATIONS_PROVIDER=planwire`, and the very same frontend, for
 * the tests in `*.planwire.spec.ts` (ADR 0003). A fourth runs the API with
 * `EPC_API_KEY`, for the tests in `*.epc.spec.ts` (PRD FR-2.6): every other
 * API runs without one, as the app does unless it is set. A fifth runs it
 * with `GOOGLE_MAPS_API_KEY`, for the Street View tests in
 * `*.google-maps.spec.ts` (FR-2.13), which stub Google's script in the
 * browser: every other runs without one, so loads nothing from Google. A
 * sixth runs it with `ANTHROPIC_API_KEY`, for the AI Explanation tests in
 * `*.anthropic.spec.ts` (PRD §6.9), whose model is a stub in the API: every
 * other runs with the key blanked, even where the shell has one, so they
 * have no Explain button and nothing is asked of a model (ADR 0005).
 */
const API_PORT = 8797;
const WEB_PORT = 5183;
const API_ORIGIN = `http://localhost:${String(API_PORT)}`;
const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`;
const NOT_PREPARED_API_PORT = 8798;
const NOT_PREPARED_WEB_PORT = 5184;
const NOT_PREPARED_API_ORIGIN = `http://localhost:${String(NOT_PREPARED_API_PORT)}`;
const NOT_PREPARED_WEB_ORIGIN = `http://localhost:${String(NOT_PREPARED_WEB_PORT)}`;
/** A folder that is never made, so nothing in it is prepared. */
const NOTHING_PREPARED = fileURLToPath(
  new URL("./test-results/nothing-prepared/", import.meta.url),
);
const NOT_PREPARED_SPECS = /\.not-prepared\.spec\.ts$/;
const PLANWIRE_API_PORT = 8799;
const PLANWIRE_WEB_PORT = 5185;
const PLANWIRE_API_ORIGIN = `http://localhost:${String(PLANWIRE_API_PORT)}`;
const PLANWIRE_WEB_ORIGIN = `http://localhost:${String(PLANWIRE_WEB_PORT)}`;
/** The key the fixture-backed API's stubbed PlanWire answers to. */
const TEST_PLANWIRE_API_KEY = "pw_test_location_scout";
const PLANWIRE_SPECS = /\.planwire\.spec\.ts$/;
const EPC_API_PORT = 8800;
const EPC_WEB_PORT = 5186;
const EPC_API_ORIGIN = `http://localhost:${String(EPC_API_PORT)}`;
const EPC_WEB_ORIGIN = `http://localhost:${String(EPC_WEB_PORT)}`;
/** The bearer token the fixture-backed API's stubbed EPC API answers to. */
const TEST_EPC_API_KEY = "epc_test_location_scout";
const EPC_SPECS = /\.epc\.spec\.ts$/;
const GOOGLE_MAPS_API_PORT = 8801;
const GOOGLE_MAPS_WEB_PORT = 5187;
const GOOGLE_MAPS_API_ORIGIN = `http://localhost:${String(GOOGLE_MAPS_API_PORT)}`;
const GOOGLE_MAPS_WEB_ORIGIN = `http://localhost:${String(GOOGLE_MAPS_WEB_PORT)}`;
/** The key the API gives the frontend, which the stubbed Google script checks. */
const TEST_GOOGLE_MAPS_API_KEY = "AIzaSy_location_scout_test";
const GOOGLE_MAPS_SPECS = /\.google-maps\.spec\.ts$/;
const ANTHROPIC_API_PORT = 8802;
const ANTHROPIC_WEB_PORT = 5188;
const ANTHROPIC_API_ORIGIN = `http://localhost:${String(ANTHROPIC_API_PORT)}`;
const ANTHROPIC_WEB_ORIGIN = `http://localhost:${String(ANTHROPIC_WEB_PORT)}`;
/** The key the fixture-backed API's stubbed model answers to. */
const TEST_ANTHROPIC_API_KEY = "sk-ant-test-location-scout";
const ANTHROPIC_SPECS = /\.anthropic\.spec\.ts$/;
/**
 * Desktop Chrome, 56 px taller than its 720, for the footer along the foot
 * of the page, with its attribution above its links (PRD FR-10.1). The map
 * fills the page above it, the panel floating over its right.
 */
const DESKTOP = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 776 },
};
/** AI Explanations off, whatever the shell running the tests has set. */
const NO_ANTHROPIC = { ANTHROPIC_API_KEY: "", ANTHROPIC_MODEL: "" };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...DESKTOP },
      testIgnore: [
        NOT_PREPARED_SPECS,
        PLANWIRE_SPECS,
        EPC_SPECS,
        GOOGLE_MAPS_SPECS,
        ANTHROPIC_SPECS,
      ],
    },
    {
      name: "chromium, nothing prepared",
      use: { ...DESKTOP, baseURL: NOT_PREPARED_WEB_ORIGIN },
      testMatch: NOT_PREPARED_SPECS,
    },
    {
      name: "chromium, PlanWire",
      use: { ...DESKTOP, baseURL: PLANWIRE_WEB_ORIGIN },
      testMatch: PLANWIRE_SPECS,
    },
    {
      name: "chromium, EPC",
      use: { ...DESKTOP, baseURL: EPC_WEB_ORIGIN },
      testMatch: EPC_SPECS,
    },
    {
      name: "chromium, Google Maps",
      use: { ...DESKTOP, baseURL: GOOGLE_MAPS_WEB_ORIGIN },
      testMatch: GOOGLE_MAPS_SPECS,
    },
    {
      name: "chromium, Anthropic",
      use: { ...DESKTOP, baseURL: ANTHROPIC_WEB_ORIGIN },
      testMatch: ANTHROPIC_SPECS,
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @location-scout/api start:fixtures",
      env: { PORT: String(API_PORT), ...NO_ANTHROPIC },
      url: `${API_ORIGIN}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --port ${String(WEB_PORT)}`,
      env: { API_ORIGIN },
      url: WEB_ORIGIN,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @location-scout/api start:fixtures",
      env: {
        PORT: String(NOT_PREPARED_API_PORT),
        PREPARED_DATA_DIR: NOTHING_PREPARED,
        ...NO_ANTHROPIC,
      },
      url: `${NOT_PREPARED_API_ORIGIN}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --port ${String(NOT_PREPARED_WEB_PORT)}`,
      env: { API_ORIGIN: NOT_PREPARED_API_ORIGIN },
      url: NOT_PREPARED_WEB_ORIGIN,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @location-scout/api start:fixtures",
      env: {
        PORT: String(PLANWIRE_API_PORT),
        PLANNING_APPLICATIONS_PROVIDER: "planwire",
        PLANWIRE_API_KEY: TEST_PLANWIRE_API_KEY,
        ...NO_ANTHROPIC,
      },
      url: `${PLANWIRE_API_ORIGIN}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --port ${String(PLANWIRE_WEB_PORT)}`,
      env: { API_ORIGIN: PLANWIRE_API_ORIGIN },
      url: PLANWIRE_WEB_ORIGIN,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @location-scout/api start:fixtures",
      env: {
        PORT: String(EPC_API_PORT),
        EPC_API_KEY: TEST_EPC_API_KEY,
        ...NO_ANTHROPIC,
      },
      url: `${EPC_API_ORIGIN}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --port ${String(EPC_WEB_PORT)}`,
      env: { API_ORIGIN: EPC_API_ORIGIN },
      url: EPC_WEB_ORIGIN,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @location-scout/api start:fixtures",
      env: {
        PORT: String(GOOGLE_MAPS_API_PORT),
        GOOGLE_MAPS_API_KEY: TEST_GOOGLE_MAPS_API_KEY,
        ...NO_ANTHROPIC,
      },
      url: `${GOOGLE_MAPS_API_ORIGIN}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --port ${String(GOOGLE_MAPS_WEB_PORT)}`,
      env: { API_ORIGIN: GOOGLE_MAPS_API_ORIGIN },
      url: GOOGLE_MAPS_WEB_ORIGIN,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @location-scout/api start:fixtures",
      env: {
        PORT: String(ANTHROPIC_API_PORT),
        ANTHROPIC_API_KEY: TEST_ANTHROPIC_API_KEY,
        ANTHROPIC_MODEL: "",
      },
      url: `${ANTHROPIC_API_ORIGIN}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --port ${String(ANTHROPIC_WEB_PORT)}`,
      env: { API_ORIGIN: ANTHROPIC_API_ORIGIN },
      url: ANTHROPIC_WEB_ORIGIN,
      reuseExistingServer: false,
    },
  ],
});
