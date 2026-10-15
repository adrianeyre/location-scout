import { describe, expect, it } from "vitest";

import {
  dashboardOrder,
  highlightCounts,
  median,
  niceTicks,
  salesByPeriod,
  share,
} from "./dashboard-data";

describe("median", () => {
  it("is the middle value, or the mean of the middle two", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("is null with nothing to take it of", () => {
    expect(median([])).toBeNull();
  });
});

describe("salesByPeriod", () => {
  it("counts each quarter's sales and gives its median price, oldest first, while they span 3 years or fewer", () => {
    expect(
      salesByPeriod([
        { date: "2026-03-01", price: 200_000 },
        { date: "2025-11-30", price: 150_000 },
        { date: "2026-02-15", price: 100_000 },
        { date: "2025-10-02", price: 170_000 },
        { date: "2026-01-31", price: 400_000 },
      ]),
    ).toEqual([
      { at: 2025.75, label: "Q4 2025", count: 2, median: 160_000 },
      { at: 2026, label: "Q1 2026", count: 3, median: 200_000 },
    ]);
  });

  it("counts by calendar year once they span more", () => {
    expect(
      salesByPeriod([
        { date: "2021-03-01", price: 100_000 },
        { date: "2021-11-30", price: 120_000 },
        { date: "2025-06-15", price: 200_000 },
      ]),
    ).toEqual([
      { at: 2021, label: "2021", count: 2, median: 110_000 },
      { at: 2025, label: "2025", count: 1, median: 200_000 },
    ]);
  });

  it("gives nothing without sales", () => {
    expect(salesByPeriod([])).toEqual([]);
  });
});

describe("niceTicks", () => {
  it("marks round steps from 0 to at least the largest value", () => {
    expect(niceTicks(182_000)).toEqual([0, 50_000, 100_000, 150_000, 200_000]);
    expect(niceTicks(9)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100]);
  });

  it("still gives an axis when every value is 0", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe("share", () => {
  it("is a per cent of the largest, kept from 0 to 100", () => {
    expect(share(25, 50)).toBe(50);
    expect(share(80, 40)).toBe(100);
    expect(share(-1, 40)).toBe(0);
    expect(share(3, 0)).toBe(0);
  });
});

describe("highlightCounts", () => {
  it("counts the Highlights at each level", () => {
    expect(
      highlightCounts([
        { rule: "crime-falling", level: "good", text: "", layer: "crime" },
        { rule: "crime-rate-high", level: "concern", text: "", layer: "crime" },
        { rule: "crime-rate-low", level: "good", text: "", layer: "crime" },
      ]),
    ).toEqual({ concern: 1, watch: 0, good: 2 });
  });
});

describe("dashboardOrder", () => {
  it("puts the Layers a Scout Mode highlights first, the rest in their order", () => {
    expect(
      dashboardOrder(
        ["crime", "planning", "amenities", "property", "land"],
        ["land", "planning"],
      ),
    ).toEqual(["planning", "land", "crime", "amenities", "property"]);
  });
});
