import { describe, expect, it } from "vitest";

import { checkNumbers, numbersIn } from "./number-check";

const INPUT = JSON.stringify({
  safety: { score: 0, value: 223.6, unit: "per 1,000 residents" },
  rule: "From 2,024 crimes in the last 12 months for the Search Area's estimated 9,052 residents.",
  change: 5.9,
  inspireCoverage: 0.727,
  medianPrice: 182000,
  period: { from: "2025-10-09", to: "2026-10-08" },
});

describe("numbersIn", () => {
  it("finds each number as written, with commas between thousands, decimals and a date's parts", () => {
    expect(
      numbersIn(
        "2,024 crimes, 223.6 per 1,000 residents, £182,000, up 5.9% since 2025-10-09; 1, 2 and 3.",
      ),
    ).toEqual([
      "2,024",
      "223.6",
      "1,000",
      "182,000",
      "5.9",
      "2025",
      "10",
      "09",
      "1",
      "2",
      "3",
    ]);
  });

  it("finds none in text without digits", () => {
    expect(numbersIn("Crime is high and rising.")).toEqual([]);
  });
});

describe("checkNumbers", () => {
  it("passes an answer whose every number is in its input, however its thousands are written", () => {
    expect(
      checkNumbers(
        "Safety scores 0: 2,024 crimes in the last 12 months for 9052 residents is 223.6 per 1,000, up 5.9%. The median price is £182,000.",
        INPUT,
      ),
    ).toEqual({ ok: true, unverified: [] });
  });

  it("passes a figure rounded to the places the answer gives it, and a share as a percentage", () => {
    expect(
      checkNumbers(
        "About 224 crimes per 1,000 residents, up 6%; 72.7% of it, or 73%, is registered.",
        INPUT,
      ),
    ).toEqual({ ok: true, unverified: [] });
  });

  it("passes the parts of a date in its input", () => {
    expect(checkNumbers("Sales from 9 October 2025.", INPUT).ok).toBe(true);
  });

  it("fails an answer with a number its input doesn't have, naming each once", () => {
    expect(
      checkNumbers(
        "The national average is 80 crimes per 1,000; 80 is far lower, and prices rose 14.2%.",
        INPUT,
      ),
    ).toEqual({ ok: false, unverified: ["80", "14.2"] });
  });

  it("fails a figure worked out from the input rather than given in it", () => {
    // 2,024 crimes less the year before's 1,912 isn't a figure it was given.
    expect(checkNumbers("That is 112 more crimes than before.", INPUT)).toEqual(
      { ok: false, unverified: ["112"] },
    );
  });

  it("fails a figure rounded further than the answer says", () => {
    // 223.6 rounded to one decimal place is itself, not 223.0.
    expect(checkNumbers("223.0 per 1,000 residents", INPUT).ok).toBe(false);
  });

  it("passes an answer with no numbers at all", () => {
    expect(checkNumbers("Crime is high here.", INPUT)).toEqual({
      ok: true,
      unverified: [],
    });
  });
});
