import {
  OFSTED_JUDGEMENTS,
  OFSTED_INSPECTIONS_DATASET,
  SCHOOLS_DATASET,
  SCHOOL_PHASES,
  distanceMetres,
  isDate,
  isSchoolPhase,
  type DataPeriod,
  type NearestSchool,
  type OfstedAreaGrade,
  type OfstedGrade,
  type OfstedInspection,
  type OfstedJudgement,
  type SchoolFeature,
  type SchoolJudgementCount,
  type SchoolPhase,
  type SchoolStatistics,
  type SearchArea,
  type SourceReport,
} from "@location-scout/shared";
import type { Json } from "@duckdb/node-api";

import {
  NotPreparedError,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";
import { RUN_DATA_PREPARE, type PreparedData } from "./prepared-data";

/*
 * The Schools Layer's prepared datasets (PRD FR-2.3a, FR-6.0): every open
 * school in the Get Information about Schools register, and the latest Ofsted
 * inspections of state-funded schools. Each is a Data Source of its own, so a
 * response names each and the date its data dates from. They are read
 * together, in one query.
 */

// Each is read afresh every time, which takes milliseconds, so a re-run of
// `pnpm data:prepare` shows at once.
export const gias: DataSource = {
  id: "gias",
  name: "Get Information about Schools",
  cacheTtlMs: 0,
};

export const ofsted: DataSource = {
  id: "ofsted",
  name: "Ofsted",
  cacheTtlMs: 0,
};

/** Each of the Schools Layer's Data Sources, and the prepared dataset it is. */
export const SCHOOLS_SOURCES = [
  { source: gias, dataset: SCHOOLS_DATASET },
  { source: ofsted, dataset: OFSTED_INSPECTIONS_DATASET },
] as const;

/**
 * How far from the Location the nearest primary and secondary school are
 * looked for: as far as the Schools score gives points for one, three times
 * the distance that earns all of them (PRD §6.4), so it is found even outside
 * the Search Area.
 */
export const SCHOOL_SEARCH_METRES = { primary: 2_400, secondary: 6_000 };

/** The phases that count as each: an all-through school teaches both. */
const PRIMARY: readonly SchoolPhase[] = ["primary", "all-through"];
const SECONDARY: readonly SchoolPhase[] = ["secondary", "all-through"];

/** A grade as Ofsted writes it in its data, and as the app names it. */
const OFSTED_GRADE_WORDS: Readonly<Record<string, OfstedGrade>> = {
  "1": "outstanding",
  "2": "good",
  "3": "requires-improvement",
  "4": "inadequate",
  Exceptional: "exceptional",
  "Strong standard": "strong-standard",
  "Expected standard": "expected-standard",
  "Needs attention": "needs-attention",
  "Urgent improvement": "urgent-improvement",
};

/** A graded inspection's overall effectiveness, 1 to 4. "Not judged" from September 2024. */
const OVERALL_EFFECTIVENESS: Readonly<Record<string, OfstedJudgement>> = {
  "1": "outstanding",
  "2": "good",
  "3": "requires-improvement",
  "4": "inadequate",
};

/**
 * An ungraded inspection that confirms the school keeps an earlier grade,
 * by the start of its outcome: "School remains Good (Improving) - S5 Next".
 */
const UNGRADED_KEEPS: readonly {
  starts: string;
  judgement: OfstedJudgement;
}[] = [
  { starts: "School remains Outstanding", judgement: "outstanding" },
  { starts: "School remains Good", judgement: "good" },
];

/** One prepared row of a school's latest Ofsted inspections, as Ofsted words them. */
export interface OfstedRow {
  reportCardOn: string | null;
  reportCardGrades: { area: string; grade: string }[];
  /** "Met" or "Not met". */
  reportCardSafeguarding: string | null;
  /** "Yes", or "No" if it inspected the school this one replaced. */
  reportCardOfCurrentUrn: string | null;
  gradedOn: string | null;
  /** 1 to 4, or "Not judged". */
  overallEffectiveness: string | null;
  gradedGrades: { area: string; grade: string }[];
  /** "Yes" or "No". */
  gradedSafeguarding: string | null;
  gradedOfCurrentUrn: string | null;
  ungradedOn: string | null;
  ungradedOutcome: string | null;
  ungradedOfCurrentUrn: string | null;
}

/** One school near a Search Area, as the prepared files give it. */
export interface SchoolRow {
  urn: string;
  name: string;
  phase: SchoolPhase;
  establishmentType: string;
  ageFrom: number | null;
  ageTo: number | null;
  inspectorate: string | null;
  lat: number;
  lng: number;
  /** `null` if Ofsted's data on state-funded schools has no row for it. */
  ofsted: OfstedRow | null;
}

/** The schools near a Search Area, and when each dataset dates from. */
export interface SchoolsNear {
  rows: SchoolRow[];
  /** The date each dataset's data dates from, by its id. */
  periods: Record<string, DataPeriod>;
}

/**
 * The schools within a box around the Location reaching as far as the
 * nearest primary or secondary school is looked for, or the Search Area if
 * it is larger, with their latest Ofsted inspections.
 */
const SCHOOLS_SQL = `
  SELECT s.urn, s.name, s.phase, s.establishment_type, s.age_from, s.age_to,
    s.inspectorate, s.lng, s.lat, o.urn IS NOT NULL AS inspected,
    o.report_card_on, o.report_card_grades, o.report_card_safeguarding,
    o.report_card_of_current_urn, o.graded_on, o.overall_effectiveness,
    o.graded_grades, o.graded_safeguarding, o.graded_of_current_urn,
    o.ungraded_on, o.ungraded_outcome, o.ungraded_of_current_urn
  FROM read_parquet($1) s
  LEFT JOIN read_parquet($2) o ON o.urn = s.urn
  WHERE s.lat BETWEEN $3 AND $4 AND s.lng BETWEEN $5 AND $6
  ORDER BY s.urn`;

export class SchoolsError extends Error {
  override name = "SchoolsError";
}

const text = (value: Json | undefined) =>
  typeof value === "string" && value !== "" ? value : null;

const number = (value: Json | undefined) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

const date = (value: Json | undefined) => (isDate(value) ? value : null);

const areaGrades = (value: Json | undefined) =>
  Array.isArray(value)
    ? value.flatMap((each) => {
        if (typeof each !== "object" || each === null || Array.isArray(each)) {
          return [];
        }
        const area = text(each.area);
        const grade = text(each.grade);
        return area && grade ? [{ area, grade }] : [];
      })
    : [];

/** Reads one row of `SCHOOLS_SQL`. */
export const readSchoolRow = (row: Record<string, Json>): SchoolRow => {
  const urn = text(row.urn);
  const name = text(row.name);
  const establishmentType = text(row.establishment_type);
  const lat = number(row.lat);
  const lng = number(row.lng);
  const { phase } = row;
  if (
    !urn ||
    !name ||
    !establishmentType ||
    !isSchoolPhase(phase) ||
    lat === null ||
    lng === null
  ) {
    throw new SchoolsError("A school's row is incomplete");
  }
  return {
    urn,
    name,
    phase,
    establishmentType,
    ageFrom: number(row.age_from),
    ageTo: number(row.age_to),
    inspectorate: text(row.inspectorate),
    lat,
    lng,
    ofsted:
      row.inspected === true
        ? {
            reportCardOn: date(row.report_card_on),
            reportCardGrades: areaGrades(row.report_card_grades),
            reportCardSafeguarding: text(row.report_card_safeguarding),
            reportCardOfCurrentUrn: text(row.report_card_of_current_urn),
            gradedOn: date(row.graded_on),
            overallEffectiveness: text(row.overall_effectiveness),
            gradedGrades: areaGrades(row.graded_grades),
            gradedSafeguarding: text(row.graded_safeguarding),
            gradedOfCurrentUrn: text(row.graded_of_current_urn),
            ungradedOn: date(row.ungraded_on),
            ungradedOutcome: text(row.ungraded_outcome),
            ungradedOfCurrentUrn: text(row.ungraded_of_current_urn),
          }
        : null,
  };
};

/** The grades the app knows, leaving out Ofsted's "Not applicable", 0 and 9. */
const knownGrades = (grades: readonly { area: string; grade: string }[]) =>
  grades.flatMap(({ area, grade }): OfstedAreaGrade[] => {
    const known = OFSTED_GRADE_WORDS[grade];
    return known ? [{ area, grade: known }] : [];
  });

const yesNo = (value: string | null, yes: string, no: string) =>
  value === yes ? true : value === no ? false : null;

/**
 * A school's latest Ofsted judgement, and the inspection it comes from
 * (`OFSTED_JUDGEMENTS`): its report card if it has one, as the latest
 * framework's; or else its latest graded inspection's overall grade, or none
 * if it gave none; or else what its latest ungraded inspection says of the
 * grade it keeps. A pure function of the prepared row.
 */
export const latestJudgement = (
  row: OfstedRow | null,
): { judgement: OfstedJudgement; inspection: OfstedInspection | null } => {
  if (row?.reportCardOn) {
    return {
      judgement: "report-card",
      inspection: {
        kind: "report-card",
        inspectedOn: row.reportCardOn,
        grades: knownGrades(row.reportCardGrades),
        safeguardingMet: yesNo(row.reportCardSafeguarding, "Met", "Not met"),
        outcome: null,
        ofPredecessor: row.reportCardOfCurrentUrn === "No",
      },
    };
  }
  if (row?.gradedOn) {
    return {
      judgement:
        OVERALL_EFFECTIVENESS[row.overallEffectiveness ?? ""] ??
        "no-overall-grade",
      inspection: {
        kind: "graded",
        inspectedOn: row.gradedOn,
        grades: knownGrades(row.gradedGrades),
        safeguardingMet: yesNo(row.gradedSafeguarding, "Yes", "No"),
        outcome: null,
        ofPredecessor: row.gradedOfCurrentUrn === "No",
      },
    };
  }
  if (row?.ungradedOn) {
    const outcome = row.ungradedOutcome;
    return {
      judgement:
        UNGRADED_KEEPS.find(({ starts }) => outcome?.startsWith(starts))
          ?.judgement ?? "no-overall-grade",
      inspection: {
        kind: "ungraded",
        inspectedOn: row.ungradedOn,
        grades: [],
        safeguardingMet: null,
        outcome,
        ofPredecessor: row.ungradedOfCurrentUrn === "No",
      },
    };
  }
  return { judgement: "none", inspection: null };
};

/** Metres in a degree of latitude, near enough for a box to search. */
const METRES_PER_DEGREE = 111_320;

/**
 * Finds the schools in the prepared files near enough to a Search Area to be
 * in it, or to be its nearest primary or secondary school, with their
 * latest Ofsted inspections. Its period is the GIAS register's date. Before
 * `pnpm data:prepare` has prepared both datasets, it is `not-prepared`.
 */
export const schoolsNear = (
  area: SearchArea,
  callSource: CallSource,
  prepared: PreparedData,
): Promise<SourceResult<SchoolsNear>> => {
  const { location, searchRadius } = area;
  return callSource(
    gias,
    `${String(location.lat)},${String(location.lng)},${String(searchRadius.metres)}`,
    async () => {
      const manifest = await prepared.manifest();
      const datasets = SCHOOLS_SOURCES.map(({ source, dataset }) => {
        const found = manifest.datasets.find(({ id }) => id === dataset);
        if (!found) {
          throw new NotPreparedError(
            `The manifest lists no ${source.name} (${dataset}). ${RUN_DATA_PREPARE}`,
          );
        }
        return found;
      });
      const reach = Math.max(
        searchRadius.metres,
        SCHOOL_SEARCH_METRES.primary,
        SCHOOL_SEARCH_METRES.secondary,
      );
      const lat = reach / METRES_PER_DEGREE;
      const lng = lat / Math.cos((location.lat * Math.PI) / 180);
      const found = await prepared.query(datasets, SCHOOLS_SQL, [
        location.lat - lat,
        location.lat + lat,
        location.lng - lng,
        location.lng + lng,
      ]);
      const periods = Object.fromEntries(
        datasets.map(({ id, sourceDate }) => [
          id,
          { from: sourceDate, to: sourceDate },
        ]),
      );
      return {
        data: { rows: found.map(readSchoolRow), periods },
        period: periods[SCHOOLS_DATASET] ?? null,
      };
    },
  );
};

/** One of the Layer's Data Sources, reported with the date its own dataset dates from. */
export const schoolsSourceResult = (
  result: SourceResult<SchoolsNear>,
  dataset: string,
): SourceResult<SchoolsNear> =>
  result.status === "ok"
    ? { ...result, period: result.data.periods[dataset] ?? null }
    : result;

/** How each of the Layer's Data Sources answered (PRD NFR-1.3). */
export const schoolsSourceReports = (
  result: SourceResult<SchoolsNear>,
): SourceReport[] =>
  SCHOOLS_SOURCES.map(({ source, dataset }) => {
    const answered = schoolsSourceResult(result, dataset);
    return {
      id: source.id,
      name: source.name,
      status: answered.status,
      period: answered.status === "ok" ? answered.period : null,
    };
  });

/** Every judgement, counted among `schools`. */
const byJudgement = (
  schools: readonly { judgement: OfstedJudgement }[],
): SchoolJudgementCount[] =>
  OFSTED_JUDGEMENTS.map((judgement) => ({
    judgement,
    count: schools.filter((school) => school.judgement === judgement).length,
  }));

/** The school nearest the Location of any of `phases`, within `metres`. */
const nearestOf = (
  schools: readonly SchoolFeature[],
  phases: readonly SchoolPhase[],
  metres: number,
  radiusMetres: number,
): NearestSchool | null => {
  const [nearest] = schools.filter(
    ({ phase, distanceMetres: distance }) =>
      phases.includes(phase) && distance <= metres,
  );
  if (!nearest) return null;
  const { id, name, phase, distanceMetres: distance } = nearest;
  return {
    id,
    name,
    phase,
    distanceMetres: distance,
    inSearchArea: distance <= radiusMetres,
    judgement: nearest.judgement,
    inspection: nearest.inspection,
  };
};

/**
 * The Schools Layer's Features, the schools in the Search Area, nearest
 * first, and its statistics (PRD FR-2.3a): how many of each phase and
 * judgement, and the nearest primary and secondary school, which may be
 * outside it. A pure function: the same rows always give the same answer.
 */
export const mapSchools = (
  rows: readonly SchoolRow[],
  area: SearchArea,
): { features: SchoolFeature[]; statistics: SchoolStatistics } => {
  const radiusMetres = area.searchRadius.metres;
  const schools = rows
    .map((row): SchoolFeature => {
      const location = { lat: row.lat, lng: row.lng };
      return {
        id: row.urn,
        location,
        distanceMetres: Math.round(distanceMetres(area.location, location)),
        name: row.name,
        phase: row.phase,
        establishmentType: row.establishmentType,
        ages:
          row.ageFrom !== null && row.ageTo !== null && row.ageFrom <= row.ageTo
            ? { from: row.ageFrom, to: row.ageTo }
            : null,
        ...latestJudgement(row.ofsted),
        inspectorate: row.inspectorate,
      };
    })
    .sort(
      (a, b) => a.distanceMetres - b.distanceMetres || a.id.localeCompare(b.id),
    );
  const features = schools.filter(
    ({ distanceMetres: distance }) => distance <= radiusMetres,
  );
  return {
    features,
    statistics: {
      total: features.length,
      byPhase: SCHOOL_PHASES.map((phase) => {
        const ofPhase = features.filter((school) => school.phase === phase);
        return {
          phase,
          count: ofPhase.length,
          byJudgement: byJudgement(ofPhase),
        };
      }),
      byJudgement: byJudgement(features),
      nearestPrimary: nearestOf(
        schools,
        PRIMARY,
        SCHOOL_SEARCH_METRES.primary,
        radiusMetres,
      ),
      primarySearchMetres: SCHOOL_SEARCH_METRES.primary,
      nearestSecondary: nearestOf(
        schools,
        SECONDARY,
        SCHOOL_SEARCH_METRES.secondary,
        radiusMetres,
      ),
      secondarySearchMetres: SCHOOL_SEARCH_METRES.secondary,
    },
  };
};
