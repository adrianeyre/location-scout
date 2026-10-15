import { describe, expect, it, vi } from "vitest";

import {
  OFSTED_INSPECTIONS_DATASET,
  milesToMetres,
  type PreparedManifest,
  type SearchArea,
} from "@location-scout/shared";

import { NOTHING_PREPARED, PREPARED_DATA_FIXTURE } from "../testing/app";
import { noNetwork } from "../testing/fetch-stubs";
import { createSourceCaller } from "./data-source";
import type { PreparedData } from "./prepared-data";
import {
  SCHOOL_SEARCH_METRES,
  latestJudgement,
  mapSchools,
  readSchoolRow,
  schoolsNear,
  schoolsSourceReports,
  type OfstedRow,
  type SchoolRow,
} from "./schools";
import { SCORING_CONFIG } from "../scoring/config";

const NG17_1AA = { lat: 53.123664, lng: -1.264078 };

const searchArea = (
  miles: 0.25 | 0.5 | 1,
  location = NG17_1AA,
): SearchArea => ({
  location,
  searchRadius: { miles, metres: milesToMetres(miles) },
});

/** A row with no inspection of any kind. */
const ofstedRow = (overrides: Partial<OfstedRow> = {}): OfstedRow => ({
  reportCardOn: null,
  reportCardGrades: [],
  reportCardSafeguarding: null,
  reportCardOfCurrentUrn: null,
  gradedOn: null,
  overallEffectiveness: null,
  gradedGrades: [],
  gradedSafeguarding: null,
  gradedOfCurrentUrn: null,
  ungradedOn: null,
  ungradedOutcome: null,
  ungradedOfCurrentUrn: null,
  ...overrides,
});

/** A school `north` metres due north of NG17 1AA. */
const school = (
  urn: string,
  phase: SchoolRow["phase"],
  north: number,
  ofsted: OfstedRow | null = ofstedRow({
    gradedOn: "2022-03-08",
    overallEffectiveness: "2",
    gradedSafeguarding: "Yes",
    gradedOfCurrentUrn: "Yes",
  }),
): SchoolRow => ({
  urn,
  name: `School ${urn}`,
  phase,
  establishmentType: "Academy converter",
  ageFrom: 4,
  ageTo: 11,
  inspectorate: null,
  lat: NG17_1AA.lat + north / 111_195,
  lng: NG17_1AA.lng,
  ofsted,
});

describe("latestJudgement", () => {
  it("is a report card's, from November 2025, with its evaluation areas' grades", () => {
    expect(
      latestJudgement(
        ofstedRow({
          reportCardOn: "2026-04-21",
          reportCardGrades: [
            { area: "Inclusion", grade: "Expected standard" },
            { area: "Achievement", grade: "Needs attention" },
            { area: "Early years", grade: "Not applicable" },
          ],
          reportCardSafeguarding: "Met",
          reportCardOfCurrentUrn: "Yes",
          // The graded inspection before it no longer counts.
          gradedOn: "2022-04-26",
          overallEffectiveness: "2",
        }),
      ),
    ).toEqual({
      judgement: "report-card",
      inspection: {
        kind: "report-card",
        inspectedOn: "2026-04-21",
        grades: [
          { area: "Inclusion", grade: "expected-standard" },
          { area: "Achievement", grade: "needs-attention" },
        ],
        safeguardingMet: true,
        outcome: null,
        ofPredecessor: false,
      },
    });
  });

  it("is a graded inspection's overall grade, 1 to 4, with its key judgements", () => {
    for (const [overall, judgement] of [
      ["1", "outstanding"],
      ["2", "good"],
      ["3", "requires-improvement"],
      ["4", "inadequate"],
    ] as const) {
      expect(
        latestJudgement(
          ofstedRow({
            gradedOn: "2022-07-19",
            overallEffectiveness: overall,
            gradedGrades: [
              { area: "Quality of education", grade: overall },
              { area: "Sixth form provision", grade: "9" },
            ],
            gradedSafeguarding: "Yes",
            gradedOfCurrentUrn: "No",
          }),
        ),
      ).toEqual({
        judgement,
        inspection: {
          kind: "graded",
          inspectedOn: "2022-07-19",
          grades: [{ area: "Quality of education", grade: judgement }],
          safeguardingMet: true,
          outcome: null,
          // It inspected the school this one replaced.
          ofPredecessor: true,
        },
      });
    }
  });

  it("gives no overall grade for a graded inspection from September 2024, which gave none", () => {
    expect(
      latestJudgement(
        ofstedRow({
          gradedOn: "2025-01-28",
          overallEffectiveness: "Not judged",
          gradedGrades: [{ area: "Quality of education", grade: "3" }],
          gradedSafeguarding: "No",
          // An earlier ungraded inspection no longer counts.
          ungradedOn: "2023-05-11",
          ungradedOutcome: "School remains Good (Concerns) - S5 Next",
        }),
      ),
    ).toMatchObject({
      judgement: "no-overall-grade",
      inspection: {
        kind: "graded",
        grades: [
          { area: "Quality of education", grade: "requires-improvement" },
        ],
        safeguardingMet: false,
      },
    });
  });

  it("keeps the earlier grade an ungraded inspection says the school keeps, and gives none if it names none", () => {
    const ungraded = (outcome: string) =>
      latestJudgement(
        ofstedRow({
          ungradedOn: "2024-03-12",
          ungradedOutcome: outcome,
          ungradedOfCurrentUrn: "Yes",
        }),
      );

    expect(ungraded("School remains Good")).toEqual({
      judgement: "good",
      inspection: {
        kind: "ungraded",
        inspectedOn: "2024-03-12",
        grades: [],
        safeguardingMet: null,
        outcome: "School remains Good",
        ofPredecessor: false,
      },
    });
    expect(
      ungraded("School remains Good (Improving) - S5 Next").judgement,
    ).toBe("good");
    expect(
      ungraded("School remains Outstanding (Concerns) - S5 Next").judgement,
    ).toBe("outstanding");
    expect(ungraded("Standards maintained").judgement).toBe("no-overall-grade");
    expect(ungraded("Improved significantly").judgement).toBe(
      "no-overall-grade",
    );
  });

  it("is none with no inspection, or no row in Ofsted's data", () => {
    expect(latestJudgement(ofstedRow())).toEqual({
      judgement: "none",
      inspection: null,
    });
    expect(latestJudgement(null)).toEqual({
      judgement: "none",
      inspection: null,
    });
  });
});

describe("readSchoolRow", () => {
  it("refuses a row without its phase or point", () => {
    expect(() =>
      readSchoolRow({
        urn: "1",
        name: "A school",
        phase: "college",
        establishment_type: "Further education",
        lat: 53,
        lng: -1,
      }),
    ).toThrow(/incomplete/);
    expect(() =>
      readSchoolRow({
        urn: "1",
        name: "A school",
        phase: "primary",
        establishment_type: "Community school",
        lat: null,
        lng: -1,
      }),
    ).toThrow(/incomplete/);
  });
});

describe("mapSchools", () => {
  const area = searchArea(0.5);

  it("makes each school in the Search Area a Feature, nearest first, and counts them by phase and judgement", () => {
    const { features, statistics } = mapSchools(
      [
        school("3", "secondary", 600),
        school("1", "primary", 200),
        school("2", "independent", 400, null),
        // Outside the Search Area.
        school("4", "primary", 1_000),
      ],
      area,
    );

    expect(
      features.map(({ id, distanceMetres }) => [id, distanceMetres]),
    ).toEqual([
      ["1", 200],
      ["2", 400],
      ["3", 600],
    ]);
    expect(features[0]).toEqual({
      id: "1",
      location: { lat: NG17_1AA.lat + 200 / 111_195, lng: NG17_1AA.lng },
      distanceMetres: 200,
      name: "School 1",
      phase: "primary",
      establishmentType: "Academy converter",
      ages: { from: 4, to: 11 },
      judgement: "good",
      inspection: {
        kind: "graded",
        inspectedOn: "2022-03-08",
        grades: [],
        safeguardingMet: true,
        outcome: null,
        ofPredecessor: false,
      },
      inspectorate: null,
    });
    expect(statistics.total).toBe(3);
    expect(
      statistics.byPhase.map(({ phase, count }) => [phase, count]),
    ).toEqual([
      ["nursery", 0],
      ["primary", 1],
      ["secondary", 1],
      ["all-through", 0],
      ["special", 0],
      ["alternative-provision", 0],
      ["independent", 1],
    ]);
    expect(statistics.byJudgement.filter(({ count }) => count > 0)).toEqual([
      { judgement: "good", count: 2 },
      { judgement: "none", count: 1 },
    ]);
    expect(
      statistics.byPhase
        .find(({ phase }) => phase === "independent")
        ?.byJudgement.find(({ count }) => count > 0),
    ).toEqual({ judgement: "none", count: 1 });
  });

  it("finds the nearest primary and secondary school, outside the Search Area if need be, an all-through school counting as both", () => {
    const { statistics } = mapSchools(
      [
        school("1", "independent", 100, null),
        school("2", "special", 150),
        school("3", "primary", 2_000),
        school("4", "all-through", 3_000),
        school("5", "secondary", 4_000),
      ],
      area,
    );

    expect(statistics.nearestPrimary).toMatchObject({
      id: "3",
      phase: "primary",
      distanceMetres: 2_000,
      inSearchArea: false,
      judgement: "good",
    });
    expect(statistics.nearestSecondary).toMatchObject({
      id: "4",
      phase: "all-through",
      distanceMetres: 3_000,
    });
  });

  it("looks for them only as far as the Schools score gives points", () => {
    const { statistics } = mapSchools(
      [school("1", "primary", 2_450), school("2", "secondary", 6_050)],
      area,
    );

    expect(statistics.nearestPrimary).toBeNull();
    expect(statistics.nearestSecondary).toBeNull();
    expect(statistics.primarySearchMetres).toBe(
      SCORING_CONFIG.schools.primary.zero,
    );
    expect(statistics.secondarySearchMetres).toBe(
      SCORING_CONFIG.schools.secondary.zero,
    );
    expect(SCHOOL_SEARCH_METRES).toEqual({ primary: 2_400, secondary: 6_000 });
  });

  it("gives no ages that GIAS gives the wrong way round", () => {
    const { features } = mapSchools(
      [{ ...school("1", "primary", 100), ageFrom: 11, ageTo: 4 }],
      area,
    );

    expect(features[0]?.ages).toBeNull();
  });
});

describe("schoolsNear", () => {
  it("finds the schools near NG17 1AA in the prepared fixture, with their Ofsted inspections", async () => {
    const fetchMock = noNetwork();

    const result = await schoolsNear(
      searchArea(0.5),
      createSourceCaller({ fetch: fetchMock }),
      PREPARED_DATA_FIXTURE,
    );

    if (result.status !== "ok") throw new Error(result.status);
    const { features, statistics } = mapSchools(
      result.data.rows,
      searchArea(0.5),
    );
    expect(
      features.map(({ id, name, phase, distanceMetres, judgement }) => [
        id,
        name,
        phase,
        distanceMetres,
        judgement,
      ]),
    ).toEqual([
      ["139063", "Sutton Community Academy", "secondary", 232, "report-card"],
      ["122463", "Croft Primary School", "primary", 519, "no-overall-grade"],
      [
        "122468",
        "Priestsic Primary and Nursery School",
        "primary",
        642,
        "good",
      ],
      // An independent special school, which Ofsted's data on state-funded
      // schools doesn't cover.
      ["146288", "Westbourne School", "special", 669, "none"],
    ]);
    expect(features[3]?.inspectorate).toBe("ISI");
    expect(statistics.nearestPrimary?.id).toBe("122463");
    expect(statistics.nearestSecondary?.id).toBe("139063");
    expect(result.period).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds the nearest outside a Search Area with no school in it", async () => {
    const parkway = searchArea(0.25, { lat: 53.1145, lng: -1.246 });
    const result = await schoolsNear(
      parkway,
      createSourceCaller({ fetch: noNetwork() }),
      PREPARED_DATA_FIXTURE,
    );

    if (result.status !== "ok") throw new Error(result.status);
    const { features, statistics } = mapSchools(result.data.rows, parkway);
    expect(features).toEqual([]);
    expect(statistics.nearestPrimary).toMatchObject({
      name: "Leamington Primary and Nursery Academy",
      distanceMetres: 947,
      inSearchArea: false,
      judgement: "good",
    });
    expect(statistics.nearestSecondary).toMatchObject({
      name: "Sutton Community Academy",
      distanceMetres: 1_420,
    });
  });

  it("is not prepared before pnpm data:prepare", async () => {
    const result = await schoolsNear(
      searchArea(0.5),
      createSourceCaller({ fetch: noNetwork() }),
      NOTHING_PREPARED,
    );

    expect(result).toEqual({ status: "not-prepared" });
  });

  it("is not prepared when the manifest lacks Ofsted's inspections, as one prepared before them does", async () => {
    const manifest = await PREPARED_DATA_FIXTURE.manifest();
    const withoutOfsted: PreparedData = {
      manifest: () =>
        Promise.resolve<PreparedManifest>({
          ...manifest,
          datasets: manifest.datasets.filter(
            ({ id }) => id !== OFSTED_INSPECTIONS_DATASET,
          ),
        }),
      query: vi.fn<PreparedData["query"]>(),
    };

    const result = await schoolsNear(
      searchArea(0.5),
      createSourceCaller({ fetch: noNetwork() }),
      withoutOfsted,
    );

    expect(result).toEqual({ status: "not-prepared" });
    expect(withoutOfsted.query).not.toHaveBeenCalled();
  });

  it("is unavailable if the prepared files can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: PreparedData = {
      manifest: () => PREPARED_DATA_FIXTURE.manifest(),
      query: () => Promise.reject(new Error("Corrupt file")),
    };

    const result = await schoolsNear(
      searchArea(0.5),
      createSourceCaller({ fetch: noNetwork() }),
      broken,
    );

    expect(result).toEqual({ status: "unavailable" });
  });
});

describe("schoolsSourceReports", () => {
  it("reports GIAS and Ofsted, each with the date its data dates from", async () => {
    const result = await schoolsNear(
      searchArea(0.25),
      createSourceCaller({ fetch: noNetwork() }),
      PREPARED_DATA_FIXTURE,
    );

    expect(schoolsSourceReports(result)).toEqual([
      {
        id: "gias",
        name: "Get Information about Schools",
        status: "ok",
        period: { from: "2026-10-09", to: "2026-10-09" },
      },
      {
        id: "ofsted",
        name: "Ofsted",
        status: "ok",
        period: { from: "2026-08-31", to: "2026-08-31" },
      },
    ]);
  });

  it("reports each as not prepared before pnpm data:prepare", () => {
    expect(
      schoolsSourceReports({ status: "not-prepared" }).map(
        ({ status, period }) => ({ status, period }),
      ),
    ).toEqual(Array(2).fill({ status: "not-prepared", period: null }));
  });
});
