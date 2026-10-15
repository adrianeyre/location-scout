import {
  searchAreaRing,
  type SearchArea,
  type ServedLayerId,
} from "@location-scout/shared";

import { formatCount } from "../format";
import { LAYER_STYLES, type LayerFeature } from "../layers/layer-styles";
import { shapeCollection } from "../map/feature-shapes";
import type { MapLayer } from "../map/SearchAreaMap";
import { boundsOf } from "../map/search-area-style";

/**
 * The Layers a report's map image leaves out: the Demographics Layer's
 * output areas would cover the whole Search Area, so its figures are given
 * in words alone.
 */
const LEFT_OFF_THE_IMAGE: readonly ServedLayerId[] = ["demographics"];

/** One Layer drawn on a report's map image, as its legend gives it. */
export interface ReportMapKey {
  id: ServedLayerId;
  name: string;
  colour: string;
  /** What is drawn of it: "89 crimes", or "197 amenities, 3 of them competitors, ringed". */
  drawn: string;
}

/** What a report's map image draws, beyond the base map, and its legend. */
export interface ReportMapData {
  /** The Location, drawn over everything else. */
  location: GeoJSON.Feature<GeoJSON.Point>;
  /** The Search Area circle, and its bounds, which the image is fitted to. */
  searchArea: GeoJSON.Feature<GeoJSON.Polygon>;
  bounds: [[number, number], [number, number]];
  /** Shapes, such as conservation areas, parks and Land Opportunities, each with its `colour`. */
  shapes: GeoJSON.FeatureCollection;
  /**
   * Features known only as points, each with its `colour`, and
   * `highlighted` where the Scout Mode highlights it.
   */
  points: GeoJSON.FeatureCollection<GeoJSON.Point>;
  key: ReportMapKey[];
}

/** A Feature's marker colour, as the map colours it. */
const markerColour = (layer: ServedLayerId, feature: LayerFeature) =>
  LAYER_STYLES[layer].markerColour?.([feature]) ?? LAYER_STYLES[layer].colour;

const point = (
  layer: ServedLayerId,
  feature: LayerFeature,
  highlighted: boolean,
): GeoJSON.Feature<GeoJSON.Point> => ({
  type: "Feature",
  properties: { colour: markerColour(layer, feature), highlighted },
  geometry: {
    type: "Point",
    coordinates: [feature.location.lng, feature.location.lat],
  },
});

const hasShape = (feature: LayerFeature) =>
  "shape" in feature && Boolean(feature.shape);

/**
 * What a report's map image draws (PRD FR-7.4): the Search Area, and the
 * Features of each Layer the map shows, as the map shows them, but for the
 * Demographics Layer's. A Feature with a shape is drawn as its shape, and
 * any other as a dot in its marker's colour. Nothing is clustered, as a
 * printed map can't be zoomed into.
 */
export const reportMapData = (
  area: SearchArea,
  layers: readonly MapLayer[],
): ReportMapData => {
  const shapes: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const key: ReportMapKey[] = [];
  const ring = searchAreaRing(area.location, area.searchRadius.metres);
  for (const { id, features, highlighted, apart } of layers) {
    if (LEFT_OFF_THE_IMAGE.includes(id)) continue;
    const highlights = highlighted?.features ?? [];
    const all = [...(apart ?? []), ...features, ...highlights];
    if (all.length === 0) continue;
    shapes.push(...shapeCollection(id, all).features);
    for (const feature of all) {
      if (hasShape(feature) && LAYER_STYLES[id].shapeColour) continue;
      points.push(point(id, feature, highlights.includes(feature)));
    }
    const style = LAYER_STYLES[id];
    key.push({
      id,
      name: style.name,
      colour: style.colour,
      drawn:
        highlighted && highlights.length > 0
          ? `${formatCount(all.length, style.noun)}, ${String(highlights.length)} of them ${highlighted.noun[highlights.length === 1 ? 0 : 1]}, ringed`
          : formatCount(all.length, style.noun),
    });
  }
  return {
    location: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Point",
        coordinates: [area.location.lng, area.location.lat],
      },
    },
    searchArea: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
    },
    bounds: boundsOf(ring),
    shapes: { type: "FeatureCollection", features: shapes },
    points: { type: "FeatureCollection", features: points },
    key,
  };
};
