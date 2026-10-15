import { describe, expect, it } from "vitest";

import {
  normaliseName,
  normalisePostcode,
  parseTitleAddress,
} from "./title-addresses";

/** The streets and places of a corner of Ashfield, as OpenStreetMap names them, normalised. */
const known = {
  streets: new Set(
    [
      "High Street",
      "Portland Road",
      "Watnall Road",
      "Diamond Avenue",
      "Station Road",
      "Lowmoor Road",
      "St Mary's Way",
    ].map(normaliseName),
  ),
  places: new Set(
    ["Sutton-in-Ashfield", "Kirkby in Ashfield", "Hucknall", "Nottingham"].map(
      normaliseName,
    ),
  ),
};

describe("normalisePostcode", () => {
  it.each([
    ["ng171aa", "NG17 1AA"],
    [" NG17  1AA ", "NG17 1AA"],
    ["NG15 7SB", "NG15 7SB"],
    ["W1A 0AX", "W1A 0AX"],
  ])("writes %j as %j", (text, postcode) => {
    expect(normalisePostcode(text)).toBe(postcode);
  });

  it.each([[""], [null], ["NG17"], ["not a postcode"]])(
    "is null for %j",
    (text) => {
      expect(normalisePostcode(text)).toBeNull();
    },
  );
});

describe("normaliseName", () => {
  it("writes a name in capitals, words only, short street types in full", () => {
    expect(normaliseName("Sutton-in-Ashfield")).toBe("SUTTON IN ASHFIELD");
    expect(normaliseName("12 High St.")).toBe("12 HIGH STREET");
    expect(normaliseName("Portland Rd")).toBe("PORTLAND ROAD");
    expect(normaliseName("Lime Tree Ave")).toBe("LIME TREE AVENUE");
  });

  it("keeps a saint's St, and drops apostrophes", () => {
    expect(normaliseName("St Mary’s Way")).toBe("ST MARYS WAY");
    expect(normaliseName("St. Mary's Way")).toBe("ST MARYS WAY");
  });
});

describe("parseTitleAddress", () => {
  it("reads a postal address and the postcode in brackets after it", () => {
    expect(
      parseTitleAddress(
        "12 High Street, Sutton-in-Ashfield (NG17 1AA)",
        null,
        known,
      ),
    ).toEqual({
      postcode: "NG17 1AA",
      street: "HIGH STREET",
      numbers: ["12"],
      name: null,
      land: false,
      beside: false,
      side: null,
      kind: "address",
    });
  });

  it("prefers the Postcode column to a postcode in the address", () => {
    expect(
      parseTitleAddress("12 High Street (NG17 1AA)", "NG17 1AB", known)
        .postcode,
    ).toBe("NG17 1AB");
  });

  it("reads every number in a short range, and the two ends of a long one", () => {
    expect(parseTitleAddress("12-16 High Street", null, known).numbers).toEqual(
      ["12", "13", "14", "15", "16"],
    );
    expect(
      parseTitleAddress("34 to 80 Watnall Road", null, known).numbers,
    ).toEqual(["34", "80"]);
    expect(parseTitleAddress("12a High St", null, known).numbers).toEqual([
      "12A",
    ]);
    expect(
      parseTitleAddress("12 and 14 High Street", null, known).numbers,
    ).toEqual(["12", "14"]);
  });

  it("reads a unit and a number given before the street's own part", () => {
    expect(
      parseTitleAddress("Unit 3, 12, Lowmoor Road, Kirkby in Ashfield", null, {
        ...known,
      }),
    ).toMatchObject({
      street: "LOWMOOR ROAD",
      numbers: ["12"],
      kind: "address",
    });
  });

  it("reads a building's name, with the street it is on", () => {
    expect(
      parseTitleAddress(
        "Byron Business Centre, Watnall Road, Hucknall",
        "NG15 7HP",
        known,
      ),
    ).toMatchObject({
      name: "BYRON BUSINESS CENTRE",
      street: "WATNALL ROAD",
      numbers: [],
      kind: "named",
    });
  });

  it("reads a description of land beside a street, and its side", () => {
    expect(
      parseTitleAddress(
        "Land lying to the south of Station Road, Sutton-in-Ashfield",
        null,
        known,
      ),
    ).toMatchObject({
      street: "STATION ROAD",
      land: true,
      beside: true,
      side: "SOUTH",
      kind: "land",
    });
    expect(
      parseTitleAddress(
        "land on the north side of Diamond Avenue",
        null,
        known,
      ),
    ).toMatchObject({ side: "NORTH", kind: "land" });
  });

  it("doesn't put land adjoining a house at the house's number", () => {
    expect(
      parseTitleAddress("Land adjoining 12 High Street", null, known),
    ).toMatchObject({
      street: "HIGH STREET",
      beside: true,
      kind: "land",
    });
  });

  it("puts land at a number at that number", () => {
    expect(
      parseTitleAddress("153 Portland Road, Hucknall, Land", null, known),
    ).toMatchObject({ numbers: ["153"], land: true, kind: "address" });
  });

  it("finds a street inside a site's name, and the land words around it", () => {
    expect(
      parseTitleAddress(
        "Diamond Avenue Allotment, Kirkby in Ashfield",
        null,
        known,
      ),
    ).toMatchObject({ street: "DIAMOND AVENUE", name: null, kind: "land" });
  });

  it("keeps a site's name even when it says what kind of land it is", () => {
    expect(
      parseTitleAddress("North Sutton Car Park", "NG17 1DG", known),
    ).toMatchObject({
      name: "NORTH SUTTON CAR PARK",
      land: true,
      kind: "named",
    });
  });

  it("falls back to the postcode, then to nothing", () => {
    expect(parseTitleAddress("Land, Hucknall", "NG15 7SB", known).kind).toBe(
      "postcode",
    );
    expect(parseTitleAddress("Land, Hucknall", null, known).kind).toBe("none");
  });
});
