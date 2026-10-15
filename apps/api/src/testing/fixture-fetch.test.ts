import { describe, expect, it, vi } from "vitest";

import type {
  LandLayerResponse,
  LandParcelResponse,
  PlanningLayerResponse,
  PropertyLayerResponse,
} from "@location-scout/shared";

import { createRateLimiter } from "../sources/rate-limiter";
import { recordedFetch } from "./fixture-fetch";
import { PREPARED_DATA_FIXTURE, testApp } from "./app";
import { STUB_PART_MS, TEST_ANTHROPIC_API_KEY } from "./anthropic-stub";
import { TEST_EPC_API_KEY } from "./epc-recordings";
import { TEST_PLANWIRE_API_KEY } from "./planwire-recordings";

describe("recordedFetch", () => {
  // As the fixture server makes it: its PlanIt requests wait for no turn.
  const app = testApp({
    fetch: recordedFetch,
    planItLimiter: createRateLimiter(0),
  });

  it("finds a recorded postcode, then its Search Area in England", async () => {
    const geocode = await app.request("/api/geocode?q=ng17%201aa");
    expect(await geocode.json()).toMatchObject({
      candidates: [{ kind: "postcode", label: "NG17 1AA" }],
    });

    const area = await app.request(
      "/api/area?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
    );
    expect(area.status).toBe(200);
    expect(await area.json()).toMatchObject({
      geography: { postcode: "NG17 1AA", localAuthority: "Ashfield" },
    });
  });

  it("answers the nearest postcode from the recording nearest the point", async () => {
    const area = await app.request(
      "/api/area?lat=53.1431&lng=-1.1982&radius=0.5",
    );

    expect(await area.json()).toMatchObject({
      geography: { postcode: "NG18 1JJ" },
    });
  });

  it("answers as postcodes.io does for a postcode or a point it has no recording for", async () => {
    const unknown = await app.request("/api/geocode?q=ZZ1%201ZZ");
    const atSea = await app.request("/api/area?lat=54.5&lng=2&radius=0.5");

    expect(unknown.status).toBe(404);
    expect(atSea.status).toBe(404);
  });

  it("answers a recorded address search, and finds nothing for any other", async () => {
    const recorded = await app.request(
      "/api/geocode?q=12%20High%20Street%2C%20Sutton-in-Ashfield",
    );
    const other = await app.request("/api/geocode?q=Nowhere%20Lane");

    expect(await recorded.json()).toMatchObject({
      candidates: [
        { kind: "address" },
        { kind: "address" },
        { kind: "address" },
      ],
    });
    expect(other.status).toBe(404);
  });

  it("answers NG17 1AA's crimes at 0.5 mile, and the Crime Layer is unavailable anywhere else", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const ng17 = await app.request(
      "/api/area/crime?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
    );
    const wider = await app.request(
      "/api/area/crime?lat=53.123664&lng=-1.264078&radius=1",
    );
    const mansfield = await app.request(
      "/api/area/crime?lat=53.1431&lng=-1.1982&radius=0.5",
    );

    expect(await ng17.json()).toMatchObject({
      status: "ok",
      statistics: {
        month: "2026-08",
        total: 185,
        trend: {
          complete: true,
          total: { last12Months: 2024, previous12Months: 1912, change: 5.9 },
        },
      },
    });
    expect(await wider.json()).toMatchObject({ status: "unavailable" });
    expect(await mansfield.json()).toMatchObject({ status: "unavailable" });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(
        "No fixture recorded for https://data.police.uk/",
      ),
    );

    logged.mockRestore();
  });

  it("answers NG17 1AA's Planning Constraints at 0.5 mile, and the Planning Layer is unavailable anywhere else", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const ng17 = await app.request(
      "/api/area/planning?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
    );
    const mansfield = await app.request(
      "/api/area/planning?lat=53.1431&lng=-1.1982&radius=0.5",
    );

    expect(await ng17.json()).toMatchObject({
      status: "ok",
      statistics: {
        coveringLocation: [
          {
            type: "conservation-area",
            name: "Sutton in Ashfield Church and Market Place",
          },
        ],
      },
    });
    expect(await mansfield.json()).toMatchObject({ status: "unavailable" });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(
        "No fixture recorded for https://www.planning.data.gov.uk/",
      ),
    );

    logged.mockRestore();
  });

  it("answers NG17 1AA's Planning Applications at 0.5 mile, and they are unavailable anywhere else", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // Its own, as the app above remembers a failed request for a minute.
    const fresh = testApp({
      fetch: recordedFetch,
      planItLimiter: createRateLimiter(0),
    });

    const ng17 = await fresh.request(
      "/api/area/planning?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
    );
    const mansfield = await fresh.request(
      "/api/area/planning?lat=53.1431&lng=-1.1982&radius=0.5",
    );

    const { applications } = (await ng17.json()) as PlanningLayerResponse;
    expect(applications).toMatchObject({
      status: "ok",
      provider: { id: "planit", name: "PlanIt" },
      statistics: { count: 126, total: 126 },
    });
    expect(await mansfield.json()).toMatchObject({
      applications: { status: "unavailable", features: [] },
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(
        "No fixture recorded for https://www.planit.org.uk/",
      ),
    );

    logged.mockRestore();
  });

  it("answers PlanWire's made-up Planning Applications for NG17 1AA at 0.5 mile, to the tests' key only, and they are unavailable anywhere else", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const ng17 =
      "/api/area/planning?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA";
    const withKey = (planWireApiKey: string) =>
      testApp({ fetch: recordedFetch, planWireApiKey });

    const ours = await withKey(TEST_PLANWIRE_API_KEY).request(ng17);
    const mansfield = await withKey(TEST_PLANWIRE_API_KEY).request(
      "/api/area/planning?lat=53.1431&lng=-1.1982&radius=0.5",
    );
    const another = await withKey("pw_live_not_ours").request(ng17);

    expect(
      ((await ours.json()) as PlanningLayerResponse).applications,
    ).toMatchObject({
      status: "ok",
      provider: { id: "planwire", name: "PlanWire" },
      statistics: { count: 97, total: null },
    });
    expect(await mansfield.json()).toMatchObject({
      applications: { status: "unavailable", features: [] },
    });
    expect(await another.json()).toMatchObject({
      applications: { status: "unavailable" },
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(
        "No fixture recorded for https://api.planwire.io/",
      ),
    );

    logged.mockRestore();
  });

  it("answers the EPC API's made-up certificates in NG17 1AA's postcodes at 0.5 mile, to the tests' token only, and they are unavailable anywhere else", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const ng17 =
      "/api/area/property?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA";
    const withKey = (epcApiKey: string) =>
      testApp({ fetch: recordedFetch, epcApiKey });

    const ours = await withKey(TEST_EPC_API_KEY).request(ng17);
    const suttonParkway = await withKey(TEST_EPC_API_KEY).request(
      "/api/area/property?lat=53.1145&lng=-1.246&radius=0.25",
    );
    const another = await withKey("not_ours").request(ng17);

    expect(((await ours.json()) as PropertyLayerResponse).epc).toMatchObject({
      status: "ok",
      statistics: { homes: 35, sales: { lookedFor: 20, matched: 19 } },
    });
    expect(await suttonParkway.json()).toMatchObject({
      status: "ok",
      epc: { status: "unavailable" },
    });
    expect(await another.json()).toMatchObject({
      status: "ok",
      epc: { status: "unavailable" },
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(
        "No fixture recorded for https://api.get-energy-performance-data.communities.gov.uk/",
      ),
    );

    logged.mockRestore();
  });

  it("writes AI Explanations with a stubbed model, a part at a time, for the tests' key only", async () => {
    const ask = (anthropicApiKey: string) =>
      testApp({
        fetch: recordedFetch,
        planItLimiter: createRateLimiter(0),
        preparedData: PREPARED_DATA_FIXTURE,
        anthropicApiKey,
      }).request("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: 53.123664,
          lng: -1.264078,
          radius: 0.5,
          postcode: "NG17 1AA",
          mode: "general",
          subject: { kind: "category", category: "safety" },
          question: "Why is this score what it is?",
        }),
      });

    const started = Date.now();
    const ours = await (await ask(TEST_ANTHROPIC_API_KEY)).text();
    const took = Date.now() - started;
    const another = await (await ask("sk-ant-not-ours")).text();

    expect(ours).toContain(
      'data: {"type":"text","text":"The stubbed model was asked \\"Why is this score what it is?\\". "}',
    );
    expect(ours).toContain('"type":"done"');
    // Its three parts come a while apart, so they are seen streaming.
    expect(took).toBeGreaterThanOrEqual(2 * STUB_PART_MS);
    expect(another).toContain(
      "Anthropic refused ANTHROPIC_API_KEY. Check the key in .env",
    );
  }, 20_000);

  it("answers NG17 1AA's amenities at 0.5 mile, and the Amenities Layer is unavailable anywhere else", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const ng17 = await app.request(
      "/api/area/amenities?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
    );
    const mansfield = await app.request(
      "/api/area/amenities?lat=53.1431&lng=-1.1982&radius=0.5",
    );

    expect(await ng17.json()).toMatchObject({
      status: "ok",
      sources: [{ period: { from: "2026-10-08", to: "2026-10-08" } }],
      statistics: { total: 197 },
    });
    expect(await mansfield.json()).toMatchObject({ status: "unavailable" });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(
        "No fixture recorded for https://overpass-api.de/",
      ),
    );

    logged.mockRestore();
  });

  it("answers the transport at NG17 1AA at 0.5 mile and at Sutton Parkway at 0.25 mile from the same recordings as the amenities", async () => {
    const ng17 = await app.request(
      "/api/area/transport?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
    );
    const suttonParkway = await app.request(
      "/api/area/transport?lat=53.1145&lng=-1.246&radius=0.25",
    );
    const suttonParkwayArea = await app.request(
      "/api/area?lat=53.1145&lng=-1.246&radius=0.25",
    );

    expect(await ng17.json()).toMatchObject({
      status: "ok",
      statistics: {
        nearestStation: { name: "Sutton Parkway", inSearchArea: false },
      },
    });
    expect(await suttonParkway.json()).toMatchObject({
      status: "ok",
      statistics: {
        facilities: [
          { type: "railway-station", count: 1 },
          { type: "bus-stop", count: 5 },
          { type: "car-park", count: 10 },
          { type: "ev-charger", count: 0 },
        ],
        nearestStation: {
          name: "Sutton Parkway",
          distanceMetres: 50,
          inSearchArea: true,
        },
      },
    });
    expect(await suttonParkwayArea.json()).toMatchObject({
      geography: { postcode: "NG17 5LG", localAuthority: "Ashfield" },
    });
  });

  it("answers the green space at NG17 1AA at 0.5 mile and at Sutton Parkway at 0.25 mile from the same recordings", async () => {
    const ng17 = await app.request(
      "/api/area/green-space?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
    );
    const suttonParkway = await app.request(
      "/api/area/green-space?lat=53.1145&lng=-1.246&radius=0.25",
    );

    expect(await ng17.json()).toMatchObject({
      status: "ok",
      statistics: {
        total: 13,
        nearestPark: { distanceMetres: 104, inSearchArea: true },
      },
    });
    expect(await suttonParkway.json()).toMatchObject({
      status: "ok",
      statistics: {
        total: 7,
        nearestPark: { distanceMetres: 95, inSearchArea: true },
      },
    });
  });

  it("answers the sales at NG17 1AA at 0.5 mile and at Sutton Parkway at 0.25 mile, with their histories and the sales a year and five years before, and the Property Layer is unavailable anywhere else", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const ng17 = await app.request(
      "/api/area/property?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
    );
    const suttonParkway = await app.request(
      "/api/area/property?lat=53.1145&lng=-1.246&radius=0.25",
    );
    const mansfield = await app.request(
      "/api/area/property?lat=53.1431&lng=-1.1982&radius=0.5",
    );

    const ng17Body = (await ng17.json()) as PropertyLayerResponse;
    expect(ng17Body).toMatchObject({
      status: "ok",
      statistics: {
        all: { count: 24, median: 182000, mean: 187000 },
        medianChange: {
          twelveMonths: { prices: { count: 54 }, change: 13.8 },
          fiveYears: { prices: { count: 39 }, change: 21.3 },
        },
        postcodes: { searched: 100, truncated: true },
      },
    });
    expect(ng17Body.features.every(({ history }) => history !== null)).toBe(
      true,
    );
    expect(await suttonParkway.json()).toMatchObject({
      status: "ok",
      features: [
        {
          address: "5 MAUN VIEW GARDENS, SUTTON-IN-ASHFIELD",
          history: [
            { price: 150000, date: "2025-10-10", change: 10.3 },
            { price: 136000, date: "2007-04-10", change: null },
          ],
        },
      ],
      statistics: {
        all: { count: 1, median: 150000, mean: 150000 },
        medianChange: {
          twelveMonths: { prices: { count: 3, median: 260000 }, change: -42.3 },
          fiveYears: { prices: { count: 2, median: 145000 }, change: 3.4 },
        },
        postcodes: { searched: 7, truncated: false },
      },
    });
    expect(await mansfield.json()).toMatchObject({
      status: "unavailable",
      sources: [{ id: "postcodes-io", status: "unavailable" }],
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(
        "No fixture recorded for https://api.postcodes.io/postcodes?lon=-1.1982&lat=53.1431&radius=805&limit=100",
      ),
    );

    logged.mockRestore();
  });

  it("answers the land sales within 1 mile of Sutton Parkway's farm field, and they are unavailable near any other Land Parcel", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const land = testApp({
      fetch: recordedFetch,
      preparedData: PREPARED_DATA_FIXTURE,
    });

    const layer = (await (
      await land.request("/api/area/land?lat=53.1145&lng=-1.246&radius=0.25")
    ).json()) as LandLayerResponse;
    const field = (await (
      await land.request("/api/land/E07000170-2")
    ).json()) as LandParcelResponse;
    const other = (await (
      await land.request("/api/land/E07000170-1")
    ).json()) as LandParcelResponse;

    expect(layer.statistics?.nearbyLandSales).toMatchObject({
      status: "ok",
      found: { count: 76, medianPrice: 207000 },
    });
    expect(layer.statistics?.nearbyLandSales?.found?.sales).toHaveLength(10);
    expect(field.nearbyLandSales.found?.sales).toHaveLength(76);
    expect(other.nearbyLandSales).toMatchObject({
      status: "unavailable",
      found: null,
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(
        "No fixture recorded for https://landregistry.data.gov.uk/landregistry/query",
      ),
    );

    logged.mockRestore();
  });

  it("fails a call it has no recording for, without sending it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const network = vi.spyOn(globalThis, "fetch");

    await expect(
      recordedFetch("https://data.police.uk/api/crimes-street/all-crime"),
    ).rejects.toThrow("No fixture recorded");
    expect(network).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("data.police.uk"),
    );

    network.mockRestore();
    logged.mockRestore();
  });
});
