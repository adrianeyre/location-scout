import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SEARCH_RADII_MILES,
  distanceMetres,
  milesToMetres,
  searchAreaRing,
  type AreaResponse,
} from "@location-scout/shared";

import { SearchAreaMap } from "./SearchAreaMap";

/**
 * MapLibre needs WebGL, which jsdom lacks, so these tests swap it for a
 * recorder and check what the component asks the map to draw.
 */
const maplibre = vi.hoisted(() => {
  interface Feature {
    type: "Feature";
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }

  class FakeGeoJSONSource {
    data: unknown;
    setData(data: Feature) {
      this.data = data;
      return Promise.resolve();
    }
  }

  class FakeMap {
    static instances: FakeMap[] = [];
    listeners = new Map<string, (event?: unknown) => void>();
    sources = new Map<string, FakeGeoJSONSource>();
    layers: {
      id: string;
      type: string;
      source: string;
      paint?: Record<string, unknown>;
    }[] = [];
    /** The layer each was added before, if any. */
    before = new Map<string, string | undefined>();
    flyTo = vi.fn();
    fitBounds = vi.fn();
    setPadding = vi.fn();
    easeTo = vi.fn();
    remove = vi.fn();
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      FakeMap.instances.push(this);
    }
    getContainer() {
      return this.options.container as HTMLElement;
    }
    on(event: string, listener: (event?: unknown) => void) {
      this.listeners.set(event, listener);
      return this;
    }
    off(event: string, listener: (event?: unknown) => void) {
      if (this.listeners.get(event) === listener) this.listeners.delete(event);
      return this;
    }
    fire(event: string, payload?: unknown) {
      this.listeners.get(event)?.(payload);
    }
    addSource(id: string, options?: { data?: unknown }) {
      const source = new FakeGeoJSONSource();
      source.data = options?.data;
      this.sources.set(id, source);
    }
    addLayer(
      layer: {
        id: string;
        type: string;
        source: string;
        paint?: Record<string, unknown>;
      },
      before?: string,
    ) {
      const at = this.layers.findIndex(({ id }) => id === before);
      this.layers.splice(at === -1 ? this.layers.length : at, 0, layer);
      this.before.set(layer.id, before);
    }
    getLayer(id: string) {
      return this.layers.find((layer) => layer.id === id);
    }
    getStyle() {
      return { layers: this.layers };
    }
    removeLayer(id: string) {
      this.layers = this.layers.filter((layer) => layer.id !== id);
    }
    getSource(id: string) {
      return this.sources.get(id);
    }
    removeSource(id: string) {
      this.sources.delete(id);
    }
    cameraForBounds() {
      return { zoom: 14.2 };
    }
    getZoom() {
      return 14.2;
    }
    getBounds() {
      return {
        getWest: () => -180,
        getSouth: () => -85,
        getEast: () => 180,
        getNorth: () => 85,
      };
    }
  }

  class FakeMarker {
    static instances: FakeMarker[] = [];
    lngLat: [number, number] | null = null;
    map: FakeMap | null = null;
    element: HTMLElement | undefined;

    constructor(options: { element?: HTMLElement } = {}) {
      this.element = options.element;
      FakeMarker.instances.push(this);
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
    addTo(map: FakeMap) {
      this.map = map;
      return this;
    }
    remove() {
      this.map = null;
    }
  }

  return { FakeMap, FakeMarker };
});

vi.mock("maplibre-gl", () => ({
  Map: maplibre.FakeMap,
  Marker: maplibre.FakeMarker,
  Popup: vi.fn(),
}));

const NG17_1AA = { lat: 53.123664, lng: -1.264078 };
const area: AreaResponse = {
  location: NG17_1AA,
  searchRadius: { miles: 0.5, metres: 804.672 },
  geography: {
    postcode: "NG17 1AA",
    ward: "Sutton Central & New Cross",
    lsoa: "Ashfield 005E",
    msoa: "Ashfield 005",
    localAuthority: "Ashfield",
    parliamentaryConstituency: "Ashfield",
  },
  council: { status: "not-prepared", council: null, inLandCoverageArea: false },
  sources: [],
  layers: [],
};

const lastMap = () => {
  const map = maplibre.FakeMap.instances.at(-1);
  if (!map) throw new Error("no map was created");
  return map;
};

/** The outline of the Search Area circle last drawn on the map. */
const drawnRing = () => {
  const drawn = lastMap().sources.get("search-area")?.data as {
    geometry: { coordinates: [number, number][][] };
  };
  const [ring = []] = drawn.geometry.coordinates;
  return ring;
};

const loadMap = () => {
  act(() => {
    lastMap().fire("load");
  });
};

describe("SearchAreaMap", () => {
  beforeEach(() => {
    maplibre.FakeMap.instances = [];
    maplibre.FakeMarker.instances = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("shows OpenStreetMap raster tiles over England with their attribution expanded", () => {
    render(<SearchAreaMap area={null} />);

    const { options } = lastMap();
    expect(options).toMatchObject({
      center: [-1.6, 52.8],
      attributionControl: { compact: false },
      style: {
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            attribution: expect.stringContaining(
              "OpenStreetMap contributors",
            ) as unknown,
          },
        },
        layers: [{ type: "raster", source: "osm" }],
      },
    });
  });

  it("draws nothing before there is a Location", () => {
    render(<SearchAreaMap area={null} />);
    loadMap();

    expect(maplibre.FakeMarker.instances).toHaveLength(0);
    expect(lastMap().flyTo).not.toHaveBeenCalled();
  });

  it("centres on the Location and draws its marker and Search Area circle", () => {
    render(<SearchAreaMap area={area} />);
    loadMap();
    const map = lastMap();

    expect(map.flyTo).toHaveBeenCalledWith({
      center: [NG17_1AA.lng, NG17_1AA.lat],
      zoom: 14.2,
    });

    const [marker] = maplibre.FakeMarker.instances;
    expect(marker?.lngLat).toEqual([NG17_1AA.lng, NG17_1AA.lat]);
    expect(marker?.map).toBe(map);

    expect(map.layers.map(({ type, source }) => [type, source])).toEqual([
      ["fill", "search-area"],
      ["line", "search-area"],
    ]);
    const drawn = map.sources.get("search-area")?.data;
    expect(drawn).toEqual({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [searchAreaRing(NG17_1AA, 804.672)],
      },
    });
  });

  it.each(SEARCH_RADII_MILES)(
    "draws the circle %s mile from the Location",
    (miles) => {
      const metres = milesToMetres(miles);
      render(
        <SearchAreaMap area={{ ...area, searchRadius: { miles, metres } }} />,
      );
      loadMap();

      const ring = drawnRing();
      expect(ring.length).toBeGreaterThan(32);
      for (const [lng, lat] of ring) {
        expect(distanceMetres(NG17_1AA, { lat, lng })).toBeCloseTo(metres, 3);
      }
    },
  );

  it("redraws the circle when the Search Radius changes", () => {
    const { rerender } = render(<SearchAreaMap area={area} />);
    loadMap();

    rerender(
      <SearchAreaMap
        area={{ ...area, searchRadius: { miles: 1, metres: 1609.344 } }}
      />,
    );

    for (const [lng, lat] of drawnRing()) {
      expect(distanceMetres(NG17_1AA, { lat, lng })).toBeCloseTo(1609.344, 3);
    }
    expect(maplibre.FakeMarker.instances.filter(({ map }) => map)).toHaveLength(
      1,
    );
  });

  it("moves the marker when the Location changes", () => {
    const { rerender } = render(<SearchAreaMap area={area} />);
    loadMap();
    const elsewhere: AreaResponse = {
      ...area,
      location: { lat: 52.9548, lng: -1.1581 },
    };

    rerender(<SearchAreaMap area={elsewhere} />);

    const [first, second] = maplibre.FakeMarker.instances;
    expect(first?.map).toBeNull();
    expect(second?.lngLat).toEqual([-1.1581, 52.9548]);
    expect(lastMap().flyTo).toHaveBeenLastCalledWith({
      center: [-1.1581, 52.9548],
      zoom: 14.2,
    });
  });

  it("clears the circle and marker when there is no longer a Search Area", () => {
    const { rerender } = render(<SearchAreaMap area={area} />);
    loadMap();

    rerender(<SearchAreaMap area={null} />);

    expect(lastMap().sources.get("search-area")?.data).toEqual({
      type: "FeatureCollection",
      features: [],
    });
    expect(maplibre.FakeMarker.instances.filter(({ map }) => map)).toHaveLength(
      0,
    );
  });

  it("picks the point clicked as the Location", () => {
    const onPick = vi.fn();
    render(<SearchAreaMap area={null} onPick={onPick} />);
    loadMap();

    act(() => {
      lastMap().fire("click", { lngLat: { lat: 53.1435, lng: -1.1985 } });
    });

    expect(onPick).toHaveBeenCalledExactlyOnceWith({
      lat: 53.1435,
      lng: -1.1985,
    });
  });

  it("passes clicks to the latest handler only", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<SearchAreaMap area={null} onPick={first} />);
    loadMap();

    rerender(<SearchAreaMap area={null} onPick={second} />);
    act(() => {
      lastMap().fire("click", { lngLat: { lat: 53.1435, lng: -1.1985 } });
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  describe("with Layers", () => {
    const crimes = [
      {
        id: "1",
        location: { lat: 53.1237, lng: -1.2641 },
        distanceMetres: 40,
        category: "drugs",
        categoryName: "Drugs",
        month: "2026-08",
        street: null,
      },
      {
        id: "2",
        location: { lat: 53.124, lng: -1.264 },
        distanceMetres: 50,
        category: "robbery",
        categoryName: "Robbery",
        month: "2026-08",
        street: null,
      },
    ];

    /** The Layers' markers on the map: everything but the Location's. */
    const featureMarkers = () =>
      maplibre.FakeMarker.instances.filter(
        ({ map, element }) => map && element?.dataset.layer,
      );

    it("draws the Features of each Layer it is given, clustered", () => {
      render(
        <SearchAreaMap
          area={area}
          layers={[{ id: "crime", features: crimes }]}
        />,
      );
      loadMap();

      const [cluster, ...others] = featureMarkers();
      expect(others).toHaveLength(0);
      expect(cluster?.element?.className).toBe("feature-cluster");
      expect(cluster?.element?.dataset.count).toBe("2");
    });

    it("takes a Layer's Features off the map when it is no longer given", () => {
      const { rerender } = render(
        <SearchAreaMap
          area={area}
          layers={[{ id: "crime", features: crimes }]}
        />,
      );
      loadMap();

      rerender(<SearchAreaMap area={area} layers={[]} />);

      expect(featureMarkers()).toHaveLength(0);
      // The Location marker stays.
      expect(
        maplibre.FakeMarker.instances.filter(({ map }) => map),
      ).toHaveLength(1);
    });

    it("draws a Layer's highlighted Features apart from the rest, and over them", () => {
      const [first, second] = crimes;
      if (!first || !second) throw new Error("two crimes are needed");
      const { rerender } = render(
        <SearchAreaMap
          area={area}
          layers={[
            {
              id: "crime",
              features: [first],
              highlighted: {
                features: [second],
                noun: ["robbery", "robberies"],
                note: "★ Highlighted",
              },
            },
          ]}
        />,
      );
      loadMap();

      // Two markers of one each, rather than a cluster of two.
      const markers = featureMarkers();
      expect(markers.map(({ element }) => element?.dataset.count)).toEqual([
        "1",
        "1",
      ]);
      expect(
        markers.map(({ element }) => element?.dataset.highlighted),
      ).toEqual([undefined, ""]);

      rerender(
        <SearchAreaMap
          area={area}
          layers={[{ id: "crime", features: crimes }]}
        />,
      );

      expect(
        featureMarkers().map(({ element }) => element?.dataset.count),
      ).toEqual(["2"]);
    });

    const square = (west: number, south: number, size: number) => ({
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [west, south],
            [west + size, south],
            [west + size, south + size],
            [west, south + size],
            [west, south],
          ] as [number, number][],
        ],
      ],
    });

    const constraints = [
      {
        id: "44005909",
        location: NG17_1AA,
        distanceMetres: 0,
        type: "conservation-area" as const,
        name: "Sutton in Ashfield Church and Market Place",
        grade: null,
        coversLocation: true,
        shape: square(-1.27, 53.12, 0.01),
      },
      {
        id: "flood-zone-3",
        location: { lat: 53.125, lng: -1.26 },
        distanceMetres: 300,
        type: "flood-zone" as const,
        name: "Flood zone 3",
        grade: null,
        coversLocation: false,
        shape: square(-1.26, 53.125, 0.002),
      },
      {
        id: "31691403",
        location: { lat: 53.124777, lng: -1.26524 },
        distanceMetres: 146,
        type: "listed-building" as const,
        name: "HUNTER'S BAR",
        grade: "II",
        coversLocation: false,
        shape: null,
      },
    ];

    it("draws the shapes of a Layer's Features under the Search Area, each in its type's colour, with a marker for every Feature", () => {
      render(
        <SearchAreaMap
          area={area}
          layers={[{ id: "planning", features: constraints }]}
        />,
      );
      loadMap();

      const map = lastMap();
      expect(map.layers.map(({ id }) => id)).toEqual([
        "planning-shapes-fill",
        "planning-shapes-outline",
        "search-area-fill",
        "search-area-outline",
      ]);
      expect(map.before.get("planning-shapes-fill")).toBe("search-area-fill");
      expect(map.sources.get("planning-shapes")?.data).toMatchObject({
        type: "FeatureCollection",
        features: [
          {
            id: "44005909",
            properties: {
              name: "Sutton in Ashfield Church and Market Place",
              colour: "#6a1b9a",
            },
            geometry: constraints[0]?.shape,
          },
          {
            id: "flood-zone-3",
            properties: { name: "Flood zone 3", colour: "#00838f" },
          },
        ],
      });
      // The listed building is only a point: it has a marker but no shape.
      expect(
        featureMarkers().reduce(
          (sum, { element }) => sum + Number(element?.dataset.count),
          0,
        ),
      ).toBe(3);
    });

    const outputArea = (id: string, populationDensity: number) => ({
      id,
      location: NG17_1AA,
      distanceMetres: 0,
      lsoa: null,
      msoaCode: null,
      population: 300,
      households: 120,
      populationDensity,
      medianAge: 40,
      householdIncome: null,
      deprivationDecile: null,
      overlap: 1,
      coversLocation: false,
      shape: square(-1.27, 53.12, 0.01),
    });

    const byDensity = {
      colour: (feature: object) =>
        "populationDensity" in feature &&
        typeof feature.populationDensity === "number" &&
        feature.populationDensity > 5000
          ? "#76300b"
          : "#f2a070",
      fillOpacity: 0.55,
      outlineColour: "#ffffff",
      outlineWidth: 1,
    };

    it("shades a Layer's shapes by its shading, below every other Layer's shapes and the Search Area", () => {
      const { rerender } = render(
        <SearchAreaMap
          area={area}
          layers={[{ id: "planning", features: constraints }]}
        />,
      );
      loadMap();

      rerender(
        <SearchAreaMap
          area={area}
          layers={[
            { id: "planning", features: constraints },
            {
              id: "demographics",
              features: [outputArea("E1", 2700), outputArea("E2", 9000)],
              shading: byDensity,
            },
          ]}
        />,
      );

      const map = lastMap();
      expect(map.layers.map(({ id }) => id)).toEqual([
        "demographics-shapes-fill",
        "demographics-shapes-outline",
        "planning-shapes-fill",
        "planning-shapes-outline",
        "search-area-fill",
        "search-area-outline",
      ]);
      expect(map.layers[0]).toMatchObject({
        paint: { "fill-opacity": 0.55 },
      });
      expect(map.layers[1]).toMatchObject({
        paint: { "line-color": "#ffffff", "line-width": 1 },
      });
      expect(map.sources.get("demographics-shapes")?.data).toMatchObject({
        features: [
          { id: "E1", properties: { name: "E1", colour: "#f2a070" } },
          { id: "E2", properties: { name: "E2", colour: "#76300b" } },
        ],
      });
    });

    it("redraws only the shapes when the shading changes, keeping the markers", () => {
      const features = [outputArea("E1", 2700)];
      const { rerender } = render(
        <SearchAreaMap
          area={area}
          layers={[{ id: "demographics", features, shading: byDensity }]}
        />,
      );
      loadMap();
      const markers = featureMarkers();

      rerender(
        <SearchAreaMap
          area={area}
          layers={[
            {
              id: "demographics",
              features,
              shading: { ...byDensity, colour: () => "#ad4615" },
            },
          ]}
        />,
      );

      expect(lastMap().sources.get("demographics-shapes")?.data).toMatchObject({
        features: [{ properties: { colour: "#ad4615" } }],
      });
      expect(featureMarkers()).toEqual(markers);
    });

    it("takes a Layer's shapes off the map when it is no longer given", () => {
      const { rerender } = render(
        <SearchAreaMap
          area={area}
          layers={[{ id: "planning", features: constraints }]}
        />,
      );
      loadMap();

      rerender(<SearchAreaMap area={area} layers={[]} />);

      const map = lastMap();
      expect(map.layers.map(({ id }) => id)).toEqual([
        "search-area-fill",
        "search-area-outline",
      ]);
      expect(map.sources.has("planning-shapes")).toBe(false);
    });

    it("adds no shapes for a Layer of points", () => {
      render(
        <SearchAreaMap
          area={area}
          layers={[{ id: "crime", features: crimes }]}
        />,
      );
      loadMap();

      expect(lastMap().sources.has("crime-shapes")).toBe(false);
    });

    it("draws nothing for a Layer until the map has loaded", () => {
      render(
        <SearchAreaMap
          area={area}
          layers={[{ id: "crime", features: crimes }]}
        />,
      );

      expect(featureMarkers()).toHaveLength(0);
    });
  });

  describe("with overlays", () => {
    const square = {
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [-1.266, 53.122],
            [-1.262, 53.122],
            [-1.262, 53.125],
            [-1.266, 53.122],
          ] satisfies [number, number][],
        ],
      ],
    };
    const industrial = {
      id: "land-use",
      shapes: [{ id: "way-123", name: "Industrial land", shape: square }],
      colour: "#57606a",
      fillOpacity: 0.08,
      lineWidth: 1,
      dashed: true,
    };

    it("draws each overlay's shapes under the Search Area circle, dashed, with no markers", () => {
      render(<SearchAreaMap area={area} overlays={[industrial]} />);
      loadMap();

      const map = lastMap();
      expect(map.layers.map(({ id }) => id)).toEqual([
        "land-use-overlay-fill",
        "land-use-overlay-outline",
        "search-area-fill",
        "search-area-outline",
      ]);
      expect(map.layers[1]?.paint).toMatchObject({
        "line-color": "#57606a",
        "line-dasharray": [2, 2],
      });
      expect(map.sources.get("land-use-overlay")?.data).toEqual({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "way-123",
            properties: { name: "Industrial land" },
            geometry: square,
          },
        ],
      });
      expect(maplibre.FakeMarker.instances).toHaveLength(1);
    });

    it("takes an overlay off the map when it is no longer given", () => {
      const { rerender } = render(
        <SearchAreaMap area={area} overlays={[industrial]} />,
      );
      loadMap();

      rerender(<SearchAreaMap area={area} overlays={[]} />);

      expect(lastMap().sources.has("land-use-overlay")).toBe(false);
      expect(lastMap().layers.map(({ id }) => id)).toEqual([
        "search-area-fill",
        "search-area-outline",
      ]);
    });

    it("shows the whole of a shape it is to focus on, such as the Land Opportunity chosen", () => {
      render(<SearchAreaMap area={area} focus={square} />);
      loadMap();

      expect(lastMap().fitBounds).toHaveBeenCalledWith(
        [
          [-1.266, 53.122],
          [-1.262, 53.125],
        ],
        expect.objectContaining({ maxZoom: 17 }),
      );
    });
  });

  it("removes the map when it unmounts", () => {
    const { unmount } = render(<SearchAreaMap area={null} />);

    unmount();

    expect(lastMap().remove).toHaveBeenCalled();
  });
});
