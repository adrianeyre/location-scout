import { describe, expect, it } from "vitest";

import type { ScoutMode } from "@location-scout/shared";

import {
  allWeights,
  customWeightsFor,
  defaultWeights,
  formatWeights,
  parseWeights,
  rebalance,
  type CustomWeights,
} from "./weights";

/** The General Scout Mode as `/api/modes` gives it. */
const GENERAL: ScoutMode = {
  id: "general",
  name: "General",
  question: "What is it like here?",
  weights: {
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
  },
  competitors: null,
  highlightedLayers: [],
  highlights: [],
};

const total = (weights: CustomWeights) =>
  Object.values(weights).reduce((sum, weight) => sum + weight, 0);

describe("defaultWeights", () => {
  it("gives each category the Scout Mode weighs its share, totalling 100%", () => {
    // PRD FR-4.2's weights for General total 100, so each is its share.
    expect(defaultWeights(GENERAL)).toEqual({
      safety: 25,
      amenities: 15,
      schools: 10,
      transport: 15,
      "green-space": 10,
      "property-activity": 10,
      "development-activity": 5,
      "planning-freedom": 10,
    });
  });

  it("renormalises the weights of a mode that don't total 100 to whole per cents", () => {
    // 25, 15, 10, 15, 10, 10 and 10 of 95: 26.3%, 15.8% twice and 10.5%
    // four times, rounded down to 96, and the four left to those that lost
    // most, the first first.
    expect(
      defaultWeights({
        ...GENERAL,
        weights: { ...GENERAL.weights, "development-activity": 0 },
      }),
    ).toEqual({
      safety: 26,
      amenities: 16,
      schools: 11,
      transport: 16,
      "green-space": 11,
      "property-activity": 10,
      "planning-freedom": 10,
    });
  });

  it("leaves out Competition in a mode with no competitors", () => {
    const weights = defaultWeights({
      ...GENERAL,
      weights: { ...GENERAL.weights, competition: 15 },
    });

    expect(weights.competition).toBeUndefined();
    expect(total(weights)).toBe(100);
  });
});

describe("rebalance", () => {
  const weights = defaultWeights(GENERAL);

  it("sets the slider moved, and shares the rest between the others in proportion, totalling 100%", () => {
    // 60 left over, for 15, 10, 15, 10, 10, 5 and 10 of 75.
    expect(rebalance(weights, "safety", 40)).toEqual({
      safety: 40,
      amenities: 12,
      schools: 8,
      transport: 12,
      "green-space": 8,
      "property-activity": 8,
      "development-activity": 4,
      "planning-freedom": 8,
    });
    // 70 left over, for 25, 15, 10, 15, 10, 10 and 10 of 95: 18.4, 11.1,
    // 7.4, 11.1, 7.4, 7.4 and 7.4, rounded down to 68, and the two left to
    // those that lost most, the first first.
    expect(rebalance(weights, "development-activity", 30)).toEqual({
      safety: 19,
      amenities: 11,
      schools: 8,
      transport: 11,
      "green-space": 7,
      "property-activity": 7,
      "development-activity": 30,
      "planning-freedom": 7,
    });
  });

  it("totals 100% wherever the slider is moved", () => {
    for (const id of Object.keys(weights) as (keyof CustomWeights)[]) {
      for (let value = 0; value <= 100; value += 1) {
        const next = rebalance(weights, id, value);
        expect(total(next)).toBe(100);
        expect(next[id]).toBe(value);
        expect(Object.keys(next)).toEqual(Object.keys(weights));
      }
    }
  });

  it("gives the others nothing when the slider moved takes 100%", () => {
    expect(rebalance(weights, "transport", 100)).toEqual({
      safety: 0,
      amenities: 0,
      schools: 0,
      transport: 100,
      "green-space": 0,
      "property-activity": 0,
      "development-activity": 0,
      "planning-freedom": 0,
    });
  });

  it("shares the rest equally when the others have nothing", () => {
    const all = rebalance(weights, "transport", 100);

    // 50 shared equally by seven: 7.1 each, rounded down to 49, and the one
    // left to the first.
    expect(rebalance(all, "transport", 50)).toEqual({
      safety: 8,
      amenities: 7,
      schools: 7,
      transport: 50,
      "green-space": 7,
      "property-activity": 7,
      "development-activity": 7,
      "planning-freedom": 7,
    });
  });

  it("keeps a weight to a whole per cent from 0 to 100", () => {
    expect(rebalance(weights, "safety", 120).safety).toBe(100);
    expect(rebalance(weights, "safety", -5).safety).toBe(0);
    expect(rebalance(weights, "safety", 33.4).safety).toBe(33);
  });

  it("keeps a lone category at 100%", () => {
    expect(rebalance({ safety: 100 }, "safety", 40)).toEqual({ safety: 100 });
  });
});

describe("customWeightsFor", () => {
  it("is the weights when they name each category the Scout Mode weighs", () => {
    const weights = rebalance(defaultWeights(GENERAL), "safety", 50);

    expect(customWeightsFor(GENERAL, weights)).toBe(weights);
  });

  it("is null for weights another mode's categories, or none", () => {
    expect(
      customWeightsFor(GENERAL, { transport: 60, "property-activity": 40 }),
    ).toBeNull();
    expect(
      customWeightsFor(GENERAL, {
        ...defaultWeights(GENERAL),
        safety: 19,
        footfall: 10,
      }),
    ).toBeNull();
    expect(customWeightsFor(GENERAL, null)).toBeNull();
  });
});

describe("allWeights", () => {
  it("gives every category a weight, 0 for those not given one", () => {
    expect(allWeights({ transport: 60, "property-activity": 40 })).toEqual({
      safety: 0,
      amenities: 0,
      schools: 0,
      transport: 60,
      "green-space": 0,
      "property-activity": 40,
      "development-activity": 0,
      "planning-freedom": 0,
      demand: 0,
      competition: 0,
      footfall: 0,
    });
  });
});

describe("formatWeights and parseWeights", () => {
  it("write each weight in the order of the categories, and read them back", () => {
    const weights = { "property-activity": 40, transport: 60 };

    expect(formatWeights(weights)).toBe("transport:60,property-activity:40");
    expect(parseWeights(formatWeights(weights))).toEqual(weights);
  });

  it("reads nothing from nothing", () => {
    expect(parseWeights(null)).toBeNull();
    expect(parseWeights("")).toBeNull();
  });
});
