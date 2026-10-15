import { describe, expect, it } from "vitest";

import { isCrimeLayerResponse, isCrimeTrend, isMonth } from "./crime";
import { SERVED_LAYER_IDS, isLayerResponse, isServedLayerId } from "./layer";
import { LAYER_IDS } from "./source-status";

const crime = {
  id: "131490811",
  location: { lat: 53.123459, lng: -1.264546 },
  distanceMetres: 37.8,
  category: "violent-crime",
  categoryName: "Violence and sexual offences",
  month: "2026-08",
  street: "On or near Market Place",
};

const trend = {
  last12Months: { from: "2025-09", to: "2026-08" },
  previous12Months: { from: "2024-09", to: "2025-08" },
  complete: true,
  missingMonths: [],
  total: { last12Months: 12, previous12Months: 10, change: 20 },
  byCategory: [
    {
      category: "violent-crime",
      name: "Violence and sexual offences",
      last12Months: 12,
      previous12Months: 10,
      change: 20,
    },
  ],
};

const statistics = {
  month: "2026-08",
  total: 1,
  byCategory: [
    {
      category: "violent-crime",
      name: "Violence and sexual offences",
      count: 1,
    },
  ],
  trend,
};

const police = {
  id: "police",
  name: "data.police.uk",
  status: "ok",
  period: { from: "2026-08", to: "2026-08" },
};

const layer = {
  layer: "crime",
  status: "ok",
  sources: [police],
  features: [crime],
  statistics,
};

describe("isMonth", () => {
  it.each(["2026-08", "2010-12"])("accepts %s", (month) => {
    expect(isMonth(month)).toBe(true);
  });

  it.each(["2026-13", "2026-8", "2026-08-01", "August", 202608, null])(
    "rejects %j",
    (month) => {
      expect(isMonth(month)).toBe(false);
    },
  );
});

describe("isCrimeLayerResponse", () => {
  it("accepts crimes and their count by category", () => {
    expect(isCrimeLayerResponse(layer)).toBe(true);
  });

  it("accepts a month with no crimes", () => {
    expect(
      isCrimeLayerResponse({
        ...layer,
        features: [],
        statistics: { ...statistics, total: 0, byCategory: [] },
      }),
    ).toBe(true);
  });

  it("accepts a crime the police place on no named street", () => {
    expect(
      isCrimeLayerResponse({
        ...layer,
        features: [{ ...crime, street: null }],
      }),
    ).toBe(true);
  });

  it("accepts an unavailable Layer, with no Features or statistics", () => {
    expect(
      isCrimeLayerResponse({
        layer: "crime",
        status: "unavailable",
        sources: [{ ...police, status: "unavailable", period: null }],
        features: [],
        statistics: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["another Layer", { ...layer, layer: "planning" }],
    ["a status that is not offered", { ...layer, status: "loading" }],
    ["missing sources", { ...layer, sources: undefined }],
    ["missing statistics", { ...layer, statistics: undefined }],
    [
      "a crime without a Location",
      { ...layer, features: [{ ...crime, location: null }] },
    ],
    [
      "a crime without a distance",
      { ...layer, features: [{ ...crime, distanceMetres: undefined }] },
    ],
    [
      "a negative distance",
      { ...layer, features: [{ ...crime, distanceMetres: -1 }] },
    ],
    ["a numeric id", { ...layer, features: [{ ...crime, id: 131490811 }] }],
    [
      "a crime without a month",
      { ...layer, features: [{ ...crime, month: "" }] },
    ],
    [
      "a crime without a category name",
      { ...layer, features: [{ ...crime, categoryName: undefined }] },
    ],
    [
      "a malformed statistics month",
      { ...layer, statistics: { ...statistics, month: "Aug" } },
    ],
    [
      "a count that is not a whole number",
      { ...layer, statistics: { ...statistics, total: 1.5 } },
    ],
    [
      "a category count without a name",
      {
        ...layer,
        statistics: {
          ...statistics,
          byCategory: [{ category: "drugs", count: 1 }],
        },
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isCrimeLayerResponse(value)).toBe(false);
  });
});

describe("isCrimeTrend", () => {
  it("accepts a complete trend", () => {
    expect(isCrimeTrend(trend)).toBe(true);
  });

  it("accepts an incomplete trend, with the months missing and no changes", () => {
    expect(
      isCrimeTrend({
        ...trend,
        complete: false,
        missingMonths: ["2025-01", "2026-07"],
        total: { last12Months: 11, previous12Months: 9, change: null },
        byCategory: [{ ...trend.byCategory[0], change: null }],
      }),
    ).toBe(true);
  });

  it("accepts a category with no crimes in the previous 12 months, and so no change", () => {
    expect(
      isCrimeTrend({
        ...trend,
        byCategory: [
          { ...trend.byCategory[0], previous12Months: 0, change: null },
        ],
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["no periods", { ...trend, last12Months: undefined }],
    ["no completeness", { ...trend, complete: undefined }],
    ["a missing month that isn't one", { ...trend, missingMonths: ["July"] }],
    [
      "a change that isn't a number",
      { ...trend, total: { ...trend.total, change: "+20%" } },
    ],
    [
      "a change that isn't finite",
      { ...trend, total: { ...trend.total, change: Infinity } },
    ],
    [
      "a count that is not a whole number",
      { ...trend, total: { ...trend.total, last12Months: 1.5 } },
    ],
    [
      "a category without a name",
      {
        ...trend,
        byCategory: [{ ...trend.byCategory[0], name: undefined }],
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isCrimeTrend(value)).toBe(false);
  });

  it("is required by the Crime Layer's statistics", () => {
    expect(
      isCrimeLayerResponse({
        ...layer,
        statistics: { ...statistics, trend: undefined },
      }),
    ).toBe(false);
  });
});

describe("served Layers", () => {
  it("are every Layer: Crime, Planning, Amenities, Schools, Transport, Green space, Property, Land and Demographics", () => {
    expect(SERVED_LAYER_IDS).toEqual([
      "crime",
      "planning",
      "amenities",
      "schools",
      "transport",
      "green-space",
      "property",
      "land",
      "demographics",
    ]);
    expect(SERVED_LAYER_IDS).toEqual(LAYER_IDS);
    expect(isServedLayerId("crime")).toBe(true);
    expect(isServedLayerId("planning")).toBe(true);
    expect(isServedLayerId("amenities")).toBe(true);
    expect(isServedLayerId("schools")).toBe(true);
    expect(isServedLayerId("transport")).toBe(true);
    expect(isServedLayerId("green-space")).toBe(true);
    expect(isServedLayerId("property")).toBe(true);
    expect(isServedLayerId("land")).toBe(true);
    expect(isServedLayerId("demographics")).toBe(true);
    expect(isServedLayerId("weather")).toBe(false);
  });

  it("each have a response the guard accepts", () => {
    expect(isLayerResponse(layer)).toBe(true);
    expect(isLayerResponse({ ...layer, layer: "weather" })).toBe(false);
  });
});
