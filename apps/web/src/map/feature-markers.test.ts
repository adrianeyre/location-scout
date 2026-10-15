import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INSPIRE_FREEHOLD_NOTE,
  LAND_OPPORTUNITY_WORDING,
  LAND_SALES_NOTE,
  type AddressSale,
  type AmenityFeature,
  type CrimeFeature,
  type GreenSpaceFeature,
  type LandOpportunityFeature,
  type LandSale,
  type OutputAreaFeature,
  type PlanningApplicationFeature,
  type PlanningConstraintFeature,
  type PropertySaleFeature,
  type SchoolFeature,
  type TransportFacilityFeature,
  type TransportRouteFeature,
} from "@location-scout/shared";

import { POLICE_CREDIT } from "../attribution";
import type { LayerFeature } from "../layers/layer-styles";
import { FeatureMarkers, popupContent } from "./feature-markers";

/**
 * MapLibre needs WebGL, which jsdom lacks, so these tests swap in a map that
 * shows a chosen view, and markers and popups that put their elements in the
 * page, where a test can find and click them.
 */
const maplibre = vi.hoisted(() => {
  class FakeMap {
    zoom = 10;
    bounds = { west: -180, south: -85, east: 180, north: 85 };
    listeners = new Map<string, () => void>();
    easeTo = vi.fn();
    readonly canvas = Object.assign(document.createElement("canvas"), {
      tabIndex: 0,
    });

    on(event: string, listener: () => void) {
      this.listeners.set(event, listener);
      return this;
    }
    off(event: string, listener: () => void) {
      if (this.listeners.get(event) === listener) this.listeners.delete(event);
      return this;
    }
    fire(event: string) {
      this.listeners.get(event)?.();
    }
    getZoom() {
      return this.zoom;
    }
    getCanvas() {
      return this.canvas;
    }
    getBounds() {
      const { west, south, east, north } = this.bounds;
      return {
        getWest: () => west,
        getSouth: () => south,
        getEast: () => east,
        getNorth: () => north,
      };
    }
  }

  class FakeMarker {
    static instances: FakeMarker[] = [];
    element: HTMLElement;
    lngLat: [number, number] | null = null;

    constructor({ element }: { element: HTMLElement }) {
      this.element = element;
      FakeMarker.instances.push(this);
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
    addTo() {
      document.body.append(this.element);
      return this;
    }
    getElement() {
      return this.element;
    }
    remove() {
      this.element.remove();
    }
  }

  class FakePopup {
    static instances: FakePopup[] = [];
    content: HTMLElement | null = null;
    lngLat: [number, number] | null = null;
    open = false;
    readonly element = document.createElement("div");
    readonly closed: (() => void)[] = [];

    constructor() {
      FakePopup.instances.push(this);
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
    setDOMContent(content: HTMLElement) {
      this.content = content;
      this.element.replaceChildren(content);
      return this;
    }
    addTo() {
      this.open = true;
      document.body.append(this.element);
      return this;
    }
    getElement() {
      return this.element;
    }
    on(type: string, listener: () => void) {
      if (type === "close") this.closed.push(listener);
      return this;
    }
    remove() {
      if (!this.open) return;
      this.open = false;
      this.element.remove();
      for (const listener of this.closed) listener();
    }
  }

  return { FakeMap, FakeMarker, FakePopup };
});

vi.mock("maplibre-gl", () => ({
  Marker: maplibre.FakeMarker,
  Popup: maplibre.FakePopup,
}));

const crime = (
  id: string,
  lat: number,
  lng: number,
  categoryName = "Shoplifting",
): CrimeFeature => ({
  id,
  location: { lat, lng },
  distanceMetres: 604,
  category: categoryName.toLowerCase(),
  categoryName,
  month: "2026-08",
  street: "On or near Market Place",
});

/** Three crimes at one point, one nearby, and one across town. */
const crimes = [
  crime("1", 53.1237, -1.2641),
  crime("2", 53.1237, -1.2641, "Robbery"),
  crime("3", 53.1237, -1.2641, "Drugs"),
  crime("4", 53.1238, -1.2642),
  crime("5", 53.13, -1.25),
];

const draw = (zoom: number) => {
  const map = new maplibre.FakeMap();
  map.zoom = zoom;
  // The fake has only what FeatureMarkers uses.
  const markers = new FeatureMarkers(
    map as unknown as ConstructorParameters<typeof FeatureMarkers>[0],
    "crime",
    crimes,
  );
  return { map, markers };
};

const buttons = (selector: string) => [
  ...document.querySelectorAll<HTMLButtonElement>(selector),
];

const openPopups = () =>
  maplibre.FakePopup.instances.filter(({ open }) => open);

beforeEach(() => {
  maplibre.FakeMarker.instances = [];
  maplibre.FakePopup.instances = [];
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("FeatureMarkers", () => {
  it("clusters the Layer's Features when zoomed out, as a button that counts them", () => {
    draw(10);

    const [cluster, ...others] = buttons("button");
    expect(others).toHaveLength(0);
    expect(cluster?.className).toBe("feature-cluster");
    expect(cluster?.dataset.layer).toBe("crime");
    expect(cluster?.textContent).toBe("5");
    expect(cluster?.getAttribute("aria-label")).toBe(
      "5 crimes clustered: zoom in",
    );
  });

  it("zooms into a cluster until it splits apart when it is clicked", () => {
    const { map } = draw(10);
    const [cluster] = buttons(".feature-cluster");
    const [marker] = maplibre.FakeMarker.instances;

    cluster?.click();

    expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({
      center: marker?.lngLat,
      zoom: expect.any(Number) as unknown,
    });
    const { zoom } = map.easeTo.mock.calls[0]?.[0] as { zoom: number };
    expect(zoom).toBeGreaterThan(10);
  });

  it("shows each point on its own when zoomed in, in the Layer's icon", () => {
    draw(20);

    const points = buttons(".feature-marker");
    expect(points).toHaveLength(3);
    expect(points.every((point) => point.querySelector("svg"))).toBe(true);
    expect(points.map((point) => point.getAttribute("aria-label"))).toEqual([
      "3 crimes, 600 m from the Location",
      "Shoplifting, August 2026, 600 m from the Location",
      "Shoplifting, August 2026, 600 m from the Location",
    ]);
    expect(points[0]?.querySelector(".feature-marker-count")?.textContent).toBe(
      "3",
    );
  });

  it("opens a popup about the crimes at a point when it is clicked", () => {
    draw(20);
    const [several, single] = buttons(".feature-marker");

    single?.click();

    const [popup] = openPopups();
    expect(popup?.lngLat).toEqual([-1.2642, 53.1238]);
    expect(popup?.content?.textContent).toContain("Shoplifting");
    expect(popup?.content?.textContent).toContain("August 2026");
    expect(popup?.content?.textContent).toContain("600 m from the Location");

    several?.click();

    expect(openPopups()).toHaveLength(1);
    expect(openPopups()[0]?.content?.textContent).toContain(
      "3 crimes at this point",
    );
  });

  it("closes its popup on Escape and gives the focus back to its marker", () => {
    draw(20);
    const [, single] = buttons(".feature-marker");
    single?.focus();
    single?.click();
    const link = document.createElement("a");
    link.href = "#";
    openPopups()[0]?.content?.append(link);
    link.focus();

    link.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(openPopups()).toHaveLength(0);
    expect(document.activeElement).toBe(single);
  });

  it("leaves the focus where it is when its popup closes without having it", () => {
    draw(20);
    const [several, single] = buttons(".feature-marker");
    single?.click();
    several?.focus();

    several?.click();

    expect(openPopups()).toHaveLength(1);
    expect(document.activeElement).toBe(several);
  });

  it("keeps a click on a marker from reaching the map, which would move the Location", () => {
    const mapClick = vi.fn();
    document.body.addEventListener("click", mapClick);
    draw(20);

    buttons(".feature-marker")[0]?.click();
    buttons(".feature-cluster")[0]?.click();

    expect(mapClick).not.toHaveBeenCalled();
    document.body.removeEventListener("click", mapClick);
  });

  it("redraws when the map stops moving", () => {
    const { map } = draw(10);
    expect(buttons(".feature-cluster")).toHaveLength(1);

    map.zoom = 20;
    map.fire("moveend");

    expect(buttons(".feature-cluster")).toHaveLength(0);
    expect(buttons(".feature-marker")).toHaveLength(3);
  });

  it("leaves the focus on the map when the marker that had it is redrawn away", () => {
    const { map } = draw(10);
    document.body.append(map.canvas);
    buttons(".feature-cluster")[0]?.focus();

    map.zoom = 20;
    map.fire("moveend");

    expect(document.activeElement).toBe(map.canvas);
  });

  it("draws only what is in view", () => {
    const { map } = draw(20);

    map.bounds = { west: -1.251, south: 53.129, east: -1.249, north: 53.131 };
    map.fire("moveend");

    expect(buttons(".feature-marker")).toHaveLength(1);
  });

  it("takes its markers and popup off the map when removed", () => {
    const { map, markers } = draw(20);
    buttons(".feature-marker")[0]?.click();

    markers.remove();

    expect(buttons("button")).toHaveLength(0);
    expect(openPopups()).toHaveLength(0);
    expect(map.listeners.has("moveend")).toBe(false);
  });
});

describe("FeatureMarkers for highlighted Features", () => {
  const cafe = (id: string, lat: number, name: string): AmenityFeature => ({
    id,
    location: { lat, lng: -1.2649 },
    distanceMetres: 110,
    type: "cafe",
    name,
    osmTag: "amenity=cafe",
  });
  const cafes = [cafe("1", 53.124, "Costa"), cafe("2", 53.13, "Greggs")];
  const competitor = {
    noun: ["competitor", "competitors"],
    note: "★ Competitor in the Business: Café Scout Mode",
  } as const;

  const drawCafes = (zoom: number) => {
    const map = new maplibre.FakeMap();
    map.zoom = zoom;
    return new FeatureMarkers(
      map as unknown as ConstructorParameters<typeof FeatureMarkers>[0],
      "amenities",
      cafes,
      competitor,
    );
  };

  it("stars each one and says what it is", () => {
    drawCafes(20);

    const points = buttons(".feature-marker");
    expect(points.map((point) => point.getAttribute("aria-label"))).toEqual([
      "Competitor: Costa, Café, 110 m from the Location",
      "Competitor: Greggs, Café, 110 m from the Location",
    ]);
    expect(points.every((point) => point.dataset.highlighted === "")).toBe(
      true,
    );
    expect(
      points.map(
        (point) =>
          point.querySelector(".feature-marker-highlight")?.textContent,
      ),
    ).toEqual(["★", "★"]);
  });

  it("counts them as what they are when clustered, still starred", () => {
    drawCafes(5);

    const [cluster] = buttons(".feature-cluster");
    expect(cluster?.getAttribute("aria-label")).toBe(
      "2 competitors clustered: zoom in",
    );
    expect(cluster?.dataset.count).toBe("2");
    expect(cluster?.dataset.highlighted).toBe("");
  });

  it("says so in the popup", () => {
    drawCafes(20);

    buttons(".feature-marker")[0]?.click();

    expect(
      openPopups()[0]?.content?.querySelector(".feature-popup-highlight")
        ?.textContent,
    ).toBe("★ Competitor in the Business: Café Scout Mode");
  });

  it("stars nothing that isn't highlighted", () => {
    draw(20);

    expect(buttons("[data-highlighted]")).toHaveLength(0);
    expect(document.querySelector(".feature-marker-highlight")).toBeNull();
  });
});

describe("popupContent", () => {
  const [first] = crimes;
  if (!first) throw new Error("no crimes");

  it("gives a crime's category, month, place and distance from the Location", () => {
    const popup = popupContent("crime", {
      key: "here",
      location: first.location,
      features: [first],
    });

    expect(popup.querySelector("h2")?.textContent).toBe("Crime");
    expect(
      [...popup.querySelectorAll("li > *")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual(["Shoplifting", "August 2026", "On or near Market Place"]);
    expect(popup.querySelector(".feature-popup-distance")?.textContent).toBe(
      "600 m from the Location",
    );
    expect(popup.querySelector(".feature-popup-note")?.textContent).toBe(
      "The police give an approximate location.",
    );
  });

  it("says where the police name no street", () => {
    const popup = popupContent("crime", {
      key: "here",
      location: first.location,
      features: [{ ...first, street: null }],
    });

    expect(popup.textContent).toContain("No street given by the police");
  });

  it("credits its Features' Data Sources once each, with their links, after the rest", () => {
    const popup = popupContent(
      "crime",
      { key: "here", location: first.location, features: crimes.slice(0, 3) },
      null,
      null,
      () => [POLICE_CREDIT],
    );

    const credits = [...popup.querySelectorAll(".feature-popup-credit")];
    expect(credits.map(({ textContent }) => textContent)).toEqual([
      "Crime data from police.uk, licensed under the Open Government Licence v3.0.",
    ]);
    expect(
      [...(credits[0]?.querySelectorAll("a") ?? [])].map((link) => [
        link.textContent,
        link.href,
        link.target,
      ]),
    ).toEqual([
      ["police.uk", "https://data.police.uk/", "_blank"],
      [
        "Open Government Licence v3.0",
        "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
        "_blank",
      ],
    ]);
    expect(popup.lastElementChild).toBe(credits[0]);
  });

  it("credits nothing without credits", () => {
    const popup = popupContent("crime", {
      key: "here",
      location: first.location,
      features: [first],
    });

    expect(popup.querySelector(".feature-popup-credit")).toBeNull();
  });
});

describe("popupContent's Street View button", () => {
  const [first, second] = crimes;
  if (!first || !second) throw new Error("no crimes");

  it("opens Street View at the point, named by its Layer and the Feature there, as its marker is", () => {
    const onStreetView = vi.fn();
    const popup = popupContent(
      "crime",
      { key: "here", location: first.location, features: [first] },
      null,
      onStreetView,
    );
    const mapClick = vi.fn();
    document.body.addEventListener("click", mapClick);
    document.body.append(popup);

    const button = popup.querySelector<HTMLButtonElement>(
      ".feature-popup-street-view",
    );
    expect(button?.type).toBe("button");
    expect(button?.textContent).toBe("Street View here");
    button?.click();

    expect(onStreetView).toHaveBeenCalledExactlyOnceWith({
      location: { lat: 53.1237, lng: -1.2641 },
      name: "Crime: Shoplifting, August 2026",
    });
    // The map would take the click as a new Location.
    expect(mapClick).not.toHaveBeenCalled();
    document.body.removeEventListener("click", mapClick);
    popup.remove();
  });

  it("names several Features at a point by how many there are", () => {
    const onStreetView = vi.fn();
    const popup = popupContent(
      "crime",
      { key: "here", location: first.location, features: [first, second] },
      null,
      onStreetView,
    );

    popup
      .querySelector<HTMLButtonElement>(".feature-popup-street-view")
      ?.click();

    expect(onStreetView).toHaveBeenCalledExactlyOnceWith({
      location: first.location,
      name: "Crime: 2 crimes",
    });
  });

  it("isn't there without Street View", () => {
    const popup = popupContent("crime", {
      key: "here",
      location: first.location,
      features: [first],
    });

    expect(popup.querySelector(".feature-popup-street-view")).toBeNull();
    expect(popup.textContent).not.toContain("Street View");
  });

  it("is in the popup FeatureMarkers opens when it is given Street View", () => {
    const onStreetView = vi.fn();
    const map = new maplibre.FakeMap();
    const markers = new FeatureMarkers(
      map as unknown as ConstructorParameters<typeof FeatureMarkers>[0],
      "crime",
      crimes,
      null,
      onStreetView,
    );
    map.zoom = 20;
    map.fire("moveend");
    buttons(".feature-marker")[1]?.click();

    openPopups()[0]
      ?.content?.querySelector<HTMLButtonElement>(".feature-popup-street-view")
      ?.click();

    expect(onStreetView).toHaveBeenCalledExactlyOnceWith({
      location: { lat: 53.1238, lng: -1.2642 },
      name: "Crime: Shoplifting, August 2026",
    });
    markers.remove();
  });
});

describe("popupContent for a Planning Constraint", () => {
  const conservationArea: PlanningConstraintFeature = {
    id: "44005909",
    location: { lat: 53.123664, lng: -1.264078 },
    distanceMetres: 0,
    type: "conservation-area",
    name: "Sutton in Ashfield Church and Market Place",
    grade: null,
    coversLocation: true,
    shape: null,
  };
  const listedBuilding: PlanningConstraintFeature = {
    id: "31691403",
    location: { lat: 53.124777, lng: -1.26524 },
    distanceMetres: 146,
    type: "listed-building",
    name: "HUNTER'S BAR",
    grade: "II",
    coversLocation: false,
    shape: null,
  };

  const items = (popup: HTMLElement) =>
    [...popup.querySelectorAll("li > *")].map(({ textContent }) => textContent);

  it("names it and its type, and says the Location is inside it", () => {
    const popup = popupContent("planning", {
      key: "here",
      location: conservationArea.location,
      features: [conservationArea],
    });

    expect(popup.querySelector("h2")?.textContent).toBe("Planning");
    expect(items(popup)).toEqual([
      "Sutton in Ashfield Church and Market Place",
      "Conservation area",
      "The Location is inside it",
    ]);
    expect(popup.querySelector(".feature-popup-distance")?.textContent).toBe(
      "0 m from the Location",
    );
    expect(popup.querySelector(".feature-popup-note")).toBeNull();
  });

  it("gives a listed building's grade and its distance from the Location", () => {
    const popup = popupContent("planning", {
      key: "there",
      location: listedBuilding.location,
      features: [listedBuilding],
    });

    expect(items(popup)).toEqual(["HUNTER'S BAR", "Listed building, grade II"]);
    expect(popup.querySelector(".feature-popup-distance")?.textContent).toBe(
      "150 m from the Location",
    );
  });

  it("names each of several at the same point", () => {
    const article4: PlanningConstraintFeature = {
      ...conservationArea,
      id: "7010009964",
      type: "article-4-direction",
      name: "Houses in Multiple Occupation Article 4 Direction",
    };

    const popup = popupContent("planning", {
      key: "here",
      location: conservationArea.location,
      features: [conservationArea, article4],
    });

    expect(popup.textContent).toContain("2 planning constraints at this point");
    expect(
      [...popup.querySelectorAll("li > strong")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual([
      "Sutton in Ashfield Church and Market Place",
      "Houses in Multiple Occupation Article 4 Direction",
    ]);
  });
});

describe("a Planning Application's marker and popup", () => {
  const pending: PlanningApplicationFeature = {
    id: "Ashfield/V/2025/0425",
    location: { lat: 53.12434, lng: -1.26446 },
    distanceMetres: 77,
    reference: "V/2025/0425",
    authority: "Ashfield",
    description:
      "Demolition of existing commercial building and construction of a 3 storey apartment block",
    address: "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU",
    postcode: "NG17 1BU",
    status: "pending",
    applicationType: "major",
    councilType: "Major Full",
    receivedOn: "2025-07-21",
    decidedOn: null,
    approximate: true,
    url: "https://planning.ashfield.gov.uk/planning-applications/planning-application/?RefType=GFPlanning&KeyNo=1",
    providerUrl: "https://www.planit.org.uk/planapplic/Ashfield/V/2025/0425/",
    estimatedHomes: null,
    impact: "Potential impact, estimated: no new homes in its description.",
  };
  const approved: PlanningApplicationFeature = {
    ...pending,
    id: "Ashfield/V/2025/0320",
    reference: "V/2025/0320",
    location: { lat: 53.124817, lng: -1.25829 },
    status: "approved",
    applicationType: "minor",
    councilType: null,
    decidedOn: "2025-11-28",
    approximate: false,
    url: null,
    providerUrl: null,
    description:
      "Outline application with all matters reserved for 4 dwellings",
    estimatedHomes: 4,
    impact:
      "Potential impact, estimated: 4 new homes, about 10 more residents, once built.",
  };
  const conservationArea: PlanningConstraintFeature = {
    id: "44005909",
    location: pending.location,
    distanceMetres: 77,
    type: "conservation-area",
    name: "Sutton in Ashfield Church and Market Place",
    grade: null,
    coversLocation: false,
    shape: null,
  };

  const items = (popup: HTMLElement) =>
    [...popup.querySelectorAll("li > *")].map(({ textContent }) => textContent);

  const drawPlanning = (features: readonly LayerFeature[]) => {
    const map = new maplibre.FakeMap();
    map.zoom = 18;
    new FeatureMarkers(
      map as unknown as ConstructorParameters<typeof FeatureMarkers>[0],
      "planning",
      features,
    );
    return buttons('.feature-marker[data-layer="planning"]');
  };

  it("gives its address, status, type, when it was received, what it proposes, its potential impact and its reference, says it is approximate, and links to it", () => {
    const popup = popupContent("planning", {
      key: "here",
      location: pending.location,
      features: [pending],
    });

    expect(items(popup)).toEqual([
      "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU",
      "Pending",
      "Major application: Major Full",
      "Received 21 July 2025",
      "Demolition of existing commercial building and construction of a 3 storey apartment block",
      "Potential impact, estimated: no new homes in its description.",
      "Ashfield reference V/2025/0425",
      "Approximate: placed at the middle of its postcode, as the council gave no closer location.",
      "See it on the council's website",
      "See it on planit.org.uk",
    ]);
    expect([...popup.querySelectorAll("a")].map((link) => link.href)).toEqual([
      pending.url,
      pending.providerUrl,
    ]);
  });

  it("says when one was decided, and leaves out what isn't known", () => {
    const popup = popupContent("planning", {
      key: "there",
      location: approved.location,
      features: [approved],
    });

    expect(items(popup)).toEqual([
      "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU",
      "Approved, 28 November 2025",
      "Minor application",
      "Received 21 July 2025",
      "Outline application with all matters reserved for 4 dwellings",
      "Potential impact, estimated: 4 new homes, about 10 more residents, once built.",
      "Ashfield reference V/2025/0320",
    ]);
  });

  it("colours each marker by its application's status, and a constraint's or a mixed point's in the Layer's colour", () => {
    const [pendingMarker, approvedMarker] = drawPlanning([pending, approved]);
    expect(pendingMarker?.style.getPropertyValue("--layer-colour")).toBe(
      "#a14d00",
    );
    expect(approvedMarker?.style.getPropertyValue("--layer-colour")).toBe(
      "#2e7d32",
    );
    document.body.replaceChildren();

    const [mixed] = drawPlanning([pending, conservationArea]);
    expect(mixed?.style.getPropertyValue("--layer-colour")).toBe("#6a1b9a");
  });

  it("counts a cluster of Planning Applications, drawn apart from the constraints, as what they are", () => {
    const map = new maplibre.FakeMap();
    map.zoom = 3;
    new FeatureMarkers(
      map as unknown as ConstructorParameters<typeof FeatureMarkers>[0],
      "planning",
      [pending, approved],
    );

    expect(
      buttons('.feature-cluster[data-layer="planning"]').map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(["2 planning applications clustered: zoom in"]);
    // A cluster is drawn in the Layer's colour, whatever is in it.
    expect(
      buttons(".feature-cluster")[0]?.style.getPropertyValue("--layer-colour"),
    ).toBe("#6a1b9a");
  });

  it("calls the Features at one point what they are", () => {
    const [applications] = drawPlanning([
      pending,
      { ...approved, location: pending.location },
    ]);
    expect(applications?.getAttribute("aria-label")).toBe(
      "2 planning applications, 80 m from the Location",
    );
    document.body.replaceChildren();

    const [mixed] = drawPlanning([pending, conservationArea]);
    expect(mixed?.getAttribute("aria-label")).toBe(
      "2 planning Features, 80 m from the Location",
    );
  });
});

describe("popupContent for an amenity", () => {
  const costa: AmenityFeature = {
    id: "way/251921972",
    location: { lat: 53.124, lng: -1.2649 },
    distanceMetres: 110,
    type: "cafe",
    name: "Costa",
    osmTag: "amenity=cafe",
  };

  const items = (popup: HTMLElement) =>
    [...popup.querySelectorAll("li > *")].map(({ textContent }) => textContent);

  it("names it, gives its type and the OpenStreetMap tag behind it, and its distance from the Location", () => {
    const popup = popupContent("amenities", {
      key: "costa",
      location: costa.location,
      features: [costa],
    });

    expect(popup.querySelector("h2")?.textContent).toBe("Amenities");
    expect(items(popup)).toEqual([
      "Costa",
      "Café",
      "OpenStreetMap tag: amenity=cafe",
    ]);
    expect(popup.querySelector(".feature-popup-distance")?.textContent).toBe(
      "110 m from the Location",
    );
    expect(popup.querySelector(".feature-popup-note")).toBeNull();
  });

  it("says a competitor is one, in its Scout Mode", () => {
    const popup = popupContent(
      "amenities",
      { key: "costa", location: costa.location, features: [costa] },
      {
        noun: ["competitor", "competitors"],
        note: "★ Competitor in the Business: Café Scout Mode",
      },
    );

    expect(popup.querySelector(".feature-popup-highlight")?.textContent).toBe(
      "★ Competitor in the Business: Café Scout Mode",
    );
    expect(items(popup)[0]).toBe("Costa");
  });

  it("calls one OpenStreetMap names nothing by its type", () => {
    const popup = popupContent("amenities", {
      key: "office",
      location: costa.location,
      features: [
        {
          ...costa,
          id: "node/1",
          type: "office",
          name: null,
          osmTag: "office=accountant",
        },
      ],
    });

    expect(items(popup)).toEqual([
      "Unnamed office",
      "Office",
      "OpenStreetMap tag: office=accountant",
    ]);
  });
});

describe("popupContent for a school", () => {
  const sutton: SchoolFeature = {
    id: "139063",
    location: { lat: 53.123786, lng: -1.260611 },
    distanceMetres: 232,
    name: "Sutton Community Academy",
    phase: "secondary",
    establishmentType: "Academy sponsor led",
    ages: { from: 11, to: 16 },
    judgement: "report-card",
    inspection: {
      kind: "report-card",
      inspectedOn: "2026-04-21",
      grades: [
        { area: "Inclusion", grade: "expected-standard" },
        { area: "Achievement", grade: "needs-attention" },
      ],
      safeguardingMet: true,
      outcome: null,
      ofPredecessor: false,
    },
    inspectorate: null,
  };

  const items = (popup: HTMLElement) =>
    [...popup.querySelectorAll("li > *")].map(({ textContent }) => textContent);
  const popupOf = (school: SchoolFeature) =>
    popupContent("schools", {
      key: school.id,
      location: school.location,
      features: [school],
    });

  it("names it, gives its phase, type and ages, and its latest Ofsted judgement with the grades it gave", () => {
    const popup = popupOf(sutton);

    expect(popup.querySelector("h2")?.textContent).toBe("Schools");
    // Then the grades, as a list of their own.
    expect(items(popup).slice(0, 5)).toEqual([
      "Sutton Community Academy",
      "Secondary school: Academy sponsor led",
      "Ages 11 to 16",
      "Ofsted: Report card, no overall grade",
      "Report card on 21 April 2026",
    ]);
    const grades = popup.querySelector(".feature-popup-sublist");
    expect(grades?.getAttribute("aria-label")).toBe("Grades");
    expect(
      [...(grades?.querySelectorAll("li") ?? [])].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual(["Inclusion: Expected standard", "Achievement: Needs attention"]);
    expect(popup.querySelector(".feature-popup-distance")?.textContent).toBe(
      "230 m from the Location",
    );
  });

  it("gives an ungraded inspection's outcome, safeguarding found wanting, and an inspection of the school it replaced", () => {
    const popup = popupOf({
      ...sutton,
      judgement: "good",
      inspection: {
        kind: "ungraded",
        inspectedOn: "2023-05-11",
        grades: [],
        safeguardingMet: false,
        outcome: "School remains Good",
        ofPredecessor: true,
      },
    });

    expect(items(popup).slice(3)).toEqual([
      "Ofsted: Good",
      "Ungraded inspection on 11 May 2023: School remains Good",
      "Safeguarding not effective",
      "Inspected as the school it replaced",
    ]);
    expect(popup.querySelector(".feature-popup-sublist")).toBeNull();
  });

  it("says why an independent school has no Ofsted judgement here", () => {
    const popup = popupOf({
      ...sutton,
      name: "Kingdom Christian School",
      phase: "independent",
      establishmentType: "Other independent school",
      ages: null,
      judgement: "none",
      inspection: null,
      inspectorate: "ISI",
    });

    expect(items(popup)).toEqual([
      "Kingdom Christian School",
      "Independent school: Other independent school",
      "No Ofsted judgement here: inspected by the Independent Schools Inspectorate, as an independent school",
    ]);
  });
});

describe("popupContent for transport", () => {
  const silkStreet: TransportFacilityFeature = {
    id: "node/502386902",
    location: { lat: 53.1224124, lng: -1.2622831 },
    distanceMetres: 184,
    type: "bus-stop",
    name: "Silk Street",
    osmTag: "highway=bus_stop",
    shape: null,
    lengthMetres: null,
  };

  const footpaths: TransportRouteFeature = {
    id: "footpath",
    location: { lat: 53.1232889, lng: -1.263982 },
    distanceMetres: 42,
    type: "footpath",
    name: null,
    osmTag: null,
    shape: {
      type: "MultiLineString",
      coordinates: [
        [
          [-1.263982, 53.1232889],
          [-1.2641, 53.1236],
        ],
      ],
    },
    lengthMetres: 9094,
  };

  const items = (popup: HTMLElement) =>
    [...popup.querySelectorAll("li > *")].map(({ textContent }) => textContent);

  it("names a facility, gives its type and the OpenStreetMap tag behind it, and its distance from the Location", () => {
    const popup = popupContent("transport", {
      key: "silk-street",
      location: silkStreet.location,
      features: [silkStreet],
    });

    expect(popup.querySelector("h2")?.textContent).toBe("Transport");
    expect(items(popup)).toEqual([
      "Silk Street",
      "Bus stop",
      "OpenStreetMap tag: highway=bus_stop",
    ]);
    expect(popup.querySelector(".feature-popup-distance")?.textContent).toBe(
      "180 m from the Location",
    );
  });

  it("calls a facility OpenStreetMap names nothing by its type", () => {
    const popup = popupContent("transport", {
      key: "charger",
      location: silkStreet.location,
      features: [
        {
          ...silkStreet,
          type: "ev-charger",
          name: null,
          osmTag: "amenity=charging_station",
        },
      ],
    });

    expect(items(popup)).toEqual([
      "Unnamed EV charger",
      "EV charger",
      "OpenStreetMap tag: amenity=charging_station",
    ]);
  });

  it("gives footpaths' length in the Search Area, and how far their nearest point is", () => {
    const popup = popupContent("transport", {
      key: "footpath",
      location: footpaths.location,
      features: [footpaths],
    });

    expect(items(popup)).toEqual([
      "Footpaths",
      "9.1 km in the Search Area",
      "Marked where they come nearest the Location",
    ]);
    expect(popup.querySelector(".feature-popup-distance")?.textContent).toBe(
      "40 m from the Location",
    );
  });
});

describe("popupContent for green space", () => {
  const suttonLawn: GreenSpaceFeature = {
    id: "way/309700889",
    location: { lat: 53.125114, lng: -1.2566126 },
    distanceMetres: 524,
    type: "park",
    name: "Sutton Lawn",
    osmTag: "leisure=park",
    coversLocation: false,
    shape: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-1.2566, 53.1251],
            [-1.255, 53.1251],
            [-1.255, 53.126],
            [-1.2566, 53.1251],
          ],
        ],
      ],
    },
  };

  const items = (popup: HTMLElement) =>
    [...popup.querySelectorAll("li > *")].map(({ textContent }) => textContent);

  it("names it, gives its type and the OpenStreetMap tag behind it, and how far its nearest edge is", () => {
    const popup = popupContent("green-space", {
      key: "sutton-lawn",
      location: suttonLawn.location,
      features: [suttonLawn],
    });

    expect(popup.querySelector("h2")?.textContent).toBe("Green space");
    expect(items(popup)).toEqual([
      "Sutton Lawn",
      "Park",
      "OpenStreetMap tag: leisure=park",
      "Marked where it comes nearest the Location",
    ]);
    expect(popup.querySelector(".feature-popup-distance")?.textContent).toBe(
      "520 m from the Location",
    );
  });

  it("says the Location is inside one that covers it", () => {
    const popup = popupContent("green-space", {
      key: "here",
      location: suttonLawn.location,
      features: [{ ...suttonLawn, coversLocation: true, distanceMetres: 0 }],
    });

    expect(items(popup)).toContain("The Location is inside it");
    expect(items(popup)).not.toContain(
      "Marked where it comes nearest the Location",
    );
  });

  it("calls one OpenStreetMap names nothing by its type, and marks one with no outline at its own point", () => {
    const popup = popupContent("green-space", {
      key: "playground",
      location: suttonLawn.location,
      features: [
        {
          ...suttonLawn,
          type: "playground",
          name: null,
          osmTag: "leisure=playground",
          shape: null,
        },
      ],
    });

    expect(items(popup)).toEqual([
      "Unnamed playground",
      "Playground",
      "OpenStreetMap tag: leisure=playground",
    ]);
  });
});

describe("popupContent for an output area", () => {
  const outputArea: OutputAreaFeature = {
    id: "E00142547",
    location: { lat: 53.123181, lng: -1.265629 },
    distanceMetres: 117,
    lsoa: { code: "E01027976", name: "Ashfield 005E" },
    msoaCode: "E02005823",
    population: 239,
    households: 140,
    populationDensity: 2725.2,
    medianAge: 49.5,
    householdIncome: 33525,
    deprivationDecile: 2,
    overlap: 1,
    coversLocation: true,
    shape: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-1.266, 53.122],
            [-1.262, 53.122],
            [-1.262, 53.125],
            [-1.266, 53.122],
          ],
        ],
      ],
    },
  };

  const items = (popup: HTMLElement) =>
    [...popup.querySelectorAll("li > *")].map(({ textContent }) => textContent);

  it("gives every figure the map can shade it by, as text, and how much of it is inside the Search Area", () => {
    const popup = popupContent("demographics", {
      key: outputArea.id,
      location: outputArea.location,
      features: [outputArea],
    });

    expect(popup.querySelector("h2")?.textContent).toBe("Demographics");
    expect(items(popup)).toEqual([
      "Output area E00142547",
      "239 residents and 140 households in Census 2021",
      "2,725 residents per km²",
      "Median age 49.5",
      "Average household income £33,525 a year, in its MSOA",
      "Deprivation decile 2 of 10, where 1 is the most deprived, in Ashfield 005E",
      "100% of it is inside the Search Area",
    ]);
    expect(popup.textContent).toContain(
      "Marked at a point of it inside the Search Area.",
    );
  });

  it("says which figures it has none of", () => {
    const popup = popupContent("demographics", {
      key: outputArea.id,
      location: outputArea.location,
      features: [
        {
          ...outputArea,
          lsoa: null,
          medianAge: null,
          householdIncome: null,
          deprivationDecile: null,
          overlap: 0.374,
        },
      ],
    });

    expect(items(popup)).toEqual(
      expect.arrayContaining([
        "No median age",
        "No household income estimate for its MSOA",
        "No deprivation decile for its LSOA",
        "37% of it is inside the Search Area",
      ]),
    );
  });
});

describe("a sale's marker and popup", () => {
  const sale = (
    id: string,
    price: number,
    lat = 53.122394,
  ): PropertySaleFeature => ({
    id,
    location: { lat, lng: -1.263681 },
    distanceMetres: 144,
    price,
    date: "2026-05-29",
    type: "detached",
    tenure: "freehold",
    newBuild: false,
    address: "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD",
    postcode: "NG17 1BT",
    history: [{ id, price, date: "2026-05-29", change: null }],
    epc: null,
  });

  /** One sale on its own, and three in one postcode further north. */
  const sales = [
    sale("1", 173000),
    sale("2", 105000, 53.1245),
    sale("3", 290000, 53.1245),
    sale("4", 142500, 53.1245),
  ];

  const drawSales = () => {
    const map = new maplibre.FakeMap();
    map.zoom = 20;
    new FeatureMarkers(
      map as unknown as ConstructorParameters<typeof FeatureMarkers>[0],
      "property",
      sales,
    );
  };

  const labels = () =>
    buttons(".feature-marker").map(
      (marker) => marker.querySelector(".feature-marker-label")?.textContent,
    );

  it("labels a sale's marker with its price, and several sales' with the lowest to the highest", () => {
    drawSales();

    expect(labels()).toEqual(["£173k", "£105k–£290k"]);
    expect(buttons(".feature-marker")[0]?.getAttribute("aria-label")).toBe(
      "£173,000, Sold on 29 May 2026, 140 m from the Location",
    );
  });

  it("labels no other Layer's markers", () => {
    draw(20);

    expect(document.querySelector(".feature-marker-label")).toBeNull();
  });

  it("gives a sale's price, date, type, tenure, new build and address, says there was no other sale at it, and says where it is placed", () => {
    const [first] = sales;
    if (!first) throw new Error("no sales");

    const popup = popupContent("property", {
      key: "1",
      location: first.location,
      features: [
        { ...first, type: "flat", tenure: "leasehold", newBuild: true },
      ],
    });

    expect(popup.querySelector("h2")?.textContent).toBe("Property");
    expect(
      [...popup.querySelectorAll("li > *")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual([
      "£173,000",
      "Sold on 29 May 2026",
      "Flat or maisonette, leasehold",
      "New build",
      "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD, NG17 1BT",
      "No other sale at this address since 1995",
    ]);
    expect(popup.querySelector(".feature-popup-distance")?.textContent).toBe(
      "140 m from the Location",
    );
    expect(popup.querySelector(".feature-popup-note")?.textContent).toBe(
      "Placed at the middle of its postcode: Price Paid gives no closer location.",
    );
  });

  it("lists every sale at the sale's address since 1995, newest first, with the change from the sale before", () => {
    const [first] = sales;
    if (!first) throw new Error("no sales");
    const history: AddressSale[] = [
      { id: "later", price: 190000, date: "2026-08-14", change: 9.8 },
      { id: first.id, price: 173000, date: "2026-05-29", change: -5.7 },
      { id: "first", price: 183500, date: "2024-10-06", change: 0 },
      { id: "earliest", price: 183500, date: "2019-02-01", change: null },
    ];

    const popup = popupContent("property", {
      key: "1",
      location: first.location,
      features: [{ ...first, history }],
    });

    expect(
      popup.querySelector(".feature-popup-sublist-name")?.textContent,
    ).toBe("Every sale at this address since 1995");
    const list = popup.querySelector(".feature-popup-sublist");
    expect(list?.getAttribute("aria-label")).toBe(
      "Every sale at this address since 1995",
    );
    expect(
      [...(list?.querySelectorAll("li") ?? [])].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual([
      "14 August 2026: £190,000, +9.8%",
      "29 May 2026: £173,000, -5.7%, this sale",
      "6 October 2024: £183,500, 0%",
      "1 February 2019: £183,500",
    ]);
    expect(popup.textContent).not.toContain("No other sale");
  });

  it("says when Price Paid didn't answer for a sale's history", () => {
    const [first] = sales;
    if (!first) throw new Error("no sales");

    const popup = popupContent("property", {
      key: "1",
      location: first.location,
      features: [{ ...first, history: null }],
    });

    expect(popup.textContent).toContain(
      "Sale history unavailable: Price Paid didn't answer",
    );
    expect(popup.querySelector(".feature-popup-sublist")).toBeNull();
  });

  describe("with EPC_API_KEY", () => {
    const [first] = sales;
    if (!first) throw new Error("no sales");
    const certificate = {
      certificateNumber: "9901-0000-0000-0000-0005",
      registrationDate: "2019-03-14",
      currentBand: "D",
      details: {
        potentialBand: "B",
        floorAreaSquareMetres: 92,
        pricePerSquareMetre: 1880,
      },
    } as const;
    const linesOf = (epc: PropertySaleFeature["epc"]) =>
      [
        ...popupContent("property", {
          key: "1",
          location: first.location,
          features: [{ ...first, epc }],
        }).querySelectorAll("li > span:not(.feature-popup-item-note)"),
      ]
        .map(({ textContent }) => textContent)
        // Its EPC's lines, after its own four and before its history's.
        .slice(4, -1);

    it("gives a matched sale's EPC rating, the rating it could reach, its floor area and price per m², and credits the EPC data (PRD FR-2.6, FR-10.1a)", () => {
      const popup = popupContent("property", {
        key: "1",
        location: first.location,
        features: [{ ...first, epc: { status: "matched", certificate } }],
      });

      expect(linesOf({ status: "matched", certificate })).toEqual([
        "EPC rating D, could be B (14 March 2019)",
        "Floor area 92 m²: £1,880 per m²",
      ]);
      expect(popup.querySelector(".feature-popup-item-note")?.textContent).toBe(
        "Energy Performance Certificate data from MHCLG's Get energy performance of buildings data, licensed under the Open Government Licence v3.0.",
      );
    });

    it("says when a certificate gives no floor area, or a mistaken one, or the EPC API didn't answer for it", () => {
      expect(
        linesOf({
          status: "matched",
          certificate: {
            ...certificate,
            details: {
              potentialBand: null,
              floorAreaSquareMetres: null,
              pricePerSquareMetre: null,
            },
          },
        }),
      ).toEqual(["EPC rating D (14 March 2019)", "Floor area not given"]);
      expect(
        linesOf({
          status: "matched",
          certificate: {
            ...certificate,
            details: {
              potentialBand: "C",
              floorAreaSquareMetres: 4500,
              pricePerSquareMetre: null,
            },
          },
        }),
      ).toEqual([
        "EPC rating D, could be C (14 March 2019)",
        "Floor area 4,500 m²",
      ]);
      expect(
        linesOf({
          status: "matched",
          certificate: { ...certificate, details: null },
        }),
      ).toEqual([
        "EPC rating D (14 March 2019)",
        "Floor area unavailable: the EPC API didn't answer",
      ]);
    });

    it("says when a sale matched no EPC, or the EPC API didn't answer for its postcode", () => {
      expect(linesOf({ status: "unmatched" })).toEqual([
        "No EPC matched to this sale",
      ]);
      expect(linesOf({ status: "unavailable" })).toEqual([
        "EPC unavailable: the EPC API didn't answer",
      ]);
    });
  });

  it("says nothing about EPCs without EPC_API_KEY, nor for other property", () => {
    const [first] = sales;
    if (!first) throw new Error("no sales");

    const popup = popupContent("property", {
      key: "1",
      location: first.location,
      features: [{ ...first, type: "other", epc: null }],
    });

    expect(popup.textContent).not.toMatch(/EPC|Energy Performance|m²/);
    expect(popup.querySelector(".feature-popup-item-note")).toBeNull();
  });

  it("lists every sale in one postcode", () => {
    const several = sales.slice(1);

    const popup = popupContent("property", {
      key: "several",
      location: { lat: 53.1245, lng: -1.263681 },
      features: several,
    });

    expect(popup.querySelector(".feature-popup-count")?.textContent).toBe(
      "3 sales at this point",
    );
    expect(
      [...popup.querySelectorAll("li > strong")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual(["£105,000", "£290,000", "£142,500"]);
    expect(popup.textContent).toContain("Not a new build");
  });
});

describe("popupContent for a Land Opportunity", () => {
  const corner: LandOpportunityFeature = {
    id: "E07000170-9",
    location: { lat: 53.1146, lng: -1.2384 },
    distanceMetres: 137,
    council: { code: "E07000170", name: "Ashfield" },
    name: null,
    landUse: ["landuse=grass", "natural=scrub"],
    areaHectares: 0.2,
    areaAcres: 0.494,
    roadDistanceMetres: null,
    inspireCoverage: 0.1,
    possiblyUnregistered: true,
    inspirePolygons: Array.from({ length: 12 }, (_, index) => ({
      inspireId: String(28_861_445 + index),
      share: index === 0 ? 0.1 : 0.001,
      ownershipCategory: null,
    })),
    ownershipCategory: null,
    matchedTitles: [],
    constraints: [
      { type: "conservation-area", name: "Kirkby Cross" },
      { type: "flood-zone", name: "Flood zone 3" },
    ],
    floodZone: 3,
    onListedBuildingOutline: true,
    estimatedHomes: 3,
    // Found across a whole Land Coverage Area, where land sales and Planning
    // Applications aren't looked for.
    nearbyLandSales: null,
    nearbyPlanningApplications: null,
    shape: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-1.24, 53.11],
            [-1.23, 53.11],
            [-1.23, 53.12],
            [-1.24, 53.11],
          ],
        ],
      ],
    },
  };

  const popup = () =>
    popupContent("land", {
      key: corner.id,
      location: corner.location,
      features: [corner],
    });

  it("gives its area and every tag: Possibly Unregistered, road, flood zone, Planning Constraints, listed building and capacity", () => {
    const shown = popup();

    expect(shown.querySelector("h2")?.textContent).toBe("Land");
    expect(
      [...shown.querySelectorAll(".feature-popup-list > li > span")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual([
      "Grass and scrub",
      "Possibly Unregistered: INSPIRE Index Polygons cover 10% of it",
      "No road within 500 m",
      "Flood zone 3",
      "Planning Constraints: Kirkby Cross (conservation area) and Flood zone 3",
      "On a listed building's outline",
      "Room for about 3 homes, estimated",
      "Planning Applications within 500 m are found for the Land Opportunities in the Search Area, among its own.",
      "Land sales within 1 mile are found for the Land Opportunities in the Search Area, and for the one chosen in the Land panel.",
      "INSPIRE Index Polygons that overlap it",
    ]);
  });

  it("gives its nearby development activity: the Planning Applications within 500 m, the approved and major ones listed", () => {
    const near: LandOpportunityFeature = {
      ...corner,
      nearbyPlanningApplications: {
        status: "ok",
        provider: "PlanIt",
        withinMetres: 500,
        found: {
          count: 3,
          approved: 1,
          major: 1,
          estimatedHomes: 124,
          highlighted: [
            {
              id: "Ashfield/ZZ/2025/0001",
              reference: "ZZ/2025/0001",
              address: "Land at Sutton Parkway",
              description: "Erection of 120 dwellings",
              status: "approved",
              applicationType: "major",
              receivedOn: "2025-05-01",
              estimatedHomes: 120,
              distanceMetres: 0,
            },
          ],
        },
      },
    };
    const shown = popupContent("land", {
      key: near.id,
      location: near.location,
      features: [near],
    });

    expect(shown.textContent).toContain(
      "Nearby development activity: 3 Planning Applications within 500 m in the Search Area, 1 approved and 1 major, for about 124 new homes approved or pending, estimated",
    );
    expect(
      [
        ...shown.querySelectorAll(
          '[aria-label="Approved and major Planning Applications within 500 m, nearest first"] li',
        ),
      ].map(({ textContent }) => textContent),
    ).toEqual([
      "Land at Sutton Parkway: Erection of 120 dwellings (approved, major application, about 120 new homes, estimated), on this land",
    ]);
    expect(shown.textContent).toContain(
      "Nearby development activity counts the Planning Applications received in the Search Area in the last 3 years, so none beyond its edge.",
    );
  });

  it.each([
    [
      "queued",
      "Nearby development activity: loading planning applications (rate-limited)",
    ],
    [
      "unavailable",
      "Nearby development activity unavailable: PlanIt didn't answer.",
    ],
  ] as const)(
    "says when its nearby development activity is %s",
    (status, text) => {
      const shown = popupContent("land", {
        key: corner.id,
        location: corner.location,
        features: [
          {
            ...corner,
            nearbyPlanningApplications: {
              status,
              provider: "PlanIt",
              withinMetres: 500,
              found: null,
            },
          },
        ],
      });

      expect(shown.textContent).toContain(text);
      expect(shown.querySelector("li > strong")?.textContent).toBe(
        "Land Opportunity: 0.494 acres (0.2 ha)",
      );
    },
  );

  it("lists the first 10 INSPIRE Index Polygons that overlap it", () => {
    const items = [
      ...popup().querySelectorAll(".feature-popup-sublist li"),
    ].map(({ textContent }) => textContent);

    expect(items).toHaveLength(11);
    expect(items[0]).toBe("INSPIRE ID 28861445: 10% of it");
    expect(items[1]).toBe("INSPIRE ID 28861446: under 1% of it");
    expect(items[10]).toBe("and 2 more");
  });

  it("gives its indicative Ownership Category, the titles matched in and around it by address, and HM Land Registry's statement for them", () => {
    const council: LandOpportunityFeature = {
      ...corner,
      inspireCoverage: 0.9,
      possiblyUnregistered: false,
      inspirePolygons: [
        {
          inspireId: "28861445",
          share: 0.9,
          ownershipCategory: "council-or-public-body",
        },
      ],
      ownershipCategory: "council-or-public-body",
      matchedTitles: [
        {
          titleNumber: "ZZ100003",
          propertyAddress: "Romo, Sutton-in-Ashfield (NG17 5FS)",
          proprietorshipCategory: "Local Authority",
          ownershipCategory: "council-or-public-body",
          dataset: "ccod",
          sourceDate: "2026-10-02",
          matchedBy: "named",
          inspireId: "28861445",
          distanceMetres: 0,
        },
      ],
    };
    const shown = popupContent("land", {
      key: council.id,
      location: council.location,
      features: [council],
    });

    expect(shown.textContent).toContain(
      "Ownership Category: Council or public-body owned (indicative)",
    );
    expect(
      [
        ...shown.querySelectorAll(
          '[aria-label="Company and council titles matched in and around it by address, indicative"] li',
        ),
      ].map(({ textContent }) => textContent),
    ).toEqual([
      "Romo, Sutton-in-Ashfield (NG17 5FS): title ZZ100003, Local Authority (UK companies data), Council or public-body owned (indicative), on this land",
    ]);
    expect(
      [...shown.querySelectorAll(".feature-popup-sublist li")][0]?.textContent,
    ).toBe(
      "INSPIRE ID 28861445: 90% of it, Council or public-body owned (indicative)",
    );
    expect(shown.querySelector(".feature-popup-item-note")?.textContent).toBe(
      "Information produced by HM Land Registry. © Crown copyright 2026. UK and overseas companies that own property in England and Wales, as at 2 October 2026.",
    );
  });

  it("lists the newest land sales within 1 mile of it, with price and date, marked indicative: may not be land, and credits Price Paid (PRD FR-5.4b)", () => {
    const sale: LandSale = {
      id: "E073986C-2D52-2134-E053-6C04A8C0233B",
      price: 110000,
      date: "2022-02-11",
      address: "PLOT D, SIDINGS ROAD, NOTTINGHAM",
      postcode: "NG17 7JZ",
      location: { lat: 53.1124, lng: -1.2525 },
      distanceMetres: 512,
    };
    const near: LandOpportunityFeature = {
      ...corner,
      nearbyLandSales: {
        status: "ok",
        period: { from: "2021-10-09", to: "2026-10-08" },
        found: {
          count: 12,
          medianPrice: 207000,
          sales: [
            { ...sale, id: "1", price: 380000, date: "2026-05-28" },
            { ...sale, distanceMetres: 0 },
          ],
        },
      },
    };

    const shown = popupContent("land", {
      key: near.id,
      location: near.location,
      features: [near],
    });

    expect(shown.textContent).toContain(
      "12 land sales within 1 mile since 9 October 2021, indicative: may not be land. Median £207,000.",
    );
    expect(
      [
        ...shown.querySelectorAll(
          '[aria-label="Land sales within 1 mile since 9 October 2021, newest first, indicative: may not be land"] li',
        ),
      ].map(({ textContent }) => textContent),
    ).toEqual([
      "£380,000 on 28 May 2026: PLOT D, SIDINGS ROAD, NOTTINGHAM, NG17 7JZ, 510 m away",
      "£110,000 on 11 February 2022: PLOT D, SIDINGS ROAD, NOTTINGHAM, NG17 7JZ, on this land",
      "and 10 more, older",
    ]);
    expect(
      [...shown.querySelectorAll(".feature-popup-item-note")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual([
      LAND_SALES_NOTE,
      "Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0. Price Paid Data contains address data processed against Ordnance Survey’s AddressBase Premium product, which incorporates Royal Mail’s PAF® database (Address Data). Royal Mail and Ordnance Survey permit its use for personal and/or non-commercial use, and to display for the purpose of providing residential property price information services.",
    ]);
  });

  it.each([
    [
      "none",
      { status: "ok", found: { count: 0, medianPrice: null, sales: [] } },
      "No land sales within 1 mile since 9 October 2021.",
    ],
    [
      "unavailable",
      { status: "unavailable", found: null },
      "Land sales within 1 mile unavailable: HM Land Registry's Price Paid didn't answer.",
    ],
    [
      "not prepared",
      { status: "not-prepared", found: null },
      "Land sales within 1 mile not prepared. Run pnpm data:prepare again to prepare the postcodes they are found in.",
    ],
  ] as const)(
    "says when there are %s land sales, listing none",
    (_what, sales, said) => {
      const near: LandOpportunityFeature = {
        ...corner,
        nearbyLandSales: {
          period: { from: "2021-10-09", to: "2026-10-08" },
          ...sales,
          found: sales.found && { ...sales.found, sales: [] },
        },
      };

      const shown = popupContent("land", {
        key: near.id,
        location: near.location,
        features: [near],
      });

      expect(shown.textContent).toContain(said);
      expect(shown.querySelector('[aria-label^="Land sales"]')).toBeNull();
    },
  );

  it("links to HM Land Registry's ownership checks, and says FR-5.7's wording and FR-5.8's note", () => {
    const shown = popup();

    expect(
      [...shown.querySelectorAll<HTMLAnchorElement>("a")].map((link) => [
        link.textContent,
        link.href,
        link.rel,
      ]),
    ).toEqual([
      [
        "Search the register",
        "https://www.gov.uk/search-property-information-land-registry",
        "noopener noreferrer",
      ],
      [
        "Search the index map",
        "https://www.gov.uk/get-information-about-property-and-land/search-the-index-map",
        "noopener noreferrer",
      ],
    ]);
    expect(shown.querySelector(".feature-popup-note")?.textContent).toBe(
      `${LAND_OPPORTUNITY_WORDING} ${INSPIRE_FREEHOLD_NOTE}`,
    );
  });
});
