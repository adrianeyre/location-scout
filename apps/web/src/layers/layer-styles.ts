import {
  type AgeGroup,
  EPC_ATTRIBUTION,
  HM_LAND_REGISTRY_SEARCHES,
  INSPIRE_FREEHOLD_NOTE,
  LAND_OPPORTUNITY_WORDING,
  LAND_PARCEL_RULES,
  LAND_SALE_LABEL,
  LAND_SALES_NOTE,
  OWNERSHIP_CATEGORY_NAMES,
  titleAttribution,
  isGreenSpaceType,
  type AddressSale,
  type AmenityFeature,
  type AmenityType,
  type CrimeFeature,
  type OutputAreaFeature,
  type GreenSpaceFeature,
  type GreenSpaceType,
  type LandOpportunityFeature,
  type LandSale,
  type LandUseContextType,
  type MatchedTitle,
  type NearbyLandSales,
  type NearbyPlanningApplication,
  type NearbyPlanningApplications,
  type OwnershipCategory,
  type LayerResponse,
  type OfstedGrade,
  type OfstedInspection,
  type OfstedJudgement,
  type PlanningApplicationFeature,
  type PlanningApplicationStatus,
  type PlanningApplicationType,
  type PlanningApplications,
  type PlanningConstraintFeature,
  type PlanningConstraintType,
  type PropertySaleFeature,
  type PropertyType,
  type SaleEpcMatch,
  type SchoolFeature,
  type SchoolPhase,
  type ServedLayerId,
  type Tenure,
  type TransportFeature,
  type TransportType,
} from "@location-scout/shared";

import { creditText, pricePaidCredit } from "../attribution";
import {
  formatChange,
  formatCount,
  formatDate,
  formatDistance,
  formatKilometres,
  formatList,
  formatMonth,
  formatPrice,
  formatShortPrice,
  formatSquareMetres,
} from "../format";

/**
 * A Feature of any served Layer, including the Planning Layer's Planning
 * Applications, which its response gives apart from its Planning Constraints.
 */
export type LayerFeature =
  LayerResponse["features"][number] | PlanningApplicationFeature;

/** What one Feature's popup says about it, beyond its distance (PRD FR-2.10). */
export interface FeatureDetails {
  title: string;
  lines: string[];
  /** Lists after its lines, such as a sale's history, each with what it lists. */
  lists?: { name: string; items: string[] }[];
  /** Notes after them, such as the statement a dataset's licence requires. */
  notes?: string[];
  /** Links after them, such as HM Land Registry's ownership searches. */
  links?: readonly { name: string; url: string }[];
}

/** How a Layer looks and speaks: each has its own colour and icon (PRD FR-9.3). */
export interface LayerStyle {
  name: string;
  /** What one Feature, and several, are called: "crime", "crimes". */
  noun: readonly [string, string];
  /** Its markers' colour. White text on it meets WCAG AA (FR-9.5). */
  colour: string;
  /** Its icon: an SVG path drawn in white on a 24 × 24 grid. */
  icon: string;
  /** Said with its statistics, if anything needs saying about its Features. */
  note: string | null;
  /** The same, briefly, for each Feature's popup. */
  popupNote: string | null;
  details: (feature: LayerFeature) => FeatureDetails;
  /**
   * What a point is labelled with on the map, from the Features at it, such
   * as a sale's price, or `null` for a Layer whose points have no label.
   */
  label: ((features: readonly LayerFeature[]) => string) | null;
  /**
   * The colour of a Feature's shape, for a Layer whose Features may have
   * one, or `null` for a Layer of points only.
   */
  shapeColour: ((feature: LayerFeature) => string) | null;
  /**
   * The colour of the marker for the Features at one point, for a Layer
   * whose markers are coloured by what they mark, as Planning Applications'
   * are by their status, or `null` for the Layer's colour. White text on it
   * meets WCAG AA too.
   */
  markerColour: ((features: readonly LayerFeature[]) => string) | null;
}

/** Describes one Layer's own Features. Another Layer's would be a mistake. */
const describing =
  <F extends LayerFeature>(
    isOwn: (feature: LayerFeature) => feature is F,
    describe: (feature: F) => FeatureDetails,
  ) =>
  (feature: LayerFeature): FeatureDetails =>
    isOwn(feature) ? describe(feature) : { title: "", lines: [] };

const isCrime = (feature: LayerFeature): feature is CrimeFeature =>
  "category" in feature;

const isPlanningConstraint = (
  feature: LayerFeature,
): feature is PlanningConstraintFeature => "coversLocation" in feature;

const isPlanningApplication = (
  feature: LayerFeature,
): feature is PlanningApplicationFeature => "applicationType" in feature;

const isAmenity = (feature: LayerFeature): feature is AmenityFeature =>
  "osmTag" in feature && !("lengthMetres" in feature);

const isSchool = (feature: LayerFeature): feature is SchoolFeature =>
  "phase" in feature && "judgement" in feature;

const isTransport = (feature: LayerFeature): feature is TransportFeature =>
  "lengthMetres" in feature;

const isGreenSpace = (feature: LayerFeature): feature is GreenSpaceFeature =>
  "type" in feature && isGreenSpaceType(feature.type);

const isOutputArea = (feature: LayerFeature): feature is OutputAreaFeature =>
  "deprivationDecile" in feature;

const isPropertySale = (
  feature: LayerFeature,
): feature is PropertySaleFeature => "price" in feature;

const isLandOpportunity = (
  feature: LayerFeature,
): feature is LandOpportunityFeature => "possiblyUnregistered" in feature;

/** PRD FR-2.9: police crime locations are deliberately approximate. */
export const CRIME_LOCATIONS_NOTE =
  "Police crime locations are deliberately approximate: each crime is placed at a nearby anonymous point, such as the middle of a street.";

const crimeDetails = ({ categoryName, month, street }: CrimeFeature) => ({
  title: categoryName,
  lines: [formatMonth(month), street ?? "No street given by the police"],
});

/** Each type of Planning Constraint: what one, and several, are called, and its shape's colour. */
export const PLANNING_CONSTRAINT_STYLES: Readonly<
  Record<
    PlanningConstraintType,
    { name: readonly [string, string]; colour: string }
  >
> = {
  "conservation-area": {
    name: ["Conservation area", "Conservation areas"],
    colour: "#6a1b9a",
  },
  "listed-building": {
    name: ["Listed building", "Listed buildings"],
    colour: "#6a1b9a",
  },
  "article-4-direction": {
    name: ["Article 4 direction", "Article 4 directions"],
    colour: "#795548",
  },
  "tree-preservation-zone": {
    name: ["Tree preservation zone", "Tree preservation zones"],
    colour: "#2e7d32",
  },
  "flood-zone": { name: ["Flood zone", "Flood zones"], colour: "#00838f" },
};

/**
 * PRD FR-2.2: planning.data.gov.uk holds only what councils have published to
 * it, and listed buildings come as points.
 */
export const PLANNING_CONSTRAINTS_NOTE =
  "Planning Constraints come from planning.data.gov.uk, which holds only what each council has published to it, so a type with none here may still apply: check with the council. Whether the Location is inside a listed building is known only where the council has published listed building outlines. Flood zones are counted by zone (2 or 3).";

const planningDetails = ({
  type,
  name,
  grade,
  coversLocation,
}: PlanningConstraintFeature) => {
  const [kind] = PLANNING_CONSTRAINT_STYLES[type].name;
  return {
    title: name,
    lines: [
      grade === null ? kind : `${kind}, grade ${grade}`,
      ...(coversLocation ? ["The Location is inside it"] : []),
    ],
  };
};

/**
 * What each status of Planning Application is called, and the colour its
 * marker is drawn in (PRD FR-2.2).
 */
export const PLANNING_APPLICATION_STATUS_STYLES: Readonly<
  Record<PlanningApplicationStatus, { name: string; colour: string }>
> = {
  pending: { name: "Pending", colour: "#a14d00" },
  approved: { name: "Approved", colour: "#2e7d32" },
  refused: { name: "Refused", colour: "#c62828" },
  withdrawn: { name: "Withdrawn", colour: "#616161" },
  other: { name: "No decision, or not known", colour: "#5d4037" },
};

/** What one Planning Application of each type, and several, are called. */
export const PLANNING_APPLICATION_TYPE_NAMES: Readonly<
  Record<PlanningApplicationType, readonly [string, string]>
> = {
  householder: ["Householder application", "Householder applications"],
  minor: ["Minor application", "Minor applications"],
  major: ["Major application", "Major applications"],
};

/** What the Planning Layer says while its provider's queue holds its request (PRD FR-2.2). */
export const PLANNING_APPLICATIONS_RATE_LIMITED =
  "Loading planning applications (rate-limited)";

/** ADR 0003: PlanIt places an application the council gave no point for at its postcode. */
export const APPROXIMATE_APPLICATION_NOTE =
  "Approximate: placed at the middle of its postcode, as the council gave no closer location.";

/** A website's name, as its address gives it: "planit.org.uk". */
const siteName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "its provider's website";
  }
};

/** A Planning Application's status, and when it was decided, if it has been. */
const decision = ({ status, decidedOn }: PlanningApplicationFeature) => {
  const { name } = PLANNING_APPLICATION_STATUS_STYLES[status];
  return decidedOn ? `${name}, ${formatDate(decidedOn)}` : name;
};

const applicationDetails = (
  application: PlanningApplicationFeature,
): FeatureDetails => {
  const { reference, authority, address, description, councilType } =
    application;
  const [kind] = PLANNING_APPLICATION_TYPE_NAMES[application.applicationType];
  return {
    title: address ?? `Planning Application ${reference}`,
    lines: [
      decision(application),
      councilType ? `${kind}: ${councilType}` : kind,
      `Received ${formatDate(application.receivedOn)}`,
      ...(description ? [description] : []),
      application.impact,
      `${authority} reference ${reference}`,
    ],
    notes: application.approximate ? [APPROXIMATE_APPLICATION_NOTE] : [],
    links: [
      ...(application.url
        ? [{ name: "See it on the council's website", url: application.url }]
        : []),
      ...(application.providerUrl
        ? [
            {
              name: `See it on ${siteName(application.providerUrl)}`,
              url: application.providerUrl,
            },
          ]
        : []),
    ],
  };
};

/**
 * What the Features at one point are called. The Planning Layer's are
 * called by what they are, Planning Constraints or Planning Applications,
 * unless there are some of each.
 */
export const featuresNoun = (
  layer: ServedLayerId,
  features: readonly LayerFeature[],
): readonly [string, string] => {
  if (layer === "planning" && features.length > 0) {
    if (features.every(isPlanningConstraint)) {
      return ["planning constraint", "planning constraints"];
    }
    if (features.every(isPlanningApplication)) {
      return ["planning application", "planning applications"];
    }
  }
  return LAYER_STYLES[layer].noun;
};

/**
 * The Planning Applications to draw: the Search Area's, once they have been
 * found.
 */
export const applicationsShown = (applications: PlanningApplications | null) =>
  applications?.status === "ok" ? applications.features : [];

/**
 * What one amenity of each type, and several, are called. Shops that are not
 * convenience stores, supermarkets or hairdressers are counted as "Other shops".
 */
export const AMENITY_NAMES: Readonly<
  Record<AmenityType, readonly [string, string]>
> = {
  shop: ["Shop", "Other shops"],
  "convenience-store": ["Convenience store", "Convenience stores"],
  cafe: ["Café", "Cafés"],
  restaurant: ["Restaurant", "Restaurants"],
  takeaway: ["Takeaway", "Takeaways"],
  pub: ["Pub", "Pubs"],
  supermarket: ["Supermarket", "Supermarkets"],
  gym: ["Gym", "Gyms"],
  hairdresser: ["Hairdresser", "Hairdressers"],
  dentist: ["Dentist", "Dentists"],
  nursery: ["Nursery", "Nurseries"],
  healthcare: ["Healthcare", "Healthcare"],
  office: ["Office", "Offices"],
};

/** PRD FR-2.3: amenities are what OpenStreetMap's volunteers have mapped. */
export const AMENITIES_NOTE =
  "Amenities come from OpenStreetMap, which volunteers map, so some may be missing, closed or out of date. Each is counted under one type: a café that also sells bread is a café, and shops that aren't convenience stores, supermarkets or hairdressers are other shops.";

/** An amenity's name, or what it is if OpenStreetMap names it nothing. */
export const amenityName = (type: AmenityType, name: string | null) =>
  name ?? `Unnamed ${AMENITY_NAMES[type][0].toLowerCase()}`;

const amenityDetails = ({ type, name, osmTag }: AmenityFeature) => ({
  title: amenityName(type, name),
  lines: [AMENITY_NAMES[type][0], `OpenStreetMap tag: ${osmTag}`],
});

/** What a school of each phase is, and several are, called. */
export const SCHOOL_PHASE_NAMES: Readonly<
  Record<SchoolPhase, readonly [string, string]>
> = {
  nursery: ["Nursery school", "Nursery schools"],
  primary: ["Primary school", "Primary schools"],
  secondary: ["Secondary school", "Secondary schools"],
  "all-through": ["All-through school", "All-through schools"],
  special: ["Special school", "Special schools"],
  "alternative-provision": ["Alternative provision", "Alternative provision"],
  independent: ["Independent school", "Independent schools"],
};

/** Each latest Ofsted judgement, as the Overview counts it. */
export const OFSTED_JUDGEMENT_NAMES: Readonly<Record<OfstedJudgement, string>> =
  {
    outstanding: "Outstanding",
    good: "Good",
    "requires-improvement": "Requires improvement",
    inadequate: "Inadequate",
    "report-card": "Report card, no overall grade",
    "no-overall-grade": "Inspected, no overall grade",
    none: "No Ofsted judgement here",
  };

/** Each grade Ofsted gives, in its own words. */
export const OFSTED_GRADE_NAMES: Readonly<Record<OfstedGrade, string>> = {
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

const INSPECTION_NAMES: Readonly<Record<OfstedInspection["kind"], string>> = {
  "report-card": "Report card",
  graded: "Graded inspection",
  ungraded: "Ungraded inspection",
};

/**
 * PRD FR-2.3a: what a school's latest Ofsted judgement can be, since Ofsted
 * stopped giving overall grades, and which schools its data leaves out.
 */
export const SCHOOLS_NOTE =
  "Schools are those open in the Department for Education's Get Information about Schools register, by phase. Each has its latest Ofsted judgement from Ofsted's data on state-funded schools: an overall grade from a graded inspection up to August 2024, or an earlier one an ungraded inspection says it keeps; a report card from November 2025, which grades each area but gives no overall grade; or an inspection from September 2024 that gave none. Independent schools, inspected by Ofsted or the Independent Schools Inspectorate, aren't in that data, so have no judgement here. The nearest primary and secondary schools are looked for up to 2.4 km and 6 km away, so may be outside the Search Area; an all-through school counts as both.";

/** A school's latest Ofsted judgement, briefly: "Good (graded inspection, 8 March 2022)". */
export const judgementText = ({
  judgement,
  inspection,
}: Pick<SchoolFeature, "judgement" | "inspection">) =>
  inspection
    ? `${OFSTED_JUDGEMENT_NAMES[judgement]} (${INSPECTION_NAMES[inspection.kind].toLowerCase()}, ${formatDate(inspection.inspectedOn)})`
    : OFSTED_JUDGEMENT_NAMES[judgement];

/** The lines a school's popup says about its latest Ofsted inspection. */
const inspectionLines = ({
  judgement,
  inspection,
  inspectorate,
}: SchoolFeature) => {
  if (!inspection) {
    return [
      inspectorate
        ? `No Ofsted judgement here: inspected by ${inspectorate === "ISI" ? "the Independent Schools Inspectorate" : inspectorate}, as an independent school`
        : "No inspection in Ofsted's data on state-funded schools",
    ];
  }
  const kind = INSPECTION_NAMES[inspection.kind];
  return [
    `Ofsted: ${OFSTED_JUDGEMENT_NAMES[judgement]}`,
    `${kind} on ${formatDate(inspection.inspectedOn)}${inspection.outcome ? `: ${inspection.outcome}` : ""}`,
    ...(inspection.safeguardingMet === false
      ? [
          inspection.kind === "report-card"
            ? "Safeguarding standards not met"
            : "Safeguarding not effective",
        ]
      : []),
    ...(inspection.ofPredecessor
      ? ["Inspected as the school it replaced"]
      : []),
  ];
};

const schoolDetails = (school: SchoolFeature): FeatureDetails => {
  const { name, phase, establishmentType, ages, inspection } = school;
  const details = {
    title: name,
    lines: [
      `${SCHOOL_PHASE_NAMES[phase][0]}: ${establishmentType}`,
      ...(ages ? [`Ages ${String(ages.from)} to ${String(ages.to)}`] : []),
      ...inspectionLines(school),
    ],
  };
  return inspection && inspection.grades.length > 0
    ? {
        ...details,
        lists: [
          {
            name: "Grades",
            items: inspection.grades.map(
              ({ area, grade }) => `${area}: ${OFSTED_GRADE_NAMES[grade]}`,
            ),
          },
        ],
      }
    : details;
};

/** What one transport Feature of each type, and several, are called, and the colour of footpaths' and cycle routes' lines. */
export const TRANSPORT_STYLES: Readonly<
  Record<TransportType, { name: readonly [string, string]; colour: string }>
> = {
  "railway-station": {
    name: ["Railway station", "Railway stations"],
    colour: "#00695c",
  },
  "bus-stop": { name: ["Bus stop", "Bus stops"], colour: "#00695c" },
  "car-park": { name: ["Car park", "Car parks"], colour: "#00695c" },
  "ev-charger": { name: ["EV charger", "EV chargers"], colour: "#00695c" },
  footpath: { name: ["Footpath", "Footpaths"], colour: "#5d4037" },
  "cycle-route": { name: ["Cycle route", "Cycle routes"], colour: "#00695c" },
};

/**
 * PRD FR-2.4: transport is what OpenStreetMap's volunteers have mapped, and
 * which ways count as footpaths and cycle routes.
 */
export const TRANSPORT_NOTE =
  "Transport comes from OpenStreetMap, which volunteers map, so some may be missing or out of date. Footpaths are footways, paths, bridleways and steps, not pavements mapped beside roads. Cycle routes are cycleways and paths designated for bikes, not lanes painted on roads. Their lengths count only what is inside the Search Area. The nearest railway station is looked for up to 5 km away, so it may be outside the Search Area.";

/**
 * A facility's name, or what it is if OpenStreetMap names it nothing, keeping
 * an initialism such as "EV" in capitals.
 */
export const transportName = (type: TransportType, name: string | null) => {
  const [kind] = TRANSPORT_STYLES[type].name;
  return (
    name ?? `Unnamed ${/^[A-Z]{2}/.test(kind) ? kind : kind.toLowerCase()}`
  );
};

const transportDetails = (feature: TransportFeature): FeatureDetails =>
  feature.shape === null
    ? {
        title: transportName(feature.type, feature.name),
        lines: [
          TRANSPORT_STYLES[feature.type].name[0],
          `OpenStreetMap tag: ${feature.osmTag}`,
        ],
      }
    : {
        title: TRANSPORT_STYLES[feature.type].name[1],
        lines: [
          `${formatKilometres(feature.lengthMetres)} in the Search Area`,
          "Marked where they come nearest the Location",
        ],
      };

/** What one green space of each type, and several, are called. */
export const GREEN_SPACE_NAMES: Readonly<
  Record<GreenSpaceType, readonly [string, string]>
> = {
  park: ["Park", "Parks"],
  playground: ["Playground", "Playgrounds"],
  "nature-reserve": ["Nature reserve", "Nature reserves"],
  wood: ["Wood", "Woods"],
};

/** The colour of the Green space Layer's markers and outlines. */
const GREEN_SPACE_COLOUR = "#4d7c0f";

/**
 * PRD FR-2.5: green space is what OpenStreetMap's volunteers have mapped, and
 * the nearest park is looked for beyond the Search Area.
 */
export const GREEN_SPACE_NOTE =
  "Green space comes from OpenStreetMap, which volunteers map, so some may be missing or out of date. Each park, playground, nature reserve or wood that reaches into the Search Area is counted, however much of it is outside; private ones are left out. The nearest park is looked for up to 2 km away, so it may be outside the Search Area, and its distance is to its nearest edge.";

/** A green space's name, or what it is if OpenStreetMap names it nothing. */
export const greenSpaceName = (type: GreenSpaceType, name: string | null) =>
  name ?? `Unnamed ${GREEN_SPACE_NAMES[type][0].toLowerCase()}`;

/** Where a green space's marker is, if that isn't its own point. */
const whereMarked = ({ coversLocation, shape }: GreenSpaceFeature) => {
  if (coversLocation) return ["The Location is inside it"];
  return shape ? ["Marked where it comes nearest the Location"] : [];
};

const greenSpaceDetails = (feature: GreenSpaceFeature) => ({
  title: greenSpaceName(feature.type, feature.name),
  lines: [
    GREEN_SPACE_NAMES[feature.type][0],
    `OpenStreetMap tag: ${feature.osmTag}`,
    ...whereMarked(feature),
  ],
});

/** What one property of each type, and several, are called. */
export const PROPERTY_TYPE_NAMES: Readonly<
  Record<PropertyType, readonly [string, string]>
> = {
  detached: ["Detached house", "Detached houses"],
  "semi-detached": ["Semi-detached house", "Semi-detached houses"],
  terraced: ["Terraced house", "Terraced houses"],
  flat: ["Flat or maisonette", "Flats and maisonettes"],
  other: ["Other property", "Other property"],
};

export const TENURE_NAMES: Readonly<Record<Tenure, string>> = {
  freehold: "Freehold",
  leasehold: "Leasehold",
};

/**
 * PRD FR-2.6: Price Paid is published a few months behind, places sales only
 * by postcode, and counts more than homes.
 */
export const PROPERTY_NOTE =
  "Sales come from HM Land Registry's Price Paid Data, which is published monthly, a few months behind, so the latest sales may not be in it yet. It gives each sale's postcode, not its point, so every sale is placed at the middle of its postcode. Other property is anything that isn't a house or a flat, such as a shop, an office or land; its sales count towards the median and mean of every sale.";

/** Price Paid begins in 1995 (PRD FR-2.12). */
export const SALE_HISTORY_NAME = "Every sale at this address since 1995";

/**
 * One sale in a sale's history: "29 May 2026: £173,000, -5.7%", the change
 * being from the sale before, if there was one.
 */
const historyItem = (
  { id, price, date, change }: AddressSale,
  sold: PropertySaleFeature,
) =>
  [
    `${formatDate(date)}: ${formatPrice(price)}`,
    ...(change === null ? [] : [formatChange(change)]),
    ...(id === sold.id ? ["this sale"] : []),
  ].join(", ");

/**
 * What a sale's popup says about its Energy Performance Certificate (PRD
 * FR-2.6): its band and the band it could reach, and its floor area and
 * price per m², or why there are none. Nothing without `EPC_API_KEY`.
 */
export const epcLines = (epc: SaleEpcMatch | null): string[] => {
  if (epc === null) return [];
  switch (epc.status) {
    case "unavailable":
      return ["EPC unavailable: the EPC API didn't answer"];
    case "unmatched":
      return ["No EPC matched to this sale"];
    case "matched": {
      const { currentBand, registrationDate, details } = epc.certificate;
      const band = `EPC rating ${currentBand ?? "not given"}${
        details?.potentialBand ? `, could be ${details.potentialBand}` : ""
      } (${formatDate(registrationDate)})`;
      if (details === null) {
        return [band, "Floor area unavailable: the EPC API didn't answer"];
      }
      const { floorAreaSquareMetres, pricePerSquareMetre } = details;
      return [
        band,
        floorAreaSquareMetres === null
          ? "Floor area not given"
          : `Floor area ${formatSquareMetres(floorAreaSquareMetres)}${
              pricePerSquareMetre === null
                ? ""
                : `: ${formatPrice(pricePerSquareMetre)} per m²`
            }`,
      ];
    }
  }
};

const propertyDetails = (sale: PropertySaleFeature): FeatureDetails => {
  const {
    price,
    date,
    type,
    tenure,
    newBuild,
    address,
    postcode,
    history,
    epc,
  } = sale;
  const details = {
    title: formatPrice(price),
    lines: [
      `Sold on ${formatDate(date)}`,
      `${PROPERTY_TYPE_NAMES[type][0]}, ${TENURE_NAMES[tenure].toLowerCase()}`,
      newBuild ? "New build" : "Not a new build",
      `${address}, ${postcode}`,
      ...epcLines(epc),
    ],
    ...(epc?.status === "matched" ? { notes: [EPC_ATTRIBUTION] } : {}),
  };
  if (history === null) {
    return {
      ...details,
      lines: [
        ...details.lines,
        "Sale history unavailable: Price Paid didn't answer",
      ],
    };
  }
  if (history.length < 2) {
    return {
      ...details,
      lines: [...details.lines, "No other sale at this address since 1995"],
    };
  }
  return {
    ...details,
    lists: [
      {
        name: SALE_HISTORY_NAME,
        items: history.map((sold) => historyItem(sold, sale)),
      },
    ],
  };
};

/**
 * The price of the sales at a point, briefly, to label the map (PRD FR-2.6):
 * "£173k", or from the lowest to the highest, "£105k–£290k".
 */
export const priceLabel = (features: readonly LayerFeature[]) => {
  const prices = features.filter(isPropertySale).map(({ price }) => price);
  if (prices.length === 0) return "";
  const [lowest, highest] = [Math.min(...prices), Math.max(...prices)];
  return lowest === highest
    ? formatShortPrice(lowest)
    : `${formatShortPrice(lowest)}–${formatShortPrice(highest)}`;
};

/**
 * PRD FR-2.7a: the Search Area's figures are estimated from the output areas
 * it reaches into, and come from datasets of different areas and dates.
 */
export const DEMOGRAPHICS_NOTE =
  "The population, households and age profile are estimates: each output area that reaches into the Search Area is counted in proportion to the share of it inside. ONS adjusts each Census table a little to protect privacy, so the age profile may not add up exactly to the population. Household income is ONS's estimate for each MSOA, a group of about 25 output areas. Deprivation is each LSOA's decile of the Index of Multiple Deprivation, where 1 is the most deprived 10% of LSOAs in England.";

const DEMOGRAPHICS_COLOUR = "#455a64";

const outputAreaDetails = ({
  id,
  lsoa,
  population,
  households,
  populationDensity,
  medianAge,
  householdIncome,
  deprivationDecile,
  overlap,
}: OutputAreaFeature): FeatureDetails => ({
  title: `Output area ${id}`,
  lines: [
    `${formatCount(population, ["resident", "residents"])} and ${formatCount(households, ["household", "households"])} in Census 2021`,
    `${Math.round(populationDensity).toLocaleString("en-GB")} residents per km²`,
    medianAge === null
      ? "No median age"
      : `Median age ${medianAge.toLocaleString("en-GB")}`,
    householdIncome === null
      ? "No household income estimate for its MSOA"
      : `Average household income ${formatPrice(householdIncome)} a year, in its MSOA`,
    deprivationDecile === null
      ? "No deprivation decile for its LSOA"
      : `Deprivation decile ${String(deprivationDecile)} of 10, where 1 is the most deprived${lsoa ? `, in ${lsoa.name}` : ""}`,
    `${String(Math.round(overlap * 100))}% of it is inside the Search Area`,
  ],
});

/** The Land Layer's markers' and Land Opportunities' outlines' colour. White on it is 4.9:1. */
const LAND_COLOUR = "#827717";

/** Possibly Unregistered land's outline, in a colour of its own (PRD FR-9.3). */
export const POSSIBLY_UNREGISTERED_COLOUR = "#e65100";

/**
 * Each Ownership Category's colour (PRD FR-2.7, FR-9.3): Land Opportunities
 * are drawn in it, and the INSPIRE Index Polygons a company's or council's
 * title is matched to.
 */
export const OWNERSHIP_CATEGORY_COLOURS: Readonly<
  Record<OwnershipCategory, string>
> = {
  company: "#5e35b1",
  "council-or-public-body": "#00838f",
  "other-registered": LAND_COLOUR,
  "possibly-unregistered": POSSIBLY_UNREGISTERED_COLOUR,
};

/** A Land Opportunity's colour: its Ownership Category's, or else whether it is Possibly Unregistered. */
export const landColour = ({
  ownershipCategory,
  possiblyUnregistered,
}: Pick<
  LandOpportunityFeature,
  "ownershipCategory" | "possiblyUnregistered"
>) =>
  ownershipCategory
    ? OWNERSHIP_CATEGORY_COLOURS[ownershipCategory]
    : possiblyUnregistered
      ? POSSIBLY_UNREGISTERED_COLOUR
      : LAND_COLOUR;

/** "Company-owned (indicative)": an Ownership Category is always said to be indicative (PRD FR-5.4a). */
export const ownershipText = (category: OwnershipCategory) =>
  `${OWNERSHIP_CATEGORY_NAMES[category]} (indicative)`;

/** Which dataset a matched title is from: CCOD lists councils' titles too. */
const TITLE_DATASET_NAMES = {
  ccod: "UK companies data",
  ocod: "overseas companies data",
} as const;

/** "2 October 2026", or "October 2026" for a month. */
const dateText = (date: string) =>
  date.length === 7 ? formatMonth(date) : formatDate(date);

/**
 * A title matched in or around a Land Opportunity, as the popup and the Land
 * panel say it: its address, title number and Proprietorship Category, the
 * category it gives the polygon it is matched to, and how far that is.
 */
export const matchedTitleText = ({
  propertyAddress,
  titleNumber,
  proprietorshipCategory,
  dataset,
  ownershipCategory,
  distanceMetres,
}: MatchedTitle) =>
  `${propertyAddress}: title ${titleNumber}, ${proprietorshipCategory} (${TITLE_DATASET_NAMES[dataset]}), ${ownershipText(ownershipCategory)}, ${distanceMetres === 0 ? "on this land" : `${formatDistance(distanceMetres)} away`}`;

/** What the titles matched in and around a Land Opportunity are listed as. */
export const MATCHED_TITLES_NAME =
  "Company and council titles matched in and around it by address, indicative";

/**
 * The statements HM Land Registry's licence for CCOD and OCOD requires, with
 * the year and date of the data the titles listed are from (PRD FR-10.1a).
 */
export const titleAttributions = (titles: readonly MatchedTitle[]) =>
  [...new Set(titles.map(({ sourceDate }) => sourceDate))]
    .sort()
    .map(
      (date) =>
        `${titleAttribution(date.slice(0, 4))} UK and overseas companies that own property in England and Wales, as at ${dateText(date)}.`,
    );

/** What industrial, commercial and retail land use, drawn as context, are called, and their colour. */
export const LAND_USE_STYLES: Readonly<
  Record<LandUseContextType, { name: string; colour: string }>
> = {
  industrial: { name: "Industrial land", colour: "#57606a" },
  commercial: { name: "Commercial land", colour: "#57606a" },
  retail: { name: "Retail land", colour: "#57606a" },
};

/**
 * PRD FR-5.7 and FR-5.8: a Land Opportunity only warrants investigation, and
 * INSPIRE covers only registered freehold titles. Every Land view says both.
 */
export const LAND_NOTE = `${LAND_OPPORTUNITY_WORDING} ${INSPIRE_FREEHOLD_NOTE}`;

/** An area in acres, with hectares: "2.48 acres (1 ha)". */
export const formatLandArea = ({
  areaAcres,
  areaHectares,
}: Pick<LandOpportunityFeature, "areaAcres" | "areaHectares">) =>
  `${formatCount(Number(areaAcres.toPrecision(3)), ["acre", "acres"])} (${Number(areaHectares.toPrecision(3)).toLocaleString("en-GB")} ha)`;

const capitalise = (text: string) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** OpenStreetMap's land use tags, as words: "landuse=farmland" as "farmland". */
export const landUseText = (tags: readonly string[]) =>
  tags.length === 0
    ? "Open land"
    : capitalise(
        formatList(
          tags.map((tag) => (tag.split("=")[1] ?? tag).replaceAll("_", " ")),
        ),
      );

/** A share of a Land Parcel, as a whole per cent: "73%", or "under 1%". */
const percentOf = (share: number) =>
  share > 0 && share < 0.005
    ? "under 1%"
    : `${String(Math.round(share * 100))}%`;

const NEARBY_WITHIN = formatDistance(
  LAND_PARCEL_RULES.developmentActivityMetres,
);

/** What is said where Planning Applications near land aren't looked for: across a whole Land Coverage Area. */
export const NEARBY_APPLICATIONS_NOT_LOOKED_FOR = `Planning Applications within ${NEARBY_WITHIN} are found for the Land Opportunities in the Search Area, among its own.`;

/**
 * A Land Opportunity's nearby development activity (PRD FR-5.4), or why it
 * isn't known: "Nearby development activity: 2 Planning Applications within
 * 500 m in the Search Area since its first day, 1 approved and 1 major, for
 * about 120 new homes approved or pending, estimated".
 */
export const nearbyApplicationsSummary = (
  nearby: NearbyPlanningApplications | null,
) => {
  if (!nearby) return NEARBY_APPLICATIONS_NOT_LOOKED_FOR;
  const within = formatDistance(nearby.withinMetres);
  if (nearby.status === "queued") {
    return `Nearby development activity: ${PLANNING_APPLICATIONS_RATE_LIMITED.toLowerCase()}`;
  }
  if (nearby.status === "unavailable" || !nearby.found) {
    return `Nearby development activity unavailable: ${nearby.provider} didn't answer.`;
  }
  const { count, approved, major, estimatedHomes } = nearby.found;
  if (count === 0) {
    return `Nearby development activity: no Planning Applications within ${within} in the Search Area`;
  }
  const homes =
    estimatedHomes > 0
      ? `, for about ${formatCount(estimatedHomes, ["new home", "new homes"])} approved or pending, estimated`
      : "";
  return `Nearby development activity: ${formatCount(count, ["Planning Application", "Planning Applications"])} within ${within} in the Search Area, ${approved.toLocaleString("en-GB")} approved and ${major.toLocaleString("en-GB")} major${homes}`;
};

/** What the approved and major Planning Applications near a Land Opportunity are listed as. */
export const NEARBY_APPLICATIONS_NAME = `Approved and major Planning Applications within ${NEARBY_WITHIN}, nearest first`;

/**
 * PRD FR-5.4: only the Search Area's Planning Applications are known, and
 * their homes are estimated.
 */
export const NEARBY_APPLICATIONS_NOTE =
  "Nearby development activity counts the Planning Applications received in the Search Area in the last 3 years, so none beyond its edge. Their homes are estimated from their descriptions.";

/**
 * An approved or major Planning Application near a Land Opportunity: "71
 * High Pavement: Erection of 120 dwellings (approved, major application,
 * about 120 new homes, estimated), 240 m away".
 */
export const nearbyApplicationText = ({
  address,
  reference,
  description,
  status,
  applicationType,
  estimatedHomes,
  distanceMetres,
}: NearbyPlanningApplication) => {
  const about = [
    PLANNING_APPLICATION_STATUS_STYLES[status].name.toLowerCase(),
    PLANNING_APPLICATION_TYPE_NAMES[applicationType][0].toLowerCase(),
    ...(estimatedHomes
      ? [
          `about ${formatCount(estimatedHomes, ["new home", "new homes"])}, estimated`,
        ]
      : []),
  ];
  return `${address ?? reference}: ${description} (${about.join(", ")}), ${
    distanceMetres === 0
      ? "on this land"
      : `${formatDistance(distanceMetres)} away`
  }`;
};

/** Each tag of a Land Opportunity, as the popup and the Land panel say it (PRD FR-5.4). */
export const landTags = ({
  landUse,
  possiblyUnregistered,
  ownershipCategory,
  inspireCoverage,
  roadDistanceMetres,
  floodZone,
  constraints,
  onListedBuildingOutline,
  estimatedHomes,
  nearbyPlanningApplications,
}: LandOpportunityFeature) => [
  landUseText(landUse),
  possiblyUnregistered
    ? `Possibly Unregistered: INSPIRE Index Polygons cover ${percentOf(inspireCoverage)} of it`
    : `INSPIRE Index Polygons cover ${percentOf(inspireCoverage)} of it`,
  ...(ownershipCategory
    ? [`Ownership Category: ${ownershipText(ownershipCategory)}`]
    : []),
  roadDistanceMetres === null
    ? `No road within ${formatDistance(LAND_PARCEL_RULES.roadSearchMetres)}`
    : `Nearest road ${formatDistance(roadDistanceMetres)} away`,
  floodZone === null ? "Flood zone 1" : `Flood zone ${String(floodZone)}`,
  constraints.length === 0
    ? "No Planning Constraints recorded"
    : `Planning Constraints: ${formatList(
        constraints.map(({ type, name }) =>
          type === "flood-zone"
            ? name
            : `${name} (${PLANNING_CONSTRAINT_STYLES[type].name[0].toLowerCase()})`,
        ),
      )}`,
  ...(onListedBuildingOutline ? ["On a listed building's outline"] : []),
  `Room for about ${formatCount(estimatedHomes, ["home", "homes"])}, estimated`,
  nearbyApplicationsSummary(nearbyPlanningApplications),
];

/**
 * A land sale near a Land Opportunity (PRD FR-5.4b), with its price and
 * date: "£110,000 on 11 February 2022: PLOT D, SIDINGS ROAD, NOTTINGHAM,
 * NG17 7JZ, 510 m away", or, in the Land Layer's statistics, "510 m from the
 * nearest Land Opportunity".
 */
export const landSaleText = (
  { price, date, address, postcode, distanceMetres }: LandSale,
  fromNearest = false,
) =>
  `${formatPrice(price)} on ${formatDate(date)}: ${address}, ${postcode}, ${
    distanceMetres === 0
      ? fromNearest
        ? "on a Land Opportunity"
        : "on this land"
      : `${formatDistance(distanceMetres)} ${fromNearest ? "from the nearest Land Opportunity" : "away"}`
  }`;

/**
 * What the land sales near a Land Opportunity are listed as, marked as
 * FR-5.4b says: "Land sales within 1 mile since 9 October 2021, newest
 * first, indicative: may not be land".
 */
export const landSalesName = ({ period }: Pick<NearbyLandSales, "period">) =>
  `Land sales within 1 mile since ${formatDate(period.from)}, newest first, ${LAND_SALE_LABEL}`;

/** What is said where land sales aren't looked for: across a whole Land Coverage Area. */
export const LAND_SALES_NOT_LOOKED_FOR =
  "Land sales within 1 mile are found for the Land Opportunities in the Search Area, and for the one chosen in the Land panel.";

/**
 * How many land sales there are within 1 mile of a Land Opportunity, or of
 * any, and their median price, or why they aren't known (PRD FR-5.4b): "76
 * land sales within 1 mile since 9 October 2021, indicative: may not be
 * land. Median £207,000".
 */
export const landSalesSummary = (sales: NearbyLandSales | null) => {
  if (!sales) return LAND_SALES_NOT_LOOKED_FOR;
  if (sales.status === "unavailable") {
    return "Land sales within 1 mile unavailable: HM Land Registry's Price Paid didn't answer.";
  }
  if (sales.status === "not-prepared" || !sales.found) {
    return "Land sales within 1 mile not prepared. Run pnpm data:prepare again to prepare the postcodes they are found in.";
  }
  const since = formatDate(sales.period.from);
  const { count, medianPrice } = sales.found;
  return count === 0
    ? `No land sales within 1 mile since ${since}.`
    : `${formatCount(count, ["land sale", "land sales"])} within 1 mile since ${since}, ${LAND_SALE_LABEL}. Median ${formatPrice(medianPrice ?? 0)}.`;
};

/** "and 66 more", for land sales counted but not listed. */
export const moreLandSales = (sales: NearbyLandSales | null) => {
  const more = sales?.found ? sales.found.count - sales.found.sales.length : 0;
  return more > 0 ? `and ${formatCount(more, ["more", "more"])}, older` : null;
};

/** At most this many overlapping INSPIRE Index Polygons are listed in a popup. */
const INSPIRE_LISTED = 10;

/** An INSPIRE Index Polygon that overlaps a Land Opportunity, as the popup and the Land panel list it. */
export const inspireOverlapText = ({
  inspireId,
  share,
  ownershipCategory,
}: LandOpportunityFeature["inspirePolygons"][number]) =>
  `INSPIRE ID ${inspireId}: ${percentOf(share)} of it${ownershipCategory ? `, ${ownershipText(ownershipCategory)}` : ""}`;

const landDetails = (opportunity: LandOpportunityFeature): FeatureDetails => {
  const {
    name,
    inspirePolygons,
    matchedTitles,
    nearbyLandSales,
    nearbyPlanningApplications,
  } = opportunity;
  const nearbyApplications = nearbyPlanningApplications?.found;
  const sales = nearbyLandSales?.found?.sales ?? [];
  const moreSales = moreLandSales(nearbyLandSales);
  const listed = inspirePolygons.slice(0, INSPIRE_LISTED);
  const more = inspirePolygons.length - listed.length;
  return {
    title: name ?? `Land Opportunity: ${formatLandArea(opportunity)}`,
    lines: [
      ...(name ? [formatLandArea(opportunity)] : []),
      ...landTags(opportunity),
      landSalesSummary(nearbyLandSales),
    ],
    lists: [
      ...(inspirePolygons.length > 0
        ? [
            {
              name: "INSPIRE Index Polygons that overlap it",
              items: [
                ...listed.map(inspireOverlapText),
                ...(more > 0
                  ? [`and ${formatCount(more, ["more", "more"])}`]
                  : []),
              ],
            },
          ]
        : []),
      ...(matchedTitles.length > 0
        ? [
            {
              name: MATCHED_TITLES_NAME,
              items: matchedTitles.map(matchedTitleText),
            },
          ]
        : []),
      ...(nearbyLandSales && sales.length > 0
        ? [
            {
              name: landSalesName(nearbyLandSales),
              items: [
                ...sales.map((sale) => landSaleText(sale)),
                ...(moreSales ? [moreSales] : []),
              ],
            },
          ]
        : []),
      ...(nearbyApplications && nearbyApplications.highlighted.length > 0
        ? [
            {
              name: NEARBY_APPLICATIONS_NAME,
              items: nearbyApplications.highlighted.map(nearbyApplicationText),
            },
          ]
        : []),
    ],
    notes: [
      ...(nearbyApplications ? [NEARBY_APPLICATIONS_NOTE] : []),
      ...titleAttributions(matchedTitles),
      ...(nearbyLandSales && sales.length > 0
        ? [
            LAND_SALES_NOTE,
            creditText(pricePaidCredit(nearbyLandSales.period.to.slice(0, 4))),
          ]
        : []),
    ],
    links: HM_LAND_REGISTRY_SEARCHES,
  };
};

export const LAYER_STYLES: Readonly<Record<ServedLayerId, LayerStyle>> = {
  crime: {
    name: "Crime",
    noun: ["crime", "crimes"],
    colour: "#bf360c",
    // A shield.
    icon: "M12 2 4 5v6c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5l-8-3Z",
    note: CRIME_LOCATIONS_NOTE,
    popupNote: "The police give an approximate location.",
    details: describing(isCrime, crimeDetails),
    label: null,
    shapeColour: null,
    markerColour: null,
  },
  planning: {
    name: "Planning",
    // Planning Constraints and Planning Applications, which may share a point.
    noun: ["planning Feature", "planning Features"],
    colour: "#6a1b9a",
    // A building with columns.
    icon: "M12 2 2 7v2h20V7L12 2ZM4 11v7h3v-7H4Zm6.5 0v7h3v-7h-3ZM17 11v7h3v-7h-3ZM2 20v2h20v-2H2Z",
    note: PLANNING_CONSTRAINTS_NOTE,
    popupNote: null,
    details: (feature) =>
      isPlanningApplication(feature)
        ? applicationDetails(feature)
        : describing(isPlanningConstraint, planningDetails)(feature),
    label: null,
    shapeColour: (feature) =>
      isPlanningConstraint(feature)
        ? PLANNING_CONSTRAINT_STYLES[feature.type].colour
        : "#6a1b9a",
    // Planning Applications by their status (FR-2.2), where those at one
    // point share it; Planning Constraints in the Layer's own colour.
    markerColour: (features) => {
      const statuses = new Set(
        features.map((feature) =>
          isPlanningApplication(feature) ? feature.status : null,
        ),
      );
      const [only] = statuses;
      return statuses.size === 1 && only
        ? PLANNING_APPLICATION_STATUS_STYLES[only].colour
        : "#6a1b9a";
    },
  },
  amenities: {
    name: "Amenities",
    noun: ["amenity", "amenities"],
    colour: "#ad1457",
    // A shopping bag.
    icon: "M5 8h14l-1 14H6L5 8Zm4-1V6a3 3 0 0 1 6 0v1h-2V6a1 1 0 0 0-2 0v1H9Z",
    note: AMENITIES_NOTE,
    popupNote: null,
    details: describing(isAmenity, amenityDetails),
    label: null,
    shapeColour: null,
    markerColour: null,
  },
  schools: {
    name: "Schools",
    noun: ["school", "schools"],
    colour: "#7b3f00",
    // A mortarboard.
    icon: "M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6.5 9.6V16c0 1.9 2.9 4 6.5 4s6.5-2.1 6.5-4v-3.4L12 16.1l-6.5-3.5Z",
    note: SCHOOLS_NOTE,
    popupNote: null,
    details: describing(isSchool, schoolDetails),
    label: null,
    shapeColour: null,
    markerColour: null,
  },
  transport: {
    name: "Transport",
    noun: ["transport Feature", "transport Features"],
    colour: "#00695c",
    // A bus, from the front.
    icon: "M6 3h12a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20h-3v-2H8v2H5v-2.3A2 2 0 0 1 4 16V5a2 2 0 0 1 2-2Zm0 3v5h12V6H6Zm1.5 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
    note: TRANSPORT_NOTE,
    popupNote: null,
    details: describing(isTransport, transportDetails),
    label: null,
    shapeColour: (feature) =>
      isTransport(feature)
        ? TRANSPORT_STYLES[feature.type].colour
        : TRANSPORT_STYLES.footpath.colour,
    markerColour: null,
  },
  "green-space": {
    name: "Green space",
    noun: ["green space", "green spaces"],
    colour: GREEN_SPACE_COLOUR,
    // A tree.
    icon: "M12 2 5 12h3l-4 6h7v4h2v-4h7l-4-6h3L12 2Z",
    note: GREEN_SPACE_NOTE,
    popupNote: null,
    details: describing(isGreenSpace, greenSpaceDetails),
    label: null,
    shapeColour: () => GREEN_SPACE_COLOUR,
    markerColour: null,
  },
  property: {
    name: "Property",
    noun: ["sale", "sales"],
    colour: "#856404",
    // A house.
    icon: "M12 3 2 12h3v9h5v-6h4v6h5v-9h3L12 3Z",
    note: PROPERTY_NOTE,
    popupNote:
      "Placed at the middle of its postcode: Price Paid gives no closer location.",
    details: describing(isPropertySale, propertyDetails),
    label: priceLabel,
    shapeColour: null,
    markerColour: null,
  },
  land: {
    name: "Land",
    noun: ["Land Opportunity", "Land Opportunities"],
    colour: LAND_COLOUR,
    // A field below hills.
    icon: "M14 6 10.25 11l2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6Z",
    note: LAND_NOTE,
    popupNote: LAND_NOTE,
    details: describing(isLandOpportunity, landDetails),
    label: null,
    shapeColour: (feature) =>
      isLandOpportunity(feature) ? landColour(feature) : LAND_COLOUR,
    markerColour: null,
  },
  demographics: {
    name: "Demographics",
    noun: ["output area", "output areas"],
    colour: DEMOGRAPHICS_COLOUR,
    // Two people.
    icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM1 21v-1c0-3.3 3.6-6 8-6s8 2.7 8 6v1H1Zm17.5 0v-1c0-1.7-.7-3.2-1.9-4.4 3.3.3 6.4 2 6.4 4.4v1h-4.5Z",
    note: DEMOGRAPHICS_NOTE,
    popupNote: "Marked at a point of it inside the Search Area.",
    details: describing(isOutputArea, outputAreaDetails),
    label: null,
    // Shaded by the measure chosen, which the map is given.
    shapeColour: () => DEMOGRAPHICS_COLOUR,
    markerColour: null,
  },
};

/** What each age group is called. */
export const AGE_GROUP_NAMES: Readonly<Record<AgeGroup, string>> = {
  "under-15": "Under 15",
  "15-to-24": "15 to 24",
  "25-to-44": "25 to 44",
  "45-to-64": "45 to 64",
  "65-and-over": "65 and over",
};
