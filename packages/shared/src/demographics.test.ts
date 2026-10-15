import { describe, expect, it } from "vitest";

import {
  AGE_GROUPS,
  AGE_GROUP_BANDS,
  CENSUS_AGE_BANDS,
  DEMOGRAPHIC_MEASURES,
  isDemographicMeasure,
  isDemographicsLayerResponse,
  isDemographicsStatistics,
  isOutputAreaFeature,
} from "./demographics";
import { isLayerResponse } from "./layer";

const outline = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-1.266, 53.122],
        [-1.262, 53.122],
        [-1.262, 53.125],
        [-1.266, 53.125],
        [-1.266, 53.122],
      ],
    ],
  ],
};

const outputArea = {
  id: "E00142451",
  location: { lat: 53.1236, lng: -1.2641 },
  distanceMetres: 7.3,
  lsoa: { code: "E01027960", name: "Ashfield 010C" },
  msoaCode: "E02005828",
  population: 312,
  households: 160,
  populationDensity: 5210.4,
  medianAge: 41.3,
  householdIncome: 37800,
  deprivationDecile: 2,
  overlap: 1,
  coversLocation: true,
  shape: outline,
};

const statistics = {
  outputAreas: 1,
  population: 312,
  households: 160,
  ageProfile: AGE_GROUPS.map((group) => ({
    group,
    population: group === "25-to-44" ? 312 : 0,
    percent: group === "25-to-44" ? 100 : 0,
  })),
  medianAge: 41.3,
  householdIncome: {
    averagePounds: 37800,
    msoas: 1,
    englandMedianPounds: 44091,
  },
  deprivation: {
    atLocation: {
      code: "E01027960",
      name: "Ashfield 010C",
      decile: 2,
      rank: 4021,
    },
    lowestDecile: 2,
    highestDecile: 2,
    lsoas: 1,
  },
};

const layer = {
  layer: "demographics",
  status: "ok",
  sources: [
    {
      id: "ons-census-2021",
      name: "ONS Census 2021",
      status: "ok",
      period: { from: "2021-03-21", to: "2021-03-21" },
    },
  ],
  features: [outputArea],
  statistics,
};

describe("DEMOGRAPHIC_MEASURES", () => {
  it("are population density, median age, household income and deprivation", () => {
    expect(DEMOGRAPHIC_MEASURES).toEqual([
      "population-density",
      "median-age",
      "household-income",
      "deprivation",
    ]);
    for (const measure of DEMOGRAPHIC_MEASURES)
      expect(isDemographicMeasure(measure)).toBe(true);
    expect(isDemographicMeasure("income")).toBe(false);
  });
});

describe("CENSUS_AGE_BANDS", () => {
  it("are Census 2021's five-year bands from 0 to 4 up to 85 and over", () => {
    expect(CENSUS_AGE_BANDS).toHaveLength(18);
    expect(CENSUS_AGE_BANDS[0]).toEqual({ from: 0, to: 4 });
    expect(CENSUS_AGE_BANDS[16]).toEqual({ from: 80, to: 84 });
    expect(CENSUS_AGE_BANDS[17]).toEqual({ from: 85, to: null });
  });

  it("each follow on from the one before", () => {
    CENSUS_AGE_BANDS.slice(1).forEach((band, index) => {
      expect(band.from).toBe((CENSUS_AGE_BANDS[index]?.to ?? NaN) + 1);
    });
  });
});

describe("AGE_GROUP_BANDS", () => {
  it("are each made of whole Census age bands, together covering every age", () => {
    const starts = CENSUS_AGE_BANDS.map(({ from }) => from);
    const ends = CENSUS_AGE_BANDS.map(({ to }) => to);
    let next = 0;
    for (const group of AGE_GROUPS) {
      const { from, to } = AGE_GROUP_BANDS[group];
      expect(from).toBe(next);
      expect(starts).toContain(from);
      expect(ends).toContain(to);
      next = (to ?? Infinity) + 1;
    }
    expect(next).toBe(Infinity);
  });
});

describe("isOutputAreaFeature", () => {
  it("accepts an output area with every figure", () => {
    expect(isOutputAreaFeature(outputArea)).toBe(true);
  });

  it("accepts one with no LSOA, income, decile or median age", () => {
    expect(
      isOutputAreaFeature({
        ...outputArea,
        lsoa: null,
        msoaCode: null,
        medianAge: null,
        householdIncome: null,
        deprivationDecile: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["a decile of 0", { ...outputArea, deprivationDecile: 0 }],
    ["a decile of 11", { ...outputArea, deprivationDecile: 11 }],
    ["part of a resident", { ...outputArea, population: 3.5 }],
    ["more than all of it inside", { ...outputArea, overlap: 1.2 }],
    ["no outline", { ...outputArea, shape: null }],
    ["no distance", { ...outputArea, distanceMetres: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isOutputAreaFeature(value)).toBe(false);
  });
});

describe("isDemographicsStatistics", () => {
  it("accepts the Search Area's estimates", () => {
    expect(isDemographicsStatistics(statistics)).toBe(true);
  });

  it("accepts no income estimate, no decile and no residents", () => {
    expect(
      isDemographicsStatistics({
        ...statistics,
        outputAreas: 0,
        population: 0,
        households: 0,
        medianAge: null,
        householdIncome: null,
        deprivation: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["no population", { ...statistics, population: undefined }],
    [
      "an unknown age group",
      {
        ...statistics,
        ageProfile: [{ group: "teenagers", population: 1, percent: 1 }],
      },
    ],
    [
      "an income with no England median",
      {
        ...statistics,
        householdIncome: { averagePounds: 37800, msoas: 1 },
      },
    ],
    [
      "a deprivation with no range",
      {
        ...statistics,
        deprivation: { atLocation: null, lsoas: 1 },
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isDemographicsStatistics(value)).toBe(false);
  });
});

describe("isDemographicsLayerResponse", () => {
  it("accepts the output areas and the Search Area's estimates", () => {
    expect(isDemographicsLayerResponse(layer)).toBe(true);
    expect(isLayerResponse(layer)).toBe(true);
  });

  it("accepts a Layer not prepared, with no Features or statistics", () => {
    expect(
      isDemographicsLayerResponse({
        ...layer,
        status: "not-prepared",
        sources: [
          { ...layer.sources[0], status: "not-prepared", period: null },
        ],
        features: [],
        statistics: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["another Layer", { ...layer, layer: "property" }],
    ["a Feature of another Layer", { ...layer, features: [{ id: "1" }] }],
    ["statistics with no population", { ...layer, statistics: {} }],
  ])("rejects %s", (_label, value) => {
    expect(isDemographicsLayerResponse(value)).toBe(false);
  });
});
