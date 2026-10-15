import type { AmenityFeature } from "./amenities";

/**
 * An OpenStreetMap tag that makes an amenity a competitor (PRD FR-4.3): a key
 * and the values it takes, or any value when `values` is `null`, so that
 * `{ key: "shop", values: null }` is any `shop=*`.
 */
export interface CompetitorTag {
  key: string;
  values: string[] | null;
}

/**
 * The businesses a Business or Retail Scout Mode competes with (PRD FR-4.3),
 * found among the Amenities Layer's Features by the tag that made each one
 * its type.
 */
export interface Competitors {
  /** What they are, as the user sees them, for example "cafés". */
  name: string;
  /** The tags that make an amenity one. */
  tags: CompetitorTag[];
}

/**
 * Whether an amenity is a competitor: whether the tag that made it its type,
 * such as `amenity=cafe`, is one of `tags`. Only that tag counts, so a café
 * also tagged as a bakery is a café, and not a shop.
 */
export const isCompetitor = (
  { osmTag }: Pick<AmenityFeature, "osmTag">,
  tags: readonly CompetitorTag[],
) => {
  const at = osmTag.indexOf("=");
  if (at < 0) return false;
  const key = osmTag.slice(0, at);
  const value = osmTag.slice(at + 1);
  return tags.some(
    (tag) =>
      tag.key === key && (tag.values === null || tag.values.includes(value)),
  );
};

/** Each tag as OpenStreetMap writes it: `amenity=cafe`, or `shop=*` for any value. */
export const competitorTagText = ({ key, values }: CompetitorTag) =>
  values === null ? [`${key}=*`] : values.map((value) => `${key}=${value}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export const isCompetitorTag = (value: unknown): value is CompetitorTag =>
  isRecord(value) &&
  isText(value.key) &&
  (value.values === null ||
    (Array.isArray(value.values) &&
      value.values.length > 0 &&
      value.values.every(isText)));

export const isCompetitors = (value: unknown): value is Competitors =>
  isRecord(value) &&
  isText(value.name) &&
  Array.isArray(value.tags) &&
  value.tags.length > 0 &&
  value.tags.every(isCompetitorTag);
