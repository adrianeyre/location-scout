import { afterEach, describe, expect, it, vi } from "vitest";

import type { SearchArea } from "@location-scout/shared";

import { NOTHING_PREPARED } from "../testing/app";
import { jsonAreaSource } from "../testing/area-sources";
import { noNetwork, stubFetch } from "../testing/fetch-stubs";
import { layerStatus, loadAreaSources, type AreaSource } from "./area-sources";
import { NotPreparedError, createSourceCaller } from "./data-source";
import { createRateLimiter } from "./rate-limiter";

const area: SearchArea = {
  location: { lat: 53.123664, lng: -1.264078 },
  searchRadius: { miles: 0.5, metres: 804.672 },
};

/** Limiters that never hold up a test. */
const limiters = {
  police: createRateLimiter(0),
  overpass: createRateLimiter(0),
};

const USER_AGENT = "location-scout-test (tests@example.com)";

const TODAY = "2026-10-08";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("layerStatus", () => {
  it.each([
    [["ok"], "ok"],
    [["ok", "ok"], "ok"],
    [["ok", "unavailable"], "unavailable"],
    [["unavailable", "not-prepared"], "not-prepared"],
    [["ok", "not-prepared"], "not-prepared"],
  ] as const)("is %j → %s", (statuses, expected) => {
    expect(layerStatus(statuses)).toBe(expected);
  });
});

describe("loadAreaSources", () => {
  it("reports no sources and no Layers when there are none", async () => {
    const callSource = createSourceCaller({ fetch: noNetwork() });

    expect(
      await loadAreaSources(
        area,
        [],
        callSource,
        limiters,
        USER_AGENT,
        TODAY,
        NOTHING_PREPARED,
      ),
    ).toEqual({
      sources: [],
      layers: [],
    });
  });

  it("reports each source with its status and period, and each Layer it supplies", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn<typeof fetch>((url) =>
      url === "/crime"
        ? Promise.resolve(Response.json([]))
        : Promise.reject(new Error("connection reset")),
    );
    const sources = [
      jsonAreaSource("police", ["crime"], "/crime", {
        from: "2026-07",
        to: "2026-07",
      }),
      jsonAreaSource("overpass", ["transport", "amenities"], "/osm"),
    ];

    const report = await loadAreaSources(
      area,
      sources,
      createSourceCaller({ fetch: fetchMock }),
      limiters,
      USER_AGENT,
      TODAY,
      NOTHING_PREPARED,
    );

    expect(report).toEqual({
      sources: [
        {
          id: "police",
          name: "police source",
          status: "ok",
          period: { from: "2026-07", to: "2026-07" },
        },
        {
          id: "overpass",
          name: "overpass source",
          status: "unavailable",
          period: null,
        },
      ],
      // In the order Layers are listed, not the order sources are.
      layers: [
        { id: "crime", status: "ok" },
        { id: "amenities", status: "unavailable" },
        { id: "transport", status: "unavailable" },
      ],
    });
  });

  it("combines the sources of a Layer that has several", async () => {
    const prepared: AreaSource = {
      source: { id: "land-files", name: "Prepared land", cacheTtlMs: 0 },
      layers: ["land"],
      load: (_area, callSource) =>
        callSource(prepared.source, "parcels", () =>
          Promise.reject(new NotPreparedError("no data/ashfield")),
        ),
    };
    const fetchMock = stubFetch(() => Response.json({}));

    const report = await loadAreaSources(
      area,
      [
        jsonAreaSource("planning", ["planning", "land"], "/constraints"),
        prepared,
      ],
      createSourceCaller({ fetch: fetchMock }),
      limiters,
      USER_AGENT,
      TODAY,
      NOTHING_PREPARED,
    );

    expect(report.layers).toEqual([
      { id: "planning", status: "ok" },
      { id: "land", status: "not-prepared" },
    ]);
  });

  it("gives each load the app's limiters, User-Agent, today's date and prepared data", async () => {
    const load = vi.fn<AreaSource["load"]>(() =>
      Promise.resolve({ status: "ok", data: null, period: null }),
    );
    const callSource = createSourceCaller({ fetch: noNetwork() });

    await loadAreaSources(
      area,
      [{ source: { id: "x", name: "X", cacheTtlMs: 0 }, layers: [], load }],
      callSource,
      limiters,
      USER_AGENT,
      TODAY,
      NOTHING_PREPARED,
    );

    expect(load).toHaveBeenCalledWith(
      area,
      callSource,
      limiters,
      USER_AGENT,
      TODAY,
      NOTHING_PREPARED,
    );
  });

  it("reports a load that throws as unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: AreaSource = {
      source: { id: "broken", name: "Broken", cacheTtlMs: 0 },
      layers: ["property"],
      load: () => Promise.reject(new Error("bug")),
    };

    const report = await loadAreaSources(
      area,
      [broken],
      createSourceCaller({ fetch: noNetwork() }),
      limiters,
      USER_AGENT,
      TODAY,
      NOTHING_PREPARED,
    );

    expect(report).toEqual({
      sources: [
        { id: "broken", name: "Broken", status: "unavailable", period: null },
      ],
      layers: [{ id: "property", status: "unavailable" }],
    });
  });
});
