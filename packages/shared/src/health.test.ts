import { describe, expect, it } from "vitest";

import { isHealthResponse } from "./health";

describe("isHealthResponse", () => {
  it("accepts the health body the API sends", () => {
    expect(
      isHealthResponse({ status: "ok", service: "location-scout-api" }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "ok"],
    ["an empty object", {}],
    ["another status", { status: "down", service: "location-scout-api" }],
    ["another service", { status: "ok", service: "something-else" }],
  ])("rejects %s", (_label, value) => {
    expect(isHealthResponse(value)).toBe(false);
  });
});
