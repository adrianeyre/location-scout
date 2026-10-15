import { describe, expect, it } from "vitest";

import { DEFAULT_SCOUT_MODE, isScoutModeId } from "./scout-modes";

describe("Scout Mode ids", () => {
  it("are lower-case words joined by hyphens, General by default", () => {
    expect(DEFAULT_SCOUT_MODE).toBe("general");
    for (const id of ["general", "buy-to-let", "business-cafe", "mode-2"]) {
      expect(isScoutModeId(id), id).toBe(true);
    }
    for (const id of ["", "General", "buy to let", "-cafe", "cafe-", 12]) {
      expect(isScoutModeId(id), String(id)).toBe(false);
    }
  });
});
