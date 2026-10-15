import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { proposedHomes, words, type ProposedHomes } from "./dwellings";

/**
 * Every description in PlanIt's recording of NG17 1AA's 0.5 mile Search
 * Area, as Ashfield's council wrote them: 126 real ones.
 */
const RECORDED: readonly { description: string; councilType: string | null }[] =
  (
    JSON.parse(
      readFileSync(
        new URL("./fixtures/planit-ng17-1aa.json", import.meta.url),
        "utf8",
      ),
    ) as {
      records: {
        description: string;
        other_fields?: { application_type?: string };
      }[];
    }
  ).records.map(({ description, other_fields }) => ({
    description,
    councilType: other_fields?.application_type ?? null,
  }));

const homes = (count: number): ProposedHomes => ({
  kind: "counted",
  homes: count,
});
const UNSTATED: ProposedHomes = { kind: "unstated" };

/**
 * The recorded descriptions that propose homes, word for word, and the new
 * homes each proposes. Every other recorded description proposes none.
 */
const RECORDED_HOMES: readonly [string, ProposedHomes][] = [
  [
    "Application to determine if prior approval is required for a proposed change of use from commercial, business and service (use class e) to dwellinghouse (use class c3)",
    homes(1),
  ],
  [
    "Change of use of first and second floor to create 3no. Self-contained flats including a first floor extension, one dormer window, and shop front alterations to create access",
    homes(3),
  ],
  [
    "Change of use to the first and second floor from dance studio to 4no. Self contained 1 bedroom flats",
    homes(4),
  ],
  ["Change of use from first floor office to one bedroom flat", homes(1)],
  [
    "Change of use of part ground, first and second floors to six flats including second floor extension and external alterations. New and replacement windows. Replacement shop front.",
    homes(6),
  ],
  ["Outline proposal for single dwelling", homes(1)],
  [
    "Demolition of existing dwelling and construction of 4no. SemI detached dwellings",
    homes(4),
  ],
  [
    "Change of use from office building to 5 flats, and a rear two-storey extension and loft conversion",
    homes(5),
  ],
  ["Outline application with all matters reserved for 4 dwellings", homes(4)],
  [
    // The apartment block's homes aren't given, so only the houses count.
    "Demolition of existing commercial building and construction of a 3 storey apartment block and 6 semi-detached houses",
    homes(6),
  ],
  ["Change of use from commercial to residential", UNSTATED],
  [
    "Change of use from pet crematorium and workshop to residential units, including roof alterations, installation of solar panels, thermal wall insulation and new window and door openings",
    UNSTATED,
  ],
  [
    "Application to determine if prior approval is required for a proposed: change of use from commercial, business and service (use class e) to mixed use including up to two flats (use class c3)",
    homes(2),
  ],
  ["Construction of a new 2 bedroom dwelling with 2 car park spaces", homes(1)],
  ["Prior approval application to convert upper floors to 2 flats", homes(2)],
  ["Change of use from former public house to seven flats", homes(7)],
  ["Change of use from pet crematorium to 5 residential flats", homes(5)],
  [
    "Redevelopment of commercial unit and creation of 2 apartments to first floor. Alterations to frontage, replacing and creating windows at first floor and additional external doors to rear",
    homes(2),
  ],
  [
    "Conversion of first and attic floor into two residential units, provision of additional window",
    homes(2),
  ],
  [
    "Application to determine if prior approval is required for a proposed: change of use from commercial, business and service (use class e) to dwellinghouses (use class c3) - conversion of the first floor and attic floors into two flats",
    homes(2),
  ],
];

/**
 * Recorded descriptions that name homes, or numbers, but propose no new
 * ones, word for word: the ones the rules must ignore.
 */
const RECORDED_IGNORED: readonly [string, string][] = [
  [
    "Change of use from a dwelling (use class c3) to a 7-bed hmo (use class suI generis)",
    "converts a home into a house in multiple occupation, whose beds aren't homes",
  ],
  [
    "Change of use of existing 6 bed 6 person hmo to 6 bed 8 person suI generis hmo",
    "counts beds and people, not homes",
  ],
  [
    "Certificate of lawfulness for a proposed single storey extension to the rear, single storey side and rear extension, dormer to the rear and change of use to a 6 bed hmo",
    "is a certificate of lawful development",
  ],
  [
    "Application to vary condition 22 of planning permission v/2021/0072 - the hereby approved house in multiple occupation shall provide residential accommodation for a maximum of 29 people",
    "varies a condition of a permission",
  ],
  [
    "Prior approval for a proposed: larger home extension - single storey rear extension",
    "extends a home",
  ],
  [
    "Front extension and increase in height of existing flat roof",
    "names a flat roof",
  ],
  [
    "Two storey extension to the side and rear, single storey extension to the front garage and bay windows",
    "counts storeys",
  ],
  [
    "Removal of 1no. 3G artificial grass pitches and creation of 2no. 3G artificial grass pitches with perimeter fencing, hardstanding areas, storage containers, floodlights, access footpaths and overflow car park",
    "creates sports pitches",
  ],
  [
    "Proposed subdivision, external alterations, and use of proposed unit b1 for mixed restaurant/hot-food takeaway use with associated ventilation/extraction equipment",
    "names a commercial unit",
  ],
  [
    "Change of use of ground floor from cafe/restaurant (use class e) to tattoo and piercing studio (suI generis)",
    "names a tattoo studio",
  ],
  [
    "Application for a lawful development certificate for a proposed development - loft conversion, including construction of rear dormer extension and associated internal alterations",
    "is a certificate of lawful development",
  ],
  [
    "Application for approval of details reserved by condition 5 of planning permission v/2026/0210 - proposed glazing and mechanical ventilation with heat recovery",
    "approves the details of a permission",
  ],
  [
    "Non material amendment following planning permission v/2022/0464 - reduce scheme from three floors to two floors, retain the existing rear wall of the building adding windows & doors, sun pipes added to pitched and flat roofs, amendments to front fa?Ade s",
    "amends a permission",
  ],
  [
    "Works to trees subject to tree preservation order refno.214 - Pollard of 3 trees and felling of 1 tree",
    "is works to trees",
  ],
  [
    "Application for consent to display advertisements - 3no. Illuminated fascia signs and 1no. Non-illuminated fascia sign",
    "is an advertisement",
  ],
  [
    "Application for a lawful development certificate for a proposed use garage conversion into bedroom",
    "converts a garage into a bedroom",
  ],
  ["Construction of single storey garden room", "builds a garden room"],
  ["Change of use from bank (e) to place of worship (f1)", "proposes no homes"],
];

describe("proposedHomes, on real descriptions", () => {
  const recorded = new Set(RECORDED.map(({ description }) => description));

  it("reads every one of the 126 descriptions PlanIt recorded around NG17 1AA", () => {
    expect(RECORDED).toHaveLength(126);
    expect(RECORDED_HOMES.length + RECORDED_IGNORED.length).toBeGreaterThan(30);
  });

  it.each(RECORDED_HOMES)("%s: %j", (description, expected) => {
    expect(recorded.has(description)).toBe(true);
    expect(proposedHomes(description)).toEqual(expected);
  });

  it.each(RECORDED_IGNORED)("ignores %s, as it %s", (description) => {
    expect(recorded.has(description)).toBe(true);
    expect(proposedHomes(description)).toBeNull();
  });

  it("finds no homes in any other recorded description", () => {
    const proposing = new Set(
      RECORDED_HOMES.map(([description]) => description),
    );
    const others = RECORDED.filter(
      ({ description }) => !proposing.has(description),
    );
    expect(others).toHaveLength(126 - RECORDED_HOMES.length);
    for (const { description, councilType } of others) {
      expect([description, proposedHomes(description, councilType)]).toEqual([
        description,
        null,
      ]);
    }
  });

  it("counts 58 new homes in 18 of them, 8 of those in the 2 refused", () => {
    // Pending: 1 + 1 + 1 + 6; approved: 4 + 6 + 4 + 5 + 4 + 2 + 1 + 2 + 7
    // + 2 + 2 + 2, 50 together. Refused: 3 and 5.
    const counted = RECORDED.flatMap(({ description }) => {
      const found = proposedHomes(description);
      return found?.kind === "counted" ? [found.homes] : [];
    });
    expect(counted.reduce((sum, count) => sum + count, 0)).toBe(58);
    expect(counted).toHaveLength(18);
  });
});

/*
 * The recording has no scheme of more than 7 homes, so the rules for larger
 * ones are checked on descriptions written for these tests, worded as
 * councils word them.
 */
describe("proposedHomes, on written descriptions", () => {
  it.each([
    ["Erection of 86 dwellings with associated infrastructure", 86],
    ["Erection of up to 300 new dwellings", 300],
    ["Construction of 4 new houses", 4],
    ["Erection of 6 proposed semi-detached dwellings", 6],
    ["Erection of 2 studio flats", 2],
    [
      "Outline planning application for residential development of up to 300 dwellings (all matters reserved except access)",
      300,
    ],
    [
      "Outline application for residential development up to 24 units with all matters to be reserved",
      24,
    ],
    ["Erection of 1,200 dwellings, a primary school and a local centre", 1200],
    ["Erection of 50 houses and 20 apartments", 70],
    ["Erection of 86 dwellings comprising 50 houses and 36 apartments", 86],
    [
      "Outline application for the erection of up to 70 residential units (including 21 affordable units) with associated parking",
      70,
    ],
    ["Demolition of 2 houses and erection of 6 dwellings", 6],
    ["Conversion of dwelling into 2 flats", 2],
    ["Erection of a pair of semi-detached houses", 2],
    ["Erection of 2 x 3 bed dwellings", 2],
    ["Erection of 12 one and two bedroom flats", 12],
    ["Erection of twenty-four affordable homes", 24],
    ["Erection of detached dwelling and garage", 1],
    ["Erection of a bungalow", 1],
    ["Change of use from 2 flats to a single dwelling", 1],
    ["Erection of 3 dwellings (plots 1-3)", 3],
    ["Erection of 4 dwellings to rear of existing dwelling", 4],
    ["Conversion of barn to form dwelling", 1],
    ["Change of use from house in multiple occupation (hmo) to 3 flats", 3],
    ["Erection of 10 dwellings; demolition of 2 houses", 10],
    // A dwelling named alone is 1, whatever its plot's number.
    ["Erection of dwelling on plot 3", 1],
  ])("%s: %d", (description, count) => {
    expect(proposedHomes(description)).toEqual(homes(count));
  });

  it.each([
    "Erection of dwellings",
    "Residential development with associated access",
    "Outline application for housing",
  ])("can't count %s", (description) => {
    expect(proposedHomes(description)).toEqual(UNSTATED);
  });

  it.each([
    "Erection of two storey rear extension to dwelling",
    "Erection of replacement dwelling",
    "Demolition of existing bungalow and erection of replacement dwelling",
    "Erection of 60 bed care home",
    "Erection of house extension",
    "Change of use of dwelling to house in multiple occupation",
    "Erection of 4 industrial units",
    "Erection of 3 storey office building",
    "Approval of reserved matters for 86 dwellings",
    "Variation of condition 2 (approved plans) of planning permission v/2020/0123 for 10 dwellings",
    "Discharge of conditions 3 and 4 of planning permission for 120 dwellings",
    "Installation of 2 flat roof dormers",
    "Rear extension to 2 dwellings",
  ])("finds no new homes in %s", (description) => {
    expect(proposedHomes(description)).toBeNull();
  });

  it("ignores an application whose council type settles another's details", () => {
    expect(
      proposedHomes("Erection of 86 dwellings", "Reserved Matters"),
    ).toBeNull();
    expect(
      proposedHomes("Erection of 86 dwellings", "Listed Building Consent"),
    ).toBeNull();
    expect(proposedHomes("Erection of 86 dwellings", "Full Planning")).toEqual(
      homes(86),
    );
  });

  it("is the same every time for the same description (FR-3.6)", () => {
    const description = "Erection of 86 dwellings comprising 50 houses";
    expect(proposedHomes(description)).toEqual(proposedHomes(description));
  });
});

describe("words", () => {
  it("writes numbers as digits, drops 'no.', and ends sentences", () => {
    expect(
      words(
        "Demolition of existing dwelling and construction of 4no. SemI detached dwellings. Twenty-one flats",
      ),
    ).toEqual([
      "demolition",
      "of",
      "existing",
      "dwelling",
      "and",
      "construction",
      "of",
      "4",
      "semi",
      "detached",
      "dwellings",
      ".",
      "21",
      "flats",
    ]);
  });

  it("keeps a stop inside a word or number in the sentence", () => {
    expect(words("Tpo refno.214 - fell 1.5m tree")).toEqual([
      "tpo",
      "refno",
      "214",
      "fell",
      "1",
      "5m",
      "tree",
    ]);
  });
});
