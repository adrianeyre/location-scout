import { describe, expect, it } from "vitest";

import { isLayerResponse } from "./layer";
import {
  OFSTED_JUDGEMENTS,
  SCHOOL_PHASES,
  isOfstedGrade,
  isOfstedInspection,
  isOfstedJudgement,
  isSchoolFeature,
  isSchoolPhase,
  isSchoolStatistics,
  isSchoolsLayerResponse,
} from "./schools";

const reportCard = {
  kind: "report-card",
  inspectedOn: "2026-01-13",
  grades: [
    { area: "Inclusion", grade: "expected-standard" },
    { area: "Achievement", grade: "strong-standard" },
  ],
  safeguardingMet: true,
  outcome: null,
  ofPredecessor: false,
};

const primary = {
  id: "122694",
  location: { lat: 53.1238, lng: -1.2653 },
  distanceMetres: 82,
  name: "Leamington Primary and Nursery Academy",
  phase: "primary",
  establishmentType: "Academy converter",
  ages: { from: 3, to: 11 },
  judgement: "good",
  inspection: {
    kind: "graded",
    inspectedOn: "2022-03-08",
    grades: [{ area: "Quality of education", grade: "good" }],
    safeguardingMet: true,
    outcome: null,
    ofPredecessor: false,
  },
  inspectorate: null,
};

const independent = {
  ...primary,
  id: "139500",
  name: "Independent School",
  phase: "independent",
  establishmentType: "Other independent school",
  ages: null,
  judgement: "none",
  inspection: null,
  inspectorate: "ISI",
};

const byJudgement = (counts: Partial<Record<string, number>>) =>
  OFSTED_JUDGEMENTS.map((judgement) => ({
    judgement,
    count: counts[judgement] ?? 0,
  }));

const statistics = {
  total: 2,
  byPhase: SCHOOL_PHASES.map((phase) => ({
    phase,
    count: phase === "primary" || phase === "independent" ? 1 : 0,
    byJudgement: byJudgement(
      phase === "primary"
        ? { good: 1 }
        : phase === "independent"
          ? { none: 1 }
          : {},
    ),
  })),
  byJudgement: byJudgement({ good: 1, none: 1 }),
  nearestPrimary: {
    id: "122694",
    name: "Leamington Primary and Nursery Academy",
    phase: "primary",
    distanceMetres: 82,
    inSearchArea: true,
    judgement: "good",
    inspection: primary.inspection,
  },
  primarySearchMetres: 2_400,
  nearestSecondary: null,
  secondarySearchMetres: 6_000,
};

const layer = {
  layer: "schools",
  status: "ok",
  sources: [
    {
      id: "gias",
      name: "Get Information about Schools",
      status: "ok",
      period: { from: "2026-10-08", to: "2026-10-08" },
    },
  ],
  features: [primary, independent],
  statistics,
};

describe("school phases, Ofsted judgements and grades", () => {
  it("are primary, secondary, special and independent, among others", () => {
    for (const phase of ["primary", "secondary", "special", "independent"]) {
      expect(isSchoolPhase(phase)).toBe(true);
    }
    expect(isSchoolPhase("college")).toBe(false);
  });

  it("judge by an overall grade, a report card, no overall grade or none", () => {
    expect(OFSTED_JUDGEMENTS).toEqual([
      "outstanding",
      "good",
      "requires-improvement",
      "inadequate",
      "report-card",
      "no-overall-grade",
      "none",
    ]);
    expect(isOfstedJudgement("satisfactory")).toBe(false);
  });

  it("grade by both of Ofsted's scales", () => {
    expect(isOfstedGrade("outstanding")).toBe(true);
    expect(isOfstedGrade("expected-standard")).toBe(true);
    expect(isOfstedGrade("Expected standard")).toBe(false);
  });
});

describe("isOfstedInspection", () => {
  it("accepts a report card, a graded and an ungraded inspection", () => {
    expect(isOfstedInspection(reportCard)).toBe(true);
    expect(isOfstedInspection(primary.inspection)).toBe(true);
    expect(
      isOfstedInspection({
        kind: "ungraded",
        inspectedOn: "2023-11-14",
        grades: [],
        safeguardingMet: null,
        outcome: "School remains Good",
        ofPredecessor: true,
      }),
    ).toBe(true);
  });

  it.each([
    ["an unknown kind", { ...reportCard, kind: "monitoring" }],
    [
      "a date as Ofsted writes it",
      { ...reportCard, inspectedOn: "13/01/2026" },
    ],
    [
      "a grade in Ofsted's words",
      {
        ...reportCard,
        grades: [{ area: "Inclusion", grade: "Expected standard" }],
      },
    ],
    [
      "an area with no name",
      { ...reportCard, grades: [{ area: "", grade: "exceptional" }] },
    ],
    ["an empty outcome", { ...reportCard, outcome: "" }],
    ["no predecessor flag", { ...reportCard, ofPredecessor: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isOfstedInspection(value)).toBe(false);
  });
});

describe("isSchoolFeature", () => {
  it("accepts a judged school, and an independent school with no Ofsted judgement", () => {
    expect(isSchoolFeature(primary)).toBe(true);
    expect(isSchoolFeature(independent)).toBe(true);
  });

  it.each([
    ["an unknown phase", { ...primary, phase: "college" }],
    ["no name", { ...primary, name: "" }],
    ["ages the wrong way round", { ...primary, ages: { from: 11, to: 3 } }],
    ["a judgement without its inspection", { ...primary, inspection: null }],
    [
      "an inspection without a judgement",
      { ...independent, inspection: reportCard },
    ],
    ["a bad location", { ...primary, location: { lat: 53 } }],
    ["an empty inspectorate", { ...independent, inspectorate: "" }],
  ])("rejects %s", (_label, value) => {
    expect(isSchoolFeature(value)).toBe(false);
  });
});

describe("isSchoolStatistics", () => {
  it("accepts counts by phase and judgement, and the nearest schools", () => {
    expect(isSchoolStatistics(statistics)).toBe(true);
  });

  it.each([
    ["a fractional count", { ...statistics, total: 1.5 }],
    [
      "an unknown phase",
      {
        ...statistics,
        byPhase: [{ phase: "college", count: 0, byJudgement: [] }],
      },
    ],
    [
      "an unknown judgement",
      { ...statistics, byJudgement: [{ judgement: "satisfactory", count: 1 }] },
    ],
    [
      "a nearest school without its distance",
      {
        ...statistics,
        nearestPrimary: {
          ...statistics.nearestPrimary,
          distanceMetres: undefined,
        },
      },
    ],
    ["no search distance", { ...statistics, secondarySearchMetres: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isSchoolStatistics(value)).toBe(false);
  });
});

describe("isSchoolsLayerResponse", () => {
  it("accepts the Layer, and as one of the served Layers", () => {
    expect(isSchoolsLayerResponse(layer)).toBe(true);
    expect(isLayerResponse(layer)).toBe(true);
  });

  it("accepts it not prepared, with no Features and no statistics", () => {
    expect(
      isSchoolsLayerResponse({
        ...layer,
        status: "not-prepared",
        sources: [
          { ...layer.sources[0], status: "not-prepared", period: null },
        ],
        features: [],
        statistics: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["another Layer", { ...layer, layer: "amenities" }],
    ["a bad status", { ...layer, status: "fine" }],
    ["a bad Feature", { ...layer, features: [{ ...primary, phase: null }] }],
    ["bad statistics", { ...layer, statistics: { total: 2 } }],
  ])("rejects %s", (_label, value) => {
    expect(isSchoolsLayerResponse(value)).toBe(false);
  });
});
