import { describe, expect, it } from "vitest";

import { locationScore, weighedCategories } from "./location-score";
import {
  CATEGORY_IDS,
  CATEGORY_LAYERS,
  type CategoryId,
  type CategoryScore,
} from "./scores";
import type { SourceStatus } from "./source-status";

/** The General Scout Mode's weights. */
const GENERAL: Record<CategoryId, number> = {
  safety: 25,
  amenities: 15,
  schools: 10,
  transport: 15,
  "green-space": 10,
  "property-activity": 10,
  "development-activity": 5,
  "planning-freedom": 10,
  demand: 0,
  competition: 0,
  footfall: 0,
};

/** Every category with `scores`, and any missing from it in `status`. */
const categories = (
  scores: Partial<Record<CategoryId, number>>,
  status: Exclude<SourceStatus, "ok"> = "unavailable",
): CategoryScore[] =>
  CATEGORY_IDS.map((id) => {
    const score = scores[id];
    const [layer] = CATEGORY_LAYERS[id];
    return score === undefined
      ? { id, layer, status, score: null, breakdown: [] }
      : { id, layer, status: "ok", score, breakdown: [] };
  });

describe("locationScore", () => {
  it("is the mean of the Category Scores, weighted by the General Scout Mode", () => {
    const location = locationScore(
      categories({
        safety: 0,
        amenities: 100,
        schools: 70,
        transport: 88,
        "green-space": 100,
        "property-activity": 24,
        "development-activity": 100,
        "planning-freedom": 80,
      }),
      GENERAL,
    );

    // (0×25 + 100×15 + 70×10 + 88×15 + 100×10 + 24×10 + 100×5 + 80×10) ÷ 100
    // = 60.6
    expect(location).toEqual({
      score: 61,
      counted: [
        { id: "safety", score: 0, weight: 25, share: 25, points: 0 },
        { id: "amenities", score: 100, weight: 15, share: 15, points: 15 },
        { id: "schools", score: 70, weight: 10, share: 10, points: 7 },
        { id: "transport", score: 88, weight: 15, share: 15, points: 13.2 },
        { id: "green-space", score: 100, weight: 10, share: 10, points: 10 },
        {
          id: "property-activity",
          score: 24,
          weight: 10,
          share: 10,
          points: 2.4,
        },
        {
          id: "development-activity",
          score: 100,
          weight: 5,
          share: 5,
          points: 5,
        },
        {
          id: "planning-freedom",
          score: 80,
          weight: 10,
          share: 10,
          points: 8,
        },
      ],
      leftOut: [],
    });
  });

  it("is 100 when every Category Score is, and 0 when every one is 0", () => {
    const every = (score: number) =>
      Object.fromEntries(CATEGORY_IDS.map((id) => [id, score]));

    expect(locationScore(categories(every(100)), GENERAL).score).toBe(100);
    expect(locationScore(categories(every(0)), GENERAL).score).toBe(0);
  });

  it("leaves out a category whose Layer is unavailable, says so, and renormalises the rest", () => {
    const location = locationScore(
      categories({
        amenities: 13,
        transport: 80,
        "green-space": 91,
        "property-activity": 1,
      }),
      GENERAL,
    );

    // (13×15 + 80×15 + 91×10 + 1×10) ÷ 50 = 46.3
    expect(location.score).toBe(46);
    expect(location.counted.map(({ id, share }) => [id, share])).toEqual([
      ["amenities", 30],
      ["transport", 30],
      ["green-space", 20],
      ["property-activity", 20],
    ]);
    expect(location.leftOut).toEqual([
      { id: "safety", layer: "crime", status: "unavailable", weight: 25 },
      { id: "schools", layer: "schools", status: "unavailable", weight: 10 },
      {
        id: "development-activity",
        layer: "planning",
        status: "unavailable",
        weight: 5,
      },
      {
        id: "planning-freedom",
        layer: "planning",
        status: "unavailable",
        weight: 10,
      },
    ]);
  });

  it("renormalises the weights of the categories counted to add up to 100%", () => {
    const sixty = locationScore(
      categories({ safety: 60, amenities: 60 }),
      GENERAL,
    );

    expect(sixty.score).toBe(60);
    expect(sixty.counted.map(({ share }) => share)).toEqual([62.5, 37.5]);
  });

  it("says a not-prepared Layer's category was left out as not prepared", () => {
    const location = locationScore(
      categories({ amenities: 50 }, "not-prepared"),
      GENERAL,
    );

    expect(location.leftOut[0]).toEqual({
      id: "safety",
      layer: "crime",
      status: "not-prepared",
      weight: 25,
    });
  });

  it("is null, listing every category it weighs as left out, when none is available", () => {
    const location = locationScore(categories({}), GENERAL);

    expect(location.score).toBeNull();
    expect(location.counted).toEqual([]);
    // General gives Competition and Footfall proxy no weight.
    expect(location.leftOut.map(({ id }) => id)).toEqual(
      CATEGORY_IDS.filter((id) => GENERAL[id] > 0),
    );
    expect(location.leftOut).toHaveLength(8);
  });

  it("counts nothing for a category the Scout Mode gives no weight", () => {
    const location = locationScore(categories({ safety: 0, amenities: 100 }), {
      ...GENERAL,
      safety: 0,
      transport: 0,
    });

    expect(location.score).toBe(100);
    expect(location.counted.map(({ id }) => id)).toEqual(["amenities"]);
    expect(location.leftOut.map(({ id }) => id)).not.toContain("transport");
  });
});

describe("weighedCategories", () => {
  it("is the categories a Scout Mode gives a weight, in the order of CATEGORY_IDS", () => {
    expect(
      weighedCategories({
        weights: { ...GENERAL, safety: 0, footfall: 20 },
        competitors: null,
      }),
    ).toEqual([
      "amenities",
      "schools",
      "transport",
      "green-space",
      "property-activity",
      "development-activity",
      "planning-freedom",
      "footfall",
    ]);
  });

  it("weighs Competition only in a mode with competitors", () => {
    const weights = { ...GENERAL, competition: 25 };
    const cafes = {
      name: "cafés",
      tags: [{ key: "amenity", values: ["cafe"] }],
    };

    expect(weighedCategories({ weights, competitors: null })).not.toContain(
      "competition",
    );
    expect(weighedCategories({ weights, competitors: cafes })).toContain(
      "competition",
    );
  });
});
