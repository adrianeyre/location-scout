/**
 * The body of `GET /api/street-view`: whether the Street View panel is on
 * (PRD FR-2.13), and the key its browser loads Google's Maps JavaScript API
 * with. It is on only when `GOOGLE_MAPS_API_KEY` is set; off, the frontend
 * hides the panel and loads nothing from Google.
 */
export type StreetViewResponse =
  | { enabled: false }
  | {
      enabled: true;
      /**
       * `GOOGLE_MAPS_API_KEY`. Google's script can only be loaded in the
       * browser with its key in the page, so the key is given here, at
       * runtime, and never built into the frontend.
       */
      apiKey: string;
    };

export const isStreetViewResponse = (
  value: unknown,
): value is StreetViewResponse => {
  if (typeof value !== "object" || value === null) return false;
  if (!("enabled" in value)) return false;
  if (value.enabled === false) return Object.keys(value).length === 1;
  return (
    value.enabled === true &&
    "apiKey" in value &&
    typeof value.apiKey === "string" &&
    value.apiKey !== ""
  );
};

/** How a Street View panorama is looked for around a point. */
export const STREET_VIEW_RULES = {
  /**
   * How far from the Location or Feature the nearest outdoor panorama may
   * be. Google looks within 50 m unless told otherwise; a postcode's middle
   * or a school's is often further than that from the street.
   */
  searchRadiusMetres: 100,
} as const;

/**
 * Google's terms for Google Maps, which Street View is part of, linked from
 * the panel beside its attribution.
 */
export const GOOGLE_MAPS_TERMS_URL =
  "https://www.google.com/intl/en-GB_ALL/help/terms_maps/";

/**
 * What the Street View panel credits (PRD FR-10.1a). Google's panorama
 * draws its own logo, copyright and terms over the imagery, which are never
 * hidden; Google's attribution guidelines ask for "Google Maps" as written,
 * never translated or wrapped.
 */
export const STREET_VIEW_ATTRIBUTION = "Street View imagery: Google Maps";
