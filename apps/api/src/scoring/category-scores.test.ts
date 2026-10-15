import { describe, expect, it } from "vitest";

import {
  AMENITY_TYPES,
  GREEN_SPACE_TYPES,
  PLANNING_APPLICATION_STATUSES,
  type EstimatedHousing,
  type AmenityFeature,
  type AmenityStatistics,
  type AmenityType,
  type Competitors,
  type CrimeStatistics,
  type DemographicsStatistics,
  type GreenSpaceStatistics,
  type NearestSchool,
  type OfstedInspection,
  type PlanningApplicationStatistics,
  type PlanningApplications,
  type PlanningConstraintFeature,
  type PlanningConstraintType,
  type PropertyStatistics,
  type SchoolStatistics,
  type SearchArea,
  type TransportStatistics,
} from "@location-scout/shared";

import { floodZoneId } from "../sources/planning-data";
import {
  cappedPoints,
  competitorsAmong,
  fallingPoints,
  scoreAmenities,
  scoreCompetition,
  scoreDemand,
  scoreDevelopmentActivity,
  scoreFootfall,
  scoreGreenSpace,
  scorePlanningFreedom,
  scorePropertyActivity,
  scoreSafety,
  scoreSchools,
  scoreTransport,
} from "./category-scores";
import { SCORING_CONFIG } from "./config";

const location = { lat: 53.123664, lng: -1.264078 };

/** A Search Area of 1 km², so crimes per km² are simply crimes. */
const ONE_KM2: SearchArea = {
  location,
  searchRadius: { miles: 0.5, metres: 1000 / Math.sqrt(Math.PI) },
};

/** NG17 1AA's 0.5 mile Search Area: 2.03 km². */
const HALF_MILE: SearchArea = {
  location,
  searchRadius: { miles: 0.5, metres: 804.672 },
};

/** 1,000 residents, so a rate per 1,000 residents is simply a count. */
const THOUSAND_RESIDENTS = 1_000;

/** NG17 1AA's 0.5 mile Search Area's residents, as the prepared fixture estimates them. */
const NG17_RESIDENTS = 9_052;

/** No estimate of the Search Area's residents: the Demographics Layer isn't `ok`. */
const NO_RESIDENTS = null;

/** Crimes in the last 12 months, `change` per cent on the 12 before. */
const crimes = (
  last12Months: number,
  change: number | null = null,
  missingMonths: string[] = [],
): CrimeStatistics => ({
  month: "2026-08",
  total: 0,
  byCategory: [],
  trend: {
    last12Months: { from: "2025-09", to: "2026-08" },
    previous12Months: { from: "2024-09", to: "2025-08" },
    complete: missingMonths.length === 0,
    missingMonths,
    total: { last12Months, previous12Months: 0, change },
    byCategory: [],
  },
});

const amenities = (
  counts: Partial<Record<string, number>>,
): AmenityStatistics => {
  const byType = AMENITY_TYPES.map((type) => ({
    type,
    count: counts[type] ?? 0,
    nearest: null,
  }));
  return {
    total: byType.reduce((sum, { count }) => sum + count, 0),
    byType,
  };
};

const transport = (
  stationMetres: number | null,
  busStops: number,
): TransportStatistics => ({
  facilities: [
    { type: "railway-station", count: 0 },
    { type: "bus-stop", count: busStops },
    { type: "car-park", count: 3 },
    { type: "ev-charger", count: 1 },
  ],
  routes: [],
  nearestStation:
    stationMetres === null
      ? null
      : {
          id: "node/1",
          name: "Sutton Parkway",
          distanceMetres: stationMetres,
          inSearchArea: false,
        },
  stationSearchMetres: 5_000,
});

const greenSpace = (
  parkMetres: number | null,
  total: number,
): GreenSpaceStatistics => ({
  total,
  byType: GREEN_SPACE_TYPES.map((type) => ({ type, count: 0 })),
  nearestPark:
    parkMetres === null
      ? null
      : {
          id: "way/1",
          name: null,
          distanceMetres: parkMetres,
          inSearchArea: true,
          coversLocation: parkMetres === 0,
        },
  parkSearchMetres: 2_000,
});

const sales = (count: number): PropertyStatistics => {
  const change = {
    period: { from: "2024-10-08", to: "2025-10-07" },
    prices: null,
    change: null,
  };
  return {
    period: { from: "2025-10-08", to: "2026-10-07" },
    all: { count, median: null, mean: null },
    byType: [],
    byTenure: [],
    byNewBuild: [],
    medianChange: { twelveMonths: change, fiveYears: change },
    postcodes: { searched: 100, limit: 100, truncated: true, reachMetres: 430 },
  };
};

/** A Planning Constraint of `type`, which the Location is inside unless `outside`. */
const constraint = (
  type: PlanningConstraintType,
  { id = `${type}-1`, outside = false } = {},
): PlanningConstraintFeature => ({
  id,
  location,
  distanceMetres: outside ? 200 : 0,
  type,
  name: type,
  grade: null,
  coversLocation: !outside,
  shape: null,
});

const floodZone = (zone: string) =>
  constraint("flood-zone", { id: floodZoneId(zone) });

const pointsOf = (scored: { breakdown: { input: string; points: number }[] }) =>
  Object.fromEntries(
    scored.breakdown.map(({ input, points }) => [input, points]),
  );

describe("fallingPoints", () => {
  const rule = { full: 800, zero: 5_000, points: 60 };

  it.each([
    [0, 60],
    [800, 60],
    [800.1, 60 * (4_199.9 / 4_200)],
    [2_900, 30],
    [4_999, 60 / 4_200],
    [5_000, 0],
    [12_000, 0],
  ])("gives %d the points %d", (value, points) => {
    expect(fallingPoints(value, rule)).toBeCloseTo(points, 10);
  });
});

describe("cappedPoints", () => {
  const rule = { cap: 10, points: 40 };

  it.each([
    [0, 0],
    [1, 4],
    [5, 20],
    [10, 40],
    [11, 40],
    [58, 40],
  ])("gives %d the points %d", (count, points) => {
    expect(cappedPoints(count, rule)).toBe(points);
  });
});

describe("scoreSafety", () => {
  it("gives 90 at 30 crimes a year per 1,000 residents or fewer", () => {
    const at = (count: number) =>
      scoreSafety(crimes(count), ONE_KM2, THOUSAND_RESIDENTS).score;

    expect(at(0)).toBe(90);
    expect(at(29)).toBe(90);
    expect(at(30)).toBe(90);
  });

  it("falls in proportion to 0 at 200 per 1,000 residents", () => {
    const at = (count: number) =>
      scoreSafety(crimes(count), ONE_KM2, THOUSAND_RESIDENTS).score;

    expect(at(31)).toBe(89);
    expect(at(115)).toBe(45);
    expect(at(199)).toBe(1);
    expect(at(200)).toBe(0);
    expect(at(1_000)).toBe(0);
  });

  it("counts crimes per 1,000 of the Search Area's estimated residents, whatever its size", () => {
    // NG17 1AA: 2,024 crimes for 9,052 residents, 223.6 per 1,000.
    const scored = scoreSafety(crimes(2_024, 5.9), HALF_MILE, NG17_RESIDENTS);

    expect(scored.score).toBe(0);
    expect(scored.breakdown[0]).toEqual({
      input: "Crimes a year per 1,000 residents",
      value: 223.6,
      unit: "per 1,000 residents",
      rule: "30 or fewer: 90 points, falling in proportion to 0 at 200 or more. From 2,024 crimes in the last 12 months for the Search Area's estimated 9,052 residents.",
      points: 0,
    });
    // 905 crimes for 9,052 residents is 100 per 1,000, as in a Search Area of any size.
    expect(scoreSafety(crimes(905), HALF_MILE, NG17_RESIDENTS).score).toBe(53);
    expect(scoreSafety(crimes(100), ONE_KM2, THOUSAND_RESIDENTS).score).toBe(
      53,
    );
  });

  it("follows the thresholds in the config", () => {
    const strict = {
      ...SCORING_CONFIG,
      safety: {
        ratePerThousand: { full: 10, zero: 50, points: 80 },
        trend: { percent: 10, points: 10 },
      },
    };

    // (50 − 30) ÷ 40 × 80 = 40.
    expect(
      scoreSafety(crimes(30), ONE_KM2, THOUSAND_RESIDENTS, strict).score,
    ).toBe(40);
  });

  it("without an estimate of the residents, gives 90 at 30 crimes a year per 1,000 residents, taken as 120 per km², or fewer", () => {
    expect(scoreSafety(crimes(0), ONE_KM2, NO_RESIDENTS).score).toBe(90);
    expect(scoreSafety(crimes(119), ONE_KM2, NO_RESIDENTS).score).toBe(90);
    expect(scoreSafety(crimes(120), ONE_KM2, NO_RESIDENTS).score).toBe(90);
  });

  it("without an estimate of the residents, falls in proportion to 0 at 200 per 1,000 residents, taken as 800 per km²", () => {
    expect(scoreSafety(crimes(121), ONE_KM2, NO_RESIDENTS).score).toBe(90);
    expect(scoreSafety(crimes(460), ONE_KM2, NO_RESIDENTS).score).toBe(45);
    expect(scoreSafety(crimes(799), ONE_KM2, NO_RESIDENTS).score).toBe(0);
    expect(scoreSafety(crimes(800), ONE_KM2, NO_RESIDENTS).score).toBe(0);
    expect(scoreSafety(crimes(5_000), ONE_KM2, NO_RESIDENTS).score).toBe(0);
  });

  it("without an estimate of the residents, counts crimes per km² of the Search Area, and says so", () => {
    // NG17 1AA: 2,024 crimes in 2.03 km², about 995 per km².
    const scored = scoreSafety(crimes(2_024, 5.9), HALF_MILE, NO_RESIDENTS);

    expect(scored.score).toBe(0);
    expect(scored.breakdown[0]).toEqual({
      input: "Crimes a year per km²",
      value: 995,
      unit: "per km²",
      rule: "120 or fewer: 90 points, falling in proportion to 0 at 800 or more. That is 30 and 200 per 1,000 residents, taking 4,000 residents per km², as the Demographics Layer has no estimate of the Search Area's residents. From 2,024 crimes in the last 12 months over the Search Area's 2.03 km².",
      points: 0,
    });
  });

  it("adds 10 points for a fall of more than 10%, and takes 10 for a rise of more than 10%", () => {
    const at = (change: number | null) =>
      pointsOf(scoreSafety(crimes(460, change), ONE_KM2, NO_RESIDENTS))[
        "Year-on-year change in crime"
      ];

    expect(at(-50)).toBe(10);
    expect(at(-10.1)).toBe(10);
    expect(at(-10)).toBe(0);
    expect(at(0)).toBe(0);
    expect(at(10)).toBe(0);
    expect(at(10.1)).toBe(-10);
    expect(at(80)).toBe(-10);
    expect(scoreSafety(crimes(460, -10.1), ONE_KM2, NO_RESIDENTS).score).toBe(
      55,
    );
    expect(scoreSafety(crimes(460, 10.1), ONE_KM2, NO_RESIDENTS).score).toBe(
      35,
    );
  });

  it("reaches 100 with few crimes and a fall, and is kept at 0 with many and a rise", () => {
    expect(scoreSafety(crimes(100, -20), ONE_KM2, NO_RESIDENTS).score).toBe(
      100,
    );

    const worst = scoreSafety(crimes(900, 20), ONE_KM2, NO_RESIDENTS);
    expect(worst.score).toBe(0);
    expect(worst.breakdown.at(-1)).toEqual({
      input: "Kept between 0 and 100",
      value: null,
      unit: null,
      rule: "A Category Score is never below 0 or above 100.",
      points: 10,
    });
  });

  it("gives no points for the change, and says why, when there is none to compare", () => {
    const noneBefore = scoreSafety(crimes(460, null), ONE_KM2, NO_RESIDENTS);
    const incomplete = scoreSafety(
      crimes(460, null, ["2024-10", "2025-01"]),
      ONE_KM2,
      NO_RESIDENTS,
    );

    expect(noneBefore.breakdown[1]).toMatchObject({ value: null, points: 0 });
    expect(noneBefore.breakdown[1]?.rule).toContain(
      "There were no crimes in the 12 months before to compare with.",
    );
    expect(incomplete.breakdown[1]?.rule).toContain(
      "Some months are missing, so there is no change to compare.",
    );
  });

  it("counts per km² for a Search Area estimated to have no residents", () => {
    expect(scoreSafety(crimes(460), ONE_KM2, 0).breakdown[0]).toMatchObject({
      value: 460,
      unit: "per km²",
      points: 45,
    });
  });

  it("scales the months data.police.uk answered for up to a year, if some of the last 12 are missing", () => {
    // 345 crimes in 9 months is 460 a year.
    const scored = scoreSafety(
      crimes(345, null, ["2025-01", "2025-10", "2026-02", "2026-08"]),
      ONE_KM2,
      NO_RESIDENTS,
    );

    expect(scored.score).toBe(45);
    expect(scored.breakdown[0]?.value).toBe(460);
    expect(scored.breakdown[0]?.rule).toContain(
      "scaled up to a year from the 9 months data.police.uk answered for",
    );
    // So too per 1,000 residents.
    expect(
      scoreSafety(
        crimes(75, null, ["2025-01", "2025-10", "2026-02", "2026-08"]),
        ONE_KM2,
        THOUSAND_RESIDENTS,
      ).breakdown[0]?.value,
    ).toBe(100);
  });
});

describe("scoreAmenities", () => {
  it("gives 70 points for every type present and 30 for 100 amenities", () => {
    const every = Object.fromEntries(AMENITY_TYPES.map((type) => [type, 8]));
    const scored = scoreAmenities(amenities(every));

    expect(scored.score).toBe(100);
    expect(scored.breakdown).toEqual([
      {
        input: "Types of amenity in the Search Area",
        value: 13,
        unit: "of 13",
        rule: "70 points shared over the 13 types: 5.38 points for each type present.",
        points: 70,
      },
      {
        input: "Amenities in the Search Area",
        value: 104,
        unit: null,
        rule: "0.3 points each, up to 100 amenities: 30 points.",
        points: 30,
      },
    ]);
  });

  it("gives 0 for none", () => {
    expect(scoreAmenities(amenities({})).score).toBe(0);
  });

  it("shares the type coverage's points out over the types present", () => {
    expect(pointsOf(scoreAmenities(amenities({ cafe: 1 })))).toEqual({
      "Types of amenity in the Search Area": 5.4,
      "Amenities in the Search Area": 0.3,
    });
    expect(
      scoreAmenities(amenities({ cafe: 25, pub: 25, shop: 25, office: 25 }))
        .score,
    ).toBe(52);
  });

  it("counts amenities only up to 100", () => {
    const points = (total: number) =>
      pointsOf(scoreAmenities(amenities({ shop: total })))[
        "Amenities in the Search Area"
      ];

    expect(points(99)).toBe(29.7);
    expect(points(100)).toBe(30);
    expect(points(197)).toBe(30);
  });
});

describe("scoreSchools", () => {
  const graded = (
    overrides: Partial<OfstedInspection> = {},
  ): OfstedInspection => ({
    kind: "graded",
    inspectedOn: "2022-03-08",
    grades: [],
    safeguardingMet: true,
    outcome: null,
    ofPredecessor: false,
    ...overrides,
  });
  const school = (
    phase: "primary" | "secondary",
    distanceMetres: number,
    judged: Pick<NearestSchool, "judgement" | "inspection"> = {
      judgement: "good",
      inspection: graded(),
    },
  ): NearestSchool => ({
    id: phase,
    name: `The ${phase} school`,
    phase,
    distanceMetres,
    inSearchArea: distanceMetres <= 805,
    ...judged,
  });
  const statistics = (
    primary: NearestSchool | null,
    secondary: NearestSchool | null,
  ): SchoolStatistics => ({
    total: 0,
    byPhase: [],
    byJudgement: [],
    nearestPrimary: primary,
    primarySearchMetres: 2_400,
    nearestSecondary: secondary,
    secondarySearchMetres: 6_000,
  });
  const primaryPoints = (metres: number) =>
    pointsOf(scoreSchools(statistics(school("primary", metres), null)))[
      "Distance to the nearest primary school"
    ];
  const secondaryPoints = (metres: number) =>
    pointsOf(scoreSchools(statistics(null, school("secondary", metres))))[
      "Distance to the nearest secondary school"
    ];
  const judgementPoints = (
    judged: Pick<NearestSchool, "judgement" | "inspection">,
  ) =>
    pointsOf(scoreSchools(statistics(school("primary", 300, judged), null)))[
      "Latest Ofsted judgement of the nearest primary school"
    ];

  it("gives 40 points for a primary school 800 m away or nearer, falling in proportion to 0 at three times that, 2.4 km", () => {
    expect(primaryPoints(0)).toBe(40);
    expect(primaryPoints(800)).toBe(40);
    expect(primaryPoints(801)).toBe(40);
    expect(primaryPoints(1_600)).toBe(20);
    expect(primaryPoints(2_399)).toBe(0);
    expect(primaryPoints(2_400)).toBe(0);
  });

  it("gives 25 points for a secondary school 2 km away or nearer, falling in proportion to 0 at 6 km", () => {
    expect(secondaryPoints(2_000)).toBe(25);
    expect(secondaryPoints(2_100)).toBe(24.4);
    expect(secondaryPoints(4_000)).toBe(12.5);
    expect(secondaryPoints(6_000)).toBe(0);
  });

  it("gives up to 17.5 points, half of 35, for each school's overall Ofsted grade", () => {
    expect(
      judgementPoints({ judgement: "outstanding", inspection: graded() }),
    ).toBe(17.5);
    // 75% of 17.5.
    expect(judgementPoints({ judgement: "good", inspection: graded() })).toBe(
      13.1,
    );
    expect(
      judgementPoints({
        judgement: "requires-improvement",
        inspection: graded(),
      }),
    ).toBe(4.4);
    expect(
      judgementPoints({ judgement: "inadequate", inspection: graded() }),
    ).toBe(0);
    // An ungraded inspection that says the school keeps its grade.
    expect(
      judgementPoints({
        judgement: "good",
        inspection: graded({
          kind: "ungraded",
          outcome: "School remains Good",
          safeguardingMet: null,
        }),
      }),
    ).toBe(13.1);
  });

  it("scores a report card, which has no overall grade, by the mean of the areas it graded", () => {
    const reportCard = graded({
      kind: "report-card",
      inspectedOn: "2026-04-21",
      grades: [
        { area: "Inclusion", grade: "exceptional" },
        { area: "Achievement", grade: "expected-standard" },
      ],
    });
    // (100% + 75%) ÷ 2 = 87.5% of 17.5 points.
    expect(
      judgementPoints({ judgement: "report-card", inspection: reportCard }),
    ).toBe(15.3);
    const [, judged] = scoreSchools(
      statistics(
        school("primary", 300, {
          judgement: "report-card",
          inspection: reportCard,
        }),
        null,
      ),
    ).breakdown;
    expect(judged).toEqual({
      input: "Latest Ofsted judgement of the nearest primary school",
      value: 87.5,
      unit: "% share",
      rule: "Up to 17.5 points, in proportion to its share. An overall grade earns Outstanding 100%, Good 75%, Requires improvement 25%, Inadequate 0%. Without one, the mean of the areas graded counts, a report card's Exceptional 100%, Strong standard 90%, Expected standard 75%, Needs attention 25%, Urgent improvement 0%. Safeguarding not found effective earns 0%. The primary school: No overall grade, so the mean of the 2 areas graded in its report card of 21 April 2026.",
      points: 15.3,
    });
  });

  it("scores a graded inspection with no overall grade by the mean of its key judgements", () => {
    expect(
      judgementPoints({
        judgement: "no-overall-grade",
        inspection: graded({
          inspectedOn: "2025-01-28",
          grades: [
            { area: "Quality of education", grade: "outstanding" },
            { area: "Behaviour and attitudes", grade: "good" },
          ],
        }),
      }),
    ).toBe(15.3);
  });

  it("gives nothing for safeguarding not found effective, an inspection with no grade, or none", () => {
    expect(
      judgementPoints({
        judgement: "good",
        inspection: graded({ safeguardingMet: false }),
      }),
    ).toBe(0);
    expect(
      judgementPoints({
        judgement: "no-overall-grade",
        inspection: graded({
          kind: "ungraded",
          outcome: "Standards maintained",
          safeguardingMet: null,
        }),
      }),
    ).toBe(0);
    expect(judgementPoints({ judgement: "none", inspection: null })).toBe(0);
    const [, unmet] = scoreSchools(
      statistics(
        school("primary", 300, {
          judgement: "report-card",
          inspection: graded({ kind: "report-card", safeguardingMet: false }),
        }),
        null,
      ),
    ).breakdown;
    expect(unmet?.rule).toMatch(
      /The primary school: Its report card of 8 March 2022 found safeguarding standards not met\.$/,
    );
  });

  it("gives no points, and says so, with no primary school within 2.4 km or secondary within 6 km", () => {
    expect(scoreSchools(statistics(null, null))).toEqual({
      score: 0,
      breakdown: [
        {
          input: "Distance to the nearest primary school",
          value: null,
          unit: "m",
          rule: "800 m or less: 40 points, falling in proportion to 0 at 2.4 km or more. There is none within 2.4 km.",
          points: 0,
        },
        {
          input: "Latest Ofsted judgement of the nearest primary school",
          value: null,
          unit: "% share",
          rule: expect.stringMatching(
            /There is none within 2\.4 km\.$/,
          ) as string,
          points: 0,
        },
        {
          input: "Distance to the nearest secondary school",
          value: null,
          unit: "m",
          rule: "2 km or less: 25 points, falling in proportion to 0 at 6 km or more. There is none within 6 km.",
          points: 0,
        },
        {
          input: "Latest Ofsted judgement of the nearest secondary school",
          value: null,
          unit: "% share",
          rule: expect.stringMatching(/There is none within 6 km\.$/) as string,
          points: 0,
        },
      ],
    });
  });

  it("adds the four, to 100 for an Outstanding primary and secondary school near enough", () => {
    const outstanding = {
      judgement: "outstanding" as const,
      inspection: graded(),
    };
    expect(
      scoreSchools(
        statistics(
          school("primary", 800, outstanding),
          school("secondary", 2_000, outstanding),
        ),
      ).score,
    ).toBe(100);
    // 40 + 13.125 for a Good primary 500 m away, and 12.5 + 13.125 for a Good
    // secondary 4 km away.
    expect(
      scoreSchools(
        statistics(school("primary", 500), school("secondary", 4_000)),
      ).score,
    ).toBe(79);
  });
});

describe("scoreTransport", () => {
  const stationPoints = (metres: number | null) =>
    pointsOf(scoreTransport(transport(metres, 0)))[
      "Distance to the nearest railway station"
    ];
  const busStopPoints = (count: number) =>
    pointsOf(scoreTransport(transport(null, count)))[
      "Bus stops in the Search Area"
    ];

  it("gives 60 points for a station 800 m away or nearer, falling in proportion to 0 at 5 km", () => {
    expect(stationPoints(0)).toBe(60);
    expect(stationPoints(800)).toBe(60);
    expect(stationPoints(1_628)).toBe(48.2);
    expect(stationPoints(2_900)).toBe(30);
    expect(stationPoints(5_000)).toBe(0);
  });

  it("gives no points, and says so, with no station within 5 km", () => {
    const [station] = scoreTransport(transport(null, 0)).breakdown;

    expect(station).toEqual({
      input: "Distance to the nearest railway station",
      value: null,
      unit: "m",
      rule: "800 m or less: 60 points, falling in proportion to 0 at 5 km or more. There is none within 5 km.",
      points: 0,
    });
  });

  it("gives 4 points a bus stop, up to 10", () => {
    expect(busStopPoints(0)).toBe(0);
    expect(busStopPoints(1)).toBe(4);
    expect(busStopPoints(9)).toBe(36);
    expect(busStopPoints(10)).toBe(40);
    expect(busStopPoints(58)).toBe(40);
  });

  it("adds the two", () => {
    expect(scoreTransport(transport(800, 10)).score).toBe(100);
    expect(scoreTransport(transport(1_628, 58)).score).toBe(88);
    expect(scoreTransport(transport(null, 0)).score).toBe(0);
  });
});

describe("scoreGreenSpace", () => {
  const parkPoints = (metres: number | null) =>
    pointsOf(scoreGreenSpace(greenSpace(metres, 0)))[
      "Distance to the nearest park"
    ];
  const countPoints = (count: number) =>
    pointsOf(scoreGreenSpace(greenSpace(null, count)))[
      "Green spaces in the Search Area"
    ];

  it("gives 70 points for a park 300 m away or nearer, falling in proportion to 0 at 2 km", () => {
    expect(parkPoints(0)).toBe(70);
    expect(parkPoints(300)).toBe(70);
    expect(parkPoints(1_150)).toBe(35);
    expect(parkPoints(1_999)).toBe(0);
    expect(parkPoints(2_000)).toBe(0);
  });

  it("gives no points, and says so, with no park within 2 km", () => {
    expect(parkPoints(null)).toBe(0);
    expect(scoreGreenSpace(greenSpace(null, 0)).breakdown[0]?.rule).toBe(
      "300 m or less: 70 points, falling in proportion to 0 at 2 km or more. There is none within 2 km.",
    );
  });

  it("gives 3 points a green space, up to 10", () => {
    expect(countPoints(0)).toBe(0);
    expect(countPoints(3)).toBe(9);
    expect(countPoints(10)).toBe(30);
    expect(countPoints(13)).toBe(30);
  });

  it("adds the two", () => {
    expect(scoreGreenSpace(greenSpace(104, 13)).score).toBe(100);
    expect(scoreGreenSpace(greenSpace(1_150, 5)).score).toBe(50);
  });
});

describe("scorePropertyActivity", () => {
  // 100 points at 60 sales, tuned from PRD §6.4's 100 on 20 real Locations.
  it.each([
    [0, 0],
    [1, 2],
    [24, 40],
    [59, 98],
    [60, 100],
    [250, 100],
  ])("gives %d sales in 12 months the score %d", (count, score) => {
    expect(scorePropertyActivity(sales(count)).score).toBe(score);
  });

  it("says it measures how active the market is, not its quality", () => {
    expect(scorePropertyActivity(sales(24)).breakdown).toEqual([
      {
        input: "Sales in the last 12 months",
        value: 24,
        unit: null,
        rule: "1.67 points each, up to 60 sales: 100 points. This measures how active the market is, not its quality.",
        points: 40,
      },
    ]);
  });
});

describe("scorePlanningFreedom", () => {
  it("gives 100 with no Planning Constraint over the Location", () => {
    expect(scorePlanningFreedom([]).score).toBe(100);
    expect(
      scorePlanningFreedom([
        constraint("conservation-area", { outside: true }),
        constraint("listed-building", { outside: true }),
      ]).score,
    ).toBe(100);
  });

  it.each([
    ["conservation-area", 80],
    ["listed-building", 80],
    ["article-4-direction", 85],
    ["tree-preservation-zone", 95],
  ] as const)(
    "takes its penalty off for a %s over the Location",
    (type, score) => {
      expect(scorePlanningFreedom([constraint(type)]).score).toBe(score);
    },
  );

  it("takes 40 off for flood zone 3 and 20 for flood zone 2, counting only the highest", () => {
    expect(scorePlanningFreedom([floodZone("3")]).score).toBe(60);
    expect(scorePlanningFreedom([floodZone("2")]).score).toBe(80);
    expect(scorePlanningFreedom([floodZone("2"), floodZone("3")]).score).toBe(
      60,
    );
  });

  it("takes each type's penalty once, however many there are", () => {
    expect(
      scorePlanningFreedom([
        constraint("conservation-area", { id: "1" }),
        constraint("conservation-area", { id: "2" }),
      ]).score,
    ).toBe(80);
  });

  it("gives 0 with every type over the Location", () => {
    const scored = scorePlanningFreedom([
      floodZone("3"),
      floodZone("2"),
      constraint("conservation-area"),
      constraint("listed-building"),
      constraint("article-4-direction"),
      constraint("tree-preservation-zone"),
    ]);

    expect(scored.score).toBe(0);
    expect(scored.breakdown).toEqual([
      {
        input: "Starting score",
        value: null,
        unit: null,
        rule: "100 points, less a penalty for each type of Planning Constraint the Location is inside.",
        points: 100,
      },
      {
        input: "Flood zone the Location is inside",
        value: 3,
        unit: null,
        rule: "Zone 3: −40 points. Zone 2: −20 points. Only the highest counts.",
        points: -40,
      },
      {
        input: "Location inside a conservation area",
        value: true,
        unit: null,
        rule: "−20 points if so.",
        points: -20,
      },
      {
        input: "Location inside a listed building",
        value: true,
        unit: null,
        rule: "−20 points if so.",
        points: -20,
      },
      {
        input: "Location inside an Article 4 direction",
        value: true,
        unit: null,
        rule: "−15 points if so.",
        points: -15,
      },
      {
        input: "Location inside a tree preservation zone",
        value: true,
        unit: null,
        rule: "−5 points if so.",
        points: -5,
      },
    ]);
  });

  it("is kept at 0 if the penalties come to more than 100", () => {
    const harsh = {
      ...SCORING_CONFIG,
      planningFreedom: {
        ...SCORING_CONFIG.planningFreedom,
        floodZones: [{ zone: "3", penalty: 90 }],
      },
    };
    const scored = scorePlanningFreedom(
      [floodZone("3"), constraint("conservation-area")],
      harsh,
    );

    expect(scored.score).toBe(0);
    expect(scored.breakdown.at(-1)).toMatchObject({
      input: "Kept between 0 and 100",
      points: 10,
    });
  });
});

/** An amenity of `type`, made so by `osmTag`, `metres` from the Location. */
const amenity = (
  type: AmenityType,
  osmTag: string,
  metres: number,
  id = `${osmTag}@${String(metres)}`,
): AmenityFeature => ({
  id,
  location,
  distanceMetres: metres,
  type,
  name: null,
  osmTag,
});

const cafe = (metres: number, id?: string) =>
  amenity("cafe", "amenity=cafe", metres, id);

/** `count` cafés, 500 m away: none near enough to cost points. */
const cafes = (count: number) =>
  Array.from({ length: count }, (_, at) => cafe(500, `node/${String(at)}`));

const CAFES: Competitors = {
  name: "cafés",
  tags: [{ key: "amenity", values: ["cafe"] }],
};
const SHOPS: Competitors = {
  name: "shops",
  tags: [{ key: "shop", values: null }],
};

describe("scoreCompetition", () => {
  it("gives 100 with no competitors, and says there are none", () => {
    const scored = scoreCompetition([], CAFES, HALF_MILE, NG17_RESIDENTS);

    expect(scored.score).toBe(100);
    expect(scored.breakdown).toEqual([
      {
        input: "Competitors (cafés) per 1,000 residents",
        value: 0,
        unit: "per 1,000 residents",
        rule: "0 or fewer: 100 points, falling in proportion to 0 at 1 or more. From 0 cafés for the Search Area's estimated 9,052 residents.",
        points: 100,
      },
      {
        input: "Distance to the nearest competitor",
        value: null,
        unit: "m",
        rule: "100 m or nearer: −10 points. There are no cafés in the Search Area.",
        points: 0,
      },
    ]);
  });

  // With no rule of the Scout Mode's own, PRD §6.4's, as a gym, a dental
  // practice and a nursery take.
  it.each([
    [0, 100],
    [1, 75],
    [2, 50],
    [3, 25],
    [4, 0],
    [9, 0],
  ])(
    "falls in proportion to 0 at 1 per 1,000 residents: %i for 4,000 residents gives %i",
    (count, score) => {
      expect(
        scoreCompetition(cafes(count), CAFES, HALF_MILE, 4_000).score,
      ).toBe(score);
    },
  );

  it("counts competitors per 1,000 of the Search Area's estimated residents", () => {
    // NG17 1AA's 11 cafés for 9,052 residents: 1.2 per 1,000.
    const busy = scoreCompetition(cafes(11), CAFES, HALF_MILE, NG17_RESIDENTS);
    expect(busy.breakdown[0]).toMatchObject({
      input: "Competitors (cafés) per 1,000 residents",
      value: 1.2,
      unit: "per 1,000 residents",
      points: 0,
    });
    // 5 cafés for 9,052 residents: 0.55 per 1,000, 44.8 points.
    expect(
      scoreCompetition(cafes(5), CAFES, HALF_MILE, NG17_RESIDENTS).score,
    ).toBe(45);
  });

  // Without an estimate of the residents: 1 per 1,000 residents, taken as 4
  // per km² at 4,000 residents per km².
  it.each([
    [1, 75],
    [2, 50],
    [3, 25],
    [4, 0],
    [9, 0],
  ])(
    "without an estimate of the residents, falls in proportion to 0 at 1 per 1,000 residents, taken as 4 per km²: %i a km² gives %i",
    (count, score) => {
      expect(
        scoreCompetition(cafes(count), CAFES, ONE_KM2, NO_RESIDENTS).score,
      ).toBe(score);
    },
  );

  it("without an estimate of the residents, counts competitors per km² of the Search Area, and says so", () => {
    // NG17 1AA's 11 cafés over 2.03 km²: 5.4 a km².
    const busy = scoreCompetition(cafes(11), CAFES, HALF_MILE, NO_RESIDENTS);
    expect(busy.breakdown[0]).toEqual({
      input: "Competitors (cafés) per km²",
      value: 5.4,
      unit: "per km²",
      rule: "0 or fewer: 100 points, falling in proportion to 0 at 4 or more. That is 0 and 1 per 1,000 residents, taking 4,000 residents per km², as the Demographics Layer has no estimate of the Search Area's residents. From 11 cafés over the Search Area's 2.03 km².",
      points: 0,
    });
    // 2 cafés over 2.03 km²: 0.98 a km², (4 − 0.98) ÷ 4 × 100 = 75.4.
    expect(
      scoreCompetition(cafes(2), CAFES, HALF_MILE, NO_RESIDENTS).score,
    ).toBe(75);
  });

  it("takes 10 off for a competitor 100 m away or nearer, but not 101 m", () => {
    expect(
      scoreCompetition([cafe(100)], CAFES, ONE_KM2, NO_RESIDENTS).score,
    ).toBe(65);
    expect(
      scoreCompetition([cafe(0)], CAFES, ONE_KM2, NO_RESIDENTS).score,
    ).toBe(65);
    expect(
      scoreCompetition([cafe(101)], CAFES, ONE_KM2, NO_RESIDENTS).score,
    ).toBe(75);

    const near = scoreCompetition(
      [cafe(500), cafe(40)],
      CAFES,
      ONE_KM2,
      NO_RESIDENTS,
    );
    expect(near.breakdown[1]).toEqual({
      input: "Distance to the nearest competitor",
      value: 40,
      unit: "m",
      rule: "100 m or nearer: −10 points.",
      points: -10,
    });
    expect(near.score).toBe(40);
  });

  it("is kept at 0 with many competitors and one near", () => {
    const scored = scoreCompetition(
      [...cafes(5), cafe(20)],
      CAFES,
      ONE_KM2,
      NO_RESIDENTS,
    );

    expect(scored.score).toBe(0);
    expect(pointsOf(scored)).toEqual({
      "Competitors (cafés) per km²": 0,
      "Distance to the nearest competitor": -10,
      "Kept between 0 and 100": 10,
    });
  });

  it("counts only the Scout Mode's competitors", () => {
    const features = [
      cafe(300),
      amenity("restaurant", "amenity=restaurant", 50),
      amenity("shop", "shop=bakery", 60),
      amenity("convenience-store", "shop=convenience", 400),
      amenity("hairdresser", "shop=hairdresser", 410),
      amenity("office", "office=estate_agent", 30),
    ];

    expect(competitorsAmong(features, CAFES).map(({ id }) => id)).toEqual([
      "amenity=cafe@300",
    ]);
    // Any shop=*, nearest first.
    expect(
      competitorsAmong(features, SHOPS).map(({ osmTag }) => osmTag),
    ).toEqual(["shop=bakery", "shop=convenience", "shop=hairdresser"]);
    expect(scoreCompetition(features, CAFES, ONE_KM2, NO_RESIDENTS).score).toBe(
      75,
    );
    // Three shops a km², the nearest 60 m away: 25 − 10.
    expect(scoreCompetition(features, SHOPS, ONE_KM2, NO_RESIDENTS).score).toBe(
      15,
    );
  });

  it("follows the thresholds in the config", () => {
    const tolerant = {
      ...SCORING_CONFIG,
      competition: {
        ratePerThousand: { full: 0, zero: 2, points: 100 },
        nearby: { metres: 50, points: 20 },
      },
    };

    // 4 a km² of 8: 50 points; the nearest, 60 m away, is beyond 50 m.
    expect(
      scoreCompetition(
        [...cafes(3), cafe(60)],
        CAFES,
        ONE_KM2,
        NO_RESIDENTS,
        tolerant,
      ).score,
    ).toBe(50);
    expect(
      scoreCompetition(
        [...cafes(3), cafe(50)],
        CAFES,
        ONE_KM2,
        NO_RESIDENTS,
        tolerant,
      ).score,
    ).toBe(30);
    // At 2,000 residents per km², 1 per 1,000 residents is 2 per km².
    expect(
      scoreCompetition(cafes(1), CAFES, ONE_KM2, NO_RESIDENTS, {
        ...SCORING_CONFIG,
        residentsPerKm2: 2_000,
      }).score,
    ).toBe(50);
  });

  it("follows the Scout Mode's own rule when it gives one", () => {
    const ownRule = { full: 0, zero: 3, points: 100 };

    // 6 cafés for 5,000 residents: 1.2 per 1,000, (3 − 1.2) ÷ 3 × 100 = 60.
    const scored = scoreCompetition(
      cafes(6),
      CAFES,
      HALF_MILE,
      5_000,
      SCORING_CONFIG,
      ownRule,
    );
    expect(scored.score).toBe(60);
    expect(scored.breakdown[0]).toEqual({
      input: "Competitors (cafés) per 1,000 residents",
      value: 1.2,
      unit: "per 1,000 residents",
      rule: "0 or fewer: 100 points, falling in proportion to 0 at 3 or more. From 6 cafés for the Search Area's estimated 5,000 residents.",
      points: 60,
    });
    // Without an estimate of the residents, 3 per 1,000 is 12 per km²: 6 a
    // km² gives 50.
    expect(
      scoreCompetition(
        cafes(6),
        CAFES,
        ONE_KM2,
        NO_RESIDENTS,
        SCORING_CONFIG,
        ownRule,
      ).score,
    ).toBe(50);
  });
});

/**
 * The Demographics Layer's statistics: `population` residents, and their
 * MSOAs' average household income `income` against England's median of
 * `median`, or none.
 */
const residents = (
  population: number,
  income: { average: number; median: number } | null = null,
): DemographicsStatistics => ({
  outputAreas: 44,
  population,
  households: Math.round(population / 2.3),
  ageProfile: [],
  medianAge: 40.1,
  householdIncome: income && {
    averagePounds: income.average,
    msoas: 5,
    englandMedianPounds: income.median,
  },
  deprivation: null,
});

/** An income `percent` above (or, negative, below) England's median of £40,000. */
const incomeAbove = (percent: number) => ({
  average: 40_000 * (1 + percent / 100),
  median: 40_000,
});

/** No homes from the Planning Applications. */
const NO_HOUSING: EstimatedHousing = {
  approved: 0,
  pending: 0,
  homes: 0,
  residents: 0,
  applications: 0,
  unstated: 0,
};

/**
 * The Planning Applications' statistics: `minor` minor and `major` major
 * ones, all approved, of which `total` were given, and `housing`.
 */
const applicationStatistics = ({
  minor = 0,
  major = 0,
  total = minor + major,
  housing = NO_HOUSING,
}: {
  minor?: number;
  major?: number;
  total?: number | null;
  housing?: EstimatedHousing;
}): PlanningApplicationStatistics => ({
  count: minor + major,
  total,
  approximate: 0,
  byStatus: PLANNING_APPLICATION_STATUSES.map((status) => ({
    status,
    count: status === "approved" ? minor + major : 0,
  })),
  byType: [
    { type: "householder", count: 0 },
    { type: "minor", count: minor },
    { type: "major", count: major },
  ],
  major: Array.from({ length: major }, (_, i) => `major-${String(i)}`),
  housing,
});

/** The approved and pending applications' homes, `homes` of them, as `estimatedHousing` gives them. */
const housingOf = (homes: number): EstimatedHousing => ({
  ...NO_HOUSING,
  approved: homes,
  homes,
  residents: Math.round(homes * 2.4),
  applications: 1,
});

/** PlanIt's 126 applications around NG17 1AA: 124 minor, 2 major, and 50 homes (planit.test.ts). */
const NG17_APPLICATIONS = applicationStatistics({
  minor: 124,
  major: 2,
  housing: {
    approved: 41,
    pending: 9,
    homes: 50,
    residents: 120,
    applications: 16,
    unstated: 2,
  },
});

describe("scoreDemand", () => {
  it("gives 75 points in proportion to the residents, up to 20,000", () => {
    const at = (population: number) =>
      pointsOf(scoreDemand(residents(population), null))[
        "Estimated residents of the Search Area"
      ];

    expect(at(0)).toBe(0);
    expect(at(2_000)).toBe(7.5);
    expect(at(10_000)).toBe(37.5);
    expect(at(19_999)).toBe(75);
    expect(at(20_000)).toBe(75);
    expect(at(55_000)).toBe(75);
  });

  it("adds up to 10 points as the household income is above the England median, and takes up to 10 as it is below", () => {
    const at = (percent: number) =>
      pointsOf(scoreDemand(residents(10_000, incomeAbove(percent)), null))[
        "Household income against the England median"
      ];

    expect(at(0)).toBe(0);
    expect(at(10)).toBe(5);
    expect(at(20)).toBe(10);
    expect(at(60)).toBe(10);
    expect(at(-5)).toBe(-2.5);
    expect(at(-20)).toBe(-10);
    expect(at(-45)).toBe(-10);
    expect(scoreDemand(residents(10_000, incomeAbove(20)), null).score).toBe(
      48,
    );
    expect(scoreDemand(residents(10_000, incomeAbove(-20)), null).score).toBe(
      28,
    );
  });

  it("adds up to 15 points in proportion to the residents planned housing would bring, up to 1,000", () => {
    const at = (homes: number) =>
      pointsOf(
        scoreDemand(
          residents(10_000),
          applicationStatistics({ housing: housingOf(homes) }),
        ),
      )["Estimated new residents from Planning Applications"];

    expect(at(0)).toBe(0);
    // 100 homes: 240 residents, 15 × 240 ÷ 1,000 = 3.6.
    expect(at(100)).toBe(3.6);
    // 416 homes: 998 residents.
    expect(at(416)).toBe(15);
    // 417 homes: 1,001 residents.
    expect(at(417)).toBe(15);
    expect(at(420)).toBe(15);
    expect(at(2_000)).toBe(15);
    expect(
      scoreDemand(
        residents(10_000),
        applicationStatistics({ housing: housingOf(420) }),
      ).score,
    ).toBe(53);
  });

  it("scores NG17 1AA's 0.5 mile Search Area from the prepared fixture's estimates and PlanIt's applications", () => {
    const scored = scoreDemand(
      residents(NG17_RESIDENTS, { average: 38_890, median: 44_091 }),
      NG17_APPLICATIONS,
    );

    // 75 × 9,052 ÷ 20,000 = 33.9; 11.8% below the median: −5.9; 15 × 120
    // ÷ 1,000 = 1.8.
    expect(scored.score).toBe(30);
    expect(scored.breakdown).toEqual([
      {
        input: "Estimated residents of the Search Area",
        value: 9052,
        unit: null,
        rule: "75 points at 20,000 residents or more, in proportion below. From Census 2021, counting each output area in proportion to the share of it inside the Search Area.",
        points: 33.9,
      },
      {
        input: "Household income against the England median",
        value: -11.8,
        unit: "%",
        rule: "20% or more above the median: +10 points. 20% or more below: −10 points. In proportion between. The Search Area's MSOAs average £38,890 a year, and England's median MSOA £44,091.",
        points: -5.9,
      },
      {
        input: "Estimated new residents from Planning Applications",
        value: 120,
        unit: null,
        rule: "15 points at 1,000 new residents or more, in proportion below. Estimated from the 50 new homes the approved and pending Planning Applications received in the Search Area in the last 3 years propose, at 2.4 residents a home.",
        points: 1.8,
      },
    ]);
  });

  it("gives no points for income, and says why, with no income estimate", () => {
    const scored = scoreDemand(residents(20_000), null);

    expect(scored.score).toBe(75);
    expect(scored.breakdown[1]).toMatchObject({ value: null, points: 0 });
    expect(scored.breakdown[1]?.rule).toContain(
      "There is no income estimate for the Search Area's MSOAs.",
    );
  });

  it("gives no points for planned housing, and says why, without the Planning Applications", () => {
    const scored = scoreDemand(residents(20_000), null);

    expect(scored.breakdown[2]).toMatchObject({
      input: "Estimated new residents from Planning Applications",
      value: null,
      points: 0,
    });
    expect(scored.breakdown[2]?.rule).toContain(
      "The Planning Applications are unavailable, so planned housing gives no points.",
    );
  });

  it("follows the thresholds in the config", () => {
    const config = {
      ...SCORING_CONFIG,
      demand: {
        population: { cap: 5_000, points: 90 },
        income: { percent: 50, points: 10 },
        plannedResidents: { cap: 240, points: 5 },
      },
    };

    // 90 × 2,500 ÷ 5,000 = 45, 10 × 25 ÷ 50 = 5, and 5 × 120 ÷ 240 = 2.5.
    expect(
      scoreDemand(
        residents(2_500, incomeAbove(25)),
        applicationStatistics({ housing: housingOf(50) }),
        config,
      ).score,
    ).toBe(53);
  });

  it("gives the same score for the same estimates", () => {
    const statistics = residents(12_345, incomeAbove(7.5));

    expect(scoreDemand(statistics, NG17_APPLICATIONS)).toEqual(
      scoreDemand(statistics, NG17_APPLICATIONS),
    );
  });
});

/** PlanIt, as the Planning Applications credit it. */
const PLANIT: Pick<PlanningApplications, "provider"> = {
  provider: {
    id: "planit",
    name: "PlanIt",
    url: "https://www.planit.org.uk/",
    note: "Planning Applications come from PlanIt.",
  },
};

describe("scoreDevelopmentActivity", () => {
  const scoreOf = (statistics: PlanningApplicationStatistics) =>
    scoreDevelopmentActivity({ ...PLANIT, statistics });

  // 100 points at a weighted count of 250, tuned from PRD §6.4's 100 on 20
  // real Locations.
  it("gives 0.4 points an application, up to 100 at 250", () => {
    expect(scoreOf(applicationStatistics({})).score).toBe(0);
    expect(scoreOf(applicationStatistics({ minor: 1 })).score).toBe(0);
    expect(scoreOf(applicationStatistics({ minor: 50 })).score).toBe(20);
    expect(scoreOf(applicationStatistics({ minor: 100 })).score).toBe(40);
    expect(scoreOf(applicationStatistics({ minor: 247 })).score).toBe(99);
    expect(scoreOf(applicationStatistics({ minor: 250 })).score).toBe(100);
    expect(scoreOf(applicationStatistics({ minor: 251 })).score).toBe(100);
  });

  it("counts a major application 5 times", () => {
    const scored = scoreOf(applicationStatistics({ minor: 10, major: 3 }));

    expect(pointsOf(scored)).toEqual({
      "Major Planning Applications in the Search Area in the last 3 years": 6,
      "Other Planning Applications in the Search Area in the last 3 years": 4,
    });
    expect(scored.score).toBe(10);
    // 222 + 5 × 5 = 247, and 225 + 25 = 250.
    expect(scoreOf(applicationStatistics({ minor: 222, major: 5 })).score).toBe(
      99,
    );
    expect(scoreOf(applicationStatistics({ minor: 225, major: 5 })).score).toBe(
      100,
    );
  });

  it("scores NG17 1AA's 0.5 mile Search Area from PlanIt's 126 applications", () => {
    const scored = scoreOf(NG17_APPLICATIONS);

    // 2 major × 5 + 124 others = 134, × 0.4 = 53.6.
    expect(scored.score).toBe(54);
    expect(scored.breakdown).toEqual([
      {
        input:
          "Major Planning Applications in the Search Area in the last 3 years",
        value: 2,
        unit: null,
        rule: "Each counts 5 towards the weighted count: 2 points each. 100 points at a weighted count of 250 or more. It indicates change, not quality.",
        points: 4,
      },
      {
        input:
          "Other Planning Applications in the Search Area in the last 3 years",
        value: 124,
        unit: null,
        rule: "Each counts 1 towards the weighted count: 0.4 points each. 100 points at a weighted count of 250 or more. It indicates change, not quality.",
        points: 49.6,
      },
    ]);
  });

  it("says when the provider has more than it gave, or may have", () => {
    expect(
      scoreOf(applicationStatistics({ minor: 40, total: 1_200 })).breakdown[1]
        ?.rule,
    ).toContain("PlanIt has 1,200: only the newest 40 are counted.");
    expect(
      scoreOf(applicationStatistics({ minor: 40, total: null })).breakdown[1]
        ?.rule,
    ).toContain(
      "PlanIt gave as many as it gives at once, so there may be more.",
    );
  });

  it("follows the thresholds in the config", () => {
    const config = {
      ...SCORING_CONFIG,
      developmentActivity: {
        applications: { cap: 50, points: 100 },
        majorWeight: 10,
      },
    };

    // (10 + 10) × 2 = 40.
    expect(
      scoreDevelopmentActivity(
        {
          ...PLANIT,
          statistics: applicationStatistics({ minor: 10, major: 1 }),
        },
        config,
      ).score,
    ).toBe(40);
  });

  it("gives the same score for the same applications", () => {
    expect(scoreOf(NG17_APPLICATIONS)).toEqual(scoreOf(NG17_APPLICATIONS));
  });
});

/** The Transport Layer's statistics with `busStops` bus stops and `stations` railway stations. */
const stops = (busStops: number, stations = 0): TransportStatistics => ({
  ...transport(null, busStops),
  facilities: [
    { type: "railway-station", count: stations },
    { type: "bus-stop", count: busStops },
    { type: "car-park", count: 40 },
    { type: "ev-charger", count: 5 },
  ],
});

describe("scoreFootfall", () => {
  it("gives 0 with nothing to bring people past", () => {
    expect(scoreFootfall(amenities({}), stops(0)).score).toBe(0);
  });

  it("counts shops, offices, bus stops and railway stations, weighted, at 0.4 points a weighted count up to 250", () => {
    const scored = scoreFootfall(
      amenities({
        shop: 10,
        "convenience-store": 5,
        supermarket: 2,
        hairdresser: 3,
        office: 5,
      }),
      stops(10, 1),
    );

    expect(scored.breakdown).toEqual([
      {
        input: "Shops in the Search Area",
        value: 20,
        unit: null,
        rule: "Each counts 1 towards the weighted count: 0.4 points each. 100 points at a weighted count of 250 or more.",
        points: 8,
      },
      {
        input: "Offices in the Search Area",
        value: 5,
        unit: null,
        rule: "Each counts 1 towards the weighted count: 0.4 points each. 100 points at a weighted count of 250 or more.",
        points: 2,
      },
      {
        input: "Bus stops in the Search Area",
        value: 10,
        unit: null,
        rule: "Each counts 1 towards the weighted count: 0.4 points each. 100 points at a weighted count of 250 or more.",
        points: 4,
      },
      {
        input: "Railway stations in the Search Area",
        value: 1,
        unit: null,
        rule: "Each counts 10 towards the weighted count: 4 points each. 100 points at a weighted count of 250 or more.",
        points: 4,
      },
    ]);
    expect(scored.score).toBe(18);
  });

  it("leaves out cafés, pubs, car parks and the like", () => {
    expect(
      scoreFootfall(
        amenities({ cafe: 30, pub: 20, restaurant: 10, healthcare: 5 }),
        stops(0),
      ).score,
    ).toBe(0);
  });

  it("rises in proportion to the weighted count, and is kept at 100 from 250", () => {
    // NG17 1AA: 131 shops, 14 offices and 58 bus stops, 203 in all.
    expect(
      scoreFootfall(
        amenities({
          shop: 100,
          "convenience-store": 10,
          supermarket: 4,
          hairdresser: 17,
          office: 14,
        }),
        stops(58),
      ).score,
    ).toBe(81);
    expect(scoreFootfall(amenities({ shop: 125 }), stops(0)).score).toBe(50);
    expect(scoreFootfall(amenities({ shop: 240 }), stops(0, 1)).score).toBe(
      100,
    );

    const capped = scoreFootfall(amenities({ shop: 300 }), stops(0));
    expect(capped.score).toBe(100);
    expect(capped.breakdown.at(-1)).toMatchObject({
      input: "Kept between 0 and 100",
      points: -20,
    });
  });

  it("follows the weights and cap in the config", () => {
    const stationsMatter = {
      ...SCORING_CONFIG,
      footfall: {
        generators: [
          {
            name: "Railway stations",
            layer: "transport" as const,
            types: ["railway-station" as const],
            weight: 50,
          },
        ],
        count: { cap: 100, points: 100 },
      },
    };

    expect(
      scoreFootfall(amenities({ shop: 100 }), stops(10, 1), stationsMatter)
        .score,
    ).toBe(50);
  });
});
