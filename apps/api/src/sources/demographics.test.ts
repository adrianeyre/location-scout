import { describe, expect, it, vi } from "vitest";

import {
  CENSUS_2021_DATASET,
  milesToMetres,
  type PreparedManifest,
  type SearchArea,
} from "@location-scout/shared";

import { NOTHING_PREPARED, PREPARED_DATA_FIXTURE } from "../testing/app";
import { noNetwork } from "../testing/fetch-stubs";
import { createSourceCaller } from "./data-source";
import {
  demographicsSourceReports,
  demographicsStatistics,
  mapOutputAreas,
  medianAge,
  outlineOf,
  outputAreasIn,
  type OutputAreaRow,
} from "./demographics";
import type { PreparedData } from "./prepared-data";

const NG17_1AA = { lat: 53.123664, lng: -1.264078 };

const searchArea = (miles: 0.25 | 0.5 | 1): SearchArea => ({
  location: NG17_1AA,
  searchRadius: { miles, metres: milesToMetres(miles) },
});

const square = {
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [-1.265, 53.123],
        [-1.263, 53.123],
        [-1.263, 53.124],
        [-1.265, 53.124],
        [-1.265, 53.123],
      ] satisfies [number, number][],
    ],
  ],
};

/** Residents counted in one Census age band only. */
const inBand = (band: number, residents: number) =>
  Array.from({ length: 18 }, (_, index) => (index === band ? residents : 0));

const row = (overrides: Partial<OutputAreaRow>): OutputAreaRow => ({
  code: "E00000001",
  lsoaCode: "E01000001",
  lsoaName: "Somewhere 001A",
  msoaCode: "E02000001",
  population: 0,
  households: 0,
  populationDensity: 4000,
  ages: inBand(0, 0),
  income: null,
  decile: null,
  rank: null,
  overlap: 1,
  coversLocation: false,
  lat: NG17_1AA.lat,
  lng: NG17_1AA.lng,
  shape: square,
  ...overrides,
});

/**
 * Three output areas: one wholly inside the Search Area, one half inside and
 * one a quarter inside.
 */
const ROWS = [
  row({
    code: "E00000001",
    lsoaCode: "E01000001",
    lsoaName: "Somewhere 001A",
    msoaCode: "E02000001",
    population: 300,
    households: 120,
    ages: inBand(5, 300), // 25 to 29
    income: 40000,
    decile: 2,
    rank: 4000,
    overlap: 1,
    coversLocation: true,
  }),
  row({
    code: "E00000002",
    lsoaCode: "E01000002",
    lsoaName: "Somewhere 001B",
    msoaCode: "E02000001",
    population: 200,
    households: 100,
    ages: inBand(0, 200), // 0 to 4
    income: 40000,
    decile: 5,
    rank: 15000,
    overlap: 0.5,
  }),
  row({
    code: "E00000003",
    lsoaCode: "E01000003",
    lsoaName: "Somewhere 002A",
    msoaCode: "E02000002",
    population: 400,
    households: 160,
    ages: inBand(13, 400), // 65 to 69
    income: 30000,
    overlap: 0.25,
  }),
];

describe("medianAge", () => {
  it("finds the median within its band, taking ages to be spread evenly through it", () => {
    // 10 residents aged 20 to 24: the 5th is halfway through the band.
    expect(medianAge(inBand(4, 10))).toBe(22.5);
  });

  it("finds it across bands", () => {
    const ages = inBand(0, 0);
    ages[2] = 30; // 10 to 14
    ages[8] = 10; // 40 to 44
    ages[12] = 60; // 60 to 64
    // 100 residents: the 50th is the 10th of the 60 aged 60 to 64.
    expect(medianAge(ages)).toBe(60.8);
  });

  it("takes the last band, 85 and over, to be ten years wide", () => {
    expect(medianAge(inBand(17, 4))).toBe(90);
  });

  it("is null with no residents", () => {
    expect(medianAge(inBand(0, 0))).toBeNull();
  });
});

/** England's median household income, as if from the income estimates. */
const MEDIAN = 44_091;

describe("demographicsStatistics", () => {
  it("estimates the population and households, counting each output area in proportion to the share of it inside the Search Area", () => {
    const statistics = demographicsStatistics(ROWS, MEDIAN);

    expect(statistics.outputAreas).toBe(3);
    // 300 + 200 × 0.5 + 400 × 0.25
    expect(statistics.population).toBe(500);
    // 120 + 100 × 0.5 + 160 × 0.25
    expect(statistics.households).toBe(210);
  });

  it("gives the age profile and median age of the estimated population", () => {
    const statistics = demographicsStatistics(ROWS, MEDIAN);

    expect(statistics.ageProfile).toEqual([
      { group: "under-15", population: 100, percent: 20 },
      { group: "15-to-24", population: 0, percent: 0 },
      { group: "25-to-44", population: 300, percent: 60 },
      { group: "45-to-64", population: 0, percent: 0 },
      { group: "65-and-over", population: 100, percent: 20 },
    ]);
    // The 250th of 500: the 150th of the 300 aged 25 to 29.
    expect(statistics.medianAge).toBe(27.5);
  });

  it("averages the MSOAs' household incomes by the households estimated to be in the Search Area in each", () => {
    // (40,000 × (120 + 50) + 30,000 × 40) ÷ 210
    expect(demographicsStatistics(ROWS, MEDIAN).householdIncome).toEqual({
      averagePounds: 38095,
      msoas: 2,
      englandMedianPounds: 44091,
    });
  });

  it("gives no income without England's median to compare it with", () => {
    expect(demographicsStatistics(ROWS, null).householdIncome).toBeNull();
  });

  it("gives the deprivation of the LSOA the Location is in, and the range of those the Search Area reaches into", () => {
    expect(demographicsStatistics(ROWS, MEDIAN).deprivation).toEqual({
      atLocation: {
        code: "E01000001",
        name: "Somewhere 001A",
        decile: 2,
        rank: 4000,
      },
      lowestDecile: 2,
      highestDecile: 5,
      lsoas: 2,
    });
  });

  it("gives no income or deprivation where the prepared data has none", () => {
    const statistics = demographicsStatistics(
      ROWS.map((one) => ({ ...one, income: null, decile: null, rank: null })),
      MEDIAN,
    );

    expect(statistics.householdIncome).toBeNull();
    expect(statistics.deprivation).toBeNull();
  });

  it("gives nothing for a Search Area no output area reaches into", () => {
    expect(demographicsStatistics([], MEDIAN)).toEqual({
      outputAreas: 0,
      population: 0,
      households: 0,
      ageProfile: [
        { group: "under-15", population: 0, percent: 0 },
        { group: "15-to-24", population: 0, percent: 0 },
        { group: "25-to-44", population: 0, percent: 0 },
        { group: "45-to-64", population: 0, percent: 0 },
        { group: "65-and-over", population: 0, percent: 0 },
      ],
      medianAge: null,
      householdIncome: null,
      deprivation: null,
    });
  });
});

describe("outlineOf", () => {
  it("makes a Polygon a MultiPolygon", () => {
    expect(
      outlineOf(
        JSON.stringify({
          type: "Polygon",
          coordinates: square.coordinates[0],
        }),
      ),
    ).toEqual(square);
  });

  it("keeps a MultiPolygon", () => {
    expect(outlineOf(JSON.stringify(square))).toEqual(square);
  });

  it("refuses anything else", () => {
    expect(() =>
      outlineOf(JSON.stringify({ type: "Point", coordinates: [0, 0] })),
    ).toThrow(/not a polygon/);
  });
});

describe("outputAreasIn", () => {
  it("finds the output areas reaching into the Search Area in the prepared files, with the share of each inside it", async () => {
    const fetchMock = noNetwork();

    const result = await outputAreasIn(
      searchArea(0.5),
      createSourceCaller({ fetch: fetchMock }),
      PREPARED_DATA_FIXTURE,
    );

    if (result.status !== "ok") throw new Error(result.status);
    const { rows } = result.data;
    expect(rows).toHaveLength(44);
    expect(rows.filter(({ overlap }) => overlap > 0.9995)).toHaveLength(15);
    expect(rows.every(({ overlap }) => overlap > 0 && overlap <= 1)).toBe(true);
    expect(rows.filter(({ coversLocation }) => coversLocation)).toEqual([
      expect.objectContaining({
        code: "E00142547",
        lsoaCode: "E01027976",
        lsoaName: "Ashfield 005E",
        msoaCode: "E02005823",
        population: 239,
        households: 140,
        populationDensity: 2725.2,
        income: 33525,
        decile: 2,
        rank: 4630,
        overlap: 1,
      }),
    ]);
    expect(result.period).toEqual({ from: "2021-03-21", to: "2021-03-21" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds the median of every MSOA's household income in the prepared income estimates", async () => {
    const result = await outputAreasIn(
      searchArea(0.25),
      createSourceCaller({ fetch: noNetwork() }),
      PREPARED_DATA_FIXTURE,
    );

    if (result.status !== "ok") throw new Error(result.status);
    // The fixture's 7 MSOAs: the median of 33,525 to 49,991.
    expect(result.data.englandMedianIncome).toBe(44091);
  });

  it("estimates the population of NG17 1AA's 0.5 mile Search Area from the prepared fixture", async () => {
    const result = await outputAreasIn(
      searchArea(0.5),
      createSourceCaller({ fetch: noNetwork() }),
      PREPARED_DATA_FIXTURE,
    );

    if (result.status !== "ok") throw new Error(result.status);
    const { rows } = result.data;
    const statistics = demographicsStatistics(
      rows,
      result.data.englandMedianIncome,
    );
    expect(statistics).toMatchObject({
      outputAreas: 44,
      population: 9052,
      households: 3951,
      medianAge: 40.1,
      // The fixture's income estimates hold only the 7 MSOAs around
      // Ashfield, so this is their median, not England's.
      householdIncome: {
        averagePounds: 38890,
        msoas: 5,
        englandMedianPounds: 44091,
      },
      deprivation: {
        atLocation: {
          code: "E01027976",
          name: "Ashfield 005E",
          decile: 2,
          rank: 4630,
        },
        lowestDecile: 1,
        highestDecile: 10,
        lsoas: 14,
      },
    });
    // More than the residents of the output areas wholly inside it, and
    // fewer than those of every output area that reaches into it.
    const whollyInside = rows
      .filter(({ overlap }) => overlap > 0.9995)
      .reduce((sum, { population }) => sum + population, 0);
    const reaching = rows.reduce((sum, { population }) => sum + population, 0);
    expect(whollyInside).toBe(4429);
    expect(reaching).toBe(13695);
    expect(statistics.population).toBeGreaterThan(whollyInside);
    expect(statistics.population).toBeLessThan(reaching);
  });

  it("estimates fewer residents in a smaller Search Area", async () => {
    const callSource = createSourceCaller({ fetch: noNetwork() });

    const [quarter, half] = await Promise.all([
      outputAreasIn(searchArea(0.25), callSource, PREPARED_DATA_FIXTURE),
      outputAreasIn(searchArea(0.5), callSource, PREPARED_DATA_FIXTURE),
    ]);

    if (quarter.status !== "ok" || half.status !== "ok") throw new Error();
    expect(demographicsStatistics(quarter.data.rows, null).population).toBe(
      1955,
    );
    expect(demographicsStatistics(half.data.rows, null).population).toBe(9052);
  });

  it("is not prepared before pnpm data:prepare", async () => {
    const result = await outputAreasIn(
      searchArea(0.5),
      createSourceCaller({ fetch: noNetwork() }),
      NOTHING_PREPARED,
    );

    expect(result).toEqual({ status: "not-prepared" });
  });

  it("is not prepared when the manifest lacks one of its datasets, as one prepared before them does", async () => {
    const manifest = await PREPARED_DATA_FIXTURE.manifest();
    const withoutCensus: PreparedData = {
      manifest: () =>
        Promise.resolve<PreparedManifest>({
          ...manifest,
          datasets: manifest.datasets.filter(
            ({ id }) => id !== CENSUS_2021_DATASET,
          ),
        }),
      query: vi.fn<PreparedData["query"]>(),
    };

    const result = await outputAreasIn(
      searchArea(0.5),
      createSourceCaller({ fetch: noNetwork() }),
      withoutCensus,
    );

    expect(result).toEqual({ status: "not-prepared" });
    expect(withoutCensus.query).not.toHaveBeenCalled();
  });

  it("is unavailable if the prepared files can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: PreparedData = {
      manifest: () => PREPARED_DATA_FIXTURE.manifest(),
      query: () => Promise.reject(new Error("Corrupt file")),
    };

    const result = await outputAreasIn(
      searchArea(0.5),
      createSourceCaller({ fetch: noNetwork() }),
      broken,
    );

    expect(result).toEqual({ status: "unavailable" });
  });
});

describe("demographicsSourceReports", () => {
  it("reports each dataset with the date its data dates from", async () => {
    const result = await outputAreasIn(
      searchArea(0.25),
      createSourceCaller({ fetch: noNetwork() }),
      PREPARED_DATA_FIXTURE,
    );

    expect(demographicsSourceReports(result)).toEqual([
      {
        id: "ons-output-areas",
        name: "ONS Open Geography",
        status: "ok",
        period: { from: "2021-12", to: "2021-12" },
      },
      {
        id: "ons-census-2021",
        name: "ONS Census 2021",
        status: "ok",
        period: { from: "2021-03-21", to: "2021-03-21" },
      },
      {
        id: "ons-income-estimates",
        name: "ONS small area income estimates",
        status: "ok",
        period: { from: "2023-03", to: "2023-03" },
      },
      {
        id: "indices-of-deprivation",
        name: "English Indices of Deprivation",
        status: "ok",
        period: { from: "2025-10-30", to: "2025-10-30" },
      },
    ]);
  });

  it("reports each as not prepared before pnpm data:prepare", () => {
    expect(
      demographicsSourceReports({ status: "not-prepared" }).map(
        ({ status, period }) => ({ status, period }),
      ),
    ).toEqual(Array(4).fill({ status: "not-prepared", period: null }));
  });
});

describe("mapOutputAreas", () => {
  it("makes each output area a Feature, marked at a point of it inside the Search Area", () => {
    const [feature] = mapOutputAreas(
      [{ ...ROWS[0], lat: 53.1236641, lng: -1.2655 } as OutputAreaRow],
      searchArea(0.5),
    );

    expect(feature).toEqual({
      id: "E00000001",
      location: { lat: 53.123664, lng: -1.2655 },
      distanceMetres: 95,
      lsoa: { code: "E01000001", name: "Somewhere 001A" },
      msoaCode: "E02000001",
      population: 300,
      households: 120,
      populationDensity: 4000,
      medianAge: 27.5,
      householdIncome: 40000,
      deprivationDecile: 2,
      overlap: 1,
      coversLocation: true,
      shape: square,
    });
  });
});
