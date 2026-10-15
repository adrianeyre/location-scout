import { describe, expect, it } from "vitest";

import { isModesResponse, isScoutMode } from "./modes";

const weights = {
  safety: 15,
  amenities: 10,
  schools: 10,
  transport: 25,
  "green-space": 5,
  "property-activity": 25,
  "development-activity": 5,
  "planning-freedom": 5,
  demand: 0,
  competition: 0,
  footfall: 0,
};
const buyToLet = {
  id: "buy-to-let",
  name: "Buy-to-let",
  question: "Should I buy a home here to let?",
  weights,
  competitors: null,
  highlightedLayers: [],
  highlights: ["crime-rate-high", "prices-rising"],
};
const general = {
  ...buyToLet,
  id: "general",
  name: "General",
  highlightedLayers: ["planning", "property", "land"],
};
const cafe = {
  ...buyToLet,
  id: "business-cafe",
  name: "Business: Café",
  question: "Could I open a café here?",
  weights: { ...weights, demand: 20, competition: 25, footfall: 20 },
  competitors: {
    name: "cafés",
    tags: [{ key: "amenity", values: ["cafe"] }],
  },
  highlightedLayers: ["amenities"],
};

describe("isScoutMode", () => {
  it("accepts a mode's weights, highlighted Layers and Highlight rules", () => {
    expect(isScoutMode(buyToLet)).toBe(true);
    expect(isScoutMode(general)).toBe(true);
    expect(isScoutMode(cafe)).toBe(true);
    expect(
      isScoutMode({
        ...cafe,
        competitors: { name: "shops", tags: [{ key: "shop", values: null }] },
      }),
    ).toBe(true);
    expect(
      isScoutMode({ ...buyToLet, weights: { ...weights, safety: 0 } }),
    ).toBe(true);
  });

  it.each([
    null,
    {},
    { ...buyToLet, id: "Buy to let" },
    { ...buyToLet, name: "" },
    { ...buyToLet, question: undefined },
    { ...buyToLet, weights: { ...weights, safety: -5 } },
    { ...buyToLet, weights: { ...weights, safety: undefined } },
    { ...buyToLet, weights: { ...weights, schools: undefined } },
    { ...buyToLet, weights: { ...weights, "development-activity": undefined } },
    { ...buyToLet, weights: { ...weights, demand: undefined } },
    { ...buyToLet, competitors: undefined },
    { ...cafe, competitors: { name: "", tags: cafe.competitors.tags } },
    { ...cafe, competitors: { name: "cafés", tags: [] } },
    { ...cafe, competitors: { name: "cafés", tags: [{ key: "amenity" }] } },
    {
      ...cafe,
      competitors: { name: "cafés", tags: [{ key: "amenity", values: [] }] },
    },
    { ...buyToLet, highlightedLayers: ["businesses"] },
    // Each once, in the order of LAYER_IDS.
    { ...buyToLet, highlightedLayers: ["property", "planning"] },
    { ...buyToLet, highlightedLayers: ["planning", "planning"] },
    { ...buyToLet, highlights: ["ai-says-so"] },
    { ...buyToLet, highlights: ["prices-rising", "crime-rate-high"] },
  ])("rejects %j", (mode) => {
    expect(isScoutMode(mode)).toBe(false);
  });
});

describe("isModesResponse", () => {
  it("accepts the Scout Modes, General among them", () => {
    expect(isModesResponse({ modes: [general, buyToLet, cafe] })).toBe(true);
  });

  it.each([
    null,
    {},
    { modes: [buyToLet] },
    { modes: [general, general] },
    { modes: [general, { ...buyToLet, weights: null }] },
  ])("rejects %j", (body) => {
    expect(isModesResponse(body)).toBe(false);
  });
});
