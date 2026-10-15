/** A Location: the single point a user is asking about. */
export interface Location {
  lat: number;
  lng: number;
}

/** The Search Radius choices (PRD FR-1.4), in miles. */
export const SEARCH_RADII_MILES = [0.25, 0.5, 1] as const;

export type SearchRadiusMiles = (typeof SEARCH_RADII_MILES)[number];

export const DEFAULT_SEARCH_RADIUS_MILES: SearchRadiusMiles = 0.5;

export const METRES_PER_MILE = 1609.344;

/** Mean Earth radius (IUGG), as used for haversine distances. */
const EARTH_RADIUS_METRES = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export const isSearchRadiusMiles = (
  value: unknown,
): value is SearchRadiusMiles =>
  SEARCH_RADII_MILES.some((miles) => miles === value);

export const isLocation = (value: unknown): value is Location =>
  typeof value === "object" &&
  value !== null &&
  "lat" in value &&
  typeof value.lat === "number" &&
  Number.isFinite(value.lat) &&
  Math.abs(value.lat) <= 90 &&
  "lng" in value &&
  typeof value.lng === "number" &&
  Number.isFinite(value.lng) &&
  Math.abs(value.lng) <= 180;

export const milesToMetres = (miles: number) => miles * METRES_PER_MILE;

/** Great-circle distance between two Locations, in metres. */
export const distanceMetres = (from: Location, to: Location) => {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * The outline of a Search Area: a closed ring of `[lng, lat]` positions (GeoJSON
 * order), each `radiusMetres` from the Location along a great circle.
 */
export const searchAreaRing = (
  location: Location,
  radiusMetres: number,
  steps = 64,
): [number, number][] => {
  const lat1 = toRadians(location.lat);
  const lng1 = toRadians(location.lng);
  const angular = radiusMetres / EARTH_RADIUS_METRES;
  const ring: [number, number][] = [];
  for (let step = 0; step < steps; step++) {
    const bearing = (2 * Math.PI * step) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) +
        Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([toDegrees(lng2), toDegrees(lat2)]);
  }
  const [first] = ring;
  if (first) ring.push([...first]);
  return ring;
};
