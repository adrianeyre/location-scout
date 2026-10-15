import type { MapOptions } from "maplibre-gl";

/**
 * The base map: OpenStreetMap's standard raster tiles. They are for light
 * development use only and are replaced before hosting (PRD §6.17).
 */
export const BASE_MAP_STYLE: NonNullable<MapOptions["style"]> = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** Where the map starts before there is a Location: all of England in view. */
export const ENGLAND_VIEW = { center: [-1.6, 52.8], zoom: 5.5 } satisfies Pick<
  MapOptions,
  "center" | "zoom"
>;
