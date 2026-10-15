/**
 * Reads the property address of a registered title, as HM Land Registry's
 * CCOD and OCOD datasets give it, so it can be matched to the INSPIRE Index
 * Polygons, which carry no title number (PRD FR-5.4a, OQ-7). CCOD's
 * Property Address is the register's own text, not a postal address:
 * "12 High Street, Sutton-in-Ashfield (NG17 1AA)", "Unit 3, Lowmoor
 * Business Park, Kirkby-in-Ashfield", or "land lying to the south of West
 * Parley Road, Bournemouth", often with no postcode.
 */

import { normaliseName } from "@location-scout/shared";

/** A UK postcode, with or without its space. */
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/;

/** "NG17 1AA" from "ng171aa" or "NG17  1AA"; `null` if it isn't a postcode. */
export const normalisePostcode = (text: string | null | undefined) => {
  const match = new RegExp(`^\\s*${POSTCODE.source}\\s*$`).exec(
    (text ?? "").toUpperCase(),
  );
  return match ? `${match[1] ?? ""} ${match[2] ?? ""}` : null;
};

export { STREET_TYPES, normaliseName } from "@location-scout/shared";

/**
 * Words that say a title is land, or a kind of site, rather than a postal
 * address: "Land at…", "Garages adjoining…", "Substation, Walesby Drive".
 */
const LAND_WORDS = new Set([
  "LAND",
  "LANDS",
  "SITE",
  "PLOT",
  "PLOTS",
  "GARAGE",
  "GARAGES",
  "SUBSTATION",
  "ALLOTMENT",
  "ALLOTMENTS",
  "PLAYING",
  "FIELD",
  "FIELDS",
  "CAR",
  "PARK",
  "OPEN",
  "SPACE",
  "VERGE",
  "STRIP",
  "PART",
  "PARCEL",
  "BUILDINGS",
  "AND",
  "OF",
  "THE",
  "AT",
  "ON",
  "TO",
  "BEING",
  "LYING",
  "KNOWN",
  "AS",
  "ADJOINING",
  "ADJACENT",
  "BEHIND",
  "REAR",
  "SIDE",
  "NORTH",
  "SOUTH",
  "EAST",
  "WEST",
  "NORTHERN",
  "SOUTHERN",
  "EASTERN",
  "WESTERN",
  "BETWEEN",
  "FORMER",
  "FORMERLY",
  "IN",
  "NEAR",
  "OFF",
  "FRONTING",
]);

/** The words that begin a description of land, rather than an address. */
const LAND_DESCRIPTION =
  /^(?:THE\s+)?(?:LAND|LANDS|SITE|PLOT|PLOTS|GARAGES?|PART\s+OF|PARCEL|STRIP|VERGE)\b|\b(?:LYING\s+TO|SIDE\s+OF|REAR\s+OF|ADJOINING|ADJACENT\s+TO|BEHIND|BETWEEN)\b|\b(?:SUBSTATION|ALLOTMENTS?|PLAYING\s+FIELDS?|CAR\s+PARK|OPEN\s+SPACE)$/;

/**
 * Words that put land beside, behind or between what the address names,
 * rather than at it: "Land adjoining 12 High Street" is not number 12.
 */
const BESIDE =
  /\b(?:ADJOINING|ADJACENT|ADJ|REAR\s+OF|SIDE\s+OF|LYING\s+TO|BEHIND|BETWEEN|OPPOSITE|NEAR|NEXT\s+TO|TO\s+THE\s+(?:NORTH|SOUTH|EAST|WEST))\b/;

/** Which side of a street a description puts the land on. */
const SIDE =
  /\b(NORTH|SOUTH|EAST|WEST)(?:ERN)?(?:[\s-]+(?:EAST|WEST)(?:ERN)?)?\s+(?:SIDE\s+)?OF\b|\bTO\s+THE\s+(NORTH|SOUTH|EAST|WEST)\b/;

export const SIDES = ["NORTH", "SOUTH", "EAST", "WEST"] as const;
export type Side = (typeof SIDES)[number];

/**
 * House numbers at the start of a normalised part of an address: "12",
 * "12A", a range "12-14" (normalised to "12 14") or "12 to 14" (every
 * number between), "12 and 14", "Flat 3 12".
 */
const NUMBERS =
  /^(?:(?:FLAT|UNIT|APARTMENT|SUITE)\s+[A-Z0-9]+\s+)?(\d+[A-Z]?)(?:\s+(TO\s+|AND\s+)?(\d+[A-Z]?))?\b/;

/** Longest ranges read as every house number in them; longer ones as their two ends. */
const MAX_RANGE = 20;

/** The numbers `NUMBERS` matched: "12 and 14" is two houses, "12 to 14" three. */
const houseNumbers = ([, from = "", separator, to]: RegExpExecArray) => {
  if (to === undefined) return [from];
  if (separator?.startsWith("AND")) return [from, to];
  const start = Number.parseInt(from, 10);
  const end = Number.parseInt(to, 10);
  if (
    String(start) !== from ||
    String(end) !== to ||
    end <= start ||
    end - start > MAX_RANGE
  ) {
    return [from, to];
  }
  return Array.from({ length: end - start + 1 }, (_, index) =>
    String(start + index),
  );
};

/** What a title's address says, read as far as it can be. */
export interface TitleAddress {
  /** From the Postcode column, or else from the address itself. */
  postcode: string | null;
  /** The street it names, as one of the known streets, normalised. */
  street: string | null;
  /** House numbers on that street. */
  numbers: string[];
  /** A building's or a site's name, normalised: "LOWMOOR BUSINESS PARK". */
  name: string | null;
  /** It describes land, or a site, rather than giving a postal address. */
  land: boolean;
  /** It puts the land beside, behind or between what it names, not at it. */
  beside: boolean;
  /** The side of the street a description of land puts it on. */
  side: Side | null;
  /**
   * - `address`: house numbers on a known street, and the land is at them.
   * - `named`: a building's or site's name.
   * - `land`: land on or beside a known street, with no number it is at.
   * - `postcode`: only a postcode.
   * - `none`: nothing that can be placed.
   */
  kind: "address" | "named" | "land" | "postcode" | "none";
}

/** The longest known street named in `part`, as a whole run of words, and where it starts. */
const findStreet = (part: string, streets: ReadonlySet<string>) => {
  const words = part.split(" ");
  for (let length = words.length; length >= 2; length--) {
    for (let start = 0; start + length <= words.length; start++) {
      const candidate = words.slice(start, start + length).join(" ");
      if (streets.has(candidate)) {
        return { street: candidate, before: words.slice(0, start).join(" ") };
      }
    }
  }
  return null;
};

/** `part` is nothing but words that describe land: "LAND", "SUBSTATION", "CAR PARK". */
const onlyLandWords = (part: string): boolean =>
  part.split(" ").every((word) => LAND_WORDS.has(word));

/**
 * Reads a title's Property Address against the streets and places known in
 * the area (each normalised by `normaliseName`), with the Postcode column's
 * value if it has one.
 */
export const parseTitleAddress = (
  address: string,
  postcode: string | null,
  known: { streets: ReadonlySet<string>; places: ReadonlySet<string> },
): TitleAddress => {
  const text = address.toUpperCase();
  const found = POSTCODE.exec(text);
  const code =
    normalisePostcode(postcode) ??
    (found ? `${found[1] ?? ""} ${found[2] ?? ""}` : null);
  const parts = text
    .replace(POSTCODE, " ")
    .replaceAll(/[()]/g, " ")
    .split(/[,;]/)
    .map(normaliseName)
    .filter((part) => part !== "");

  let street: string | null = null;
  let numbers: string[] = [];
  let name: string | null = null;
  const sideMatch = SIDE.exec(normaliseName(text));
  const side = (sideMatch?.[1] ?? sideMatch?.[2] ?? null) as Side | null;
  let land = LAND_DESCRIPTION.test(parts[0] ?? "");
  // A number alone before the street's part, as in "Unit 3, 12, High Street".
  let pending: string[] = [];

  for (const part of parts) {
    if (street !== null) {
      if (LAND_DESCRIPTION.test(part)) land = true;
      continue;
    }
    const inPart = findStreet(part, known.streets);
    if (inPart) {
      street = inPart.street;
      // What comes before the street, less the words about land it starts
      // with: "Land adjoining 12 High Street" gives 12.
      const words = inPart.before.split(" ").filter((word) => word !== "");
      const first = words.findIndex((word) => !LAND_WORDS.has(word));
      const before = first < 0 ? "" : words.slice(first).join(" ");
      const number = NUMBERS.exec(before);
      if (number) {
        numbers = houseNumbers(number);
      } else if (before === "" && pending.length > 0) {
        numbers = pending;
      } else if (before !== "") {
        name ??= before;
      }
      if (LAND_DESCRIPTION.test(part)) land = true;
      continue;
    }
    if (known.places.has(part)) continue;
    const number = NUMBERS.exec(part);
    if (number && number[0].length === part.length) {
      pending = houseNumbers(number);
      continue;
    }
    if (LAND_DESCRIPTION.test(part) || onlyLandWords(part)) {
      land = true;
      // "North Sutton Car Park" is a name, as well as a kind of land.
      if (!onlyLandWords(part)) name ??= part;
      continue;
    }
    if (number) {
      // A number and words that aren't a known street: "12 The Paddocks".
      pending = houseNumbers(number);
      name ??= part.slice(number[0].length).trim() || null;
      continue;
    }
    name ??= part;
  }

  const beside = BESIDE.test(normaliseName(text));
  const kind =
    street !== null && numbers.length > 0 && !beside
      ? "address"
      : name !== null
        ? "named"
        : street !== null
          ? "land"
          : code !== null
            ? "postcode"
            : "none";
  return {
    postcode: code,
    street,
    numbers: street === null ? [] : numbers,
    name,
    land: land || beside,
    beside,
    side,
    kind,
  };
};
