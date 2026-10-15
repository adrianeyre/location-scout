/**
 * The 20 real Locations of PRD §6.19's seventh success criterion, four of
 * each kind, each found by its postcode as a user would search for it. Nine
 * are in Ashfield, the default Land Coverage Area, so the Land Layer has
 * something to show; the rest are spread across England's regions. Each
 * postcode was checked with postcodes.io and Nominatim on 9 October 2026 to
 * be in England and of its kind.
 */

export const LOCATION_KINDS = [
  "town centre",
  "suburb",
  "village",
  "rural edge",
  "industrial",
] as const;

export type LocationKind = (typeof LOCATION_KINDS)[number];

export interface SurveyLocation {
  kind: LocationKind;
  /** Where it is, as a person would say it. */
  name: string;
  postcode: string;
}

export const SURVEY_LOCATIONS: readonly SurveyLocation[] = [
  { kind: "town centre", name: "Sutton-in-Ashfield", postcode: "NG17 1AA" },
  { kind: "town centre", name: "Kirkby-in-Ashfield", postcode: "NG17 7BA" },
  { kind: "town centre", name: "York, Coppergate", postcode: "YO1 8RS" },
  { kind: "town centre", name: "Camden Town, London", postcode: "NW1 8NH" },
  { kind: "suburb", name: "Skegby, Sutton-in-Ashfield", postcode: "NG17 3FP" },
  { kind: "suburb", name: "Huthwaite", postcode: "NG17 2NW" },
  { kind: "suburb", name: "Bishopston, Bristol", postcode: "BS7 8PB" },
  { kind: "suburb", name: "Headingley, Leeds", postcode: "LS6 3HN" },
  { kind: "village", name: "Westwood, Selston", postcode: "NG16 6DP" },
  { kind: "village", name: "Jacksdale", postcode: "NG16 5JU" },
  { kind: "village", name: "Bibury, Cotswolds", postcode: "GL7 5NW" },
  { kind: "village", name: "Grantchester, Cambridge", postcode: "CB3 9NF" },
  { kind: "rural edge", name: "Teversal", postcode: "NG17 3JN" },
  { kind: "rural edge", name: "Annesley", postcode: "NG15 0AR" },
  { kind: "rural edge", name: "Hexham, west edge", postcode: "NE46 2NB" },
  { kind: "rural edge", name: "Okehampton, south edge", postcode: "EX20 1EL" },
  {
    kind: "industrial",
    name: "Sherwood Business Park, Annesley",
    postcode: "NG15 0DT",
  },
  {
    kind: "industrial",
    name: "Trafford Park, Manchester",
    postcode: "M17 1PA",
  },
  { kind: "industrial", name: "Attercliffe, Sheffield", postcode: "S9 3SA" },
  {
    kind: "industrial",
    name: "Threemilestone Industrial Estate, Truro",
    postcode: "TR4 9LD",
  },
];
