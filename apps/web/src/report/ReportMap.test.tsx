import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CrimeFeature, SearchArea } from "@location-scout/shared";

import { ReportMap } from "./ReportMap";

/**
 * MapLibre needs WebGL, which jsdom lacks, so these tests swap it for a
 * recorder of what the report's map is asked to draw, which turns into a
 * made-up image once it is idle.
 */
const maplibre = vi.hoisted(() => {
  class FakeMap {
    static instances: FakeMap[] = [];
    static failing = false;
    static image: () => string = () => "data:image/png;base64,iVBORw0KGgo=";
    listeners = new Map<string, () => void>();
    sources = new Map<string, unknown>();
    layers: string[] = [];
    remove = vi.fn();
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      if (FakeMap.failing) throw new Error("Failed to initialize WebGL");
      this.options = options;
      FakeMap.instances.push(this);
    }
    on(event: string, listener: () => void) {
      this.listeners.set(event, listener);
      return this;
    }
    once(event: string, listener: () => void) {
      return this.on(event, listener);
    }
    fire(event: string) {
      this.listeners.get(event)?.();
    }
    addSource(id: string, { data }: { data: unknown }) {
      this.sources.set(id, data);
    }
    addLayer({ id }: { id: string }) {
      this.layers.push(id);
    }
    getCanvas() {
      return { toDataURL: () => FakeMap.image() };
    }
  }
  return { FakeMap };
});

vi.mock("maplibre-gl", () => ({ Map: maplibre.FakeMap }));

const AREA: SearchArea = {
  location: { lat: 53.123664, lng: -1.264078 },
  searchRadius: { miles: 0.5, metres: 804.672 },
};

const CRIME: CrimeFeature = {
  id: "1",
  location: { lat: 53.1239, lng: -1.2637 },
  distanceMetres: 37,
  category: "shoplifting",
  categoryName: "Shoplifting",
  month: "2026-08",
  street: "On or near Market Place",
};

const NAME = "0.5 mile around NG17 1AA";

const lastMap = () => {
  const map = maplibre.FakeMap.instances.at(-1);
  if (!map) throw new Error("No map was made");
  return map;
};

/** Loads the map, then lets it go idle, as MapLibre does once it has drawn. */
const draw = () => {
  act(() => {
    lastMap().fire("load");
  });
  act(() => {
    lastMap().fire("idle");
  });
};

describe("ReportMap", () => {
  beforeEach(() => {
    maplibre.FakeMap.instances = [];
    maplibre.FakeMap.failing = false;
    maplibre.FakeMap.image = () => "data:image/png;base64,iVBORw0KGgo=";
  });

  afterEach(() => {
    cleanup();
  });

  it("waits for every Layer before drawing, keying the Location and Search Area and crediting OpenStreetMap meanwhile", () => {
    render(<ReportMap area={AREA} layers={null} name={NAME} />);

    expect(
      screen.getByText("The map is drawn once every Layer has loaded."),
    ).toBeTruthy();
    expect(maplibre.FakeMap.instances).toHaveLength(0);
    const key = screen.getByRole("list", { name: "Map key" });
    expect(
      within(key)
        .getAllByRole("listitem")
        .map(({ textContent }) => textContent),
    ).toEqual(["The Location", "The Search Area, 0.5 mile around NG17 1AA"]);
    expect(
      screen
        .getByRole("link", { name: "OpenStreetMap contributors" })
        .getAttribute("href"),
    ).toBe("https://www.openstreetmap.org/copyright");
  });

  it("draws the Search Area and its Features on a map that can't be moved, then shows it as an image", () => {
    render(
      <ReportMap
        area={AREA}
        layers={[{ id: "crime", features: [CRIME] }]}
        name={NAME}
      />,
    );

    expect(screen.getByText("Drawing the map…")).toBeTruthy();
    const map = lastMap();
    expect(map.options).toMatchObject({
      interactive: false,
      attributionControl: false,
      pixelRatio: 2,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    draw();

    expect([...map.sources.keys()]).toEqual([
      "search-area",
      "shapes",
      "points",
      "location",
    ]);
    // The Location is drawn last, over everything else.
    expect(map.layers.at(-1)).toBe("location");
    const image = screen.getByRole("img", {
      name: "Map of the Search Area, 0.5 mile around NG17 1AA, with the Features of the Layers listed beneath",
    });
    expect(image.getAttribute("src")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(map.remove).toHaveBeenCalled();
    expect(screen.queryByText("Drawing the map…")).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "Map key" })).getByText(
        "Crime: 1 crime",
      ),
    ).toBeTruthy();
  });

  it("says there is no map image where the browser has no WebGL", () => {
    maplibre.FakeMap.failing = true;

    render(
      <ReportMap
        area={AREA}
        layers={[{ id: "crime", features: [CRIME] }]}
        name={NAME}
      />,
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/couldn't draw the map/)).toBeTruthy();
  });

  it("says so too if the map, once drawn, can't be read", () => {
    maplibre.FakeMap.image = () => {
      throw new Error("The canvas has been tainted");
    };

    render(
      <ReportMap
        area={AREA}
        layers={[{ id: "crime", features: [CRIME] }]}
        name={NAME}
      />,
    );
    draw();

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/couldn't draw the map/)).toBeTruthy();
  });
});
