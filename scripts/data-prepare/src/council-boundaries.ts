import {
  arcGisQueryUrl,
  queryPages,
  type ArcGisQuery,
  type FeatureCollection,
} from "./arcgis";

/**
 * The council boundaries, from ONS Open Geography (PRD FR-6.1): every local
 * authority district's boundary, generalised to 20 m and clipped to the
 * coastline (BGC). They answer which council a Location is in, and give each
 * Land Coverage Area its outline.
 *
 * ONS publishes each edition as a new service whose fields carry its year, so
 * a new edition means changing `COUNCIL_BOUNDARIES` and nothing else.
 */
export const COUNCIL_BOUNDARIES = {
  name: "Council boundaries",
  source: "ONS Open Geography",
  url: "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_May_2026_Boundaries_UK_BGC/FeatureServer/0",
  /** The boundaries are as they stood in May 2026. */
  sourceDate: "2026-05",
  codeField: "LAD26CD",
  nameField: "LAD26NM",
} as const;

/** ONS codes of English councils start with E (Wales W, Scotland S, Northern Ireland N). */
export const ENGLISH_CODE_PREFIX = "E";

/** The query for every UK council's code and name, as GeoJSON in WGS 84. */
const COUNCIL_BOUNDARIES_QUERY: ArcGisQuery = {
  source: COUNCIL_BOUNDARIES.source,
  url: COUNCIL_BOUNDARIES.url,
  params: {
    where: "1=1",
    outFields: `${COUNCIL_BOUNDARIES.codeField},${COUNCIL_BOUNDARIES.nameField}`,
    outSR: "4326",
    orderByFields: COUNCIL_BOUNDARIES.codeField,
    f: "geojson",
  },
  maxPages: 20,
};

/** The query for one page of boundaries, from the `offset`-th, as GeoJSON in WGS 84. */
export const boundariesQueryUrl = (offset: number) =>
  arcGisQueryUrl(COUNCIL_BOUNDARIES_QUERY, offset);

/**
 * Downloads every council's boundary, a page at a time while the service
 * says there are more, as one GeoJSON feature collection. Throws if the
 * service fails or answers with anything else.
 */
export const downloadCouncilBoundaries = async (
  fetchFn: typeof fetch,
): Promise<FeatureCollection> => {
  const features: unknown[] = [];
  await queryPages(fetchFn, COUNCIL_BOUNDARIES_QUERY, (page) => {
    features.push(...page.features);
  });
  return { type: "FeatureCollection", features };
};
