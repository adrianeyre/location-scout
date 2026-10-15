/*
 * The new homes a Planning Application proposes, read from its description
 * as the council wrote it (PRD FR-2.2): "erection of 86 dwellings" is 86.
 * It is an estimate, and labelled as one wherever it is shown. The rules,
 * each a fixed one so the same description always gives the same homes:
 *
 * - Homes are dwellings, houses, bungalows, flats, apartments, maisonettes,
 *   cottages, studios, and residential or dwelling units. A house in
 *   multiple occupation, a care home or a public house is not one, nor is a
 *   house or flat that names something else: a house extension, a flat roof,
 *   an apartment block (whose homes it doesn't count).
 * - They count only where the description proposes them: after erection,
 *   construction, creation, provision, new, outline, proposed and the like,
 *   or after "to" or "into" in a change of use or conversion. Those being
 *   demolished, extended or altered, those a building is converted from, and
 *   existing, former, neighbouring and replacement ones don't count. The
 *   homes proposed are counted, not less any demolished or converted.
 * - The number before them counts ("4no. semi-detached dwellings", "six
 *   flats", "up to 300 dwellings"), but not a number of bedrooms, storeys
 *   or people ("a 2 bedroom dwelling" is 1). Without a number, one named
 *   ("a dwelling", "single dwelling", "dwellinghouse") is 1.
 * - Homes listed after a number of them ("86 dwellings comprising 50
 *   houses and 36 apartments") are its breakdown, so aren't counted again.
 * - An application that only settles the details of homes already
 *   permitted proposes none of its own: discharging, varying or removing a
 *   condition, approving details or reserved matters, a non-material
 *   amendment, or a certificate of lawful development. Nor do listed
 *   building consent, advertisements or works to trees, which come beside or
 *   apart from a planning application.
 * - Homes proposed without a number ("change of use to residential units")
 *   can't be counted: they are `unstated`.
 */

/** What a description proposes: a number of new homes, homes without a number, or none. */
export type ProposedHomes =
  { kind: "counted"; homes: number } | { kind: "unstated" } | null;

/** Applications that settle the details of homes already permitted, or that come beside a planning application. */
const NO_NEW_HOMES = [
  /\bdischarge\b/,
  /\b(?:vary|variation of|varying|remove|removal of|removing)\b[^.;]{0,40}\bconditions?\b/,
  /\bdetails reserved by conditions?\b/,
  /\bapproval of (?:the )?details\b/,
  /\breserved matters\b/,
  /\bnon[- ]?material amendments?\b/,
  /\bminor[- ]?material amendments?\b/,
  /\blawful development certificate\b/,
  /\bcertificate of lawful/,
  /\blisted building consent\b/,
  /\badvertisements?\b/,
  /\bworks? to (?:a )?trees?\b/,
  /\btree preservation order\b/,
];

/** The council's own types for those, where it gives one. */
const NO_NEW_HOMES_TYPE =
  /condition|reserved matters|non[- ]?material|lawful|listed building|advert|tree/i;

const UNITS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Words naming homes, singular and plural. */
const HOMES: Readonly<Record<string, "one" | "many">> = {
  dwelling: "one",
  dwellings: "many",
  dwellinghouse: "one",
  dwellinghouses: "many",
  house: "one",
  houses: "many",
  home: "one",
  homes: "many",
  bungalow: "one",
  bungalows: "many",
  flat: "one",
  flats: "many",
  apartment: "one",
  apartments: "many",
  maisonette: "one",
  maisonettes: "many",
  cottage: "one",
  cottages: "many",
  townhouse: "one",
  townhouses: "many",
  studio: "one",
  studios: "many",
  unit: "one",
  units: "many",
};

/**
 * A unit or studio is a home only with one of these up to 5 words before
 * it: "residential units", "residential development of up to 24 units".
 */
const UNIT_QUALIFIERS = new Set([
  "residential",
  "dwelling",
  "housing",
  "living",
  "contained",
  "affordable",
  "apartment",
  "flat",
]);

/** A unit or studio that names something else: "dance studio". */
const QUALIFIED = new Set(["unit", "units", "studio", "studios"]);

/** Words before a home that make it something else: "public house", "care home". */
const NOT_A_HOME_BEFORE = new Set([
  "public",
  "summer",
  "green",
  "boat",
  "pump",
  "club",
  "meeting",
  "bin",
  "play",
  "tree",
  "wash",
  "bath",
  "hen",
  "dog",
  "ice",
  "light",
  "power",
  "store",
  "care",
  "nursing",
  "retirement",
  "mobile",
  "funeral",
  "children",
  "childrens",
  "dance",
  "art",
  "recording",
  "photography",
  "yoga",
  "tattoo",
  "beauty",
  "industrial",
  "commercial",
  "business",
  "retail",
  "office",
  "storage",
  "workshop",
  "starter",
]);

/** Words after a home that make it part of something else: "house extension", "flat roof". */
const NOT_A_HOME_AFTER = new Set([
  "extension",
  "extensions",
  "alteration",
  "alterations",
  "improvement",
  "improvements",
  "office",
  "block",
  "blocks",
  "roof",
  "roofs",
  "roofed",
  "pack",
  "in",
  "of",
  "garden",
  "gardens",
  "conversion",
  "occupation",
  "boundary",
  "window",
  "windows",
]);

/** Words that start proposing something new. */
const CREATING = new Set([
  "erection",
  "erect",
  "erecting",
  "construction",
  "construct",
  "constructing",
  "build",
  "rebuild",
  "creation",
  "create",
  "creating",
  "provision",
  "provide",
  "providing",
  "development",
  "redevelopment",
  "new",
  "outline",
  "proposed",
  "proposal",
  "proposing",
  "form",
  "forming",
  "formation",
  "siting",
  "placement",
]);

/** Words that propose something new, and may also describe the homes proposed: "4 new houses". */
const DESCRIBING = new Set(["new", "proposed"]);

/** Words after which the homes named are those a building is converted from. */
const CONVERTING = new Set([
  "conversion",
  "convert",
  "converting",
  "converted",
  "subdivision",
  "subdivide",
  "subdividing",
  "split",
]);

/** In a conversion, words after which the homes named are those it makes. */
const INTO = new Set([
  "to",
  "into",
  "as",
  "form",
  "forming",
  "create",
  "creating",
  "provide",
  "providing",
]);

/** Words after which the homes named are being taken away, or changed. */
const CHANGING = new Set([
  "demolition",
  "demolish",
  "demolishing",
  "demolished",
  "removal",
  "remove",
  "loss",
  "extension",
  "extensions",
  "extend",
  "extending",
  "alteration",
  "alterations",
  "alter",
  "refurbishment",
  "refurbish",
  "renovation",
  "repair",
  "repairs",
  "insulation",
  "works",
  "installation",
  "improvements",
  "annexe",
  "annex",
]);

/** Words before a home that make it one there already, or one replaced. */
const NOT_NEW = new Set([
  "existing",
  "former",
  "original",
  "neighbouring",
  "neighboring",
  "adjacent",
  "adjoining",
  "host",
  "current",
  "replacement",
]);

/** Words after a number that make it something other than a number of homes. */
const NOT_A_COUNT_AFTER = new Set([
  "bed",
  "beds",
  "bedded",
  "bedroom",
  "bedrooms",
  "bedroomed",
  "storey",
  "storeys",
  "story",
  "stories",
  "person",
  "persons",
  "people",
  "occupant",
  "occupants",
  "car",
  "parking",
  "space",
  "spaces",
  "metre",
  "metres",
  "m",
  "sqm",
  "year",
  "years",
  "hectare",
  "hectares",
  "ha",
  "acre",
  "acres",
  "percent",
]);

/** Words before a number that make it a name rather than a count: "plot 3". */
const NOT_A_COUNT_BEFORE = new Set([
  "plot",
  "plots",
  "phase",
  "phases",
  "no",
  "number",
  "condition",
  "conditions",
  "block",
  "unit",
  "flat",
  "house",
  "class",
]);

/** Words that start listing the homes already counted: "comprising 50 houses". */
const BREAKDOWN = new Set([
  "comprising",
  "comprises",
  "comprise",
  "including",
  "includes",
  "include",
  "consisting",
  "incorporating",
  "namely",
]);

/** Words a home's description may have before it, between its number and it. */
const STOPS = new Set([
  "of",
  "to",
  "into",
  "for",
  "and",
  "or",
  "with",
  "from",
  "at",
  "on",
  "in",
  "by",
  "as",
  "the",
]);

/** Words after "residential" that make it a scheme of homes. */
const RESIDENTIAL_SCHEMES = new Set([
  "development",
  "redevelopment",
  "scheme",
  "accommodation",
]);

/** The most homes one description is believed to propose: more is a mistake. */
const MOST_HOMES = 10_000;

type Token = string;

/**
 * The description's words in lower case, with numbers as digits, "3no." as
 * "3", and its sentences ended by ".": "Demolition of existing dwelling and
 * construction of 4no. SemI detached dwellings" gives ["demolition", "of",
 * "existing", "dwelling", "and", "construction", "of", "4", "semi",
 * "detached", "dwellings"].
 */
export const words = (description: string): Token[] => {
  const text = description
    .toLowerCase()
    .replace(/\|/g, " ")
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    // "3no.", "2 no", "4nos", "2 x" and "2x" are counts.
    .replace(/(\d+)\s*(?:nos?\b\.?|x\b)/g, "$1 ")
    .replace(/\ba pair of\b/g, "2")
    .replace(/[’']/g, "")
    // A sentence ends at a full stop or semicolon before a space; any other
    // stop is inside a word or a number, as in "refno.214".
    .replace(/[;.!?]+(?=\s|$)/g, " | ")
    .replace(/\./g, " ");
  const tokens = (text.match(/[a-z0-9]+|[|()]/g) ?? []).map((token) =>
    token === "|" ? "." : token,
  );
  const joined: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const next = tokens[i + 1] ?? "";
    const unit = UNITS[next];
    const tens = TENS[token];
    if (tens !== undefined && unit !== undefined && unit < 10) {
      joined.push(String(tens + unit));
      i++;
    } else if (tens !== undefined) {
      joined.push(String(tens));
    } else if (UNITS[token] !== undefined) {
      joined.push(String(UNITS[token]));
    } else if (
      token === "dwelling" &&
      (next === "house" || next === "houses")
    ) {
      // "dwelling house" is one word.
      joined.push(`dwelling${next}`);
      i++;
    } else {
      joined.push(token);
    }
  }
  return joined;
};

const isNumber = (token: Token | undefined) =>
  token !== undefined && /^\d+$/.test(token);

/** Whether the token at `i` is a number of bedrooms, storeys or the like. */
const isMeasure = (tokens: readonly Token[], i: number): boolean => {
  const after = tokens[i + 1];
  if (after !== undefined && NOT_A_COUNT_AFTER.has(after)) return true;
  // "one and two bedroom flats": the first is a number of bedrooms too.
  return (
    (after === "and" || after === "or" || after === "to") &&
    isNumber(tokens[i + 2]) &&
    isMeasure(tokens, i + 2)
  );
};

/** Whether the word at `i` names homes, rather than something else. */
const isHome = (tokens: readonly Token[], i: number) => {
  const token = tokens[i] ?? "";
  if (HOMES[token] === undefined) return false;
  const before = tokens[i - 1] ?? "";
  const after = tokens[i + 1] ?? "";
  if (NOT_A_HOME_BEFORE.has(before) || NOT_A_HOME_AFTER.has(after)) {
    return false;
  }
  // "studio flats": a home naming the next is counted with it.
  if (HOMES[after] !== undefined) return false;
  if (QUALIFIED.has(token)) {
    return tokens
      .slice(Math.max(0, i - 5), i)
      .some((word) => UNIT_QUALIFIERS.has(word));
  }
  return true;
};

/**
 * How many homes the words before the home at `i` say there are: a number,
 * 1 for a home named alone, or `null` for homes without a number. `notNew`
 * is set if they say it is one there already, or replaced.
 */
const countBefore = (
  tokens: readonly Token[],
  i: number,
): { count: number | null; notNew: boolean } => {
  const singular = HOMES[tokens[i] ?? ""] === "one";
  for (let j = i - 1; j >= 0 && j >= i - 6; j--) {
    const token = tokens[j] ?? "";
    if (NOT_NEW.has(token)) return { count: null, notNew: true };
    if (isNumber(token) && !isMeasure(tokens, j)) {
      if (NOT_A_COUNT_BEFORE.has(tokens[j - 1] ?? "")) break;
      const count = Number(token);
      return {
        count: count > 0 && count <= MOST_HOMES ? count : null,
        notNew: false,
      };
    }
    // "12 one and two bedroom flats": read on past the bedrooms.
    if (
      STOPS.has(token) &&
      !(token === "and" && isNumber(tokens[j - 1]) && isNumber(tokens[j + 1]))
    ) {
      break;
    }
    if (token === "." || token === "(" || token === ")") break;
    // "300 new dwellings": "new" and "proposed" describe the homes.
    if (
      (CREATING.has(token) && !DESCRIBING.has(token)) ||
      CONVERTING.has(token) ||
      CHANGING.has(token)
    ) {
      break;
    }
  }
  return { count: singular ? 1 : null, notNew: false };
};

type Mode = "none" | "creating" | "converting" | "changing";

/**
 * The new homes a Planning Application's description proposes, by the
 * rules above, or `null` if it proposes none. `councilType` is the
 * council's own type for it, if it gives one.
 */
export const proposedHomes = (
  description: string,
  councilType: string | null = null,
): ProposedHomes => {
  const text = description.toLowerCase();
  if (NO_NEW_HOMES.some((pattern) => pattern.test(text))) return null;
  if (councilType && NO_NEW_HOMES_TYPE.test(councilType)) return null;

  const tokens = words(description);
  let homes = 0;
  let unstated = false;
  let mode: Mode = "none";
  // Whether the sentence has counted homes, after which more are its breakdown.
  let counted = false;
  let breakdown = false;
  let depth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const next = tokens[i + 1] ?? "";
    if (token === ".") {
      mode = "none";
      counted = false;
      breakdown = false;
      depth = 0;
      continue;
    }
    if (token === "(") depth++;
    if (token === ")") depth = Math.max(0, depth - 1);
    if (BREAKDOWN.has(token) && counted) breakdown = true;

    if (token === "change" && next === "of" && tokens[i + 2] === "use") {
      mode = "converting";
      i += 2;
      continue;
    }
    if (CONVERTING.has(token)) {
      mode = "converting";
      continue;
    }
    if (token === "from" && mode !== "none") {
      mode = "converting";
      continue;
    }
    if (mode === "converting" && INTO.has(token)) {
      mode = "creating";
      continue;
    }
    if (CHANGING.has(token)) {
      mode = "changing";
      continue;
    }
    if (CREATING.has(token)) {
      // "conversion to form 2 flats" is still the conversion's.
      mode = "creating";
      continue;
    }

    // "Residential development" proposes homes, whatever came before it.
    if (token === "residential" && RESIDENTIAL_SCHEMES.has(next)) {
      unstated = true;
      continue;
    }
    if (mode !== "creating") continue;
    if (
      (token === "residential" || token === "housing") &&
      HOMES[next] === undefined
    ) {
      unstated = true;
      continue;
    }
    if (!isHome(tokens, i)) continue;
    const { count, notNew } = countBefore(tokens, i);
    if (notNew) continue;
    // Homes after those counted, listed or in brackets, are their breakdown.
    if (counted && (breakdown || depth > 0)) continue;
    if (count === null) {
      unstated = true;
    } else {
      homes += count;
      counted = true;
    }
  }

  if (homes > 0) return { kind: "counted", homes };
  return unstated ? { kind: "unstated" } : null;
};
