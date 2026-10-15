import { describe, expect, it } from "vitest";

import { isStreetViewResponse } from "./street-view";

describe("isStreetViewResponse", () => {
  it.each([
    ["Street View off", { enabled: false }],
    ["Street View on, with its key", { enabled: true, apiKey: "AIzaSyTest" }],
  ])("accepts %s", (_label, value) => {
    expect(isStreetViewResponse(value)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "enabled"],
    ["an empty object", {}],
    ["on without a key", { enabled: true }],
    ["on with an empty key", { enabled: true, apiKey: "" }],
    ["on with a key that isn't a string", { enabled: true, apiKey: 42 }],
    ["off with a key", { enabled: false, apiKey: "AIzaSyTest" }],
    ["enabled that isn't a boolean", { enabled: "true", apiKey: "AIza" }],
  ])("rejects %s", (_label, value) => {
    expect(isStreetViewResponse(value)).toBe(false);
  });
});
