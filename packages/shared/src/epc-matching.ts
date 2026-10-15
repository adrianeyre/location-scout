/**
 * Matches a Price Paid sale to the Energy Performance Certificates lodged in
 * its postcode, so a sale can be given its EPC's floor area and ratings
 * (PRD FR-2.6, OQ-8). Price Paid gives a sale's address as PAON (the house
 * number or name), SAON (the flat), street, locality and town. The EPC
 * register gives up to four free-text address lines and, for most
 * certificates, the property's UPRN. HM Land Registry's monthly lookups
 * give a sale its UPRN too, for sales registered since July 2026.
 */

import { normaliseName } from "./address-names";

/** A Price Paid sale, as far as matching needs it. */
export interface EpcSale {
  /** Price Paid's transaction id. */
  id: string;
  /** When it completed, as an ISO 8601 date. */
  date: string;
  postcode: string;
  /** The house number or name: "12", "12A", "ROSE COTTAGE". */
  paon: string;
  /** The flat: "FLAT 2", "2", "FIRST FLOOR FLAT"; "" for a house. */
  saon: string;
  street: string;
  /** Its UPRN, where HM Land Registry's lookups give one. */
  uprn: string | null;
}

/** A certificate the EPC register's search gives for a postcode. */
export interface Certificate {
  certificateNumber: string;
  /** The property's UPRN, where the register has one. */
  uprn: string | null;
  /** Its address lines, as lodged: "Flat 2", "12 High Street", null, null. */
  addressLines: readonly (string | null)[];
  /** When it was registered, as an ISO 8601 date. */
  registrationDate: string;
}

/**
 * How a sale is matched, tried in this order. A step matches a sale when it
 * finds exactly one property, and leaves it ambiguous when it finds more.
 *
 * - **uprn**: the certificates with the sale's UPRN.
 * - **address**: the certificates whose address holds the sale's flat,
 *   house number or name and street, in that order, as whole words.
 * - **building**: the same without the street, for a street written
 *   differently on the certificate, where the address begins with them and
 *   no number follows: "2 Mill Lane" for house 2, but not "Flat 2, 12 Mill
 *   Lane". Within one postcode a flat and house number usually name one
 *   property.
 */
export const EPC_MATCH_STEPS = ["uprn", "address", "building"] as const;
export type EpcMatchStep = (typeof EPC_MATCH_STEPS)[number];

/** What matching found for one sale. */
export interface EpcMatch<C extends Certificate = Certificate> {
  /** The step that found it a property, or properties; null if none did. */
  step: EpcMatchStep | null;
  /** How many properties that step found: 1 is a match. */
  properties: number;
  /** The matched property's certificate for the sale, if it matched. */
  certificate: C | null;
}

/** Words for a flat that one side writes and the other leaves out. */
const FLAT_WORDS = new Set(["FLAT", "APARTMENT", "APT"]);

/** Floors written as ordinals: "1st Floor Flat" is "First Floor Flat". */
const ORDINALS: Readonly<Record<string, string>> = {
  "1ST": "FIRST",
  "2ND": "SECOND",
  "3RD": "THIRD",
  "4TH": "FOURTH",
  GRD: "GROUND",
};

/**
 * Address parts as words matching compares: each part normalised as
 * `normaliseName` does, ordinals written out and "Flat" and "Apartment"
 * left out, so "Apartment 2, 12 High St." and "FLAT 2", "12", "HIGH
 * STREET" both read "2 12 HIGH STREET".
 */
export const addressWords = (parts: readonly (string | null)[]) =>
  parts
    .filter((part): part is string => part !== null)
    .map(normaliseName)
    .join(" ")
    .split(" ")
    .filter((word) => word !== "" && !FLAT_WORDS.has(word))
    .map((word) => ORDINALS[word] ?? word)
    .join(" ");

/** `phrase` appears in `words` as whole words. */
const holds = (words: string, phrase: string) =>
  phrase !== "" && ` ${words} `.includes(` ${phrase} `);

/** `words` begin with `phrase`, and the next word, if any, has no digit. */
const beginsWith = (words: string, phrase: string) =>
  phrase !== "" &&
  (words === phrase ||
    (words.startsWith(`${phrase} `) &&
      !/\d/.test(words.slice(phrase.length + 1).split(" ")[0] ?? "")));

/** A property on the register: its certificates, and its words. */
interface Property<C extends Certificate> {
  uprn: string | null;
  words: string;
  certificates: C[];
}

/**
 * The postcode's certificates grouped by property: by UPRN where the
 * register has one, and otherwise by address.
 */
const properties = <C extends Certificate>(
  certificates: readonly C[],
): Property<C>[] => {
  const byKey = new Map<string, Property<C>>();
  for (const certificate of certificates) {
    const words = addressWords(certificate.addressLines);
    const key =
      certificate.uprn === null
        ? `address ${words}`
        : `uprn ${certificate.uprn}`;
    const property = byKey.get(key) ?? {
      uprn: certificate.uprn,
      words,
      certificates: [],
    };
    property.certificates.push(certificate);
    byKey.set(key, property);
  }
  return [...byKey.values()];
};

/**
 * The certificate that describes a property when it sold: the last one
 * registered on or before the sale, or else the first one after it (a new
 * build's is often registered after completion).
 */
export const certificateFor = <C extends Certificate>(
  certificates: readonly C[],
  saleDate: string,
): C | null => {
  const byDate = [...certificates].sort((a, b) =>
    a.registrationDate.localeCompare(b.registrationDate),
  );
  return (
    byDate.findLast(({ registrationDate }) => registrationDate <= saleDate) ??
    byDate[0] ??
    null
  );
};

/**
 * Each property's latest certificate among `certificates`, those the
 * register gives for a postcode, grouped by property as matching groups
 * them: one for each property, however many times it was assessed.
 */
export const latestCertificates = <C extends Certificate>(
  certificates: readonly C[],
): C[] =>
  properties(certificates).flatMap(
    ({ certificates: lodged }) =>
      [...lodged].sort((a, b) =>
        b.registrationDate.localeCompare(a.registrationDate),
      )[0] ?? [],
  );

/**
 * Matches `sale` to one property among `certificates`, those the register
 * gives for its postcode, by the first of `EPC_MATCH_STEPS` that finds any.
 */
export const matchSale = <C extends Certificate>(
  sale: EpcSale,
  certificates: readonly C[],
): EpcMatch<C> => {
  const candidates = properties(certificates);
  const flat = addressWords([sale.saon]);
  const building = [flat, addressWords([sale.paon])]
    .filter((words) => words !== "")
    .join(" ");
  const street = addressWords([sale.street]);
  const tests: Record<
    EpcMatchStep,
    ((property: Property<C>) => boolean) | null
  > = {
    uprn: sale.uprn === null ? null : (property) => property.uprn === sale.uprn,
    address:
      building === "" || street === ""
        ? null
        : (property) => holds(property.words, `${building} ${street}`),
    building:
      building === ""
        ? null
        : (property) => beginsWith(property.words, building),
  };
  for (const step of EPC_MATCH_STEPS) {
    const test = tests[step];
    if (test === null) continue;
    const found = candidates.filter(test);
    if (found.length === 0) continue;
    const [property] = found;
    return {
      step,
      properties: found.length,
      certificate:
        found.length === 1 && property
          ? certificateFor(property.certificates, sale.date)
          : null,
    };
  }
  return { step: null, properties: 0, certificate: null };
};
