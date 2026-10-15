import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LAND_FILTERS,
  LAND_OPPORTUNITY_WORDING,
  SERVED_LAYER_IDS,
  type AreaResponse,
  type CategoryScore,
  type CrimeLayerResponse,
  type LandLayerResponse,
  type LandOpportunityFeature,
  type ScoutMode,
} from "@location-scout/shared";

import type { MapLayer } from "../map/SearchAreaMap";
import {
  loadingLayers,
  unavailableLayer,
  type LayerStates,
  type SearchResult,
} from "../useSearchArea";
import type { CustomWeights } from "../weights";
import { Report } from "./Report";

// The map image has its own tests; here it only says what it would draw.
vi.mock("./ReportMap", () => ({
  ReportMap: ({
    layers,
    name,
  }: {
    layers: readonly MapLayer[] | null;
    name: string;
  }) => (
    <p data-testid="report-map">
      {layers
        ? `Map of ${name}: ${layers.map(({ id }) => id).join(", ")}`
        : `Map of ${name}, once every Layer has loaded`}
    </p>
  ),
}));

const ASHFIELD = { code: "E07000170", name: "Ashfield" };

const AREA: AreaResponse = {
  location: { lat: 53.123664, lng: -1.264078 },
  searchRadius: { miles: 0.5, metres: 804.672 },
  geography: {
    postcode: "NG17 1AA",
    ward: "Sutton Central & New Cross",
    lsoa: "Ashfield 005E",
    msoa: "Ashfield 005",
    localAuthority: "Ashfield",
    parliamentaryConstituency: "Ashfield",
  },
  council: { status: "ok", council: ASHFIELD, inLandCoverageArea: true },
  sources: [],
  layers: [],
};

const GENERAL: ScoutMode = {
  id: "general",
  name: "General",
  question: "What is it like here?",
  weights: {
    safety: 50,
    amenities: 0,
    schools: 0,
    transport: 50,
    "green-space": 0,
    "property-activity": 0,
    "development-activity": 0,
    "planning-freedom": 0,
    demand: 0,
    competition: 0,
    footfall: 0,
  },
  competitors: null,
  highlightedLayers: [],
  highlights: [],
};

const CRIME: CrimeLayerResponse = {
  layer: "crime",
  status: "ok",
  sources: [
    {
      id: "police",
      name: "data.police.uk",
      status: "ok",
      period: { from: "2026-08", to: "2026-08" },
    },
  ],
  features: [],
  statistics: null,
};

const FIELD: LandOpportunityFeature = {
  id: "E07000170-2",
  location: { lat: 53.1146, lng: -1.2384 },
  distanceMetres: 137,
  council: ASHFIELD,
  name: null,
  landUse: ["landuse=farmland"],
  areaHectares: 19.522,
  areaAcres: 48.241,
  roadDistanceMetres: 7,
  inspireCoverage: 0.727,
  possiblyUnregistered: false,
  inspirePolygons: [],
  ownershipCategory: null,
  matchedTitles: [],
  constraints: [],
  floodZone: null,
  onListedBuildingOutline: false,
  estimatedHomes: 351,
  shape: {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [-1.239, 53.114],
          [-1.238, 53.114],
          [-1.238, 53.115],
          [-1.239, 53.114],
        ],
      ],
    ],
  },
  nearbyLandSales: null,
  nearbyPlanningApplications: null,
};

const LAND: LandLayerResponse = {
  ...unavailableLayer("land"),
  layer: "land",
  status: "ok",
  scope: "search-area",
  sort: "area",
  filters: DEFAULT_LAND_FILTERS,
  landCoverageAreas: [ASHFIELD],
  notCovered: [],
  features: [FIELD],
  landUse: [],
  statistics: {
    parcels: 1,
    count: 1,
    totalHectares: 19.52,
    possiblyUnregistered: 0,
    ownershipCategories: null,
    estimatedHomes: 351,
    listed: 1,
    nearbyLandSales: null,
  },
};

const unavailable = (): LayerStates => {
  const layers = loadingLayers();
  for (const id of SERVED_LAYER_IDS) {
    layers[id] = unavailableLayer(id);
  }
  return layers;
};

const category = (
  id: CategoryScore["id"],
  layer: CategoryScore["layer"],
  score: number | null,
): CategoryScore =>
  score === null
    ? { id, layer, status: "unavailable", score: null, breakdown: [] }
    : {
        id,
        layer,
        status: "ok",
        score,
        breakdown: [
          {
            input: "Bus stops in the Search Area",
            value: 58,
            unit: null,
            rule: "4 points each, up to 40 points for 10 or more.",
            points: 40,
          },
        ],
      };

/** NG17 1AA, as the search for it found it, with its Layers as given. */
const result = (changes: Partial<SearchResult> = {}): SearchResult => ({
  found: { kind: "postcode", label: "NG17 1AA" },
  area: AREA,
  layers: { ...unavailable(), crime: CRIME, land: LAND },
  scores: {
    status: "ok",
    scores: {
      mode: "general",
      categories: [
        category("safety", "crime", null),
        category("transport", "transport", 88),
      ],
      location: {
        score: 88,
        counted: [
          {
            id: "transport",
            score: 88,
            weight: 50,
            share: 100,
            points: 88,
          },
        ],
        leftOut: [
          { id: "safety", layer: "crime", status: "unavailable", weight: 50 },
        ],
      },
    },
  },
  highlights: {
    status: "ok",
    highlights: {
      mode: "general",
      highlights: [
        {
          rule: "good-bus-service",
          level: "good",
          text: "58 bus stops in the Search Area",
          layer: "transport",
        },
        {
          rule: "crime-rate-high",
          level: "concern",
          text: "High crime: 224 crimes a year per 1,000 residents",
          layer: "crime",
        },
      ],
      leftOut: [{ layer: "schools", status: "unavailable" }],
    },
  },
  ...changes,
});

const MAP_LAYERS: MapLayer[] = [{ id: "crime", features: [] }];

const show = ({
  shown = result(),
  busy = false,
  weights = null,
  onClose = vi.fn(),
}: {
  shown?: SearchResult | null;
  busy?: boolean;
  weights?: CustomWeights | null;
  onClose?: () => void;
} = {}) =>
  render(
    <Report
      result={shown}
      busy={busy}
      coverage={{ status: "unavailable" }}
      scoutMode={GENERAL}
      weights={weights}
      mapLayers={MAP_LAYERS}
      onClose={onClose}
    />,
  );

const section = (name: string) => screen.getByRole("region", { name });

describe("Report", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.title = "";
  });

  it("is titled for its Search Area, which a saved PDF is named after, and says what it is of", () => {
    show();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Location Scout report: 0.5 mile around NG17 1AA",
      }),
    ).toBeTruthy();
    expect(document.title).toBe(
      "Location Scout report: 0.5 mile around NG17 1AA",
    );
    const facts = screen.getByRole("article");
    expect(within(facts).getByText("53.12366, -1.26408")).toBeTruthy();
    expect(
      within(facts).getByText(
        "General: What is it like here? Weighed with its default weights.",
      ),
    ).toBeTruthy();
  });

  it("draws the map's Layers once every Layer has loaded", () => {
    show({
      shown: result({
        layers: { ...unavailable(), crime: { status: "loading" } },
      }),
    });
    expect(screen.getByTestId("report-map").textContent).toBe(
      "Map of 0.5 mile around NG17 1AA, once every Layer has loaded",
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Still loading the Crime Layer. Anything not loaded when you print is left out.",
    );
    cleanup();

    show();
    expect(screen.getByTestId("report-map").textContent).toBe(
      "Map of 0.5 mile around NG17 1AA: crime",
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Everything has loaded. To keep a PDF, choose Save as PDF as the printer.",
    );
  });

  it("gives each Highlight's level in words, with its Layer, and what they leave out", () => {
    show();

    const highlights = within(section("What you need to know")).getAllByRole(
      "listitem",
    );
    expect(highlights.map(({ textContent }) => textContent)).toEqual([
      "Good: 58 bus stops in the Search Area Transport",
      "Concern: High crime: 224 crimes a year per 1,000 residents Crime",
    ]);
    expect(
      within(section("What you need to know")).getByText(/Left out:/)
        .parentElement?.textContent,
    ).toBe("Left out: anything from the Schools Layer, which is unavailable.");
    // Text, not buttons: a printed page can't be clicked.
    expect(
      within(section("What you need to know")).queryByRole("button"),
    ).toBeNull();
  });

  it("gives the Location Overview's geography and each Layer's statistics, without the Land panel's button", () => {
    show();

    const overview = section("Location Overview");
    expect(
      within(overview).getByText("Sutton Central & New Cross"),
    ).toBeTruthy();
    for (const name of ["Crime", "Planning", "Land", "Demographics"]) {
      expect(within(overview).getByRole("region", { name })).toBeTruthy();
    }
    expect(within(overview).queryByRole("button")).toBeNull();
  });

  it("gives every score with its breakdown in full, and what the Location Score leaves out", () => {
    show();

    const scores = section("Scores beta");
    expect(
      within(scores).getByRole("table", {
        name: "How the Location Score is weighed, with the General Scout Mode's weights",
      }),
    ).toBeTruthy();
    expect(
      within(scores).getByRole("table", {
        name: "How the Transport score is reached",
      }),
    ).toBeTruthy();
    expect(
      within(scores).getByText(/Left out:/).parentElement?.textContent,
    ).toMatch(/^Left out: Safety \(the Crime Layer is unavailable\)\./);
    // Nothing to expand: a printed page shows it all.
    expect(scores.querySelector("details")).toBeNull();
  });

  it("weighs the Location Score by the user's own weights, as the Overview does", () => {
    show({ weights: { ...GENERAL.weights, safety: 0, transport: 100 } });

    expect(
      within(section("Scores beta")).getByRole("table", {
        name: "How the Location Score is weighed, with your own weights for the General Scout Mode",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "General: What is it like here? Weighed with your own weights.",
      ),
    ).toBeTruthy();
  });

  it("lists each Land Opportunity with its tags under FR-5.7's wording, and where to check who owns it", () => {
    show();

    const land = section("Land Opportunities");
    expect(within(land).getByText(LAND_OPPORTUNITY_WORDING)).toBeTruthy();
    expect(
      within(land).getByRole("heading", {
        name: "Land Opportunity: 48.2 acres (19.5 ha), 140 m from the Location",
      }),
    ).toBeTruthy();
    expect(
      within(land).getByRole("list", { name: "Its tags" }).textContent,
    ).toContain("Room for about 351 homes, estimated");
    expect(
      within(land).getByRole("link", { name: "Search the index map" }),
    ).toBeTruthy();
  });

  it("has no Land Opportunities section where there are none", () => {
    show({
      shown: result({
        layers: { ...unavailable(), land: { ...LAND, features: [] } },
      }),
    });

    expect(
      screen.queryByRole("region", { name: "Land Opportunities" }),
    ).toBeNull();
  });

  it("credits every Layer, or says why nothing of it is in the report", () => {
    show();

    const credits = section("Attributions");
    expect(
      within(credits)
        .getAllByRole("term")
        .map(({ textContent }) => textContent),
    ).toEqual([
      "Map",
      "Location",
      "Crime",
      "Planning",
      "Amenities",
      "Schools",
      "Transport",
      "Green space",
      "Property",
      "Land",
      "Demographics",
    ]);
    const definitions = within(credits)
      .getAllByRole("definition")
      .map(({ textContent }) => textContent);
    expect(definitions[2]).toBe(
      "Crime data from police.uk, licensed under the Open Government Licence v3.0.",
    );
    expect(definitions[3]).toBe(
      "Unavailable, so nothing of it is in this report.",
    );
    expect(definitions[9]).toMatch(
      /^Map data © OpenStreetMap contributors, ODbL, from Geofabrik's extracts/,
    );
  });

  it("prints with the browser's print dialog, and goes back to the map", async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const onClose = vi.fn();
    show({ onClose });

    await user.click(
      screen.getByRole("button", { name: "Print or save as PDF" }),
    );
    expect(print).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Back to the map" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("says when its Search Area is still loading, or there is none", () => {
    show({ shown: null, busy: true });
    expect(screen.getByText("Loading the Search Area…")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Print or save as PDF",
      }).disabled,
    ).toBe(true);
    cleanup();

    show({ shown: null });
    expect(
      screen.getByText(
        "There is no Search Area to report on. Go back to the map and choose a Location first.",
      ),
    ).toBeTruthy();
  });
});
