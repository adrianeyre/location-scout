import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DataSource } from "../sources/data-source";
import {
  TEST_ANTHROPIC_API_KEY,
  stubAnthropic,
} from "../testing/anthropic-stub";
import { TEST_EPC_API_KEY } from "../testing/epc-recordings";
import {
  fixtureFetch,
  neverAnswers,
  noNetwork,
  stubFetch,
} from "../testing/fetch-stubs";
import { recordedFetch } from "../testing/fixture-fetch";
import { TEST_USER_AGENT } from "../testing/app";
import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import { TEST_PLANWIRE_API_KEY } from "../testing/planwire-recordings";
import { PROPERTY_RECORDED_ON } from "../testing/property-recordings";
import {
  SMOKE_AREA,
  SMOKE_CHECKS,
  readSmokeSettings,
  runSmokeChecks,
  type SmokeResult,
} from "./smoke-checks";

/** Every setting, with the keys the recordings answer to. */
const EVERY_KEY = readSmokeSettings({
  NOMINATIM_USER_AGENT: TEST_USER_AGENT,
  PLANWIRE_API_KEY: TEST_PLANWIRE_API_KEY,
  EPC_API_KEY: TEST_EPC_API_KEY,
  ANTHROPIC_API_KEY: TEST_ANTHROPIC_API_KEY,
});

/** The URL a request is sent to. */
const urlOf = (input: Parameters<typeof fetch>[0]) =>
  typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

/** The recordings the end-to-end tests use, with the stubbed model answering at once. */
const recordings = vi.fn<typeof fetch>((input, init) => {
  const url = urlOf(input);
  return Promise.resolve(
    stubAnthropic(url, init, { partMs: 0 }) ?? recordedFetch(input, init),
  );
});

/** Runs the checks as recorded, on the day the recordings were made. */
const run = (options: Partial<Parameters<typeof runSmokeChecks>[0]> = {}) =>
  runSmokeChecks({
    settings: EVERY_KEY,
    fetch: recordings,
    today: PROPERTY_RECORDED_ON,
    ...options,
  });

const byName = (results: readonly SmokeResult[]) =>
  Object.fromEntries(
    results.map(({ name, outcome, detail, requests }) => [
      name,
      { outcome, detail, requests },
    ]),
  );

/** The hosts each request went to. */
const hostsAsked = (fetchFn: ReturnType<typeof vi.fn<typeof fetch>>) =>
  new Set(fetchFn.mock.calls.map(([input]) => new URL(urlOf(input)).host));

describe("runSmokeChecks", () => {
  beforeEach(() => {
    recordings.mockClear();
  });

  it("asks about the Search Area the recordings cover", () => {
    expect(SMOKE_AREA).toEqual(NG17_1AA_AREA);
  });

  it("calls each live Data Source once, as the app does, and passes each answer that maps to our types", async () => {
    const results = await run();

    expect(byName(results)).toEqual({
      "postcodes.io": {
        outcome: "pass",
        detail: "NG17 1AA is in Sutton Central & New Cross, Ashfield, England",
        requests: 1,
      },
      Nominatim: {
        outcome: "pass",
        detail: expect.stringMatching(
          /^"12 High Street, Sutton-in-Ashfield" found \d+ places?, first .*High Street/,
        ) as string,
        requests: 1,
      },
      // The latest month, then its crimes.
      "data.police.uk": {
        outcome: "pass",
        detail: expect.stringMatching(
          /^\d+ crimes around NG17 1AA in 2026-08, the latest month published$/,
        ) as string,
        requests: 2,
      },
      // The constraints, and the listed building outlines at the Location.
      "planning.data.gov.uk": {
        outcome: "pass",
        detail: expect.stringMatching(
          /^9 Planning Constraints around NG17 1AA, \d+ covering it$/,
        ) as string,
        requests: 2,
      },
      "Overpass API": {
        outcome: "pass",
        detail: expect.stringMatching(
          /^[\d,]+ OpenStreetMap elements around NG17 1AA, as OpenStreetMap stood on 2026-10-0\d$/,
        ) as string,
        requests: 1,
      },
      // postcodes.io for its postcodes, then one Price Paid query.
      "HM Land Registry Price Paid": {
        outcome: "pass",
        detail:
          "24 sales in the last 12 months in 100 postcodes around NG17 1AA",
        requests: 2,
      },
      PlanIt: {
        outcome: "pass",
        detail: "126 Planning Applications around NG17 1AA since 2023-10-09",
        requests: 1,
      },
      PlanWire: {
        outcome: "pass",
        detail: "97 Planning Applications around NG17 1AA since 2023-10-09",
        requests: 1,
      },
      // A postcode's certificates, then the first one's details: no address.
      "Energy Performance of Buildings Data API": {
        outcome: "pass",
        detail: expect.stringMatching(
          /^2 certificates in NG17 1EJ, the first band [A-G], potential [A-G], [\d.]+ m²$/,
        ) as string,
        requests: 2,
      },
      "Anthropic API": {
        outcome: "pass",
        detail: expect.stringMatching(
          /^claude-sonnet-5-5 answered in \d+ tokens in and \d+ out$/,
        ) as string,
        requests: 1,
      },
    });
  });

  it("covers every live Data Source the API calls", async () => {
    // Each adapter module's Data Sources; those read from what `pnpm
    // data:prepare` prepared are never cached, as they aren't live.
    const dir = fileURLToPath(new URL("../sources/", import.meta.url));
    const modules = (await readdir(dir)).filter(
      (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
    );
    const live: string[] = [];
    for (const file of modules) {
      const exported = (await import(
        pathToFileURL(`${dir}${file}`).href
      )) as Record<string, unknown>;
      for (const value of Object.values(exported)) {
        const source = value as Partial<DataSource> | null;
        if (
          typeof source?.id === "string" &&
          typeof source.name === "string" &&
          typeof source.cacheTtlMs === "number" &&
          source.cacheTtlMs > 0
        ) {
          live.push(source.id);
        }
      }
    }

    expect(live.length).toBeGreaterThanOrEqual(9);
    const checked = SMOKE_CHECKS.map(({ id }) => id);
    // And Anthropic's API, for AI Explanations, which isn't a Layer's.
    expect(new Set(checked)).toEqual(new Set([...live, "anthropic"]));
    expect(checked).toHaveLength(new Set(checked).size);
  });

  it("skips each source whose key or User-Agent isn't set, asking it nothing", async () => {
    const results = await run({ settings: readSmokeSettings({}) });

    expect(
      results.map(
        ({ name, outcome, detail }) => `${outcome} ${name}: ${detail}`,
      ),
    ).toEqual([
      expect.stringMatching(/^pass postcodes\.io: /) as string,
      "skip Nominatim: no NOMINATIM_USER_AGENT, which it asks every request to identify us with",
      expect.stringMatching(/^pass data\.police\.uk: /) as string,
      expect.stringMatching(/^pass planning\.data\.gov\.uk: /) as string,
      "skip Overpass API: no NOMINATIM_USER_AGENT, which it asks every request to identify us with",
      expect.stringMatching(/^pass HM Land Registry Price Paid: /) as string,
      "skip PlanIt: no PLANIT_USER_AGENT or NOMINATIM_USER_AGENT, one of which it asks for",
      "skip PlanWire: no PLANWIRE_API_KEY",
      "skip Energy Performance of Buildings Data API: no EPC_API_KEY",
      "skip Anthropic API: no ANTHROPIC_API_KEY",
    ]);
    for (const skipped of results.filter(({ outcome }) => outcome === "skip")) {
      expect(skipped.requests).toBe(0);
    }
    expect(hostsAsked(recordings)).not.toContain("nominatim.openstreetmap.org");
    expect([...hostsAsked(recordings)].sort()).toEqual([
      "api.postcodes.io",
      "data.police.uk",
      "landregistry.data.gov.uk",
      "www.planning.data.gov.uk",
    ]);
  });

  it("checks PlanIt with PLANIT_USER_AGENT alone, sending it that", async () => {
    const results = await run({
      settings: readSmokeSettings({
        PLANIT_USER_AGENT: "planit-smoke (me@example.com)",
      }),
    });

    expect(byName(results).PlanIt?.outcome).toBe("pass");
    const [, init] =
      recordings.mock.calls.find(([input]) =>
        urlOf(input).startsWith("https://www.planit.org.uk/"),
      ) ?? [];
    expect(new Headers(init?.headers).get("user-agent")).toBe(
      "planit-smoke (me@example.com)",
    );
  });

  it("reads blank settings as not set", () => {
    expect(
      readSmokeSettings({
        NOMINATIM_USER_AGENT: "  ",
        PLANWIRE_API_KEY: "",
        EPC_API_KEY: " ",
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_MODEL: "",
      }),
    ).toEqual({
      userAgent: null,
      planItUserAgent: null,
      planWireApiKey: null,
      epcApiKey: null,
      anthropicApiKey: null,
      anthropicModel: "claude-sonnet-5-5",
    });
    // PlanIt is sent NOMINATIM_USER_AGENT without its own, as the API sends it.
    expect(
      readSmokeSettings({ NOMINATIM_USER_AGENT: TEST_USER_AGENT })
        .planItUserAgent,
    ).toBe(TEST_USER_AGENT);
  });

  it("fails each source that can't be reached, saying why", async () => {
    const results = await run({ fetch: noNetwork() });

    expect(results.map(({ outcome }) => outcome)).toEqual(
      SMOKE_CHECKS.map(() => "fail"),
    );
    expect(byName(results)["data.police.uk"]).toEqual({
      outcome: "fail",
      detail: "tests must not call Data Sources",
      requests: 1,
    });
  });

  it("fails each source whose answer no longer maps to our types", async () => {
    const results = await run({ fetch: fixtureFetch({ changed: true }) });

    expect(results.map(({ outcome }) => outcome)).toEqual(
      SMOKE_CHECKS.map(() => "fail"),
    );
    expect(byName(results)).toMatchObject({
      "postcodes.io": {
        detail: "postcodes.io answered 200 without a result",
      },
      Nominatim: {
        detail: "Nominatim answered 200 without a list of places",
      },
      PlanIt: { detail: "PlanIt gave no records" },
    });
  });

  it("fails a source whose answer still maps but has lost what it always had", async () => {
    const results = await run({
      checks: SMOKE_CHECKS.filter(({ name }) => name === "Nominatim"),
      fetch: fixtureFetch([{ name: "High Street" }]),
    });

    expect(results).toEqual([
      expect.objectContaining({
        outcome: "fail",
        detail:
          'It found no place for "12 High Street, Sutton-in-Ashfield", as it always has: its answer may have changed',
      }),
    ]);
  });

  it("fails a key the source refuses, saying which", async () => {
    const results = await run({
      settings: readSmokeSettings({
        NOMINATIM_USER_AGENT: TEST_USER_AGENT,
        PLANWIRE_API_KEY: "pw_live_wrong",
        EPC_API_KEY: "wrong",
        ANTHROPIC_API_KEY: "sk-ant-wrong",
      }),
    });

    expect(byName(results)).toMatchObject({
      PlanWire: {
        outcome: "fail",
        detail:
          "PlanWire answered 401 Unauthorised: check PLANWIRE_API_KEY is the key PlanWire gave you",
      },
      "Energy Performance of Buildings Data API": {
        outcome: "fail",
        detail:
          "The EPC API answered 403: check EPC_API_KEY is the bearer token on your account page at get-energy-performance-data.communities.gov.uk",
        requests: 1,
      },
      "Anthropic API": {
        outcome: "fail",
        detail:
          "Anthropic refused ANTHROPIC_API_KEY. Check the key in .env, and restart the API.",
      },
    });
  });

  it("fails PlanIt once it answers 429 Too Many Requests, without asking again", async () => {
    const tooMany = stubFetch(
      () =>
        new Response("Too many requests", {
          status: 429,
          headers: { "retry-after": "120" },
        }),
    );
    const results = await run({
      checks: SMOKE_CHECKS.filter(({ name }) => name === "PlanIt"),
      fetch: tooMany,
    });

    expect(results).toEqual([
      expect.objectContaining({
        outcome: "fail",
        detail:
          "PlanIt answered 429 Too Many Requests: waiting 120 s before asking again",
        requests: 1,
      }),
    ]);
  });

  it("fails a source that doesn't answer within the timeout", async () => {
    const results = await run({
      checks: SMOKE_CHECKS.filter(({ name }) => name === "postcodes.io"),
      fetch: neverAnswers(),
      timeoutMs: 50,
    });

    expect(results).toEqual([
      expect.objectContaining({
        outcome: "fail",
        detail: "It didn't answer within 0.05 seconds",
      }),
    ]);
  });

  it("tells each result as it comes", async () => {
    const onResult = vi.fn<(result: SmokeResult) => void>();
    const results = await run({ settings: readSmokeSettings({}), onResult });

    expect(onResult.mock.calls.map(([result]) => result)).toEqual(results);
  });
});
