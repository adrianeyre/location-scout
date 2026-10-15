import { isFeature, type Feature } from "./feature";
import { isDate } from "./property";
import {
  isSourceReport,
  isSourceStatus,
  type SourceReport,
  type SourceStatus,
} from "./source-status";

/**
 * The phases the Schools Layer shows schools by (PRD FR-2.3a). Each school
 * has exactly one, from the Get Information about Schools register: an
 * independent school is `independent` whatever ages it teaches, and a
 * state-funded special school or alternative provision, such as a pupil
 * referral unit, is that rather than primary or secondary. Middle schools
 * count as the phase GIAS deems them; an all-through school teaches both
 * primary and secondary pupils.
 */
export const SCHOOL_PHASES = [
  "nursery",
  "primary",
  "secondary",
  "all-through",
  "special",
  "alternative-provision",
  "independent",
] as const;

export type SchoolPhase = (typeof SCHOOL_PHASES)[number];

export const isSchoolPhase = (value: unknown): value is SchoolPhase =>
  SCHOOL_PHASES.some((phase) => phase === value);

/**
 * A school's latest Ofsted judgement, as the Location Overview counts it.
 * Ofsted has judged schools in three ways since September 2019:
 *
 * - `outstanding`, `good`, `requires-improvement`, `inadequate`: an overall
 *   grade, from a graded inspection between September 2019 and August 2024,
 *   or an earlier grade an ungraded inspection says the school keeps
 *   ("School remains Good").
 * - `report-card`: a report card, from November 2025, which grades each
 *   evaluation area but gives no overall grade.
 * - `no-overall-grade`: an inspection that gave none, a graded one from
 *   September 2024 to November 2025, which graded only its key judgements,
 *   or an ungraded one that names no grade ("Standards maintained").
 * - `none`: no inspection in Ofsted's data on state-funded schools, such as
 *   a new school, or an independent school, which Ofsted's data on them
 *   doesn't cover.
 */
export const OFSTED_JUDGEMENTS = [
  "outstanding",
  "good",
  "requires-improvement",
  "inadequate",
  "report-card",
  "no-overall-grade",
  "none",
] as const;

export type OfstedJudgement = (typeof OFSTED_JUDGEMENTS)[number];

export const isOfstedJudgement = (value: unknown): value is OfstedJudgement =>
  OFSTED_JUDGEMENTS.some((judgement) => judgement === value);

/**
 * The grades Ofsted gives: the four of a graded inspection from September
 * 2019, which also grades its key judgements, then the five of a report card's
 * evaluation areas from November 2025.
 */
export const OFSTED_GRADES = [
  "outstanding",
  "good",
  "requires-improvement",
  "inadequate",
  "exceptional",
  "strong-standard",
  "expected-standard",
  "needs-attention",
  "urgent-improvement",
] as const;

export type OfstedGrade = (typeof OFSTED_GRADES)[number];

export const isOfstedGrade = (value: unknown): value is OfstedGrade =>
  OFSTED_GRADES.some((grade) => grade === value);

/** How the inspection a judgement comes from was made. */
export const OFSTED_INSPECTION_KINDS = [
  "report-card",
  "graded",
  "ungraded",
] as const;

export type OfstedInspectionKind = (typeof OFSTED_INSPECTION_KINDS)[number];

/** One area Ofsted graded, for example a report card's "Achievement". */
export interface OfstedAreaGrade {
  /** As Ofsted names it, for example "Curriculum and teaching". */
  area: string;
  grade: OfstedGrade;
}

/**
 * The inspection a school's latest Ofsted judgement comes from, from
 * Ofsted's management information on state-funded schools' latest
 * inspections.
 */
export interface OfstedInspection {
  kind: OfstedInspectionKind;
  /** The first day of the inspection, as an ISO 8601 date. */
  inspectedOn: string;
  /**
   * The area grades it gave: a report card's evaluation areas, or a graded
   * inspection's key judgements, in Ofsted's order. Empty for an ungraded
   * inspection.
   */
  grades: OfstedAreaGrade[];
  /**
   * Whether it found safeguarding effective, or its standards met, or `null`
   * if it doesn't say, as an ungraded inspection doesn't.
   */
  safeguardingMet: boolean | null;
  /** An ungraded inspection's outcome in Ofsted's words, such as "School remains Good", or else `null`. */
  outcome: string | null;
  /**
   * Whether it inspected the school this one replaced, such as the
   * maintained school an academy converted from, as Ofsted counts it.
   */
  ofPredecessor: boolean;
}

/**
 * One school open in the Search Area, from the Get Information about Schools
 * register (PRD FR-2.3a). Its `id` is its URN, the number GIAS and Ofsted
 * know it by.
 */
export interface SchoolFeature extends Feature {
  name: string;
  phase: SchoolPhase;
  /** Its type as GIAS names it, for example "Academy converter". */
  establishmentType: string;
  /** The ages it may teach, as GIAS gives them, or `null` if it gives none. */
  ages: { from: number; to: number } | null;
  judgement: OfstedJudgement;
  /** The inspection `judgement` comes from, or `null` for `none`. */
  inspection: OfstedInspection | null;
  /**
   * Who inspects an independent school, as GIAS names it, for example "ISI"
   * (the Independent Schools Inspectorate) or "Ofsted", or else `null`.
   */
  inspectorate: string | null;
}

/** How many schools of one phase are in the Search Area, by their judgement. */
export interface SchoolPhaseCount {
  phase: SchoolPhase;
  count: number;
  /** Every judgement, in the order of `OFSTED_JUDGEMENTS`, even with none. */
  byJudgement: SchoolJudgementCount[];
}

export interface SchoolJudgementCount {
  judgement: OfstedJudgement;
  count: number;
}

/** The school of a phase nearest the Location, which may be outside the Search Area. */
export interface NearestSchool {
  id: string;
  name: string;
  phase: SchoolPhase;
  distanceMetres: number;
  /** Whether it is inside the Search Area, and so a Feature of the Layer. */
  inSearchArea: boolean;
  judgement: OfstedJudgement;
  inspection: OfstedInspection | null;
}

/** The Schools Layer's statistics for the Location Overview (FR-2.3a). */
export interface SchoolStatistics {
  /** Schools of every phase together. */
  total: number;
  /** Every phase, in the order of `SCHOOL_PHASES`, even with none. */
  byPhase: SchoolPhaseCount[];
  /** Every judgement, of every phase together, in the order of `OFSTED_JUDGEMENTS`. */
  byJudgement: SchoolJudgementCount[];
  /**
   * The nearest primary school, or all-through school, within
   * `primarySearchMetres`, or `null` if there is none that close.
   */
  nearestPrimary: NearestSchool | null;
  /** How far from the Location the nearest primary school is looked for. */
  primarySearchMetres: number;
  /** The nearest secondary or all-through school within `secondarySearchMetres`. */
  nearestSecondary: NearestSchool | null;
  secondarySearchMetres: number;
}

/**
 * The body of `GET /api/area/schools`: the schools open in the Search Area,
 * by phase, with their latest Ofsted judgement, their counts, and the nearest
 * primary and secondary school (PRD FR-2.3a), from the GIAS register and
 * Ofsted's inspection outcomes that `pnpm data:prepare` prepared (FR-6.0).
 * Before it has run, `status` is `not-prepared`, and there are no Features
 * and no statistics (FR-6.6).
 */
export interface SchoolsLayerResponse {
  layer: "schools";
  status: SourceStatus;
  /** The Data Sources behind the Layer, and how each answered. */
  sources: SourceReport[];
  features: SchoolFeature[];
  /** `null` unless `status` is `ok`. */
  statistics: SchoolStatistics | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isMetres = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isAge = (value: unknown): value is number =>
  isCount(value) && value <= 100;

const isOfstedInspectionKind = (
  value: unknown,
): value is OfstedInspectionKind =>
  OFSTED_INSPECTION_KINDS.some((kind) => kind === value);

const isOfstedAreaGrade = (value: unknown): value is OfstedAreaGrade =>
  isRecord(value) && isText(value.area) && isOfstedGrade(value.grade);

export const isOfstedInspection = (value: unknown): value is OfstedInspection =>
  isRecord(value) &&
  isOfstedInspectionKind(value.kind) &&
  isDate(value.inspectedOn) &&
  Array.isArray(value.grades) &&
  value.grades.every(isOfstedAreaGrade) &&
  (value.safeguardingMet === null ||
    typeof value.safeguardingMet === "boolean") &&
  (value.outcome === null || isText(value.outcome)) &&
  typeof value.ofPredecessor === "boolean";

/** A judgement and the inspection it comes from agree: only `none` has none. */
const isJudged = (judgement: unknown, inspection: unknown) =>
  isOfstedJudgement(judgement) &&
  (judgement === "none" ? inspection === null : isOfstedInspection(inspection));

const isAges = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    isAge(value.from) &&
    isAge(value.to) &&
    value.from <= value.to);

export const isSchoolFeature = (value: unknown): value is SchoolFeature =>
  isFeature(value) &&
  isRecord(value) &&
  isText(value.name) &&
  isSchoolPhase(value.phase) &&
  isText(value.establishmentType) &&
  isAges(value.ages) &&
  isJudged(value.judgement, value.inspection) &&
  (value.inspectorate === null || isText(value.inspectorate));

const isSchoolJudgementCount = (
  value: unknown,
): value is SchoolJudgementCount =>
  isRecord(value) && isOfstedJudgement(value.judgement) && isCount(value.count);

const isSchoolPhaseCount = (value: unknown): value is SchoolPhaseCount =>
  isRecord(value) &&
  isSchoolPhase(value.phase) &&
  isCount(value.count) &&
  Array.isArray(value.byJudgement) &&
  value.byJudgement.every(isSchoolJudgementCount);

const isNearestSchool = (value: unknown): value is NearestSchool =>
  isRecord(value) &&
  isText(value.id) &&
  isText(value.name) &&
  isSchoolPhase(value.phase) &&
  isMetres(value.distanceMetres) &&
  typeof value.inSearchArea === "boolean" &&
  isJudged(value.judgement, value.inspection);

export const isSchoolStatistics = (value: unknown): value is SchoolStatistics =>
  isRecord(value) &&
  isCount(value.total) &&
  Array.isArray(value.byPhase) &&
  value.byPhase.every(isSchoolPhaseCount) &&
  Array.isArray(value.byJudgement) &&
  value.byJudgement.every(isSchoolJudgementCount) &&
  (value.nearestPrimary === null || isNearestSchool(value.nearestPrimary)) &&
  isMetres(value.primarySearchMetres) &&
  (value.nearestSecondary === null ||
    isNearestSchool(value.nearestSecondary)) &&
  isMetres(value.secondarySearchMetres);

export const isSchoolsLayerResponse = (
  value: unknown,
): value is SchoolsLayerResponse =>
  isRecord(value) &&
  value.layer === "schools" &&
  isSourceStatus(value.status) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  Array.isArray(value.features) &&
  value.features.every(isSchoolFeature) &&
  (value.statistics === null || isSchoolStatistics(value.statistics));
