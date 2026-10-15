import {
  AMENITY_TYPES,
  ESTIMATED_HOUSING_RULES,
  PLANNING_CONSTRAINT_TYPES,
  isCompetitor,
  oneDecimal,
  type AmenityFeature,
  type AmenityStatistics,
  type Competitors,
  type CrimeStatistics,
  type CrimeTrend,
  type DemographicsStatistics,
  type GreenSpaceStatistics,
  type NearestSchool,
  type OfstedGrade,
  type OfstedInspection,
  type PlanningApplicationStatistics,
  type PlanningApplications,
  type PlanningConstraintFeature,
  type PlanningConstraintType,
  type PropertyStatistics,
  type SchoolStatistics,
  type ScorePart,
  type SearchArea,
  type TransportStatistics,
} from "@location-scout/shared";

import { floodZoneId } from "../sources/planning-data";
import {
  SCORING_CONFIG,
  type CappedCountRule,
  type FallingRule,
  type ScoringConfig,
} from "./config";

/*
 * The rules that turn each Layer's statistics into its Category Score (PRD
 * §6.4). Each is a pure function of the statistics and the scoring config, so
 * the same inputs always give the same score (FR-3.6), and each returns the
 * breakdown it was reached by (FR-3.3).
 */

/** A Category Score and how it was reached. */
export interface Scored {
  /** A whole number from 0 to 100. */
  score: number;
  breakdown: ScorePart[];
}

const number = (value: number) =>
  value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** A distance in the config, such as 800 m or 5 km. */
const distance = (metres: number) =>
  metres >= 1000 ? `${number(metres / 1000)} km` : `${number(metres)} m`;

const signed = (points: number) =>
  points < 0 ? `−${number(-points)}` : `+${number(points)}`;

/** `points` at `full` or less, 0 at `zero` or more, in proportion between. */
export const fallingPoints = (
  value: number,
  { full, zero, points }: FallingRule,
) => {
  if (value <= full) return points;
  if (value >= zero) return 0;
  return (points * (zero - value)) / (zero - full);
};

/** `points` shared out over a count up to `cap`. */
export const cappedPoints = (count: number, { cap, points }: CappedCountRule) =>
  (points * Math.min(count, cap)) / cap;

/** "800 m or less: 60 points, falling in proportion to 0 at 5 km or more." */
const fallingRule = (
  { full, zero, points }: FallingRule,
  write: (value: number) => string,
  more: string,
  fewer: string,
) =>
  `${write(full)} or ${fewer}: ${number(points)} points, falling in proportion to 0 at ${write(zero)} or ${more}.`;

/** "4 points each, up to 10 stops: 40 points." */
const cappedRule = ({ cap, points }: CappedCountRule, things: string) => {
  const each = points / cap;
  return `${number(each)} ${each === 1 ? "point" : "points"} each, up to ${number(cap)} ${things}: ${number(points)} points.`;
};

/**
 * Adds the parts' points into a score from 0 to 100. If they add up to more
 * or less, a last part says how far the score was kept in.
 */
const total = (parts: readonly ScorePart[]): Scored => {
  const sum = parts.reduce((added, { points }) => added + points, 0);
  const kept = Math.min(100, Math.max(0, sum));
  const all =
    kept === sum
      ? parts
      : [
          ...parts,
          {
            input: "Kept between 0 and 100",
            value: null,
            unit: null,
            rule: "A Category Score is never below 0 or above 100.",
            points: kept - sum,
          },
        ];
  return {
    score: Math.round(kept),
    breakdown: all.map((part) => ({
      ...part,
      points: oneDecimal(part.points),
    })),
  };
};

/** How many months a period of months such as `2025-09` to `2026-08` holds. */
const monthsIn = ({ from, to }: { from: string; to: string }) => {
  const [fromYear = 0, fromMonth = 0] = from.split("-").map(Number);
  const [toYear = 0, toMonth = 0] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
};

/** The Search Area's size in km². */
const areaKm2 = ({ searchRadius }: SearchArea) =>
  Math.PI * (searchRadius.metres / 1000) ** 2;

/**
 * A count in the Search Area as a rate: per 1,000 of its residents, as the
 * Demographics Layer estimates them, or per km² of it when there is no
 * estimate, because the Layer is not prepared or unavailable.
 */
export type Rate = {
  value: number;
  /**
   * What it is counted over, as a breakdown says it: "over the Search
   * Area's 2.03 km²".
   */
  basis: string;
} & (
  | { per: "per 1,000 residents" }
  | {
      per: "per km²";
      /** The residents per km² taken to judge it as if per 1,000 residents. */
      residentsPerKm2: number;
    }
);

/**
 * `count` per 1,000 of the Search Area's `residents`, or, with none to count
 * by, per km² of it.
 */
export const rateIn = (
  count: number,
  area: SearchArea,
  residents: number | null,
  residentsPerKm2: number,
): Rate => {
  if (residents !== null && residents > 0) {
    return {
      value: (count / residents) * 1000,
      basis: `for the Search Area's estimated ${number(residents)} residents`,
      per: "per 1,000 residents",
    };
  }
  const km2 = areaKm2(area);
  return {
    value: count / km2,
    basis: `over the Search Area's ${number(km2)} km²`,
    per: "per km²",
    residentsPerKm2,
  };
};

/**
 * A threshold per 1,000 residents as it applies to `rate`: the same, or for
 * a rate per km², the rate per km² at its residents per km².
 */
export const threshold = (perThousand: number, rate: Rate) =>
  rate.per === "per km²"
    ? (perThousand * rate.residentsPerKm2) / 1000
    : perThousand;

/** A rule on a rate per 1,000 residents, as it applies to `rate`. */
const rateRule = (rule: FallingRule, rate: Rate): FallingRule => ({
  ...rule,
  full: threshold(rule.full, rate),
  zero: threshold(rule.zero, rate),
});

/**
 * How a rule on a rate per 1,000 residents reads for `rate`. For a rate per
 * km², it also says what that is per 1,000 residents, and why.
 */
const rateRuleText = (rule: FallingRule, rate: Rate) => {
  const applied = fallingRule(rateRule(rule, rate), number, "more", "fewer");
  return rate.per === "per km²"
    ? `${applied} That is ${number(rule.full)} and ${number(rule.zero)} per 1,000 residents, taking ${number(rate.residentsPerKm2)} residents per km², as the Demographics Layer has no estimate of the Search Area's residents.`
    : applied;
};

/**
 * Crimes a year in the Search Area, as a rate per 1,000 of its residents, or
 * per km² with no estimate of them. If data.police.uk didn't answer for some
 * of the last 12 months, the months it did answer for are scaled up to a
 * year.
 */
export const crimeRate = (
  trend: CrimeTrend,
  area: SearchArea,
  residents: number | null,
  residentsPerKm2: number,
) => {
  const months = monthsIn(trend.last12Months);
  const counted =
    months -
    trend.missingMonths.filter(
      (month) =>
        month >= trend.last12Months.from && month <= trend.last12Months.to,
    ).length;
  const perYear = (trend.total.last12Months * months) / counted;
  return {
    months,
    /** The months data.police.uk answered for. */
    counted,
    rate: rateIn(perYear, area, residents, residentsPerKm2),
  };
};

/**
 * Safety (PRD §6.4): crimes a year per 1,000 of the Search Area's residents,
 * as the Demographics Layer estimates them, or per km² of it without them,
 * and the year-on-year change.
 */
export const scoreSafety = (
  { trend }: CrimeStatistics,
  area: SearchArea,
  residents: number | null,
  { safety, residentsPerKm2 }: ScoringConfig = SCORING_CONFIG,
): Scored => {
  const { months, counted, rate } = crimeRate(
    trend,
    area,
    residents,
    residentsPerKm2,
  );
  const { change } = trend.total;
  const { percent, points } = safety.trend;
  let trendPoints = 0;
  if (change !== null && change < -percent) trendPoints = points;
  if (change !== null && change > percent) trendPoints = -points;
  const noChange = trend.complete
    ? " There were no crimes in the 12 months before to compare with."
    : " Some months are missing, so there is no change to compare.";

  return total([
    {
      input: `Crimes a year ${rate.per}`,
      value: oneDecimal(rate.value),
      unit: rate.per,
      rule: `${rateRuleText(safety.ratePerThousand, rate)} From ${number(trend.total.last12Months)} crimes in the last 12 months ${rate.basis}${counted === months ? "" : `, scaled up to a year from the ${number(counted)} months data.police.uk answered for`}.`,
      points: fallingPoints(rate.value, rateRule(safety.ratePerThousand, rate)),
    },
    {
      input: "Year-on-year change in crime",
      value: change,
      unit: "%",
      rule: `A fall of more than ${number(percent)}%: ${signed(points)} points. A rise of more than ${number(percent)}%: ${signed(-points)} points.${change === null ? noChange : ""}`,
      points: trendPoints,
    },
  ]);
};

/** Amenities (PRD §6.4): how many types of amenity are present, and how many amenities. */
export const scoreAmenities = (
  statistics: AmenityStatistics,
  { amenities }: ScoringConfig = SCORING_CONFIG,
): Scored => {
  const types = AMENITY_TYPES.length;
  const present = statistics.byType.filter(({ count }) => count > 0).length;
  const { typeCoverage, count } = amenities;
  return total([
    {
      input: "Types of amenity in the Search Area",
      value: present,
      unit: `of ${number(types)}`,
      rule: `${number(typeCoverage.points)} points shared over the ${number(types)} types: ${number(typeCoverage.points / types)} points for each type present.`,
      points: (typeCoverage.points * present) / types,
    },
    {
      input: "Amenities in the Search Area",
      value: statistics.total,
      unit: null,
      rule: cappedRule(count, "amenities"),
      points: cappedPoints(statistics.total, count),
    },
  ]);
};

/** Each Ofsted grade, as the breakdown names it. */
const OFSTED_GRADE_NAMES: Readonly<Record<OfstedGrade, string>> = {
  outstanding: "Outstanding",
  good: "Good",
  "requires-improvement": "Requires improvement",
  inadequate: "Inadequate",
  exceptional: "Exceptional",
  "strong-standard": "Strong standard",
  "expected-standard": "Expected standard",
  "needs-attention": "Needs attention",
  "urgent-improvement": "Urgent improvement",
};

/** The overall grades, which a graded inspection gave until August 2024. */
const OVERALL_GRADES = [
  "outstanding",
  "good",
  "requires-improvement",
  "inadequate",
] as const satisfies readonly OfstedGrade[];

/** The grades of a report card's evaluation areas, from November 2025. */
const REPORT_CARD_GRADES = [
  "exceptional",
  "strong-standard",
  "expected-standard",
  "needs-attention",
  "urgent-improvement",
] as const satisfies readonly OfstedGrade[];

const isOverallGrade = (
  judgement: string,
): judgement is (typeof OVERALL_GRADES)[number] =>
  OVERALL_GRADES.some((grade) => grade === judgement);

/** "Outstanding 100%, Good 75%…", from the config. */
const gradeShares = (
  grades: readonly OfstedGrade[],
  shares: Readonly<Record<OfstedGrade, number>>,
) =>
  grades
    .map(
      (grade) => `${OFSTED_GRADE_NAMES[grade]} ${number(shares[grade] * 100)}%`,
    )
    .join(", ");

const INSPECTION_NAMES: Readonly<Record<OfstedInspection["kind"], string>> = {
  "report-card": "report card",
  graded: "graded inspection",
  ungraded: "ungraded inspection",
};

/** An ISO 8601 date as the breakdown gives it: "21 April 2026". */
const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * The share of its points a school's latest Ofsted judgement earns, and
 * why: its overall grade's share; with none, the mean of the shares of the
 * areas its inspection graded, as for a report card; or none if it found
 * safeguarding wanting, gave no grade, or there is no inspection.
 */
export const ofstedShare = (
  { judgement, inspection }: Pick<NearestSchool, "judgement" | "inspection">,
  shares: Readonly<Record<OfstedGrade, number>>,
): { share: number; why: string } => {
  if (!inspection) {
    return {
      share: 0,
      why: "It has no inspection in Ofsted's data on state-funded schools.",
    };
  }
  const its = `its ${INSPECTION_NAMES[inspection.kind]} of ${longDate(inspection.inspectedOn)}`;
  if (inspection.safeguardingMet === false) {
    return {
      share: 0,
      why: `${its.charAt(0).toUpperCase()}${its.slice(1)} found safeguarding ${inspection.kind === "report-card" ? "standards not met" : "not effective"}.`,
    };
  }
  if (isOverallGrade(judgement)) {
    return {
      share: shares[judgement],
      why: `${OFSTED_GRADE_NAMES[judgement]}, from ${its}${inspection.outcome ? ` ("${inspection.outcome}")` : ""}.`,
    };
  }
  const { grades } = inspection;
  if (grades.length === 0) {
    return {
      share: 0,
      why: `No overall grade: ${its} gave none${inspection.outcome ? ` ("${inspection.outcome}")` : ""}.`,
    };
  }
  const mean =
    grades.reduce((sum, { grade }) => sum + shares[grade], 0) / grades.length;
  return {
    share: mean,
    why: `No overall grade, so the mean of the ${number(grades.length)} areas graded in ${its}.`,
  };
};

/** The nearest school of a phase: its distance's part, and its Ofsted judgement's. */
const nearestSchoolParts = (
  school: NearestSchool | null,
  phase: string,
  rule: FallingRule,
  { points, grades }: ScoringConfig["schools"]["ofsted"],
): ScorePart[] => {
  const none = ` There is none within ${distance(rule.zero)}.`;
  const each = points / 2;
  const judged = school && ofstedShare(school, grades);
  return [
    {
      input: `Distance to the nearest ${phase} school`,
      value: school?.distanceMetres ?? null,
      unit: "m",
      rule: `${fallingRule(rule, distance, "more", "less")}${school ? "" : none}`,
      points: school ? fallingPoints(school.distanceMetres, rule) : 0,
    },
    {
      input: `Latest Ofsted judgement of the nearest ${phase} school`,
      value: judged ? oneDecimal(judged.share * 100) : null,
      unit: "% share",
      rule: `Up to ${number(each)} points, in proportion to its share. An overall grade earns ${gradeShares(OVERALL_GRADES, grades)}. Without one, the mean of the areas graded counts, a report card's ${gradeShares(REPORT_CARD_GRADES, grades)}. Safeguarding not found effective earns 0%. ${
        school ? `${school.name}: ${judged?.why ?? ""}` : none.trim()
      }`,
      points: judged ? each * judged.share : 0,
    },
  ];
};

/**
 * Schools (PRD §6.4): how far the nearest primary and secondary school are,
 * and their latest Ofsted judgements. An all-through school counts as both.
 */
export const scoreSchools = (
  { nearestPrimary, nearestSecondary }: SchoolStatistics,
  { schools }: ScoringConfig = SCORING_CONFIG,
): Scored =>
  total([
    ...nearestSchoolParts(
      nearestPrimary,
      "primary",
      schools.primary,
      schools.ofsted,
    ),
    ...nearestSchoolParts(
      nearestSecondary,
      "secondary",
      schools.secondary,
      schools.ofsted,
    ),
  ]);

/** Transport (PRD §6.4): how far the nearest railway station is, and how many bus stops. */
export const scoreTransport = (
  { nearestStation, facilities }: TransportStatistics,
  { transport }: ScoringConfig = SCORING_CONFIG,
): Scored => {
  const busStops =
    facilities.find(({ type }) => type === "bus-stop")?.count ?? 0;
  const { station } = transport;
  return total([
    {
      input: "Distance to the nearest railway station",
      value: nearestStation?.distanceMetres ?? null,
      unit: "m",
      rule: `${fallingRule(station, distance, "more", "less")}${nearestStation ? "" : ` There is none within ${distance(station.zero)}.`}`,
      points: nearestStation
        ? fallingPoints(nearestStation.distanceMetres, station)
        : 0,
    },
    {
      input: "Bus stops in the Search Area",
      value: busStops,
      unit: null,
      rule: cappedRule(transport.busStops, "stops"),
      points: cappedPoints(busStops, transport.busStops),
    },
  ]);
};

/** Green space (PRD §6.4): how far the nearest park is, and how many green spaces. */
export const scoreGreenSpace = (
  { nearestPark, total: count }: GreenSpaceStatistics,
  { greenSpace }: ScoringConfig = SCORING_CONFIG,
): Scored => {
  const { park } = greenSpace;
  return total([
    {
      input: "Distance to the nearest park",
      value: nearestPark?.distanceMetres ?? null,
      unit: "m",
      rule: `${fallingRule(park, distance, "more", "less")}${nearestPark ? "" : ` There is none within ${distance(park.zero)}.`}`,
      points: nearestPark ? fallingPoints(nearestPark.distanceMetres, park) : 0,
    },
    {
      input: "Green spaces in the Search Area",
      value: count,
      unit: null,
      rule: cappedRule(greenSpace.count, "green spaces"),
      points: cappedPoints(count, greenSpace.count),
    },
  ]);
};

/**
 * Property activity (PRD §6.4): how many sales there were in the last 12
 * months. It measures how active the market is, not how good it is.
 */
export const scorePropertyActivity = (
  { all }: PropertyStatistics,
  { propertyActivity }: ScoringConfig = SCORING_CONFIG,
): Scored =>
  total([
    {
      input: "Sales in the last 12 months",
      value: all.count,
      unit: null,
      rule: `${cappedRule(propertyActivity.sales, "sales")} This measures how active the market is, not its quality.`,
      points: cappedPoints(all.count, propertyActivity.sales),
    },
  ]);

/**
 * Development activity (PRD §6.4): how many Planning Applications were
 * received in the Search Area in the last 3 years, a major one counting
 * more. It indicates change, not quality.
 */
export const scoreDevelopmentActivity = (
  {
    provider,
    statistics,
  }: Pick<PlanningApplications, "provider"> & {
    statistics: PlanningApplicationStatistics;
  },
  { developmentActivity }: ScoringConfig = SCORING_CONFIG,
): Scored => {
  const { applications, majorWeight } = developmentActivity;
  const { cap, points } = applications;
  const each = points / cap;
  const { count, total: has } = statistics;
  const major =
    statistics.byType.find(({ type }) => type === "major")?.count ?? 0;
  let more = "";
  if (has === null) {
    more = ` ${provider.name} gave as many as it gives at once, so there may be more.`;
  } else if (has > count) {
    more = ` ${provider.name} has ${number(has)}: only the newest ${number(count)} are counted.`;
  }
  const weighted = `${number(points)} points at a weighted count of ${number(cap)} or more. It indicates change, not quality.`;
  return total([
    {
      input:
        "Major Planning Applications in the Search Area in the last 3 years",
      value: major,
      unit: null,
      rule: `Each counts ${number(majorWeight)} towards the weighted count: ${number(majorWeight * each)} points each. ${weighted}`,
      points: major * majorWeight * each,
    },
    {
      input:
        "Other Planning Applications in the Search Area in the last 3 years",
      value: count - major,
      unit: null,
      rule: `Each counts 1 towards the weighted count: ${number(each)} ${each === 1 ? "point" : "points"} each. ${weighted}${more}`,
      points: (count - major) * each,
    },
  ]);
};

/** Every type of Planning Constraint but flood zones, which have zones. */
export type PenalisedType = Exclude<PlanningConstraintType, "flood-zone">;

/** Each of those types, as "inside …" names it. */
export const INSIDE: Readonly<Record<PenalisedType, string>> = {
  "conservation-area": "a conservation area",
  "listed-building": "a listed building",
  "article-4-direction": "an Article 4 direction",
  "tree-preservation-zone": "a tree preservation zone",
};

/**
 * Planning freedom (PRD §6.4): 100, less a penalty for each type of Planning
 * Constraint the Location is inside. Only the highest flood zone counts.
 */
export const scorePlanningFreedom = (
  features: readonly PlanningConstraintFeature[],
  { planningFreedom }: ScoringConfig = SCORING_CONFIG,
): Scored => {
  const covering = features.filter(({ coversLocation }) => coversLocation);
  const { start, penalties, floodZones } = planningFreedom;
  const floodZone = floodZones.find(({ zone }) =>
    covering.some(
      ({ type, id }) => type === "flood-zone" && id === floodZoneId(zone),
    ),
  );
  const types = PLANNING_CONSTRAINT_TYPES.filter(
    (type): type is PenalisedType => type !== "flood-zone",
  );
  return total([
    {
      input: "Starting score",
      value: null,
      unit: null,
      rule: `${number(start)} points, less a penalty for each type of Planning Constraint the Location is inside.`,
      points: start,
    },
    {
      input: "Flood zone the Location is inside",
      value: floodZone ? Number(floodZone.zone) : null,
      unit: null,
      rule: `${floodZones
        .map(({ zone, penalty }) => `Zone ${zone}: ${signed(-penalty)} points.`)
        .join(" ")} Only the highest counts.`,
      points: floodZone ? -floodZone.penalty : 0,
    },
    ...types.map((type) => {
      const inside = covering.some((feature) => feature.type === type);
      return {
        input: `Location inside ${INSIDE[type]}`,
        value: inside,
        unit: null,
        rule: `${signed(-penalties[type])} points if so.`,
        points: inside ? -penalties[type] : 0,
      };
    }),
  ]);
};

/** What Demand's planned housing reads when the Planning Applications aren't there. */
const NO_PLANNED_HOUSING =
  "The Planning Applications are unavailable, so planned housing gives no points.";

/**
 * Demand (PRD §6.4): how many people live in the Search Area, as the
 * Demographics Layer estimates them, how their household income compares
 * with the England median, and how many more the approved and pending
 * Planning Applications would bring, estimated from the homes they propose.
 * Without the Planning Applications, planned housing gives no points.
 */
export const scoreDemand = (
  { population, householdIncome }: DemographicsStatistics,
  applications: PlanningApplicationStatistics | null,
  { demand }: ScoringConfig = SCORING_CONFIG,
): Scored => {
  const planned = applications?.housing ?? null;
  const { residentsPerHome } = ESTIMATED_HOUSING_RULES;
  const { cap, points } = demand.population;
  const { percent, points: incomePoints } = demand.income;
  const above =
    householdIncome && householdIncome.englandMedianPounds > 0
      ? (householdIncome.averagePounds / householdIncome.englandMedianPounds -
          1) *
        100
      : null;
  return total([
    {
      input: "Estimated residents of the Search Area",
      value: population,
      unit: null,
      rule: `${number(points)} points at ${number(cap)} residents or more, in proportion below. From Census 2021, counting each output area in proportion to the share of it inside the Search Area.`,
      points: cappedPoints(population, demand.population),
    },
    {
      input: "Household income against the England median",
      value: above === null ? null : oneDecimal(above),
      unit: "%",
      rule: `${number(percent)}% or more above the median: ${signed(incomePoints)} points. ${number(percent)}% or more below: ${signed(-incomePoints)} points. In proportion between. ${
        householdIncome
          ? `The Search Area's MSOAs average £${number(householdIncome.averagePounds)} a year, and England's median MSOA £${number(householdIncome.englandMedianPounds)}.`
          : "There is no income estimate for the Search Area's MSOAs."
      }`,
      points:
        above === null
          ? 0
          : (incomePoints * Math.max(-percent, Math.min(percent, above))) /
            percent,
    },
    {
      input: "Estimated new residents from Planning Applications",
      value: planned?.residents ?? null,
      unit: null,
      rule: `${number(demand.plannedResidents.points)} points at ${number(demand.plannedResidents.cap)} new residents or more, in proportion below. ${
        planned
          ? `Estimated from the ${number(planned.homes)} new ${planned.homes === 1 ? "home" : "homes"} the approved and pending Planning Applications received in the Search Area in the last 3 years propose, at ${number(residentsPerHome)} residents a home.`
          : NO_PLANNED_HOUSING
      }`,
      points: planned
        ? cappedPoints(planned.residents, demand.plannedResidents)
        : 0,
    },
  ]);
};

/** The Scout Mode's competitors among the amenities, nearest first. */
export const competitorsAmong = (
  features: readonly AmenityFeature[],
  { tags }: Competitors,
) =>
  features
    .filter((feature) => isCompetitor(feature, tags))
    .sort((a, b) => a.distanceMetres - b.distanceMetres);

/**
 * Competition (PRD §6.4): how many of the Scout Mode's competitors (FR-4.3)
 * there are per 1,000 of the Search Area's residents, as the Demographics
 * Layer estimates them, or per km² of it without them, and whether one is
 * very near. Fewer scores higher. `rule` is the mode's own, for a business
 * commoner than the default allows for.
 */
export const scoreCompetition = (
  features: readonly AmenityFeature[],
  competitors: Competitors,
  area: SearchArea,
  residents: number | null,
  { competition, residentsPerKm2 }: ScoringConfig = SCORING_CONFIG,
  rule: FallingRule = competition.ratePerThousand,
): Scored => {
  const found = competitorsAmong(features, competitors);
  const rate = rateIn(found.length, area, residents, residentsPerKm2);
  const nearest = found[0] ?? null;
  const { metres, points } = competition.nearby;
  return total([
    {
      input: `Competitors (${competitors.name}) ${rate.per}`,
      value: oneDecimal(rate.value),
      unit: rate.per,
      rule: `${rateRuleText(rule, rate)} From ${number(found.length)} ${competitors.name} ${rate.basis}.`,
      points: fallingPoints(rate.value, rateRule(rule, rate)),
    },
    {
      input: "Distance to the nearest competitor",
      value: nearest?.distanceMetres ?? null,
      unit: "m",
      rule: `${distance(metres)} or nearer: ${signed(-points)} points.${nearest ? "" : ` There are no ${competitors.name} in the Search Area.`}`,
      points: nearest && nearest.distanceMetres <= metres ? -points : 0,
    },
  ]);
};

/**
 * Footfall proxy (PRD §6.4): how many people are likely to pass, from the
 * shops, offices and transport stops in the Search Area, each weighted, and
 * the weighted count capped. Schools join with the Schools Layer.
 */
export const scoreFootfall = (
  amenities: AmenityStatistics,
  transport: TransportStatistics,
  { footfall }: ScoringConfig = SCORING_CONFIG,
): Scored => {
  const { cap, points } = footfall.count;
  const each = points / cap;
  return total(
    footfall.generators.map((generator) => {
      const counts: readonly { type: string; count: number }[] =
        generator.layer === "amenities"
          ? amenities.byType
          : transport.facilities;
      const types: readonly string[] = generator.types;
      const count = counts
        .filter(({ type }) => types.includes(type))
        .reduce((sum, { count: ofType }) => sum + ofType, 0);
      return {
        input: `${generator.name} in the Search Area`,
        value: count,
        unit: null,
        rule: `Each counts ${number(generator.weight)} towards the weighted count: ${number(generator.weight * each)} points each. ${number(points)} points at a weighted count of ${number(cap)} or more.`,
        points: count * generator.weight * each,
      };
    }),
  );
};
