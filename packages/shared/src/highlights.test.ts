import { describe, expect, it } from "vitest";

import {
  HIGHLIGHT_LEVELS,
  HIGHLIGHT_RULE_IDS,
  isHighlight,
  isHighlightLevel,
  isHighlightRuleId,
  isHighlightsResponse,
} from "./highlights";

const crimeRising = {
  rule: "crime-rising",
  level: "concern",
  text: "Crime up 12.4% year on year",
  layer: "crime",
};
const parkNearby = {
  rule: "park-nearby",
  level: "good",
  text: "A park 104 m away: Sutton Lawn",
  layer: "green-space",
};
const highlights = {
  mode: "general",
  highlights: [crimeRising, parkNearby],
  leftOut: [{ layer: "planning", status: "unavailable" }],
};

describe("Highlights", () => {
  it("are Good, Watch or Concern, most pressing first", () => {
    expect(HIGHLIGHT_LEVELS).toEqual(["concern", "watch", "good"]);
    expect(isHighlightLevel("watch")).toBe(true);
    expect(isHighlightLevel("alert")).toBe(false);
  });

  it("each come from a named rule, listed once", () => {
    expect(new Set(HIGHLIGHT_RULE_IDS).size).toBe(HIGHLIGHT_RULE_IDS.length);
    for (const id of HIGHLIGHT_RULE_IDS)
      expect(isHighlightRuleId(id)).toBe(true);
    expect(isHighlightRuleId("homes-approved-nearby")).toBe(false);
  });

  it("accepts a Highlight from a rule, linked to a served Layer", () => {
    expect(isHighlight(crimeRising)).toBe(true);
    expect(isHighlight(parkNearby)).toBe(true);
    expect(isHighlight({ ...crimeRising, level: "alert" })).toBe(false);
    expect(isHighlight({ ...crimeRising, rule: "ai-says-so" })).toBe(false);
    expect(isHighlight({ ...crimeRising, layer: "weather" })).toBe(false);
    expect(isHighlight({ ...crimeRising, text: "" })).toBe(false);
  });
});

describe("isHighlightsResponse", () => {
  it("accepts a Scout Mode's Highlights and the Layers left out", () => {
    expect(isHighlightsResponse(highlights)).toBe(true);
    expect(
      isHighlightsResponse({ mode: "homebuyer", highlights: [], leftOut: [] }),
    ).toBe(true);
  });

  it.each([
    null,
    {},
    { ...highlights, mode: "Buy to let" },
    { ...highlights, highlights: undefined },
    { ...highlights, highlights: [{ ...crimeRising, text: 12 }] },
    { ...highlights, leftOut: [{ layer: "planning", status: "ok" }] },
  ])("rejects %j", (body) => {
    expect(isHighlightsResponse(body)).toBe(false);
  });
});
