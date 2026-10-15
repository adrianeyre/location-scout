import { describe, expect, it } from "vitest";

import { isOutOfDate, monthsAfter } from "./coverage";

describe("monthsAfter", () => {
  it.each([
    ["2026-10-04", 2, "2026-12-04"],
    ["2026-11-01", 2, "2027-01-01"],
    ["2026-12-31", 2, "2027-02-28"],
    ["2027-12-31", 2, "2028-02-29"],
    ["2026-05", 2, "2026-07-01"],
  ])("puts %s plus %i months on %s", (date, months, after) => {
    expect(monthsAfter(date, months)).toBe(after);
  });
});

describe("isOutOfDate", () => {
  const inspire = { id: "inspire-index-polygons", sourceDate: "2026-10-04" };
  const boundary = { id: "council-boundary", sourceDate: "2026-05" };

  it.each([
    ["2026-10-08", false],
    ["2026-12-04", false],
    ["2026-12-05", true],
  ])(
    "on %s, says INSPIRE Index Polygons published on 4 October 2026 are more than 2 months old: %s",
    (today, outOfDate) => {
      expect(isOutOfDate([boundary, inspire], today)).toBe(outOfDate);
    },
  );

  it("says a Land Coverage Area prepared before its INSPIRE Index Polygons were is out of date", () => {
    expect(isOutOfDate([boundary], "2026-10-08")).toBe(true);
  });
});
