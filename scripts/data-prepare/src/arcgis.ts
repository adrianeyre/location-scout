/** Who is asking, for the services we download from. */
export const USER_AGENT = "location-scout data:prepare";

/** A download that takes longer than this has failed. */
export const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * A Land Coverage Area's largest downloads, such as planning.data.gov.uk's
 * 543 MB of flood zones, may take longer on a slow line, so they get an hour.
 */
export const LARGE_DOWNLOAD_TIMEOUT_MS = 60 * 60 * 1000;

/** One page of an ArcGIS FeatureServer query, as GeoJSON. */
export interface FeatureCollection {
  type: "FeatureCollection";
  features: unknown[];
}

/** An ONS Open Geography FeatureServer layer to query, a page at a time. */
export interface ArcGisQuery {
  /** Who publishes it, for messages. */
  source: string;
  /** The layer's URL, ending `/FeatureServer/0`. */
  url: string;
  /** The query's parameters, but for the page's offset. */
  params: Readonly<Record<string, string>>;
  /** Guards against a service that never stops saying there is more. */
  maxPages: number;
}

/** The query for one page of a layer, from the `offset`-th feature. */
export const arcGisQueryUrl = (
  { url, params }: Pick<ArcGisQuery, "url" | "params">,
  offset: number,
) =>
  `${url}/query?${new URLSearchParams({
    ...params,
    resultOffset: String(offset),
  }).toString()}`;

const isFeatureCollection = (value: unknown): value is FeatureCollection =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  value.type === "FeatureCollection" &&
  "features" in value &&
  Array.isArray(value.features);

/** ArcGIS says a page was cut short, with more to come, in its properties. */
const exceededTransferLimit = (value: object) =>
  "properties" in value &&
  typeof value.properties === "object" &&
  value.properties !== null &&
  "exceededTransferLimit" in value.properties &&
  value.properties.exceededTransferLimit === true;

/**
 * Asks for a layer a page at a time while the service says there are more,
 * handing each page to `onPage` as it arrives, so a large layer is never all
 * in memory at once. Throws if the service fails or answers with anything
 * but GeoJSON features.
 */
export const queryPages = async (
  fetchFn: typeof fetch,
  query: ArcGisQuery,
  onPage: (page: FeatureCollection) => Promise<void> | void,
): Promise<void> => {
  let offset = 0;
  for (let page = 0; page < query.maxPages; page++) {
    const url = arcGisQueryUrl(query, offset);
    const response = await fetchFn(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `${query.source} answered ${String(response.status)} for ${url}`,
      );
    }
    const body: unknown = await response.json();
    if (!isFeatureCollection(body)) {
      throw new Error(
        `${query.source} did not answer with GeoJSON features for ${url}`,
      );
    }
    await onPage({ type: "FeatureCollection", features: body.features });
    offset += body.features.length;
    if (!exceededTransferLimit(body) || body.features.length === 0) return;
  }
  throw new Error(
    `${query.source} still had more after ${String(query.maxPages)} pages of ${query.url}`,
  );
};
