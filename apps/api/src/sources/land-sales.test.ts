import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NEARBY_LAND_SALES_RULES,
  type LandParcel,
  type PreparedManifest,
} from "@location-scout/shared";

import {
  NOTHING_PREPARED,
  PREPARED_DATA_FIXTURE,
  PREPARED_DATA_FIXTURE_DIR,
} from "../testing/app";
import {
  fixtureFetch,
  landRegistryFixtures,
  noNetwork,
} from "../testing/fetch-stubs";
import {
  PROPERTY_RECORDED_ON,
  SUTTON_PARKWAY_LAND_SALES,
} from "../testing/property-recordings";
import { createSourceCaller } from "./data-source";
import suttonParkwayLandSales from "./fixtures/land-registry-sutton-parkway-land-sales.json" with { type: "json" };
import { landParcel } from "./land";
import { landSalesNear, listing, postcodesNear } from "./land-sales";
import { openPreparedData } from "./prepared-data";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A Land Parcel in the prepared-data fixture, by its id. */
const parcel = async (id: string): Promise<LandParcel> => {
  const found = await landParcel(
    id,
    createSourceCaller({ fetch: noNetwork() }),
    PREPARED_DATA_FIXTURE,
  );
  if (found.status !== "ok" || !found.data) throw new Error(`No ${id}`);
  return found.data.parcel;
};

/** Sutton Parkway's farm field, the Land Opportunity in its 0.25 mile Search Area. */
const FIELD = "E07000170-2";

/** A copy of the prepared-data fixture, as prepared before postcodes were kept. */
const withoutPostcodes = async () => {
  const dir = await mkdtemp(join(tmpdir(), "location-scout-land-sales-"));
  await cp(PREPARED_DATA_FIXTURE_DIR, dir, { recursive: true });
  const file = join(dir, "manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as PreparedManifest;
  await writeFile(
    file,
    JSON.stringify({
      ...manifest,
      landCoverageAreas: manifest.landCoverageAreas.map((area) => ({
        ...area,
        datasets: area.datasets.filter(({ id }) => id !== "postcodes"),
      })),
    }),
  );
  return { dir, prepared: openPreparedData(dir) };
};

describe("postcodesNear", () => {
  it("finds the postcodes within 1 mile of a Land Parcel, the nearest first, calling no Data Source", async () => {
    const fetchMock = noNetwork();

    const result = await postcodesNear(
      [await parcel(FIELD)],
      createSourceCaller({ fetch: fetchMock }),
      PREPARED_DATA_FIXTURE,
    );

    expect(result).toMatchObject({
      status: "ok",
      period: { from: "2026-08", to: "2026-08" },
    });
    const near = result.status === "ok" ? result.data.get(FIELD) : undefined;
    expect(near).toHaveLength(494);
    expect(near?.[0]).toEqual({
      postcode: "NG17 5LX",
      location: {
        lat: expect.closeTo(53.11349, 5) as unknown,
        lng: expect.closeTo(-1.24503, 5) as unknown,
      },
      distanceMetres: 36,
    });
    const distances = near?.map(({ distanceMetres }) => distanceMetres) ?? [];
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(Math.max(...distances)).toBeLessThanOrEqual(
      NEARBY_LAND_SALES_RULES.withinMetres,
    );
    // The postcodes Price Paid's recording was asked for.
    expect(near?.map(({ postcode }) => postcode).sort()).toEqual(
      SUTTON_PARKWAY_LAND_SALES.postcodes,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds each Land Parcel's own", async () => {
    const result = await postcodesNear(
      [await parcel(FIELD), await parcel("E07000170-1")],
      createSourceCaller({ fetch: noNetwork() }),
      PREPARED_DATA_FIXTURE,
    );

    expect(
      result.status === "ok"
        ? [...result.data].map(([id, near]) => [id, near.length])
        : [],
    ).toEqual([
      [FIELD, 494],
      ["E07000170-1", 450],
    ]);
  });

  it("is not prepared for a Land Coverage Area prepared before its postcodes were kept, or before pnpm data:prepare", async () => {
    const field = await parcel(FIELD);
    const { dir, prepared } = await withoutPostcodes();
    try {
      for (const preparedData of [prepared, NOTHING_PREPARED]) {
        expect(
          await postcodesNear(
            [field],
            createSourceCaller({ fetch: noNetwork() }),
            preparedData,
          ),
        ).toEqual({ status: "not-prepared" });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("landSalesNear", () => {
  /** 9 October 2021 to the day the recordings were asked on. */
  const PERIOD = { from: "2021-10-09", to: PROPERTY_RECORDED_ON };

  it("gives the 76 sales of property of type Other recorded within 1 mile of Sutton Parkway's farm field in 5 years, the newest first, each at its postcode", async () => {
    const fetchMock = landRegistryFixtures(SUTTON_PARKWAY_LAND_SALES.pricePaid);

    const near = await landSalesNear(
      [await parcel(FIELD)],
      PROPERTY_RECORDED_ON,
      createSourceCaller({ fetch: fetchMock }),
      PREPARED_DATA_FIXTURE,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const field = near.byParcel.get(FIELD);
    expect(field).toMatchObject({
      status: "ok",
      period: PERIOD,
      found: { count: 76, medianPrice: 207000 },
    });
    expect(field?.found?.sales).toHaveLength(76);
    expect(field?.found?.sales[0]).toEqual({
      id: "5A7B802D-835A-1886-E063-4704A8C021AE",
      price: 100000,
      date: "2026-07-14",
      address: "44 HARCOURT STREET, NOTTINGHAM",
      postcode: "NG17 8DD",
      location: {
        lat: expect.any(Number) as unknown,
        lng: expect.any(Number) as unknown,
      },
      distanceMetres: expect.any(Number) as unknown,
    });
    for (const sale of field?.found?.sales ?? []) {
      expect(sale.distanceMetres).toBeLessThanOrEqual(
        NEARBY_LAND_SALES_RULES.withinMetres,
      );
    }
    // Plot D on Sidings Road is the one that is plainly land.
    expect(
      field?.found?.sales.find(({ address }) => address.startsWith("PLOT D")),
    ).toMatchObject({
      price: 110000,
      date: "2022-02-11",
      postcode: "NG17 7JZ",
    });
    expect(near.all).toEqual(field);
    expect(near.sources).toEqual([
      {
        id: "postcodes",
        name: "Postcodes",
        status: "ok",
        period: { from: "2026-08", to: "2026-08" },
      },
      {
        id: "land-registry",
        name: "HM Land Registry Price Paid",
        status: "ok",
        period: PERIOD,
      },
    ]);
  });

  it("asks once for several Land Parcels, giving each its own, and all of them each as far as the nearest", async () => {
    // Any query is answered with the field's sales.
    const fetchMock = fixtureFetch(suttonParkwayLandSales);
    const parcels = [await parcel(FIELD), await parcel("E07000170-1")];

    const near = await landSalesNear(
      parcels,
      PROPERTY_RECORDED_ON,
      createSourceCaller({ fetch: fetchMock }),
      PREPARED_DATA_FIXTURE,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const field = near.byParcel.get(FIELD)?.found?.sales ?? [];
    const other = near.byParcel.get("E07000170-1")?.found?.sales ?? [];
    expect(field).toHaveLength(76);
    expect(other.length).toBeGreaterThan(0);
    const all = near.all.found?.sales ?? [];
    expect(all).toHaveLength(
      new Set([...field, ...other].map(({ id }) => id)).size,
    );
    for (const sale of all) {
      const distances = [...field, ...other]
        .filter(({ id }) => id === sale.id)
        .map(({ distanceMetres }) => distanceMetres);
      expect(sale.distanceMetres).toBe(Math.min(...distances));
    }
  });

  it("is unavailable if Price Paid doesn't answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const near = await landSalesNear(
      [await parcel(FIELD)],
      PROPERTY_RECORDED_ON,
      createSourceCaller({ fetch: noNetwork() }),
      PREPARED_DATA_FIXTURE,
    );

    const unavailable = { status: "unavailable", period: PERIOD, found: null };
    expect(near.byParcel.get(FIELD)).toEqual(unavailable);
    expect(near.all).toEqual(unavailable);
    expect(near.sources.map(({ id, status }) => [id, status])).toEqual([
      ["postcodes", "ok"],
      ["land-registry", "unavailable"],
    ]);
  });

  it("is not prepared, and asks Price Paid nothing, without the Land Coverage Area's postcodes", async () => {
    const field = await parcel(FIELD);
    const fetchMock = noNetwork();
    const { dir, prepared } = await withoutPostcodes();
    try {
      const near = await landSalesNear(
        [field],
        PROPERTY_RECORDED_ON,
        createSourceCaller({ fetch: fetchMock }),
        prepared,
      );

      expect(near.all).toEqual({
        status: "not-prepared",
        period: PERIOD,
        found: null,
      });
      expect(near.sources).toEqual([
        {
          id: "postcodes",
          name: "Postcodes",
          status: "not-prepared",
          period: null,
        },
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("finds none, and asks nothing, near no Land Parcel", async () => {
    const fetchMock = noNetwork();

    const near = await landSalesNear(
      [],
      PROPERTY_RECORDED_ON,
      createSourceCaller({ fetch: fetchMock }),
      PREPARED_DATA_FIXTURE,
    );

    expect(near.all).toEqual({
      status: "ok",
      period: PERIOD,
      found: { count: 0, medianPrice: null, sales: [] },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("listing", () => {
  it("lists the newest 10, still counting them all", async () => {
    const near = await landSalesNear(
      [await parcel(FIELD)],
      PROPERTY_RECORDED_ON,
      createSourceCaller({
        fetch: landRegistryFixtures(SUTTON_PARKWAY_LAND_SALES.pricePaid),
      }),
      PREPARED_DATA_FIXTURE,
    );

    const listed = listing(near.all);

    expect(listed.found?.count).toBe(76);
    expect(listed.found?.sales).toEqual(near.all.found?.sales.slice(0, 10));
    expect(listed.found?.sales.map(({ date }) => date)).toEqual([
      "2026-07-14",
      "2026-05-28",
      "2026-04-28",
      "2026-03-27",
      "2026-03-27",
      "2026-01-06",
      "2025-12-22",
      "2025-12-19",
      "2025-11-19",
      "2025-10-17",
    ]);
  });

  it("leaves land sales that aren't known as they are", () => {
    const unknown = {
      status: "unavailable" as const,
      period: { from: "2021-10-09", to: "2026-10-08" },
      found: null,
    };

    expect(listing(unknown)).toBe(unknown);
  });
});
