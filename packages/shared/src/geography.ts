/**
 * The local geography a Location lies in (PRD FR-1.8), as postcodes.io names it
 * for one postcode: the postcode the user searched for, or else the postcode
 * nearest the Location. Each name is `null` if postcodes.io gives none.
 */
export interface LocalGeography {
  /** The postcode whose record names these areas, for example "NG17 1AA". */
  postcode: string;
  /** The electoral ward. */
  ward: string | null;
  /** The Lower layer Super Output Area, for example "Ashfield 005E". */
  lsoa: string | null;
  /** The Middle layer Super Output Area, for example "Ashfield 005". */
  msoa: string | null;
  /** The district, unitary authority or London borough. */
  localAuthority: string | null;
  parliamentaryConstituency: string | null;
}

const isName = (value: unknown) => value === null || typeof value === "string";

export const isLocalGeography = (value: unknown): value is LocalGeography =>
  typeof value === "object" &&
  value !== null &&
  "postcode" in value &&
  typeof value.postcode === "string" &&
  "ward" in value &&
  isName(value.ward) &&
  "lsoa" in value &&
  isName(value.lsoa) &&
  "msoa" in value &&
  isName(value.msoa) &&
  "localAuthority" in value &&
  isName(value.localAuthority) &&
  "parliamentaryConstituency" in value &&
  isName(value.parliamentaryConstituency);
