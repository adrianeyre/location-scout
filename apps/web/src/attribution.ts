import {
  EPC_SOURCE,
  GOOGLE_MAPS_TERMS_URL,
  STREET_VIEW_ATTRIBUTION,
  TITLE_DATASETS,
  titleAttribution,
  type LayerResponse,
  type PlanningApplicationsProviderInfo,
  type PreparedDataset,
  type SourceReport,
} from "@location-scout/shared";

import { formatDate } from "./format";
import type { LayerFeature } from "./layers/layer-styles";
import type { CoverageState } from "./useCoverage";

/** Words in a credit that link somewhere, such as a source or its licence. */
export interface CreditLink {
  text: string;
  url: string;
}

/**
 * What one Data Source's licence asks to be said wherever its data is shown
 * (PRD §6.15), as words and links in order, so the page, a popup and a
 * printed report each give it the same, and it can be read as text.
 */
export type Credit = readonly (string | CreditLink)[];

/** A credit as plain text, its links' words in place. */
export const creditText = (credit: Credit) =>
  credit.map((part) => (typeof part === "string" ? part : part.text)).join("");

/** The licence most of the Data Sources publish under. */
export const OGL_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

const OGL: CreditLink = { text: "Open Government Licence v3.0", url: OGL_URL };

/** Where OpenStreetMap asks to be credited from, which explains its licence. */
export const OPENSTREETMAP_COPYRIGHT_URL =
  "https://www.openstreetmap.org/copyright";

const OPENSTREETMAP: CreditLink = {
  text: "OpenStreetMap contributors",
  url: OPENSTREETMAP_COPYRIGHT_URL,
};

/** OpenStreetMap's licence, which its copyright page asks to be named and linked. */
const ODBL: CreditLink = {
  text: "ODbL",
  url: "https://opendatacommons.org/licenses/odbl/",
};

/** What a credit says in place of a year it can't know, as the guide writes it. */
export const ANY_YEAR = "[year]";

/**
 * PRD FR-10.1's credit, in the footer of every view and the report: the
 * Data Sources almost every Search Area draws on.
 */
export const FOOTER_CREDIT: Credit = [
  "© ",
  OPENSTREETMAP,
  " (",
  ODBL,
  "). police.uk, HM Land Registry and planning.data.gov.uk data under the ",
  OGL,
  ". Contains OS data © Crown copyright and database right.",
];

/** OpenStreetMap's data, `from` where it was read, such as the Overpass API. */
export const openStreetMapCredit = (from = ""): Credit => [
  "Map data © ",
  OPENSTREETMAP,
  ", ",
  ODBL,
  `${from ? `, ${from}` : ""}.`,
];

export const POLICE_CREDIT: Credit = [
  "Crime data from ",
  { text: "police.uk", url: "https://data.police.uk/" },
  ", licensed under the ",
  OGL,
  ".",
];

/** planning.data.gov.uk's Planning Constraints, live or `from` its bulk files. */
export const planningConstraintsCredit = (from = ""): Credit => [
  "Planning Constraints from ",
  { text: "planning.data.gov.uk", url: "https://www.planning.data.gov.uk/" },
  `${from}, licensed under the `,
  OGL,
  ".",
];

/**
 * The statement planning.data.gov.uk's conservation areas and listed
 * buildings carry from Historic England, which supplies them, with the day
 * they were obtained, an ISO 8601 date, or `ANY_YEAR`'s placeholders.
 */
export const historicEnglandCredit = (obtainedOn: string | null): Credit => {
  const year = obtainedOn?.slice(0, 4) ?? ANY_YEAR;
  return [
    `Conservation areas and listed buildings: © Historic England ${year}. Contains Ordnance Survey data © Crown copyright and database right ${year}. The Historic England GIS Data contained in this material was obtained on ${obtainedOn ? formatDate(obtainedOn) : "[date]"}. The most publicly available up to date Historic England GIS Data can be obtained from `,
    { text: "HistoricEngland.org.uk", url: "https://historicengland.org.uk" },
    ".",
  ];
};

/** What PlanIt's points looked up from postcodes contain (its acknowledgements). */
const PLANIT_POSTCODES =
  " Locations PlanIt looks up from postcodes contain OS data © Crown copyright and database right, Royal Mail data © Royal Mail copyright and database right, and National Statistics data © Crown copyright and database right, under the ";

/**
 * The Planning Applications' provider, PlanIt or PlanWire (ADR 0003), as
 * it had them `asOf` an ISO 8601 date, if given.
 */
export const planningApplicationsCredit = (
  provider: Pick<PlanningApplicationsProviderInfo, "id" | "name" | "url">,
  asOf: string | null = null,
): Credit => [
  "Planning Applications from ",
  { text: provider.name, url: provider.url },
  asOf ? `, as it had them on ${formatDate(asOf)}.` : ".",
  ...(provider.id === "planit" ? [PLANIT_POSTCODES, OGL, "."] : []),
];

/** The PlanIt and PlanWire this app may ask, for the credits of all sources. */
const PLANIT = {
  id: "planit",
  name: "PlanIt",
  url: "https://www.planit.org.uk/",
} as const;
const PLANWIRE = {
  id: "planwire",
  name: "PlanWire",
  url: "https://planwire.io/",
} as const;

/** Copyright in Price Paid Data of `year` (PRD FR-10.3). */
export const pricePaidCopyright = (year: string) =>
  `Contains HM Land Registry data © Crown copyright and database right ${year}.`;

/**
 * The conditions Royal Mail and Ordnance Survey put on Price Paid Data's
 * address data, which HM Land Registry's attribution includes (PRD FR-10.3).
 */
export const PRICE_PAID_ADDRESS_CONDITIONS =
  "Price Paid Data contains address data processed against Ordnance Survey’s AddressBase Premium product, which incorporates Royal Mail’s PAF® database (Address Data). Royal Mail and Ordnance Survey permit its use for personal and/or non-commercial use, and to display for the purpose of providing residential property price information services.";

/** HM Land Registry's required wording for Price Paid Data of `year` (PRD FR-10.3). */
export const pricePaidCredit = (year: string): Credit => [
  `${pricePaidCopyright(year)} This data is licensed under the `,
  OGL,
  `. ${PRICE_PAID_ADDRESS_CONDITIONS}`,
];

/** MHCLG's Energy Performance Certificates (PRD FR-10.1a), saying what `EPC_ATTRIBUTION` does. */
export const EPC_CREDIT: Credit = [
  "Energy Performance Certificate data from MHCLG's ",
  { text: EPC_SOURCE.name, url: EPC_SOURCE.url },
  ", licensed under the ",
  OGL,
  ".",
];

/**
 * postcodes.io's postcodes are the ONS Postcode Directory's, which ONS's
 * licence for postcode products asks to be credited so.
 */
export const POSTCODES_CREDIT: Credit = [
  "Postcode data via ",
  { text: "postcodes.io", url: "https://postcodes.io" },
  ": Contains OS data © Crown copyright and database right. Contains Royal Mail data © Royal Mail copyright and database right. Source: Office for National Statistics licensed under the ",
  OGL,
  ".",
];

/** ONS Open Geography's council boundaries, of `year` (PRD FR-10.1a). */
export const councilBoundariesCredit = (year: string): Credit => [
  "Council boundaries: Source: Office for National Statistics licensed under the ",
  OGL,
  `. Contains OS data © Crown copyright and database right ${year}.`,
];

/** The Demographics Layer's datasets (PRD FR-10.1a). */
export const DEMOGRAPHICS_CREDIT: Credit = [
  "Census, boundary and income data: Source: Office for National Statistics licensed under the ",
  OGL,
  // The licence is linked once.
  ". Contains OS data © Crown copyright and database right 2021. English Indices of Deprivation © Crown copyright, Ministry of Housing, Communities and Local Government, licensed under the Open Government Licence v3.0.",
];

/** The Schools Layer's datasets (PRD FR-10.1a). */
export const SCHOOLS_CREDIT: Credit = [
  "Contains public sector information from the Department for Education's Get Information about Schools and Ofsted, licensed under the ",
  OGL,
  ".",
];

/** A prepared dataset's own statements, with its conditions (PRD FR-10.2). */
export const datasetCredit = ({ name, attribution }: PreparedDataset) =>
  attribution
    ? ([
        `${name}: ${attribution.statements.join(" ")} `,
        { text: "Conditions of use", url: attribution.conditionsUrl },
        ".",
      ] satisfies Credit)
    : null;

const LAND_REGISTRY_DATASETS =
  "https://use-land-property-data.service.gov.uk/datasets";

/** CCOD's and OCOD's statement and licences, of `year` (PRD FR-10.1a). */
export const titlesCredit = (year: string): Credit => [
  `UK and overseas companies that own property in England and Wales (CCOD and OCOD): ${titleAttribution(year)} `,
  { text: "CCOD licence", url: `${LAND_REGISTRY_DATASETS}/ccod/licence/view` },
  ", ",
  { text: "OCOD licence", url: `${LAND_REGISTRY_DATASETS}/ocod/licence/view` },
  ".",
];

/** HM Land Registry's and Ordnance Survey's statements for INSPIRE, of `year` (PRD FR-10.2). */
export const inspireCredit = (year: string): Credit => [
  `INSPIRE Index Polygons: This information is subject to Crown copyright and database rights ${year} and is reproduced with the permission of HM Land Registry. The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights ${year} Ordnance Survey AC0000851063. `,
  {
    text: "Conditions of use",
    url: `${LAND_REGISTRY_DATASETS}/inspire/#conditions`,
  },
  ".",
];

/** Ordnance Survey's Code-Point Open, of `year`, which places land sales and titles. */
export const codePointOpenCredit = (year: string): Credit => [
  `Code-Point Open: Contains OS data © Crown copyright and database right ${year}. Contains Royal Mail data © Royal Mail copyright and database right ${year}. Contains National Statistics data © Crown copyright and database right ${year}. `,
  { text: "Conditions of use", url: OGL_URL },
  ".",
];

/** Google's credit beneath the Street View panel (PRD FR-10.1a). */
export const STREET_VIEW_CREDIT: Credit = [
  `${STREET_VIEW_ATTRIBUTION}. `,
  { text: "Terms", url: GOOGLE_MAPS_TERMS_URL },
];

/** One Data Source and its credit, as the footer's Data sources and licences lists them. */
export interface SourceCredit {
  name: string;
  /** What it gives the app. */
  usedFor: string;
  credit: Credit;
}

/**
 * Every Data Source the app shows data from, and its credit, a year it
 * names being that of the data wherever it is shown (PRD §6.15). The guide's
 * Attribution section gives each the same (`attribution.test.ts`).
 */
export const SOURCE_CREDITS: readonly SourceCredit[] = [
  {
    name: "OpenStreetMap",
    usedFor:
      "The base map, address search (Nominatim), amenities, transport and green space (the Overpass API), and Land Parcels (Geofabrik's extracts)",
    credit: openStreetMapCredit(),
  },
  {
    name: "data.police.uk",
    usedFor: "Street-level crime",
    credit: POLICE_CREDIT,
  },
  {
    name: "planning.data.gov.uk",
    usedFor: "Planning Constraints, live and from its bulk files",
    credit: planningConstraintsCredit(),
  },
  {
    name: "Historic England, via planning.data.gov.uk",
    usedFor: "Conservation areas and listed buildings",
    credit: historicEnglandCredit(null),
  },
  {
    name: "PlanIt",
    usedFor: "Planning Applications, by default",
    credit: planningApplicationsCredit(PLANIT),
  },
  {
    name: "PlanWire",
    usedFor: "Planning Applications, with PLANWIRE_API_KEY",
    credit: planningApplicationsCredit(PLANWIRE),
  },
  {
    name: "HM Land Registry Price Paid Data",
    usedFor: "Sold prices, sale histories and land sales",
    credit: pricePaidCredit(ANY_YEAR),
  },
  {
    name: "HM Land Registry INSPIRE Index Polygons",
    usedFor: "Registered freehold outlines, for Possibly Unregistered land",
    credit: inspireCredit(ANY_YEAR),
  },
  {
    name: "HM Land Registry CCOD and OCOD",
    usedFor: "Company and council titles, for Ownership Categories",
    credit: titlesCredit(ANY_YEAR),
  },
  {
    name: "Energy Performance Certificates (MHCLG)",
    usedFor: "Energy ratings and floor areas, with EPC_API_KEY",
    credit: EPC_CREDIT,
  },
  {
    name: "postcodes.io",
    usedFor: "Postcodes, local geography and the postcodes in a Search Area",
    credit: POSTCODES_CREDIT,
  },
  {
    name: "Ordnance Survey Code-Point Open",
    usedFor: "Postcode points, for land sales and company and council titles",
    credit: codePointOpenCredit(ANY_YEAR),
  },
  {
    name: "ONS Open Geography",
    usedFor: "Council boundaries",
    credit: councilBoundariesCredit(ANY_YEAR),
  },
  {
    name: "ONS Census 2021, income estimates and English Indices of Deprivation",
    usedFor: "Demographics",
    credit: DEMOGRAPHICS_CREDIT,
  },
  {
    name: "Get Information about Schools and Ofsted",
    usedFor: "Schools and their Ofsted judgements",
    credit: SCHOOLS_CREDIT,
  },
  {
    name: "Google Street View",
    usedFor: "Street-level imagery, with GOOGLE_MAPS_API_KEY",
    credit: STREET_VIEW_CREDIT,
  },
];

const answered = (sources: readonly SourceReport[], id: string) =>
  sources.find((source) => source.id === id && source.status === "ok") ?? null;

/** The year of the latest data a source answered with, if it says. */
const yearOf = (source: SourceReport | null) =>
  source?.period?.to.slice(0, 4) ?? null;

/** The Historic England statement, for live constraints, if planning.data.gov.uk answered. */
export const liveHistoricEnglandCredit = (sources: readonly SourceReport[]) => {
  const planningData = answered(sources, "planning-data");
  return planningData
    ? historicEnglandCredit(planningData.period?.to ?? null)
    : null;
};

/** The Historic England statement for a Land Coverage Area's bulk files, by their date. */
export const preparedHistoricEnglandCredit = (
  datasets: readonly PreparedDataset[],
) => {
  const dated = datasets.find(
    ({ id }) => id === "conservation-area" || id === "listed-building",
  );
  return dated ? historicEnglandCredit(dated.sourceDate) : null;
};

/** The prepared datasets the Land Layer's Land Coverage Areas, and their titles, draw on. */
export const landDatasets = (
  layer: Extract<LayerResponse, { layer: "land" }>,
  coverage: CoverageState,
) => {
  const prepared = coverage.status === "ok" ? coverage.coverage : null;
  const areas =
    prepared?.landCoverageAreas.filter(({ council }) =>
      layer.landCoverageAreas.some(({ code }) => code === council.code),
    ) ?? [];
  const titles = layer.statistics?.ownershipCategories
    ? (prepared?.datasets.filter(({ id }) =>
        TITLE_DATASETS.some((dataset) => dataset === id),
      ) ?? [])
    : [];
  return { areas: areas.flatMap(({ datasets }) => datasets), titles };
};

/** What credits the Features of one Layer in their popups. */
export type FeatureCredits = (feature: LayerFeature) => readonly Credit[];

const isOwn = (credit: Credit | null): credit is Credit => credit !== null;

/**
 * The credits each Feature's popup gives, for the Data Sources it comes
 * from (PRD FR-2.10, §6.15): a Planning Application's provider's and a
 * Planning Constraint's planning.data.gov.uk's, a sale's Price Paid's and
 * any matched certificate's, a Land Opportunity's land data's.
 */
export const featureCredits = (
  layer: LayerResponse,
  coverage: CoverageState,
): FeatureCredits => {
  switch (layer.layer) {
    case "crime":
      return () => [POLICE_CREDIT];
    case "planning": {
      const applications =
        layer.applications?.status === "ok" ? layer.applications : null;
      const constraints = [
        planningConstraintsCredit(),
        liveHistoricEnglandCredit(layer.sources),
      ].filter(isOwn);
      return (feature) =>
        "applicationType" in feature
          ? applications
            ? [planningApplicationsCredit(applications.provider)]
            : []
          : constraints;
    }
    case "amenities":
    case "transport":
    case "green-space":
      return () => [openStreetMapCredit("from the Overpass API")];
    case "schools":
      return () => [SCHOOLS_CREDIT];
    case "property": {
      const year = yearOf(answered(layer.sources, "land-registry"));
      const pricePaid = year ? [pricePaidCredit(year)] : [];
      return (feature) =>
        "epc" in feature && feature.epc?.status === "matched"
          ? [...pricePaid, EPC_CREDIT]
          : pricePaid;
    }
    case "land": {
      const { areas } = landDatasets(layer, coverage);
      const credits = [
        openStreetMapCredit(
          "from Geofabrik's extracts, which Land Parcels are built from",
        ),
        planningConstraintsCredit("'s bulk files"),
        preparedHistoricEnglandCredit(areas),
        ...areas.map(datasetCredit),
      ].filter(isOwn);
      return () => credits;
    }
    case "demographics":
      return () => [DEMOGRAPHICS_CREDIT];
  }
};
