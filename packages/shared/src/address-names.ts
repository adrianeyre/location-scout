/**
 * Names of streets and places, normalised so that two ways of writing one
 * compare equal. HM Land Registry's registers, OpenStreetMap and the EPC
 * register each write addresses their own way.
 */

/** Street types written short, as registers and OpenStreetMap sometimes do. */
export const STREET_TYPES: Readonly<Record<string, string>> = {
  RD: "ROAD",
  AVE: "AVENUE",
  AV: "AVENUE",
  LN: "LANE",
  DR: "DRIVE",
  CL: "CLOSE",
  CRES: "CRESCENT",
  CRESC: "CRESCENT",
  GDNS: "GARDENS",
  GRN: "GREEN",
  GR: "GROVE",
  GRO: "GROVE",
  PL: "PLACE",
  SQ: "SQUARE",
  TER: "TERRACE",
  TERR: "TERRACE",
  CT: "COURT",
  PDE: "PARADE",
  WY: "WAY",
};

/**
 * A street's or a place's name, so two ways of writing it compare equal:
 * capitals, words only, short street types written out, and "ST" at the
 * end, as in "High St", read as "STREET" ("St Mary's Road" keeps its saint).
 */
export const normaliseName = (text: string) => {
  const words = text
    .toUpperCase()
    .replaceAll("&", " AND ")
    .replaceAll(/['’]/g, "")
    .replaceAll(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "");
  return words
    .map((word, index) =>
      index === words.length - 1 && word === "ST"
        ? "STREET"
        : (STREET_TYPES[word] ?? word),
    )
    .join(" ");
};
