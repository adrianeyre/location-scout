import "maplibre-gl/dist/maplibre-gl.css";

import {
  Map,
  Marker,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  searchAreaRing,
  type AreaResponse,
  type ConstraintShape,
  type Location,
  type ServedLayerId,
} from "@location-scout/shared";

import type { FeatureCredits } from "../attribution";
import type { LayerFeature } from "../layers/layer-styles";
import { BASE_MAP_STYLE, ENGLAND_VIEW } from "./base-map-style";
import {
  FeatureMarkers,
  type MarkerHighlight,
  type OpenStreetView,
} from "./feature-markers";
import { FeatureShapes, type ShapeShading } from "./feature-shapes";
import { OverlayShapes, type MapOverlay } from "./overlay-shapes";
import { MAP_COVER_EVENT, coveredEdges } from "./map-cover";
import {
  LOCATION_COLOUR,
  SEARCH_AREA_COLOUR,
  boundsOf,
} from "./search-area-style";

const SEARCH_AREA_SOURCE = "search-area";
const SEARCH_AREA_FILL = "search-area-fill";

/** Space kept between the Search Area circle and the map's edges, in pixels. */
const FIT_PADDING = 40;

/** Features of a Layer that the Scout Mode highlights, and how to mark them. */
export interface MapHighlight extends MarkerHighlight {
  features: readonly LayerFeature[];
}

/** A Layer to draw on the map, with its Features. */
export interface MapLayer {
  id: ServedLayerId;
  /** Its Features, but for any `highlighted`. */
  features: readonly LayerFeature[];
  /**
   * Its Features the Scout Mode highlights, such as its competitors (PRD
   * FR-4.3), drawn over the rest and never clustered with them.
   */
  highlighted?: MapHighlight | null;
  /**
   * Its Features clustered apart from the rest, as the Planning Layer's
   * Planning Applications are from its Planning Constraints, so that a few
   * of one kind are never lost among many of the other.
   */
  apart?: readonly LayerFeature[] | null;
  /**
   * How its shapes are shaded by a figure, as the Demographics Layer's
   * output areas are by the measure chosen (PRD FR-2.7a), or `null` to draw
   * them faintly in its colours.
   */
  shading?: ShapeShading | null;
  /** What its popups credit, for the Data Sources of their Features (PRD §6.15). */
  credits?: FeatureCredits | null;
}

/**
 * The lowest of the Layers' shapes drawn under the Search Area, or the
 * Search Area itself, so shading goes below every other Layer's shapes.
 */
const lowestShapes = (map: Map) =>
  map
    .getStyle()
    .layers.find(
      ({ id }) => id.endsWith("-shapes-fill") || id === SEARCH_AREA_FILL,
    )?.id ?? SEARCH_AREA_FILL;

interface FeatureLayerProps extends MapLayer {
  map: Map;
  /** Opens Street View at a point from a Feature's popup, or `null` without it. */
  onStreetView: OpenStreetView | null;
}

/**
 * Draws one Layer's Features, clustered, and the shapes of those that have
 * one, until it is hidden or replaced. Any it draws apart are clustered on
 * their own, and drawn first, so under the rest. Any it highlights are
 * clustered apart too, and drawn last, so over the rest. A change of shading redraws only the
 * shapes, so the markers and any popup open stay put.
 */
const FeatureLayer = ({
  map,
  id,
  features,
  highlighted = null,
  apart = null,
  shading = null,
  credits = null,
  onStreetView,
}: FeatureLayerProps) => {
  // The popups ask the latest `credits` as they open, so new credits, made
  // with every render, never redraw the markers.
  const latestCredits = useRef(credits);
  useEffect(() => {
    latestCredits.current = credits;
  }, [credits]);
  const popupCredits = useCallback<FeatureCredits>(
    (feature) => latestCredits.current?.(feature) ?? [],
    [],
  );
  useEffect(() => {
    const all = highlighted ? [...features, ...highlighted.features] : features;
    const shapes = new FeatureShapes(
      map,
      id,
      all,
      shading ? lowestShapes(map) : SEARCH_AREA_FILL,
      shading,
    );
    return () => {
      shapes.remove();
    };
  }, [map, id, features, highlighted, shading]);
  useEffect(() => {
    // Those apart first, so the rest, fewer, are drawn over them.
    const others =
      apart &&
      new FeatureMarkers(map, id, apart, null, onStreetView, popupCredits);
    const markers = new FeatureMarkers(
      map,
      id,
      features,
      null,
      onStreetView,
      popupCredits,
    );
    const marked =
      highlighted &&
      new FeatureMarkers(
        map,
        id,
        highlighted.features,
        highlighted,
        onStreetView,
        popupCredits,
      );
    return () => {
      marked?.remove();
      others?.remove();
      markers.remove();
    };
  }, [map, id, features, highlighted, apart, onStreetView, popupCredits]);
  return null;
};

/** Draws one overlay until it is replaced or taken away. */
const Overlay = ({ map, overlay }: { map: Map; overlay: MapOverlay }) => {
  useEffect(() => {
    const shapes = new OverlayShapes(map, overlay, SEARCH_AREA_FILL);
    return () => {
      shapes.remove();
    };
  }, [map, overlay]);
  return null;
};

/** The bounds of a shape's outer rings. */
const shapeBounds = (shape: ConstraintShape) =>
  boundsOf(shape.coordinates.flatMap(([outer = []]) => outer));

interface SearchAreaMapProps {
  /** The Search Area to show, or `null` when there is none. */
  area: AreaResponse | null;
  /** The Layers to draw: those switched on that have loaded. */
  layers?: readonly MapLayer[];
  /** Shapes to draw with no markers, such as land use shown as context. */
  overlays?: readonly MapOverlay[];
  /**
   * A shape to show the whole of, such as the Land Opportunity chosen in the
   * Land panel, or `null` to show the Search Area.
   */
  focus?: ConstraintShape | null;
  /** Called with the point the user clicks, to make it the Location (PRD FR-1.3). */
  onPick?: (location: Location) => void;
  /**
   * Opens Street View at a Feature, from a button in its popup (PRD
   * FR-2.13), or `null` to offer none, as without `GOOGLE_MAPS_API_KEY`.
   */
  onStreetView?: OpenStreetView | null;
}

/**
 * The map: OSM base tiles, the Location marker, the Search Area circle and the
 * Features of each Layer shown. Clicking it picks a new Location.
 */
export const SearchAreaMap = ({
  area,
  layers = [],
  overlays = [],
  focus = null,
  onPick,
  onStreetView = null,
}: SearchAreaMapProps) => {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  // The popups call the latest `onStreetView`, so a new one never redraws
  // the markers; only whether there is one does.
  const streetView = useRef(onStreetView);
  useEffect(() => {
    streetView.current = onStreetView;
  }, [onStreetView]);
  const offersStreetView = onStreetView !== null;
  const openStreetView = useMemo(
    (): OpenStreetView | null =>
      offersStreetView
        ? (target) => {
            streetView.current?.(target);
          }
        : null,
    [offersStreetView],
  );

  useEffect(() => {
    if (!container.current) return;
    let removed = false;
    const created = new Map({
      container: container.current,
      style: BASE_MAP_STYLE,
      ...ENGLAND_VIEW,
      // Expanded, so tile attribution is always visible on the map (FR-10.4).
      attributionControl: { compact: false },
      // MapLibre labels its canvas "Map" too; a landmark's name must be unique (WCAG 1.3.1).
      locale: { "Map.Title": "Map view, moved with the arrow keys" },
    });
    created.on("load", () => {
      created.addSource(SEARCH_AREA_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      created.addLayer({
        id: SEARCH_AREA_FILL,
        type: "fill",
        source: SEARCH_AREA_SOURCE,
        paint: { "fill-color": SEARCH_AREA_COLOUR, "fill-opacity": 0.08 },
      });
      created.addLayer({
        id: "search-area-outline",
        type: "line",
        source: SEARCH_AREA_SOURCE,
        paint: { "line-color": SEARCH_AREA_COLOUR, "line-width": 2 },
      });
      if (!removed) setMap(created);
    });
    return () => {
      removed = true;
      setMap(null);
      created.remove();
    };
  }, []);

  useEffect(() => {
    if (!map || !onPick) return;
    // MapLibre only fires `click` for a click, not at the end of a drag.
    const pick = ({ lngLat }: MapMouseEvent) => {
      onPick({ lat: lngLat.lat, lng: lngLat.lng });
    };
    map.on("click", pick);
    return () => {
      map.off("click", pick);
    };
  }, [map, onPick]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>(SEARCH_AREA_SOURCE);
    if (!area) {
      void source?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const { lat, lng } = area.location;
    const ring = searchAreaRing(area.location, area.searchRadius.metres);

    void source?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    });
    const marker = new Marker({
      color: LOCATION_COLOUR,
      className: "location-marker",
    })
      .setLngLat([lng, lat])
      .addTo(map);
    // Centred in the part of the map that isn't covered, and zoomed about it.
    map.setPadding(coveredEdges(map.getContainer()));
    const camera = map.cameraForBounds(boundsOf(ring), {
      padding: FIT_PADDING,
    });
    map.flyTo({ center: [lng, lat], zoom: camera?.zoom ?? 15 });

    return () => {
      marker.remove();
    };
  }, [map, area]);

  // When what covers the map moves, the view slides to stay in the part left.
  useEffect(() => {
    if (!map) return;
    const follow = () => {
      map.easeTo({
        padding: coveredEdges(map.getContainer()),
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 300,
      });
    };
    window.addEventListener(MAP_COVER_EVENT, follow);
    return () => {
      window.removeEventListener(MAP_COVER_EVENT, follow);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !focus) return;
    map.setPadding(coveredEdges(map.getContainer()));
    map.fitBounds(shapeBounds(focus), { padding: FIT_PADDING, maxZoom: 17 });
  }, [map, focus]);

  return (
    <div
      ref={container}
      className="search-area-map"
      role="region"
      aria-label="Map"
      data-testid="search-area-map"
    >
      {map &&
        layers.map(({ id, features, highlighted, apart, shading, credits }) => (
          <FeatureLayer
            key={id}
            map={map}
            id={id}
            features={features}
            highlighted={highlighted ?? null}
            apart={apart ?? null}
            shading={shading ?? null}
            credits={credits ?? null}
            onStreetView={openStreetView}
          />
        ))}
      {map &&
        overlays.map((overlay) => (
          <Overlay key={overlay.id} map={map} overlay={overlay} />
        ))}
    </div>
  );
};
