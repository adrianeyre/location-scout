import {
  AMENITY_TYPES,
  distanceMetres,
  type AmenityFeature,
  type AmenityStatistics,
  type AmenityType,
  type Location,
} from "@location-scout/shared";

import type { OsmElement } from "./overpass";
import { tagFilter } from "./overpass-filters";

/**
 * Which OpenStreetMap tags make an amenity of each type (PRD FR-2.3), using
 * the same tags as the Business Scout Modes' competitors (FR-4.3). The first
 * rule an element matches decides its type, so a café that is also tagged as a
 * bakery is a café, and only shops no earlier rule claims are `shop`.
 * `values: null` matches any value of the key.
 */
export const AMENITY_RULES: readonly {
  type: AmenityType;
  key: string;
  values: readonly string[] | null;
}[] = [
  { type: "supermarket", key: "shop", values: ["supermarket"] },
  { type: "convenience-store", key: "shop", values: ["convenience"] },
  { type: "hairdresser", key: "shop", values: ["hairdresser"] },
  { type: "cafe", key: "amenity", values: ["cafe"] },
  { type: "restaurant", key: "amenity", values: ["restaurant"] },
  { type: "takeaway", key: "amenity", values: ["fast_food"] },
  { type: "pub", key: "amenity", values: ["pub"] },
  { type: "gym", key: "leisure", values: ["fitness_centre"] },
  { type: "dentist", key: "amenity", values: ["dentist"] },
  { type: "dentist", key: "healthcare", values: ["dentist"] },
  { type: "nursery", key: "amenity", values: ["kindergarten", "childcare"] },
  {
    type: "healthcare",
    key: "amenity",
    values: ["doctors", "clinic", "hospital", "pharmacy"],
  },
  { type: "healthcare", key: "healthcare", values: null },
  { type: "shop", key: "shop", values: null },
  { type: "office", key: "office", values: null },
];

/** Values OpenStreetMap uses to say there is no longer anything there. */
const NOTHING_THERE: ReadonlySet<string> = new Set(["no", "vacant", "disused"]);

/**
 * The Overpass QL tag filters that find every element a rule could match: one
 * per key, naming its values unless some rule takes any value.
 */
export const AMENITY_FILTERS: readonly string[] = [
  ...new Set(AMENITY_RULES.map(({ key }) => key)),
].map((key) => {
  const rules = AMENITY_RULES.filter((rule) => rule.key === key);
  return tagFilter(
    key,
    rules.some(({ values }) => values === null)
      ? null
      : [...new Set(rules.flatMap(({ values }) => values ?? []))],
  );
});

/** The type of amenity an element is, and the tag that says so, or `null`. */
export const classifyAmenity = (
  tags: Readonly<Record<string, string>>,
): { type: AmenityType; osmTag: string } | null => {
  for (const { type, key, values } of AMENITY_RULES) {
    const value = tags[key]?.trim();
    if (value === undefined || value === "" || NOTHING_THERE.has(value)) {
      continue;
    }
    if (values === null || values.includes(value)) {
      return { type, osmTag: `${key}=${value}` };
    }
  }
  return null;
};

const byTypeThenDistance = (a: AmenityFeature, b: AmenityFeature) =>
  AMENITY_TYPES.indexOf(a.type) - AMENITY_TYPES.indexOf(b.type) ||
  a.distanceMetres - b.distanceMetres ||
  (a.name ?? "").localeCompare(b.name ?? "") ||
  a.id.localeCompare(b.id);

/**
 * The amenities among the elements Overpass found, each measured from the
 * Location, by type and then nearest first. Elements of other Layers, and
 * ones whose shop or office is vacant, are left out.
 */
export const mapAmenities = (
  elements: readonly OsmElement[],
  from: Location,
): AmenityFeature[] => {
  const seen = new Set<string>();
  const features: AmenityFeature[] = [];
  for (const { id, location, tags } of elements) {
    const amenity = classifyAmenity(tags);
    if (!amenity || seen.has(id)) continue;
    seen.add(id);
    features.push({
      id,
      location,
      distanceMetres: Math.round(distanceMetres(from, location)),
      name: tags.name?.trim() || null,
      ...amenity,
    });
  }
  return features.sort(byTypeThenDistance);
};

/** Counts the amenities of every type, and finds the nearest of each. */
export const amenityStatistics = (
  features: readonly AmenityFeature[],
): AmenityStatistics => ({
  total: features.length,
  byType: AMENITY_TYPES.map((type) => {
    const ofType = features.filter((feature) => feature.type === type);
    const nearest = ofType.reduce<AmenityFeature | null>(
      (best, feature) =>
        best === null || feature.distanceMetres < best.distanceMetres
          ? feature
          : best,
      null,
    );
    return {
      type,
      count: ofType.length,
      nearest: nearest && {
        id: nearest.id,
        name: nearest.name,
        distanceMetres: nearest.distanceMetres,
      },
    };
  }),
});
