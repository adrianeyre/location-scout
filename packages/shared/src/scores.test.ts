import { describe, expect, it } from "vitest";

import { SERVED_LAYER_IDS } from "./layer";
import {
  CATEGORY_IDS,
  CATEGORY_LAYERS,
  CATEGORY_NAMES,
  isCategoryId,
  isCategoryScore,
  isScorePart,
  isScoresResponse,
} from "./scores";

const stationPart = {
  input: "Distance to the nearest railway station",
  value: 1_604,
  unit: "m",
  rule: "800 m or less: 60 points, falling in proportion to 0 at 5 km.",
  points: 48.6,
};
const transport = {
  id: "transport",
  layer: "transport",
  status: "ok",
  score: 89,
  breakdown: [
    stationPart,
    {
      input: "Bus stops in the Search Area",
      value: 58,
      unit: null,
      rule: "4 points each, up to 10 stops: 40 points.",
      points: 40,
    },
  ],
};
const safety = {
  id: "safety",
  layer: "crime",
  status: "unavailable",
  score: null,
  breakdown: [],
};
const scores = {
  mode: "general",
  categories: [safety, transport],
  location: {
    score: 89,
    counted: [
      { id: "transport", score: 89, weight: 15, share: 100, points: 89 },
    ],
    leftOut: [
      { id: "safety", layer: "crime", status: "unavailable", weight: 25 },
    ],
  },
};

describe("Category Scores", () => {
  it("each have a name and come from served Layers", () => {
    for (const id of CATEGORY_IDS) {
      expect(isCategoryId(id)).toBe(true);
      expect(CATEGORY_NAMES[id]).not.toBe("");
      for (const layer of CATEGORY_LAYERS[id]) {
        expect(SERVED_LAYER_IDS).toContain(layer);
      }
    }
    expect(isCategoryId("weather")).toBe(false);
  });

  it("scores Development activity from the Planning Layer's Planning Applications", () => {
    expect(isCategoryId("development-activity")).toBe(true);
    expect(CATEGORY_NAMES["development-activity"]).toBe("Development activity");
    expect(CATEGORY_LAYERS["development-activity"]).toEqual(["planning"]);
  });

  it("scores Schools from the Schools Layer", () => {
    expect(isCategoryId("schools")).toBe(true);
    expect(CATEGORY_NAMES.schools).toBe("Schools");
    expect(CATEGORY_LAYERS.schools).toEqual(["schools"]);
  });

  it("scores Demand from the Demographics Layer", () => {
    expect(CATEGORY_LAYERS.demand).toEqual(["demographics"]);
    expect(CATEGORY_NAMES.demand).toBe("Demand");
  });

  it("counts competitors among the amenities, and footfall from amenities and transport", () => {
    expect(CATEGORY_LAYERS.competition).toEqual(["amenities"]);
    expect(CATEGORY_LAYERS.footfall).toEqual(["amenities", "transport"]);
    expect(CATEGORY_NAMES.footfall).toBe("Footfall proxy");
  });

  it("accepts a breakdown part whose figure is a number, a yes or no, or none", () => {
    expect(isScorePart(stationPart)).toBe(true);
    expect(isScorePart({ ...stationPart, value: true, unit: null })).toBe(true);
    expect(isScorePart({ ...stationPart, value: null })).toBe(true);
    expect(isScorePart({ ...stationPart, points: -40 })).toBe(true);
    expect(isScorePart({ ...stationPart, value: "1.6 km" })).toBe(false);
    expect(isScorePart({ ...stationPart, points: Number.NaN })).toBe(false);
    expect(isScorePart({ ...stationPart, rule: undefined })).toBe(false);
  });

  it("accepts none while the Planning Applications it needs are queued", () => {
    const queued = {
      id: "development-activity",
      layer: "planning",
      status: "queued",
      score: null,
      breakdown: [],
    };
    expect(isCategoryScore(queued)).toBe(true);
    expect(isCategoryScore({ ...queued, status: "loading" })).toBe(false);
    expect(
      isScoresResponse({
        ...scores,
        categories: [queued],
        location: {
          score: null,
          counted: [],
          leftOut: [{ ...queued, weight: 25 }],
        },
      }),
    ).toBe(true);
  });

  it("accepts a score from 0 to 100, or none when its Layer is unavailable", () => {
    expect(isCategoryScore(transport)).toBe(true);
    expect(isCategoryScore(safety)).toBe(true);
    expect(isCategoryScore({ ...transport, score: 0 })).toBe(true);
    expect(isCategoryScore({ ...transport, score: 101 })).toBe(false);
    expect(isCategoryScore({ ...transport, score: -1 })).toBe(false);
    expect(isCategoryScore({ ...transport, score: 88.5 })).toBe(false);
    expect(isCategoryScore({ ...transport, id: "weather" })).toBe(false);
    expect(isCategoryScore({ ...transport, layer: "weather" })).toBe(false);
  });
});

describe("isScoresResponse", () => {
  it("accepts every Category Score and the Location Score", () => {
    expect(isScoresResponse(scores)).toBe(true);
    expect(
      isScoresResponse({
        mode: "development",
        categories: [safety],
        location: {
          score: null,
          counted: [],
          leftOut: scores.location.leftOut,
        },
      }),
    ).toBe(true);
  });

  it.each([
    null,
    {},
    { ...scores, mode: undefined },
    { ...scores, categories: undefined },
    { ...scores, location: { ...scores.location, score: "89" } },
    { ...scores, location: { ...scores.location, counted: [{ id: "x" }] } },
    {
      ...scores,
      location: {
        ...scores.location,
        leftOut: [{ id: "safety", layer: "crime", status: "ok", weight: 25 }],
      },
    },
  ])("rejects %j", (body) => {
    expect(isScoresResponse(body)).toBe(false);
  });
});
