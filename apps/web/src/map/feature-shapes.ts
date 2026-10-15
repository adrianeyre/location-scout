import type { Map as MapLibreMap } from "maplibre-gl";

import type { ServedLayerId } from "@location-scout/shared";

import { LAYER_STYLES, type LayerFeature } from "../layers/layer-styles";

/** Shapes are filled faintly, so the map and other Layers show through. */
const FILL_OPACITY = 0.12;
const OUTLINE_WIDTH = 2;

/**
 * How a Layer's shapes are shaded by a figure of each, as the Demographics
 * Layer's output areas are by the measure chosen, rather than faintly in
 * the Layer's colours: filled more strongly, each with its own shade, and
 * drawn below every other Layer's shapes.
 */
export interface ShapeShading {
  colour: (feature: LayerFeature) => string;
  fillOpacity: number;
  /** Their outlines, which keep neighbouring shapes apart. */
  outlineColour: string;
  outlineWidth: number;
}

/**
 * The shapes of one Layer's Features, such as conservation areas or
 * footpaths, as GeoJSON, each with its colour, or its shade if the Layer is
 * shaded. Features known only as points have none.
 */
export const shapeCollection = (
  layer: ServedLayerId,
  features: readonly LayerFeature[],
  shading: ShapeShading | null = null,
): GeoJSON.FeatureCollection => {
  const shapeColour = shading?.colour ?? LAYER_STYLES[layer].shapeColour;
  return {
    type: "FeatureCollection",
    features: shapeColour
      ? features.flatMap((feature) =>
          "shape" in feature && feature.shape
            ? [
                {
                  type: "Feature",
                  id: feature.id,
                  properties: {
                    name: "name" in feature ? feature.name : feature.id,
                    colour: shapeColour(feature),
                  },
                  geometry: feature.shape,
                },
              ]
            : [],
        )
      : [],
  };
};

/**
 * One Layer's shapes on the map: faint fills with solid outlines, or solid
 * lines for footpaths and cycle routes, or fills shaded by a figure, drawn
 * under `beforeLayer` so the Search Area circle stays on top. They take no clicks,
 * so a click inside one still picks a new Location (PRD FR-1.3); each one's
 * marker opens its popup.
 */
export class FeatureShapes {
  readonly #map: MapLibreMap;
  readonly #source: string;
  readonly #layers: string[];

  constructor(
    map: MapLibreMap,
    layer: ServedLayerId,
    features: readonly LayerFeature[],
    beforeLayer: string,
    shading: ShapeShading | null = null,
  ) {
    this.#map = map;
    this.#source = `${layer}-shapes`;
    this.#layers = [`${layer}-shapes-fill`, `${layer}-shapes-outline`];
    const shapes = shapeCollection(layer, features, shading);
    if (shapes.features.length === 0) return;
    const [fill = "", outline = ""] = this.#layers;
    map.addSource(this.#source, { type: "geojson", data: shapes });
    map.addLayer(
      {
        id: fill,
        type: "fill",
        source: this.#source,
        // Lines have nothing to fill.
        filter: [
          "in",
          ["geometry-type"],
          ["literal", ["Polygon", "MultiPolygon"]],
        ],
        paint: {
          "fill-color": ["get", "colour"],
          "fill-opacity": shading?.fillOpacity ?? FILL_OPACITY,
        },
      },
      beforeLayer,
    );
    map.addLayer(
      {
        id: outline,
        type: "line",
        source: this.#source,
        paint: {
          "line-color": shading?.outlineColour ?? ["get", "colour"],
          "line-width": shading?.outlineWidth ?? OUTLINE_WIDTH,
        },
      },
      beforeLayer,
    );
  }

  /** Takes the shapes off the map, if the map is still there. */
  remove() {
    for (const id of this.#layers) {
      if (this.#map.getLayer(id)) this.#map.removeLayer(id);
    }
    if (this.#map.getSource(this.#source)) this.#map.removeSource(this.#source);
  }
}
