import type { Map as MapLibreMap } from "maplibre-gl";

import type { ConstraintShape } from "@location-scout/shared";

/**
 * Shapes drawn on the map for what they show around Features, with no
 * markers of their own: the industrial and commercial land the Land Layer
 * shows as context (PRD FR-2.7), or the INSPIRE Index Polygons that overlap
 * the Land Opportunity chosen (FR-5.6).
 */
export interface MapOverlay {
  /** Names its source and layers on the map, so it must be unique. */
  id: string;
  shapes: readonly {
    id: string;
    name: string | null;
    shape: ConstraintShape;
  }[];
  colour: string;
  fillOpacity: number;
  lineWidth: number;
  /** Whether its outlines are dashed, to tell them from Features' shapes. */
  dashed: boolean;
}

/** An overlay's shapes as GeoJSON. */
export const overlayCollection = ({
  shapes,
}: Pick<MapOverlay, "shapes">): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: shapes.map(({ id, name, shape }) => ({
    type: "Feature",
    id,
    properties: { name: name ?? id },
    geometry: shape,
  })),
});

/**
 * One overlay on the map, drawn under `beforeLayer` so the Search Area
 * circle stays on top. Its shapes take no clicks, so a click inside one
 * still picks a new Location (PRD FR-1.3).
 */
export class OverlayShapes {
  readonly #map: MapLibreMap;
  readonly #source: string;
  readonly #layers: string[];

  constructor(map: MapLibreMap, overlay: MapOverlay, beforeLayer: string) {
    this.#map = map;
    this.#source = `${overlay.id}-overlay`;
    this.#layers = [
      `${overlay.id}-overlay-fill`,
      `${overlay.id}-overlay-outline`,
    ];
    if (overlay.shapes.length === 0) return;
    const [fill = "", outline = ""] = this.#layers;
    map.addSource(this.#source, {
      type: "geojson",
      data: overlayCollection(overlay),
    });
    map.addLayer(
      {
        id: fill,
        type: "fill",
        source: this.#source,
        paint: {
          "fill-color": overlay.colour,
          "fill-opacity": overlay.fillOpacity,
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
          "line-color": overlay.colour,
          "line-width": overlay.lineWidth,
          ...(overlay.dashed ? { "line-dasharray": [2, 2] } : {}),
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
