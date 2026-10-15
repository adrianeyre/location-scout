import { describe, expect, it } from "vitest";

import { parsePostcode } from "./postcode";

describe("parsePostcode", () => {
  it.each([
    ["NG17 1AA", "NG171AA"],
    ["ng17 1aa", "NG171AA"],
    ["  NG171AA ", "NG171AA"],
    ["SW1A 1AA", "SW1A1AA"],
    ["M1 1AE", "M11AE"],
    ["B33 8TH", "B338TH"],
  ])("reads %j as %s", (input, expected) => {
    expect(parsePostcode(input)).toBe(expected);
  });

  it.each(["", "NG17", "NG17 1A", "10 Downing Street", "NG17 1AAA"])(
    "rejects %j",
    (input) => {
      expect(parsePostcode(input)).toBeNull();
    },
  );
});
