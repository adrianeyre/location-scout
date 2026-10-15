import { describe, expect, it } from "vitest";

import {
  LAYER_IDS,
  isDataPeriod,
  isLayerId,
  isSourceStatus,
} from "./source-status";

describe("isSourceStatus", () => {
  it.each(["ok", "unavailable", "not-prepared"])("accepts %s", (status) => {
    expect(isSourceStatus(status)).toBe(true);
  });

  it.each(["", "OK", "failed", null])("rejects %j", (status) => {
    expect(isSourceStatus(status)).toBe(false);
  });
});

describe("LAYER_IDS", () => {
  it("names the nine Layers of PRD §6.3", () => {
    expect(LAYER_IDS).toHaveLength(9);
    expect(isLayerId("green-space")).toBe(true);
    expect(isLayerId("businesses")).toBe(false);
  });
});

describe("isDataPeriod", () => {
  it("accepts a from and to", () => {
    expect(isDataPeriod({ from: "2025-08", to: "2026-07" })).toBe(true);
  });

  it.each([null, {}, { from: "2025-08" }, { from: 2025, to: 2026 }])(
    "rejects %j",
    (value) => {
      expect(isDataPeriod(value)).toBe(false);
    },
  );
});
