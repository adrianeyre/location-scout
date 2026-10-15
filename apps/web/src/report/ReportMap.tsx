import { Map } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SearchArea } from "@location-scout/shared";

import { BASE_MAP_STYLE } from "../map/base-map-style";
import type { MapLayer } from "../map/SearchAreaMap";
import { LOCATION_COLOUR, SEARCH_AREA_COLOUR } from "../map/search-area-style";
import { reportMapData, type ReportMapData } from "./report-map";

/** Space kept between the Search Area circle and the image's edges, in pixels. */
const FIT_PADDING = 24;

/** The image is drawn at twice the screen's resolution, so it prints sharply. */
const PIXEL_RATIO = 2;

/**
 * Draws the Search Area, its shapes and points on a map that can't be
 * moved, made only to be turned into an image.
 */
const drawOn = (map: Map, data: ReportMapData) => {
  map.addSource("search-area", { type: "geojson", data: data.searchArea });
  map.addSource("shapes", { type: "geojson", data: data.shapes });
  map.addSource("points", { type: "geojson", data: data.points });
  map.addLayer({
    id: "shapes-fill",
    type: "fill",
    source: "shapes",
    // Lines have nothing to fill.
    filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.15 },
  });
  map.addLayer({
    id: "shapes-outline",
    type: "line",
    source: "shapes",
    paint: { "line-color": ["get", "colour"], "line-width": 1.5 },
  });
  map.addLayer({
    id: "search-area-fill",
    type: "fill",
    source: "search-area",
    paint: { "fill-color": SEARCH_AREA_COLOUR, "fill-opacity": 0.06 },
  });
  map.addLayer({
    id: "search-area-outline",
    type: "line",
    source: "search-area",
    paint: { "line-color": SEARCH_AREA_COLOUR, "line-width": 2.5 },
  });
  map.addLayer({
    id: "points",
    type: "circle",
    source: "points",
    paint: {
      "circle-color": ["get", "colour"],
      "circle-radius": ["case", ["get", "highlighted"], 6, 4],
      "circle-stroke-color": [
        "case",
        ["get", "highlighted"],
        "#1f2328",
        "#ffffff",
      ],
      "circle-stroke-width": ["case", ["get", "highlighted"], 2, 1],
    },
  });
  map.addSource("location", { type: "geojson", data: data.location });
  map.addLayer({
    id: "location",
    type: "circle",
    source: "location",
    paint: {
      "circle-color": LOCATION_COLOUR,
      "circle-radius": 7,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
};

interface ReportMapProps {
  area: SearchArea;
  /** The Layers the map shows, once every one has loaded, or `null` until then. */
  layers: readonly MapLayer[] | null;
  /** The Search Area in words, for the image's text alternative. */
  name: string;
}

/**
 * A report's static map image (PRD FR-7.4): the Search Area and the
 * Features the map shows, drawn once on a map of its own, which is then
 * turned into an image, as a map drawn with WebGL may print blank. A key
 * names what is drawn, and OpenStreetMap is credited beneath it (FR-10.4).
 */
export const ReportMap = ({ area, layers, name }: ReportMapProps) => {
  const data = useMemo(
    () => (layers ? reportMapData(area, layers) : null),
    [area, layers],
  );
  const container = useRef<HTMLDivElement>(null);
  // The image drawn, `null` if it couldn't be, for the data it was drawn from.
  const [image, setImage] = useState<{
    data: ReportMapData;
    src: string | null;
  } | null>(null);
  const drawn = image && image.data === data ? image : null;

  useEffect(() => {
    const element = container.current;
    if (!data || !element) return;
    let map: Map | null = null;
    const finish = (src: string | null) => {
      map?.remove();
      map = null;
      setImage({ data, src });
    };
    try {
      map = new Map({
        container: element,
        style: BASE_MAP_STYLE,
        bounds: data.bounds,
        fitBoundsOptions: { padding: FIT_PADDING },
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        pixelRatio: PIXEL_RATIO,
        // Kept, so the canvas can be read once it is drawn.
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
    } catch {
      // No WebGL, so no map to draw on.
      finish(null);
      return;
    }
    const drawing = map;
    drawing.on("load", () => {
      drawOn(drawing, data);
      // Idle once every tile has loaded or failed, and every shape is drawn.
      drawing.once("idle", () => {
        let src: string | null;
        try {
          src = drawing.getCanvas().toDataURL("image/png");
        } catch {
          src = null;
        }
        finish(src);
      });
    });
    return () => {
      map?.remove();
    };
  }, [data]);

  return (
    <figure className="report-map" aria-labelledby="report-map-caption">
      {drawn?.src ? (
        <img
          className="report-map-image"
          src={drawn.src}
          alt={`Map of the Search Area, ${name}, with the Features of the Layers listed beneath`}
        />
      ) : drawn ? (
        <p className="report-map-missing">
          <strong>No map image.</strong> This browser couldn&apos;t draw the
          map, as it has no WebGL. Everything else in the report stands.
        </p>
      ) : (
        <div className="report-map-drawing">
          <p>
            {data
              ? "Drawing the map…"
              : "The map is drawn once every Layer has loaded."}
          </p>
          {data && (
            <div
              ref={container}
              className="report-map-canvas"
              aria-hidden="true"
            />
          )}
        </div>
      )}
      <figcaption id="report-map-caption">
        <ul className="report-map-key" aria-label="Map key">
          <li>
            <span
              className="report-map-swatch report-map-swatch-location"
              style={{ backgroundColor: LOCATION_COLOUR }}
              aria-hidden="true"
            />
            The Location
          </li>
          <li>
            <span
              className="report-map-swatch report-map-swatch-search-area"
              style={{ borderColor: SEARCH_AREA_COLOUR }}
              aria-hidden="true"
            />
            The Search Area, {name}
          </li>
          {data?.key.map(({ id, name: layerName, colour, drawn: what }) => (
            <li key={id}>
              <span
                className="report-map-swatch"
                style={{ backgroundColor: colour }}
                aria-hidden="true"
              />
              {layerName}: {what}
            </li>
          ))}
        </ul>
        <p className="layer-attribution">
          Base map ©{" "}
          <a href="https://www.openstreetmap.org/copyright">
            OpenStreetMap contributors
          </a>
          , ODbL.
        </p>
      </figcaption>
    </figure>
  );
};
