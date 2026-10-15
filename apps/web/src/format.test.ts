import { describe, expect, it } from "vitest";

import {
  describeChange,
  formatChange,
  formatCount,
  formatDate,
  formatDistance,
  formatFigure,
  formatKilometres,
  formatList,
  formatMonth,
  formatPeriod,
  formatPoints,
  formatPrice,
  formatShortPrice,
  formatSquareMetres,
} from "./format";

describe("formatMonth", () => {
  it.each([
    ["2026-08", "August 2026"],
    ["2026-01", "January 2026"],
    ["2025-12", "December 2025"],
  ])("writes %s as %s", (month, written) => {
    expect(formatMonth(month)).toBe(written);
  });

  it("leaves something that is not a month as it is", () => {
    expect(formatMonth("latest")).toBe("latest");
  });
});

describe("formatDate", () => {
  it.each([
    ["2026-05-29", "29 May 2026"],
    ["2025-10-09", "9 October 2025"],
  ])("writes %s as %s", (date, written) => {
    expect(formatDate(date)).toBe(written);
  });

  it("leaves something that is not a day as it is", () => {
    expect(formatDate("recently")).toBe("recently");
  });
});

describe("formatPrice", () => {
  it.each([
    [173000, "£173,000"],
    [1250000, "£1,250,000"],
    [950, "£950"],
  ])("writes %d as %s", (pounds, written) => {
    expect(formatPrice(pounds)).toBe(written);
  });
});

describe("formatShortPrice", () => {
  it.each([
    [173000, "£173k"],
    [95500, "£95.5k"],
    [182499, "£182k"],
    [999400, "£999k"],
    [999600, "£1m"],
    [1250000, "£1.25m"],
    [950, "£950"],
  ])("writes %d as %s", (pounds, written) => {
    expect(formatShortPrice(pounds)).toBe(written);
  });
});

describe("formatKilometres", () => {
  it.each([
    [0, "0.0 km"],
    [40, "0.0 km"],
    [2923, "2.9 km"],
    [9094, "9.1 km"],
    [12_345, "12.3 km"],
  ])("writes %d m as %s", (metres, written) => {
    expect(formatKilometres(metres)).toBe(written);
  });
});

describe("formatSquareMetres", () => {
  it.each([
    [92, "92 m²"],
    [84.5, "84.5 m²"],
    [1_234.56, "1,234.6 m²"],
  ])("writes %s as %s", (squareMetres, written) => {
    expect(formatSquareMetres(squareMetres)).toBe(written);
  });
});

describe("formatDistance", () => {
  it.each([
    [0, "0 m"],
    [4, "0 m"],
    [604, "600 m"],
    [605, "610 m"],
    [994, "990 m"],
    [995, "1.0 km"],
    [1609.344, "1.6 km"],
  ])("writes %s metres as %s", (metres, written) => {
    expect(formatDistance(metres)).toBe(written);
  });
});

describe("formatCount", () => {
  const crimes = ["crime", "crimes"] as const;

  it.each([
    [0, "0 crimes"],
    [1, "1 crime"],
    [185, "185 crimes"],
    [1234, "1,234 crimes"],
  ])("writes %s as %s", (count, written) => {
    expect(formatCount(count, crimes)).toBe(written);
  });
});

describe("formatPeriod", () => {
  it("writes a period of months from one to the other", () => {
    expect(formatPeriod({ from: "2025-09", to: "2026-08" })).toBe(
      "September 2025 to August 2026",
    );
  });
});

describe("formatList", () => {
  it.each([
    [["March 2025"], "March 2025"],
    [["March 2025", "May 2025"], "March 2025 and May 2025"],
    [["March", "May", "June"], "March, May and June"],
  ])("writes %j as %s", (items, written) => {
    expect(formatList(items)).toBe(written);
  });
});

describe("formatChange", () => {
  it.each([
    [5.9, "+5.9%"],
    [23, "+23%"],
    [-16.9, "-16.9%"],
    [-100, "-100%"],
    [0, "0%"],
    [1234.5, "+1,234.5%"],
  ])("writes %s as %s", (percent, written) => {
    expect(formatChange(percent)).toBe(written);
  });
});

describe("describeChange", () => {
  it.each([
    [5.9, "up 5.9%"],
    [-16.9, "down 16.9%"],
    [0, "no change"],
  ])("writes %s as %s", (percent, written) => {
    expect(describeChange(percent)).toBe(written);
  });
});

describe("formatFigure", () => {
  it.each([
    [1_628, "m", "1.6 km"],
    [104, "m", "100 m"],
    [5.9, "%", "+5.9%"],
    [-18.2, "%", "-18.2%"],
    [995, "per km²", "995 per km²"],
    [1_234.56, "per km²", "1,234.6 per km²"],
    [13, "of 13", "13 of 13"],
    [67.9, "% share", "67.9% share"],
    [58, null, "58"],
    [true, null, "Yes"],
    [false, null, "No"],
    [null, "m", "–"],
    [null, null, "–"],
  ] as const)("writes %j %j as %j", (value, unit, written) => {
    expect(formatFigure(value, unit)).toBe(written);
  });
});

describe("formatPoints", () => {
  it.each([
    [48.2, "48.2"],
    [100, "100"],
    [0, "0"],
    [-20, "−20"],
    [-0.5, "−0.5"],
  ])("writes %d as %j", (points, written) => {
    expect(formatPoints(points)).toBe(written);
  });
});
