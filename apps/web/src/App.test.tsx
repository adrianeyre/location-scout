import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AMENITY_TYPES,
  DEFAULT_LAND_FILTERS,
  INSPIRE_FREEHOLD_NOTE,
  LAND_OPPORTUNITY_WORDING,
  LAND_SALES_NOTE,
  OWNERSHIP_CATEGORY_NOTE,
  OFSTED_JUDGEMENTS,
  PLANNING_CONSTRAINT_TYPES,
  SCHOOL_PHASES,
  SEARCH_RADII_MILES,
  locationScore,
  milesToMetres,
  type AmenitiesLayerResponse,
  type AreaResponse,
  type CategoryScore,
  type ConstraintShape,
  type CrimeLayerResponse,
  type Location,
  type PlanningApplicationFeature,
  type PlanningApplications,
  type PlanningLayerResponse,
  type GreenSpaceLayerResponse,
  type HighlightsResponse,
  type LandLayerResponse,
  type LandOpportunityFeature,
  type LandParcelResponse,
  type LandSale,
  type ModesResponse,
  type NearbyLandSales,
  type NearbyPlanningApplications,
  type DemographicsLayerResponse,
  type NearestPark,
  type OfstedInspection,
  type OutputAreaFeature,
  type PropertyLayerResponse,
  type PropertyStatistics,
  type EpcStatistics,
  type SchoolsLayerResponse,
  type ScoresResponse,
  type ScoutMode,
  type TransportLayerResponse,
} from "@location-scout/shared";

import { App } from "./App";
import type { MapLayer } from "./map/SearchAreaMap";
import { PLANNING_APPLICATIONS_RETRY_MS } from "./useSearchArea";

/** How the stand-in map below lets a test click it, and a Feature's Street View button. */
const mapClicks = vi.hoisted(() => ({
  pick: undefined as ((location: Location) => void) | undefined,
  streetView: undefined as
    ((target: { location: Location; name: string }) => void) | null | undefined,
}));

/**
 * Google's script, which the Street View panel loads, stood in for: jsdom
 * loads no scripts, and no test reaches Google.
 */
const googleMaps = vi.hoisted(() => ({
  loadStreetView: vi.fn<(apiKey: string) => Promise<unknown>>(),
}));

vi.mock("./street-view/google-maps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./street-view/google-maps")>()),
  loadStreetView: googleMaps.loadStreetView,
}));

// MapLibre needs WebGL, which jsdom lacks. The map has its own tests; here it
// only reports the Search Area and Layers it was given, and passes on clicks.
vi.mock("./map/SearchAreaMap", () => ({
  SearchAreaMap: ({
    area,
    layers = [],
    onPick,
    onStreetView,
  }: {
    area: AreaResponse | null;
    layers?: readonly MapLayer[];
    onPick?: (location: Location) => void;
    onStreetView?: (target: { location: Location; name: string }) => void;
  }) => {
    mapClicks.pick = onPick;
    mapClicks.streetView = onStreetView;
    return (
      <>
        <div data-testid="search-area-map">
          {area &&
            `${String(area.location.lat)},${String(area.location.lng)} ${String(area.searchRadius.miles)} mile`}
        </div>
        <div data-testid="map-layers">
          {layers
            .map(
              ({ id, features, highlighted, apart, shading }) =>
                `${id}: ${String(features.length)}${highlighted ? ` and ${String(highlighted.features.length)} ${highlighted.noun[1]}` : ""}${apart?.length ? ` and ${String(apart.length)} apart` : ""}${shading ? ` shaded ${features.map((feature) => shading.colour(feature)).join(" ")}` : ""}`,
            )
            .join(", ")}
        </div>
      </>
    );
  },
}));

// The report's map image needs WebGL too, and has its own tests.
vi.mock("./report/ReportMap", () => ({
  ReportMap: ({ name }: { name: string }) => (
    <p data-testid="report-map">{name}</p>
  ),
}));

/** Clicks the map at a point, as MapLibre would report it. */
const clickMap = (location: Location) => {
  act(() => {
    if (!mapClicks.pick) throw new Error("the map is not clickable");
    mapClicks.pick(location);
  });
};

const NG17_1AA = { lat: 53.123664, lng: -1.264078 };

/**
 * NG17 1AA's local geography, as the backend names it from the recorded
 * postcodes.io lookup `postcodes-io-ng17-1aa.json`.
 */
const NG17_GEOGRAPHY = {
  postcode: "NG17 1AA",
  ward: "Sutton Central & New Cross",
  lsoa: "Ashfield 005E",
  msoa: "Ashfield 005",
  localAuthority: "Ashfield",
  parliamentaryConstituency: "Ashfield",
};

/**
 * The backend's local geography for NG17 1AA's point without the postcode: the
 * nearest postcode there is NG17 0AZ (`postcodes-io-nearest-ng17-1aa.json`).
 */
const NG17_NEAREST_GEOGRAPHY = { ...NG17_GEOGRAPHY, postcode: "NG17 0AZ" };

/**
 * The backend's local geography anywhere else: NG18 1JJ's, the nearest postcode
 * to a point in Mansfield (`postcodes-io-nearest-mansfield.json`).
 */
const MANSFIELD_GEOGRAPHY = {
  postcode: "NG18 1JJ",
  ward: "Central",
  lsoa: "Mansfield 008D",
  msoa: "Mansfield 008",
  localAuthority: "Mansfield",
  parliamentaryConstituency: "Mansfield",
};

/** The council, as the backend reports it before `pnpm data:prepare` has run. */
const COUNCIL_NOT_PREPARED = {
  status: "not-prepared",
  council: null,
  inLandCoverageArea: false,
};

const ng17Geocode = {
  query: "NG17 1AA",
  candidates: [{ kind: "postcode", label: "NG17 1AA", location: NG17_1AA }],
};

/** The High Streets Nominatim offers for "12 High Street, Sutton-in-Ashfield". */
const HIGH_STREETS = [
  {
    kind: "address",
    label: "High Street, Huthwaite, Ashfield, Nottinghamshire, NG17 2PG",
    location: { lat: 53.1287698, lng: -1.293384 },
  },
  {
    kind: "address",
    label:
      "High Street, Sutton-in-Ashfield, Ashfield, Nottinghamshire, NG17 1DH",
    location: { lat: 53.1241078, lng: -1.2621582 },
  },
  {
    kind: "address",
    label: "High Street, Stanton Hill, Ashfield, Nottinghamshire, NG17 3FY",
    location: { lat: 53.1408244, lng: -1.2773692 },
  },
];

const SCOUT_MODE_WEIGHTS = {
  safety: 25,
  amenities: 15,
  // These tests' Search Areas have no Schools Layer to score.
  schools: 0,
  transport: 15,
  "green-space": 10,
  "property-activity": 10,
  // Nor any Planning Applications.
  "development-activity": 0,
  "planning-freedom": 10,
  demand: 0,
  competition: 0,
  footfall: 0,
};

/** Three of the Scout Modes, as `/api/modes` gives them. */
const MODES: ModesResponse = {
  modes: [
    {
      id: "general",
      name: "General",
      question: "What is it like here?",
      weights: SCOUT_MODE_WEIGHTS,
      competitors: null,
      highlightedLayers: [],
      highlights: ["crime-rate-high", "conservation-area", "park-nearby"],
    },
    {
      id: "investment",
      name: "Investment",
      question: "Should I invest in property here?",
      weights: { ...SCOUT_MODE_WEIGHTS, "property-activity": 25 },
      competitors: null,
      highlightedLayers: ["planning", "property"],
      highlights: ["crime-rate-high", "prices-rising"],
    },
    {
      id: "development",
      name: "Development",
      question: "Could I build here?",
      weights: { ...SCOUT_MODE_WEIGHTS, "planning-freedom": 30 },
      competitors: null,
      highlightedLayers: ["planning", "land"],
      highlights: ["crime-rate-high", "prices-rising"],
    },
  ],
};

/** What `/api/coverage` says before `pnpm data:prepare` has run. */
const NOTHING_PREPARED = {
  status: "not-prepared",
  preparedAt: null,
  datasets: [],
  landCoverageAreas: [],
};

/**
 * Our backend, stubbed: each path answers with the given response.
 * `/api/modes` gives `MODES`, `/api/coverage` says nothing is prepared,
 * `/api/street-view` says Street View is off, `/api/explain` says AI
 * Explanations are off, unless a test says otherwise.
 */
const stubBackend = (routes: Record<string, (url: URL) => Response>) => {
  const withModes: Record<string, (url: URL) => Response> = {
    "/api/modes": () => Response.json(MODES),
    "/api/coverage": () => Response.json(NOTHING_PREPARED),
    "/api/street-view": () => Response.json({ enabled: false }),
    "/api/explain": () => Response.json({ enabled: false }),
    ...routes,
  };
  // The app only ever fetches by URL string.
  const fetchMock = vi.fn((input: string) => {
    const url = new URL(input, "http://localhost");
    const route = withModes[url.pathname];
    return route
      ? Promise.resolve(route(url))
      : Promise.reject(new TypeError("Failed to fetch"));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

/**
 * The requests that load a Search Area: `/api/area`, leaving the Layers'
 * Data Sources to them, then each Layer on its own with the same query (PRD
 * NFR-2.3), then its scores and Highlights in the Scout Mode, General unless
 * another is given.
 */
const withLayers = (areaUrl: string, mode = "general") => [
  `${areaUrl}&sources=false`,
  areaUrl.replace("/api/area?", "/api/area/crime?"),
  areaUrl.replace("/api/area?", "/api/area/planning?"),
  areaUrl.replace("/api/area?", "/api/area/amenities?"),
  areaUrl.replace("/api/area?", "/api/area/schools?"),
  areaUrl.replace("/api/area?", "/api/area/transport?"),
  areaUrl.replace("/api/area?", "/api/area/green-space?"),
  areaUrl.replace("/api/area?", "/api/area/property?"),
  areaUrl.replace("/api/area?", "/api/area/land?"),
  areaUrl.replace("/api/area?", "/api/area/demographics?"),
  `${areaUrl.replace("/api/area?", "/api/scores?")}&mode=${mode}`,
  `${areaUrl.replace("/api/area?", "/api/highlights?")}&mode=${mode}`,
];

const searchFor = async (query: string) => {
  const user = userEvent.setup();
  const input = screen.getByLabelText("Postcode or address");
  await user.clear(input);
  await user.type(input, query);
  await user.click(screen.getByRole("button", { name: "Search" }));
};

/**
 * Serves the Search Area it is asked for, with the local geography of the
 * postcode searched for or, failing that, the postcode nearest the Location,
 * and the council it is in, which is not prepared unless a test says.
 */
const areaRoute = (url: URL, council: unknown = COUNCIL_NOT_PREPARED) => {
  const miles = Number(url.searchParams.get("radius"));
  const location = {
    lat: Number(url.searchParams.get("lat")),
    lng: Number(url.searchParams.get("lng")),
  };
  const atNg17 = location.lat === NG17_1AA.lat && location.lng === NG17_1AA.lng;
  const geography =
    url.searchParams.get("postcode") === "NG17 1AA"
      ? NG17_GEOGRAPHY
      : atNg17
        ? NG17_NEAREST_GEOGRAPHY
        : MANSFIELD_GEOGRAPHY;
  return Response.json({
    location,
    searchRadius: { miles, metres: milesToMetres(miles) },
    geography,
    council,
    sources: [],
    layers: [],
  });
};

/** A backend that finds NG17 1AA and serves the Search Area it is asked for. */
const stubNg17Backend = () =>
  stubBackend({
    "/api/geocode": () => Response.json(ng17Geocode),
    "/api/area": areaRoute,
  });

/** A backend whose address search finds `candidates`. */
const stubAddressBackend = (candidates: unknown[]) =>
  stubBackend({
    "/api/geocode": (url) =>
      Response.json({ query: url.searchParams.get("q"), candidates }),
    "/api/area": areaRoute,
  });

const chooseRadius = async (miles: number) => {
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByLabelText("Search Radius"),
    `${String(miles)} mile`,
  );
};

const mapText = () => screen.getByTestId("search-area-map").textContent;

/** Opens the page at a URL, as a reload or a shared link would. */
const openAt = (path: string, state: unknown = null) => {
  window.history.replaceState(state, "", path);
  return render(<App />);
};

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("lays out the search bar, the map and an empty Location Overview", () => {
    stubBackend({});

    render(<App />);

    expect(screen.getByRole("search")).toBeTruthy();
    expect(screen.getByTestId("search-area-map").textContent).toBe("");
    const overview = screen.getByRole("complementary", {
      name: "Location Overview",
    });
    expect(overview.textContent).toMatch(/Enter a postcode/);
  });

  it("resolves a postcode, then shows its Location and 0.5 mile Search Area", async () => {
    const fetchMock = stubBackend({
      "/api/geocode": () => Response.json(ng17Geocode),
      "/api/area": () =>
        Response.json({
          location: NG17_1AA,
          searchRadius: { miles: 0.5, metres: 804.672 },
          geography: NG17_GEOGRAPHY,
          council: COUNCIL_NOT_PREPARED,
          sources: [],
          layers: [],
        }),
    });
    render(<App />);

    await searchFor("NG17 1AA");

    const overview = screen.getByRole("complementary", {
      name: "Location Overview",
    });
    expect(await within(overview).findByText("NG17 1AA")).toBeTruthy();
    expect(within(overview).getByText("53.12366, -1.26408")).toBeTruthy();
    expect(within(overview).getByText("0.5 mile")).toBeTruthy();
    expect(screen.getByTestId("search-area-map").textContent).toBe(
      "53.123664,-1.264078 0.5 mile",
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/modes",
      "/api/coverage",
      "/api/street-view",
      "/api/explain",
      "/api/geocode?q=NG17+1AA",
      ...withLayers(
        "/api/area?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      ),
    ]);
  });

  it("shows the backend's message when a postcode is not found", async () => {
    stubBackend({
      "/api/geocode": () =>
        Response.json(
          { error: "We couldn't find the postcode ZZ1 1ZZ." },
          { status: 404 },
        ),
    });
    render(<App />);

    await searchFor("ZZ1 1ZZ");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "We couldn't find the postcode ZZ1 1ZZ.",
    );
    expect(screen.getByTestId("search-area-map").textContent).toBe("");
  });

  it("says so when the backend is not answering", async () => {
    stubBackend({
      "/api/geocode": () => new Response("Bad gateway", { status: 502 }),
    });
    render(<App />);

    await searchFor("NG17 1AA");

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /backend is not answering/,
    );
  });

  it("offers 0.25, 0.5 and 1 mile, with 0.5 chosen", () => {
    stubBackend({});

    render(<App />);

    const select = screen.getByLabelText<HTMLSelectElement>("Search Radius");
    expect([...select.options].map((option) => option.text)).toEqual([
      "0.25 mile",
      "0.5 mile",
      "1 mile",
    ]);
    expect(select.value).toBe("0.5");
  });

  it.each(SEARCH_RADII_MILES)(
    "reloads the Search Area at %s mile when that radius is chosen",
    async (miles) => {
      const fetchMock = stubNg17Backend();
      render(<App />);
      await searchFor("NG17 1AA");
      await screen.findByText("53.123664,-1.264078 0.5 mile");
      fetchMock.mockClear();

      await chooseRadius(miles);

      await waitFor(() => {
        expect(mapText()).toBe(`53.123664,-1.264078 ${String(miles)} mile`);
      });
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        ...withLayers(
          `/api/area?lat=53.123664&lng=-1.264078&radius=${String(miles)}&postcode=NG17+1AA`,
        ),
      ]);
      expect(window.location.search).toBe(
        `?lat=53.123664&lng=-1.264078&radius=${String(miles)}`,
      );
    },
  );

  it("keeps the Location and radius in the URL as the user searches", async () => {
    stubNg17Backend();
    render(<App />);
    expect(window.location.search).toBe("");

    await chooseRadius(1);
    expect(window.location.search).toBe("?radius=1");

    await searchFor("NG17 1AA");
    await screen.findByText("53.123664,-1.264078 1 mile");
    expect(window.location.search).toBe(
      "?lat=53.123664&lng=-1.264078&radius=1",
    );
  });

  it("restores the Location, radius and postcode when the page is reloaded", async () => {
    stubNg17Backend();
    const { unmount } = render(<App />);
    await searchFor("NG17 1AA");
    await chooseRadius(0.25);
    await screen.findByText("53.123664,-1.264078 0.25 mile");
    unmount();

    const fetchMock = stubNg17Backend();
    render(<App />);

    expect(
      await screen.findByText("53.123664,-1.264078 0.25 mile"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLSelectElement>("Search Radius").value,
    ).toBe("0.25");
    const overview = screen.getByRole("complementary", {
      name: "Location Overview",
    });
    expect(within(overview).getByText("NG17 1AA")).toBeTruthy();
    expect(within(overview).getByText("0.25 mile")).toBeTruthy();
    // The page loads the Search Area first, then the Scout Modes.
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      ...withLayers(
        "/api/area?lat=53.123664&lng=-1.264078&radius=0.25&postcode=NG17+1AA",
      ),
      "/api/modes",
      "/api/coverage",
      "/api/street-view",
      "/api/explain",
    ]);
  });

  it("opens a shared URL at its Location and radius", async () => {
    stubNg17Backend();

    openAt("/?lat=53.123664&lng=-1.264078&radius=1");

    expect(await screen.findByText("53.123664,-1.264078 1 mile")).toBeTruthy();
    const overview = screen.getByRole("complementary", {
      name: "Location Overview",
    });
    expect(within(overview).getByText("53.12366, -1.26408")).toBeTruthy();
    expect(within(overview).getByText("1 mile")).toBeTruthy();
    // The URL says where, not which postcode found it.
    expect(within(overview).queryByText("Postcode")).toBeNull();
  });

  it("falls back to 0.5 mile for an invalid radius in the URL, and corrects the URL", async () => {
    const fetchMock = stubNg17Backend();

    openAt("/?lat=53.123664&lng=-1.264078&radius=2");

    expect(
      await screen.findByText("53.123664,-1.264078 0.5 mile"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLSelectElement>("Search Radius").value,
    ).toBe("0.5");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      ...withLayers("/api/area?lat=53.123664&lng=-1.264078&radius=0.5"),
      "/api/modes",
      "/api/coverage",
      "/api/street-view",
      "/api/explain",
    ]);
    expect(window.location.search).toBe(
      "?lat=53.123664&lng=-1.264078&radius=0.5",
    );
  });

  it("loads no Search Area for a URL without a valid Location", () => {
    const fetchMock = stubNg17Backend();

    openAt("/?lat=north&lng=-1.264078&radius=1");

    // Only the Scout Modes, which the selector needs whatever the Location,
    // what is prepared, and whether Street View is on.
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/modes",
      "/api/coverage",
      "/api/street-view",
      "/api/explain",
    ]);
    expect(mapText()).toBe("");
    expect(
      screen.getByLabelText<HTMLSelectElement>("Search Radius").value,
    ).toBe("1");
  });

  it("returns to the previous Search Area when the user goes back", async () => {
    stubNg17Backend();
    render(<App />);
    await searchFor("NG17 1AA");
    await screen.findByText("53.123664,-1.264078 0.5 mile");
    await chooseRadius(1);
    await screen.findByText("53.123664,-1.264078 1 mile");

    act(() => {
      window.history.back();
    });

    expect(
      await screen.findByText("53.123664,-1.264078 0.5 mile"),
    ).toBeTruthy();
    expect(window.location.search).toBe(
      "?lat=53.123664&lng=-1.264078&radius=0.5",
    );
    expect(
      screen.getByLabelText<HTMLSelectElement>("Search Radius").value,
    ).toBe("0.5");
  });
  describe("searching for an address", () => {
    const candidateList = () =>
      screen.getByRole("region", { name: "Choose an address" });

    it("offers the matching addresses, and moves the map to the one chosen", async () => {
      const fetchMock = stubAddressBackend(HIGH_STREETS);
      render(<App />);

      await searchFor("12 High Street, Sutton-in-Ashfield");

      const list = await screen.findByRole("region", {
        name: "Choose an address",
      });
      expect(
        within(list)
          .getAllByRole("button")
          .map((button) => button.textContent),
      ).toEqual(HIGH_STREETS.map(({ label }) => label));
      // Nothing is loaded until the user picks one.
      expect(mapText()).toBe("");
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "/api/modes",
        "/api/coverage",
        "/api/street-view",
        "/api/explain",
        "/api/geocode?q=12+High+Street%2C+Sutton-in-Ashfield",
      ]);

      await userEvent
        .setup()
        .click(
          within(list).getByRole("button", { name: /Sutton-in-Ashfield/ }),
        );

      expect(
        await screen.findByText("53.1241078,-1.2621582 0.5 mile"),
      ).toBeTruthy();
      expect(
        screen.queryByRole("region", { name: "Choose an address" }),
      ).toBeNull();
      const overview = screen.getByRole("complementary", {
        name: "Location Overview",
      });
      expect(within(overview).getByText("Address")).toBeTruthy();
      expect(
        within(overview).getByText(HIGH_STREETS[1]?.label ?? ""),
      ).toBeTruthy();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "/api/modes",
        "/api/coverage",
        "/api/street-view",
        "/api/explain",
        "/api/geocode?q=12+High+Street%2C+Sutton-in-Ashfield",
        ...withLayers("/api/area?lat=53.1241078&lng=-1.2621582&radius=0.5"),
      ]);
      expect(window.location.search).toBe(
        "?lat=53.124108&lng=-1.262158&radius=0.5",
      );
    });

    it("moves the map again when another address is chosen", async () => {
      stubAddressBackend(HIGH_STREETS);
      render(<App />);
      await searchFor("12 High Street, Sutton-in-Ashfield");
      const user = userEvent.setup();
      await user.click(
        within(await screen.findByRole("region")).getByRole("button", {
          name: /Huthwaite/,
        }),
      );
      await screen.findByText("53.1287698,-1.293384 0.5 mile");

      await searchFor("12 High Street, Sutton-in-Ashfield");
      await user.click(
        within(candidateList()).getByRole("button", { name: /Stanton Hill/ }),
      );

      expect(
        await screen.findByText("53.1408244,-1.2773692 0.5 mile"),
      ).toBeTruthy();
    });

    it("keeps the radius chosen while the list was showing", async () => {
      stubAddressBackend(HIGH_STREETS);
      render(<App />);
      await searchFor("12 High Street, Sutton-in-Ashfield");
      await screen.findByRole("region", { name: "Choose an address" });

      await chooseRadius(1);
      await userEvent
        .setup()
        .click(
          within(candidateList()).getByRole("button", { name: /Huthwaite/ }),
        );

      expect(
        await screen.findByText("53.1287698,-1.293384 1 mile"),
      ).toBeTruthy();
    });

    it("goes straight to the only address found", async () => {
      const fetchMock = stubAddressBackend(HIGH_STREETS.slice(1, 2));
      render(<App />);

      await searchFor("High Street, NG17 1DH");

      expect(
        await screen.findByText("53.1241078,-1.2621582 0.5 mile"),
      ).toBeTruthy();
      expect(
        screen.queryByRole("region", { name: "Choose an address" }),
      ).toBeNull();
      // The Scout Modes, what is prepared, whether Street View and AI
      // Explanations are on, the address search, then the Search Area and
      // each Layer.
      expect(fetchMock).toHaveBeenCalledTimes(5 + withLayers("").length);
    });

    it("clears the list when a new search starts", async () => {
      stubAddressBackend(HIGH_STREETS);
      render(<App />);
      await searchFor("12 High Street, Sutton-in-Ashfield");
      await screen.findByRole("region", { name: "Choose an address" });

      stubNg17Backend();
      await searchFor("NG17 1AA");

      expect(
        await screen.findByText("53.123664,-1.264078 0.5 mile"),
      ).toBeTruthy();
      expect(
        screen.queryByRole("region", { name: "Choose an address" }),
      ).toBeNull();
    });

    it("still names the address chosen when the page is reloaded", async () => {
      stubAddressBackend(HIGH_STREETS);
      const { unmount } = render(<App />);
      await searchFor("12 High Street, Sutton-in-Ashfield");
      await userEvent
        .setup()
        .click(
          within(
            await screen.findByRole("region", { name: "Choose an address" }),
          ).getByRole("button", { name: /Stanton Hill/ }),
        );
      await screen.findByText("53.1408244,-1.2773692 0.5 mile");
      unmount();

      stubAddressBackend(HIGH_STREETS);
      render(<App />);

      const overview = screen.getByRole("complementary", {
        name: "Location Overview",
      });
      expect(
        await within(overview).findByText(HIGH_STREETS[2]?.label ?? ""),
      ).toBeTruthy();
      expect(within(overview).getByText("Address")).toBeTruthy();
    });

    it("shows the backend's message when no address is found", async () => {
      stubBackend({
        "/api/geocode": () =>
          Response.json(
            {
              error:
                'We couldn\'t find an address matching "Nowhere Lane". Try adding the town or the postcode.',
            },
            { status: 404 },
          ),
      });
      render(<App />);

      await searchFor("Nowhere Lane");

      expect((await screen.findByRole("alert")).textContent).toMatch(
        /couldn't find an address matching "Nowhere Lane"/,
      );
      expect(
        screen.queryByRole("region", { name: "Choose an address" }),
      ).toBeNull();
    });
  });

  describe("clicking the map", () => {
    const overview = () =>
      screen.getByRole("complementary", { name: "Location Overview" });

    /** What our backend says of a Location outside England (PRD FR-1.5). */
    const outsideEngland = (country: string) => () =>
      Response.json(
        {
          error: `Location Scout currently covers England only. That Location is in ${country}.`,
        },
        { status: 422 },
      );

    it("loads a Location clicked in Nottinghamshire", async () => {
      const fetchMock = stubNg17Backend();
      render(<App />);

      clickMap({ lat: 53.1435, lng: -1.1985 });

      expect(await screen.findByText("53.1435,-1.1985 0.5 mile")).toBeTruthy();
      expect(within(overview()).getByText("53.14350, -1.19850")).toBeTruthy();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "/api/modes",
        "/api/coverage",
        "/api/street-view",
        "/api/explain",
        ...withLayers("/api/area?lat=53.1435&lng=-1.1985&radius=0.5"),
      ]);
      expect(window.location.search).toBe(
        "?lat=53.1435&lng=-1.1985&radius=0.5",
      );
    });

    it("replaces a searched postcode, which no longer names the Location", async () => {
      stubNg17Backend();
      render(<App />);
      await searchFor("NG17 1AA");
      await screen.findByText("53.123664,-1.264078 0.5 mile");
      await chooseRadius(1);
      await screen.findByText("53.123664,-1.264078 1 mile");

      clickMap({ lat: 53.1435, lng: -1.1985 });

      expect(await screen.findByText("53.1435,-1.1985 1 mile")).toBeTruthy();
      expect(within(overview()).queryByText("Postcode")).toBeNull();
      expect(within(overview()).queryByText("NG17 1AA")).toBeNull();
    });

    it("keeps the Location to the URL's precision", async () => {
      const fetchMock = stubNg17Backend();
      render(<App />);

      clickMap({ lat: 53.143512345678, lng: -1.198587654321 });

      expect(
        await screen.findByText("53.143512,-1.198588 0.5 mile"),
      ).toBeTruthy();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "/api/modes",
        "/api/coverage",
        "/api/street-view",
        "/api/explain",
        ...withLayers("/api/area?lat=53.143512&lng=-1.198588&radius=0.5"),
      ]);
    });

    it("clears the list of addresses still waiting for a choice", async () => {
      stubAddressBackend(HIGH_STREETS);
      render(<App />);
      await searchFor("12 High Street, Sutton-in-Ashfield");
      await screen.findByRole("region", { name: "Choose an address" });

      clickMap({ lat: 53.1435, lng: -1.1985 });

      expect(await screen.findByText("53.1435,-1.1985 0.5 mile")).toBeTruthy();
      expect(
        screen.queryByRole("region", { name: "Choose an address" }),
      ).toBeNull();
    });

    it.each([
      ["Wales", { lat: 52.4153, lng: -4.0829 }],
      ["Scotland", { lat: 55.9533, lng: -3.1883 }],
    ])(
      "shows the England-only message for a click in %s, and loads no Search Area",
      async (country, location) => {
        stubBackend({
          "/api/geocode": () => Response.json(ng17Geocode),
          "/api/area": (url) =>
            url.searchParams.get("lat") === String(NG17_1AA.lat)
              ? areaRoute(url)
              : outsideEngland(country)(),
        });
        render(<App />);
        await searchFor("NG17 1AA");
        await screen.findByText("53.123664,-1.264078 0.5 mile");

        clickMap(location);

        expect((await screen.findByRole("alert")).textContent).toBe(
          `Location Scout currently covers England only. That Location is in ${country}.`,
        );
        // The Search Area before it is gone, so nothing suggests it was loaded.
        expect(mapText()).toBe("");
        expect(within(overview()).queryByText("NG17 1AA")).toBeNull();
        expect(overview().textContent).toMatch(/Enter a postcode/);
      },
    );

    it("shows the England-only message for a postcode in Scotland", async () => {
      stubBackend({
        "/api/geocode": () =>
          Response.json({
            query: "EH1 1YZ",
            candidates: [
              {
                kind: "postcode",
                label: "EH1 1YZ",
                location: { lat: 55.950328, lng: -3.193018 },
              },
            ],
          }),
        "/api/area": outsideEngland("Scotland"),
      });
      render(<App />);

      await searchFor("EH1 1YZ");

      expect((await screen.findByRole("alert")).textContent).toBe(
        "Location Scout currently covers England only. That Location is in Scotland.",
      );
      expect(mapText()).toBe("");
    });

    it("explains a click in the sea instead of failing", async () => {
      stubBackend({
        "/api/area": () =>
          Response.json(
            {
              error:
                "There is no postcode within 2 km of that Location, so it may be at sea or outside the UK. Location Scout currently covers England only. Choose a Location on land in England.",
            },
            { status: 404 },
          ),
      });
      render(<App />);

      clickMap({ lat: 53.5, lng: 1.5 });

      expect((await screen.findByRole("alert")).textContent).toMatch(
        /no postcode within 2 km of that Location, so it may be at sea/,
      );
      expect(mapText()).toBe("");
      expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    });

    it("loads a Location in England again after one outside it", async () => {
      stubBackend({
        "/api/area": (url) =>
          url.searchParams.get("lat") === "55.9533"
            ? outsideEngland("Scotland")()
            : areaRoute(url),
      });
      render(<App />);
      clickMap({ lat: 55.9533, lng: -3.1883 });
      await screen.findByRole("alert");

      clickMap({ lat: 53.1435, lng: -1.1985 });

      expect(await screen.findByText("53.1435,-1.1985 0.5 mile")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("Land Coverage Area", () => {
    const ASHFIELD = { code: "E07000170", name: "Ashfield" };
    const boundaries = {
      id: "council-boundaries",
      name: "Council boundaries",
      source: "ONS Open Geography",
      sourceUrl:
        "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_May_2026_Boundaries_UK_BGC/FeatureServer/0",
      sourceDate: "2026-05",
      preparedAt: "2026-10-08T12:00:00.000Z",
      attribution: null,
    };
    const dataset = (
      id: string,
      name: string,
      source: string,
      sourceDate: string,
    ) => ({
      ...boundaries,
      id,
      name,
      source,
      sourceUrl: `https://example.org/${id}`,
      sourceDate,
    });
    const inspire = {
      ...dataset(
        "inspire-index-polygons",
        "INSPIRE Index Polygons",
        "HM Land Registry",
        "2026-10-04",
      ),
      attribution: {
        statements: [
          "This information is subject to Crown copyright and database rights 2026 and is reproduced with the permission of HM Land Registry.",
          "The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey AC0000851063.",
        ],
        conditionsUrl:
          "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
      },
    };
    /** Ashfield's land data, as `pnpm data:prepare` lists it. */
    const ASHFIELD_DATASETS = [
      { ...boundaries, id: "council-boundary", name: "Council boundary" },
      inspire,
      ...[
        ["osm-land-use", "Land use"],
        ["osm-buildings", "Buildings"],
        ["osm-roads", "Roads"],
        ["osm-water", "Water"],
      ].map(([id = "", name = ""]) =>
        dataset(id, name, "OpenStreetMap via Geofabrik", "2026-10-08"),
      ),
      ...[
        ["conservation-area", "Conservation areas"],
        ["flood-risk-zone", "Flood risk zones"],
      ].map(([id = "", name = ""]) =>
        dataset(id, name, "planning.data.gov.uk", "2026-10-08"),
      ),
    ];
    /** What `/api/coverage` says once Ashfield is prepared, its INSPIRE Index Polygons `outOfDate` or not. */
    const ashfieldPrepared = (
      outOfDate = false,
      datasets: unknown[] = ASHFIELD_DATASETS,
    ) => ({
      status: "ok",
      preparedAt: "2026-10-08T12:00:00.000Z",
      datasets: [boundaries],
      landCoverageAreas: [{ council: ASHFIELD, datasets, outOfDate }],
    });
    const ASHFIELD_PREPARED = ashfieldPrepared();

    /** The Land Coverage Area section of the Location Overview, once it shows. */
    const landCoverageArea = () =>
      screen.findByRole("region", { name: "Land Coverage Area" });

    /** Searches for NG17 1AA, which the backend says is in `council`. */
    const searchIn = async (
      council: unknown,
      coverage: () => Response = () => Response.json(ASHFIELD_PREPARED),
    ) => {
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": (url) => areaRoute(url, council),
        "/api/coverage": coverage,
      });
      render(<App />);
      await searchFor("NG17 1AA");
      return landCoverageArea();
    };

    it("says to run pnpm data:prepare before it has run, and shows the rest of the Search Area", async () => {
      const section = await searchIn(COUNCIL_NOT_PREPARED, () =>
        Response.json(NOTHING_PREPARED),
      );

      expect(section.textContent).toBe(
        "Land Coverage AreaNot prepared. Run pnpm data:prepare to find the council the Location is in and prepare its land data.",
      );
      expect(within(section).getByText("pnpm data:prepare").tagName).toBe(
        "CODE",
      );
      expect(
        await screen.findByRole("region", { name: "Local geography" }),
      ).toBeTruthy();
    });

    it("names the council from the prepared boundaries, a Land Coverage Area, with its dates", async () => {
      const section = await searchIn({
        status: "ok",
        council: ASHFIELD,
        inLandCoverageArea: true,
      });

      expect(
        within(section).getByText("Council").nextSibling?.textContent,
      ).toBe("Ashfield");
      expect(
        await within(section).findByText(
          "Ashfield is a Land Coverage Area: its land data was prepared on 8 October 2026.",
        ),
      ).toBeTruthy();
      expect(
        within(section).getByText(
          "Council boundaries from ONS Open Geography, as at May 2026, prepared on 8 October 2026.",
        ),
      ).toBeTruthy();
    });

    it("gives the date of each source of a Land Coverage Area's land data, and credits INSPIRE Index Polygons as HM Land Registry requires", async () => {
      const section = await searchIn({
        status: "ok",
        council: ASHFIELD,
        inLandCoverageArea: true,
      });

      const list = await within(section).findByRole("list", {
        name: "Land data",
      });
      expect(
        within(list)
          .getAllByRole("listitem")
          .map(({ textContent }) => textContent),
      ).toEqual([
        "INSPIRE Index Polygons: HM Land Registry, published on 4 October 2026",
        "Land use, Buildings, Roads, Water: OpenStreetMap via Geofabrik, as at 8 October 2026",
        "Conservation areas, Flood risk zones: planning.data.gov.uk, as at 8 October 2026",
      ]);
      const credit = within(section).getByText(/^INSPIRE Index Polygons: This/);
      expect(credit.textContent).toBe(
        "INSPIRE Index Polygons: This information is subject to Crown copyright and database rights 2026 and is reproduced with the permission of HM Land Registry. The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey AC0000851063. Conditions of use.",
      );
      expect(
        within(credit)
          .getByRole("link", { name: "Conditions of use" })
          .getAttribute("href"),
      ).toBe(
        "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
      );
      expect(within(section).queryByText(/Out of date/)).toBeNull();
    });

    it("dates CCOD and OCOD, which Ownership Categories come from, and credits them as HM Land Registry's licence requires", async () => {
      const titles = ["ccod", "ocod"].map((id) => ({
        ...dataset(
          id,
          `${id === "ccod" ? "UK" : "Overseas"} companies that own property in England and Wales`,
          "HM Land Registry",
          "2026-10-02",
        ),
        attribution: {
          statements: [
            "Information produced by HM Land Registry. © Crown copyright 2026.",
          ],
          conditionsUrl: `https://use-land-property-data.service.gov.uk/datasets/${id}/licence/view`,
        },
      }));
      const section = await searchIn(
        { status: "ok", council: ASHFIELD, inLandCoverageArea: true },
        () =>
          Response.json({
            ...ASHFIELD_PREPARED,
            datasets: [boundaries, ...titles],
          }),
      );

      const list = await within(section).findByRole("list", {
        name: "Land data",
      });
      expect(
        within(list)
          .getAllByRole("listitem")
          .map(({ textContent }) => textContent),
      ).toContain(
        "UK companies that own property in England and Wales, Overseas companies that own property in England and Wales: HM Land Registry, published on 2 October 2026",
      );
      const credit = within(section).getByText(/^UK companies that own/, {
        selector: "p",
      });
      expect(credit.textContent).toBe(
        "UK companies that own property in England and Wales: Information produced by HM Land Registry. © Crown copyright 2026. Conditions of use.",
      );
      expect(
        within(credit)
          .getByRole("link", { name: "Conditions of use" })
          .getAttribute("href"),
      ).toBe(
        "https://use-land-property-data.service.gov.uk/datasets/ccod/licence/view",
      );
      expect(
        within(section).getByText(/^Overseas companies that own/, {
          selector: "p",
        }),
      ).toBeTruthy();
      expect(within(section).queryByText(/aren't prepared/)).toBeNull();
    });

    it("says Ownership Categories aren't prepared without CCOD and OCOD, and how to add them", async () => {
      const section = await searchIn({
        status: "ok",
        council: ASHFIELD,
        inLandCoverageArea: true,
      });

      expect(
        (await within(section).findByText(/^Ownership Categories aren't/))
          .textContent,
      ).toBe(
        "Ownership Categories aren't prepared, so its land is only Possibly Unregistered or registered. Set LAND_REGISTRY_DATA_API_KEY and run pnpm data:prepare to add them from HM Land Registry's CCOD and OCOD.",
      );
    });

    it("suggests running pnpm data:prepare again once its INSPIRE Index Polygons are more than 2 months old", async () => {
      const section = await searchIn(
        { status: "ok", council: ASHFIELD, inLandCoverageArea: true },
        () => Response.json(ashfieldPrepared(true)),
      );

      const note = await within(section).findByText(/^Out of date\./);
      expect(note.parentElement?.textContent).toBe(
        "Out of date. Its INSPIRE Index Polygons were published on 4 October 2026, more than 2 months ago. Run pnpm data:prepare again for the latest: HM Land Registry publishes them on the first Sunday of every month.",
      );
      expect(
        within(section).getByText(
          "Ashfield is a Land Coverage Area: its land data was prepared on 8 October 2026.",
        ),
      ).toBeTruthy();
    });

    it("suggests running pnpm data:prepare again for a Land Coverage Area prepared before its INSPIRE Index Polygons were", async () => {
      const section = await searchIn(
        { status: "ok", council: ASHFIELD, inLandCoverageArea: true },
        () =>
          Response.json(ashfieldPrepared(true, ASHFIELD_DATASETS.slice(0, 1))),
      );

      const note = await within(section).findByText(/^Not all prepared\./);
      expect(note.parentElement?.textContent).toBe(
        "Not all prepared. Its INSPIRE Index Polygons aren't prepared yet. Run pnpm data:prepare again to prepare them.",
      );
      expect(
        within(section).queryByRole("list", { name: "Land data" }),
      ).toBeNull();
    });

    it("says a council that isn't a Land Coverage Area has no land data, and how to add it", async () => {
      const section = await searchIn({
        status: "ok",
        council: { code: "E07000174", name: "Mansfield" },
        inLandCoverageArea: false,
      });

      const notPrepared = within(section).getByText(
        /^Land data not prepared for this area\./,
      );
      expect(notPrepared.textContent).toBe(
        'Land data not prepared for this area. Add Mansfield with pnpm data:prepare --area "Mansfield".',
      );
    });

    it("says when no prepared boundary covers the Location", async () => {
      const section = await searchIn({
        status: "ok",
        council: null,
        inLandCoverageArea: false,
      });

      expect(
        within(section).getByText(
          "No prepared council boundary covers the Location.",
        ),
      ).toBeTruthy();
    });

    it("says the boundaries are unavailable if they can't be read, and nothing else is affected", async () => {
      const section = await searchIn({
        status: "unavailable",
        council: null,
        inLandCoverageArea: false,
      });

      expect(section.textContent).toContain(
        "Unavailable. The prepared council boundaries can't be read for now. Everything else still works.",
      );
      expect(
        await screen.findByRole("region", { name: "Local geography" }),
      ).toBeTruthy();
    });

    it("still names the council when what is prepared can't be loaded, without its dates", async () => {
      const section = await searchIn(
        { status: "ok", council: ASHFIELD, inLandCoverageArea: true },
        () => Response.json({ error: "Down" }, { status: 500 }),
      );

      expect(
        within(section).getByText("Ashfield is a Land Coverage Area."),
      ).toBeTruthy();
      expect(within(section).queryByText(/Council boundaries from/)).toBeNull();
    });
  });

  describe("local geography", () => {
    /** The Local geography section of the Location Overview, once it shows. */
    const localGeography = async () =>
      screen.findByRole("region", { name: "Local geography" });

    /** Each label in the section, with the name shown against it. */
    const rows = (section: HTMLElement) =>
      [...section.querySelectorAll("dt")].map((dt) => [
        dt.textContent,
        dt.nextElementSibling?.textContent,
      ]);

    it("names the ward, LSOA, MSOA, local authority and parliamentary constituency of NG17 1AA", async () => {
      stubNg17Backend();
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await localGeography();
      // NG17 1AA's own record, not that of NG17 0AZ, which shares its point.
      expect(rows(section)).toEqual([
        ["Ward", "Sutton Central & New Cross"],
        ["LSOA", "Ashfield 005E"],
        ["MSOA", "Ashfield 005"],
        ["Local authority", "Ashfield"],
        ["Parliamentary constituency", "Ashfield"],
      ]);
      expect(
        within(section).getByTitle("Lower layer Super Output Area"),
      ).toBeTruthy();
      expect(
        within(section).getByTitle("Middle layer Super Output Area"),
      ).toBeTruthy();
    });

    it("names the nearest postcode's local geography for a map click, and says which postcode", async () => {
      stubNg17Backend();
      render(<App />);

      clickMap({ lat: 53.1435, lng: -1.1985 });

      expect(rows(await localGeography())).toEqual([
        ["Nearest postcode", "NG18 1JJ"],
        ["Ward", "Central"],
        ["LSOA", "Mansfield 008D"],
        ["MSOA", "Mansfield 008"],
        ["Local authority", "Mansfield"],
        ["Parliamentary constituency", "Mansfield"],
      ]);
    });

    it("keeps the searched postcode's local geography when the radius changes", async () => {
      stubNg17Backend();
      render(<App />);
      await searchFor("NG17 1AA");
      await screen.findByText("53.123664,-1.264078 0.5 mile");

      await chooseRadius(1);

      await screen.findByText("53.123664,-1.264078 1 mile");
      expect(
        within(await localGeography()).queryByText("Nearest postcode"),
      ).toBeNull();
    });

    it("says a shared URL's local geography comes from the nearest postcode", async () => {
      stubNg17Backend();

      openAt("/?lat=53.123664&lng=-1.264078&radius=0.5");

      const section = await localGeography();
      expect(rows(section)[0]).toEqual(["Nearest postcode", "NG17 0AZ"]);
      expect(
        within(section).getByText("Sutton Central & New Cross"),
      ).toBeTruthy();
    });

    it("says so when postcodes.io names no ward or constituency", async () => {
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": (url) => {
          const miles = Number(url.searchParams.get("radius"));
          return Response.json({
            location: NG17_1AA,
            searchRadius: { miles, metres: milesToMetres(miles) },
            geography: {
              ...NG17_GEOGRAPHY,
              ward: null,
              parliamentaryConstituency: null,
            },
            council: COUNCIL_NOT_PREPARED,
            sources: [],
            layers: [],
          });
        },
      });
      render(<App />);

      await searchFor("NG17 1AA");

      expect(rows(await localGeography())).toEqual([
        ["Ward", "Not known"],
        ["LSOA", "Ashfield 005E"],
        ["MSOA", "Ashfield 005"],
        ["Local authority", "Ashfield"],
        ["Parliamentary constituency", "Not known"],
      ]);
    });
  });

  describe("the Crime Layer", () => {
    const police = {
      id: "police",
      name: "data.police.uk",
      status: "ok",
      period: { from: "2026-08", to: "2026-08" },
    } as const;

    const crime = (id: string, category: string, categoryName: string) => ({
      id,
      location: { lat: 53.1237, lng: -1.2641 },
      distanceMetres: 40,
      category,
      categoryName,
      month: "2026-08",
      street: "On or near Market Place",
    });

    /** Three crimes, as the backend gives them for NG17 1AA. */
    const crimeLayer: CrimeLayerResponse = {
      layer: "crime",
      status: "ok",
      sources: [police],
      features: [
        crime("1", "shoplifting", "Shoplifting"),
        crime("2", "shoplifting", "Shoplifting"),
        crime("3", "violent-crime", "Violence and sexual offences"),
      ],
      statistics: {
        month: "2026-08",
        total: 3,
        byCategory: [
          { category: "shoplifting", name: "Shoplifting", count: 2 },
          {
            category: "violent-crime",
            name: "Violence and sexual offences",
            count: 1,
          },
        ],
        trend: {
          last12Months: { from: "2025-09", to: "2026-08" },
          previous12Months: { from: "2024-09", to: "2025-08" },
          complete: true,
          missingMonths: [],
          total: { last12Months: 1234, previous12Months: 1000, change: 23.4 },
          byCategory: [
            {
              category: "shoplifting",
              name: "Shoplifting",
              last12Months: 1200,
              previous12Months: 950,
              change: 26.3,
            },
            {
              category: "violent-crime",
              name: "Violence and sexual offences",
              last12Months: 30,
              previous12Months: 50,
              change: -40,
            },
            {
              category: "drugs",
              name: "Drugs",
              last12Months: 4,
              previous12Months: 0,
              change: null,
            },
          ],
        },
      },
    };

    /** The same Layer, but data.police.uk didn't answer for two months. */
    const incompleteCrimeLayer: CrimeLayerResponse = {
      ...crimeLayer,
      statistics: crimeLayer.statistics && {
        ...crimeLayer.statistics,
        trend: {
          ...crimeLayer.statistics.trend,
          complete: false,
          missingMonths: ["2025-03", "2025-11"],
          total: { last12Months: 1134, previous12Months: 920, change: null },
          byCategory: crimeLayer.statistics.trend.byCategory.map(
            (category) => ({ ...category, change: null }),
          ),
        },
      },
    };

    /** Each row of a table, as the text of its cells. */
    const rowsOf = (table: HTMLElement) =>
      within(table)
        .getAllByRole("row")
        .map((row) =>
          [...row.querySelectorAll("th, td")].map(
            ({ textContent }) => textContent,
          ),
        );

    const unavailableCrime: CrimeLayerResponse = {
      layer: "crime",
      status: "unavailable",
      sources: [{ ...police, status: "unavailable", period: null }],
      features: [],
      statistics: null,
    };

    /** NG17 1AA, whose Crime Layer the backend answers with `crimeRoute`. */
    const stubCrimeBackend = (crimeRoute: (url: URL) => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/crime": crimeRoute,
      });

    const crimeToggle = () =>
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Crime" });

    const crimeStatus = () =>
      document.getElementById("layer-crime-status")?.textContent;

    const mapLayers = () => screen.getByTestId("map-layers").textContent;

    const overview = () =>
      screen.getByRole("complementary", { name: "Location Overview" });

    const crimeOverview = () =>
      within(overview()).getByRole("region", { name: "Crime" });

    it("has a toggle for the Crime Layer, switched on, before there is a Search Area", () => {
      stubBackend({});

      render(<App />);

      expect(crimeToggle().checked).toBe(true);
      expect(crimeStatus()).toBeUndefined();
    });

    it("loads the Crime Layer with the Search Area, and draws its Features", async () => {
      const fetchMock = stubCrimeBackend(() => Response.json(crimeLayer));
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(mapLayers()).toBe("crime: 3");
      });
      expect(crimeStatus()).toBe("3 crimes");
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/area/crime?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      );
    });

    it("counts crimes by category in the Location Overview, and says police locations are approximate", async () => {
      stubCrimeBackend(() => Response.json(crimeLayer));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await within(overview()).findByRole("region", {
        name: "Crime",
      });
      await waitFor(() => {
        expect(section.textContent).toMatch(
          /3 crimes reported in the Search Area in August 2026/,
        );
      });
      expect(
        rowsOf(
          within(section).getByRole("table", {
            name: "Crimes by category, August 2026",
          }),
        ),
      ).toEqual([
        ["Category", "Crimes"],
        ["Shoplifting", "2"],
        ["Violence and sexual offences", "1"],
      ]);
      expect(section.textContent).toMatch(
        /Police crime locations are deliberately approximate/,
      );
    });

    it("gives the last 12 months' totals and the year-on-year change, overall and per category", async () => {
      stubCrimeBackend(() => Response.json(crimeLayer));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await within(overview()).findByRole("region", {
        name: "Crime",
      });
      await waitFor(() => {
        expect(section.textContent).toMatch(
          /1,234 crimes reported in the Search Area from September 2025 to August 2026: up 23\.4% on the 12 months before \(1,000\)\./,
        );
      });
      expect(
        within(section).getByRole("heading", { name: "Last 12 months" }),
      ).toBeTruthy();
      expect(
        rowsOf(
          within(section).getByRole("table", {
            name: "Crimes by category, September 2025 to August 2026, against the 12 months before",
          }),
        ),
      ).toEqual([
        ["Category", "Last 12 months", "12 months before", "Change"],
        ["Shoplifting", "1,200", "950", "+26.3%"],
        ["Violence and sexual offences", "30", "50", "-40%"],
        ["Drugs", "4", "0", "None before"],
        ["All crimes", "1,234", "1,000", "+23.4%"],
      ]);
      expect(section.textContent).not.toMatch(/incomplete/i);
    });

    it("marks the trend incomplete, and gives no change, when data.police.uk didn't answer for some months", async () => {
      stubCrimeBackend(() => Response.json(incompleteCrimeLayer));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await within(overview()).findByRole("region", {
        name: "Crime",
      });
      await waitFor(() => {
        expect(section.textContent).toMatch(
          /Trend incomplete\. data\.police\.uk didn't answer for March 2025 and November 2025, so the counts leave those months out and no year-on-year change is given\./,
        );
      });
      expect(section.textContent).toMatch(
        /1,134 crimes counted in the Search Area from September 2025 to August 2026, and 920 in the 12 months before\./,
      );
      expect(section.textContent).not.toMatch(/%/);
      expect(
        rowsOf(
          within(section).getByRole("table", {
            name: /against the 12 months before$/,
          }),
        ),
      ).toEqual([
        ["Category", "Last 12 months", "12 months before"],
        ["Shoplifting", "1,200", "950"],
        ["Violence and sexual offences", "30", "50"],
        ["Drugs", "4", "0"],
        ["All crimes", "1,134", "920"],
      ]);
      // The latest month is complete, so it is still shown.
      expect(section.textContent).toMatch(
        /3 crimes reported in the Search Area in August 2026/,
      );
    });

    it("counts the months missing rather than naming them when there are many", async () => {
      const missingMonths = [
        "2024-09",
        "2024-10",
        "2024-11",
        "2024-12",
        "2025-01",
      ];
      stubCrimeBackend(() =>
        Response.json({
          ...incompleteCrimeLayer,
          statistics: incompleteCrimeLayer.statistics && {
            ...incompleteCrimeLayer.statistics,
            trend: {
              ...incompleteCrimeLayer.statistics.trend,
              missingMonths,
            },
          },
        }),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(crimeOverview().textContent).toMatch(
          /didn't answer for 5 of the 24 months, so/,
        );
      });
    });

    it("shows the Search Area while the Crime Layer is still loading, then the crimes when they arrive", async () => {
      let answer: (response: Response) => void = () => undefined;
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
      });
      const fetchMock = vi.mocked(fetch);
      const backend = fetchMock.getMockImplementation();
      fetchMock.mockImplementation((input) =>
        typeof input === "string" && input.startsWith("/api/area/crime")
          ? new Promise<Response>((resolve) => {
              answer = resolve;
            })
          : (backend?.(input) ?? Promise.reject(new Error("no backend"))),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      expect(
        await screen.findByText("53.123664,-1.264078 0.5 mile"),
      ).toBeTruthy();
      expect(crimeStatus()).toBe("Loading…");
      expect(crimeOverview().textContent).toMatch(/Loading/);
      expect(mapLayers()).toBe("");

      act(() => {
        answer(Response.json(crimeLayer));
      });

      await waitFor(() => {
        expect(crimeStatus()).toBe("3 crimes");
      });
      expect(mapLayers()).toBe("crime: 3");
    });

    it("says when a month has no crimes in the Search Area", async () => {
      stubCrimeBackend(() =>
        Response.json({
          ...crimeLayer,
          features: [],
          statistics: {
            month: "2026-08",
            total: 0,
            byCategory: [],
            trend: {
              ...crimeLayer.statistics?.trend,
              total: { last12Months: 0, previous12Months: 0, change: null },
              byCategory: [],
            },
          },
        }),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(crimeStatus()).toBe("None in this Search Area");
      });
      expect(crimeOverview().textContent).toMatch(
        /No crimes reported in the Search Area in August 2026/,
      );
      expect(crimeOverview().textContent).toMatch(
        /No crimes reported in the Search Area from September 2025 to August 2026, or in the 12 months before\./,
      );
      expect(within(crimeOverview()).queryByRole("table")).toBeNull();
    });

    it.each([
      ["data.police.uk is unavailable", () => Response.json(unavailableCrime)],
      [
        "the Layer can't be loaded",
        () => new Response("Bad gateway", { status: 502 }),
      ],
    ])(
      "shows the Layer as Unavailable when %s, and the rest of the page still works",
      async (_label, crimeRoute) => {
        stubCrimeBackend(crimeRoute);
        render(<App />);

        await searchFor("NG17 1AA");

        await waitFor(() => {
          expect(crimeStatus()).toBe("Unavailable");
        });
        expect(crimeOverview().textContent).toMatch(/^CrimeUnavailable\./);
        expect(mapLayers()).toBe("");
        // The Search Area and its local geography are still shown.
        expect(mapText()).toBe("53.123664,-1.264078 0.5 mile");
        expect(
          within(overview()).getByText("Sutton Central & New Cross"),
        ).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
      },
    );

    it("names data.police.uk when it is unavailable", async () => {
      stubCrimeBackend(() => Response.json(unavailableCrime));
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(crimeOverview().textContent).toMatch(
          /data\.police\.uk didn't answer/,
        );
      });
    });

    it("hides and shows the Layer on the map, keeping it in the URL", async () => {
      const fetchMock = stubCrimeBackend(() => Response.json(crimeLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toBe("crime: 3");
      });
      fetchMock.mockClear();
      const user = userEvent.setup();

      await user.click(crimeToggle());

      expect(crimeToggle().checked).toBe(false);
      expect(mapLayers()).toBe("");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&hidden=crime",
      );
      // Its statistics stay in the Overview as text (PRD FR-9.5).
      expect(crimeOverview().textContent).toMatch(/3 crimes reported/);

      await user.click(crimeToggle());

      expect(crimeToggle().checked).toBe(true);
      expect(mapLayers()).toBe("crime: 3");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5",
      );
      // Toggling only shows or hides what has already loaded.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("opens a shared URL with the Layer hidden", async () => {
      stubCrimeBackend(() => Response.json(crimeLayer));

      openAt("/?lat=53.123664&lng=-1.264078&radius=0.5&hidden=crime");

      await waitFor(() => {
        expect(crimeStatus()).toBe("3 crimes");
      });
      expect(crimeToggle().checked).toBe(false);
      expect(mapLayers()).toBe("");
    });

    it("keeps the Layer hidden for the next search and radius", async () => {
      stubCrimeBackend(() => Response.json(crimeLayer));
      openAt("/?hidden=crime");

      await searchFor("NG17 1AA");
      await chooseRadius(1);

      await screen.findByText("53.123664,-1.264078 1 mile");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=1&hidden=crime",
      );
      expect(crimeToggle().checked).toBe(false);
    });

    it("goes back to the Layer shown, without loading the Search Area again", async () => {
      const fetchMock = stubCrimeBackend(() => Response.json(crimeLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toBe("crime: 3");
      });
      await userEvent.setup().click(crimeToggle());
      fetchMock.mockClear();

      act(() => {
        window.history.back();
      });

      await waitFor(() => {
        expect(crimeToggle().checked).toBe(true);
      });
      expect(mapLayers()).toBe("crime: 3");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never shows the crimes of a Search Area the user has moved on from", async () => {
      const answers: ((response: Response) => void)[] = [];
      stubCrimeBackend(() => Response.json(crimeLayer));
      const fetchMock = vi.mocked(fetch);
      const backend = fetchMock.getMockImplementation();
      fetchMock.mockImplementation((input) =>
        typeof input === "string" && input.startsWith("/api/area/crime")
          ? new Promise<Response>((resolve) => {
              answers.push(resolve);
            })
          : (backend?.(input) ?? Promise.reject(new Error("no backend"))),
      );
      render(<App />);
      await searchFor("NG17 1AA");
      await screen.findByText("53.123664,-1.264078 0.5 mile");

      await chooseRadius(1);
      await screen.findByText("53.123664,-1.264078 1 mile");
      act(() => {
        answers[0]?.(Response.json(crimeLayer));
      });

      // The 0.5 mile crimes arrived, but the 1 mile Search Area is shown.
      await act(() => Promise.resolve());
      expect(crimeStatus()).toBe("Loading…");
      expect(mapLayers()).toBe("");
    });
  });

  describe("the Planning Layer", () => {
    const planningData = {
      id: "planning-data",
      name: "planning.data.gov.uk",
      status: "ok",
      period: null,
    } as const;

    const square: ConstraintShape = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-1.27, 53.12],
            [-1.26, 53.12],
            [-1.26, 53.13],
            [-1.27, 53.12],
          ],
        ],
      ],
    };

    /** A conservation area the Location is inside, and two listed buildings, as for NG17 1AA. */
    const planningLayer: PlanningLayerResponse = {
      layer: "planning",
      status: "ok",
      sources: [planningData],
      features: [
        {
          id: "44005909",
          location: NG17_1AA,
          distanceMetres: 0,
          type: "conservation-area",
          name: "Sutton in Ashfield Church and Market Place",
          grade: null,
          coversLocation: true,
          shape: square,
        },
        {
          id: "31691403",
          location: { lat: 53.124777, lng: -1.26524 },
          distanceMetres: 146,
          type: "listed-building",
          name: "HUNTER'S BAR",
          grade: "II",
          coversLocation: false,
          shape: null,
        },
        {
          id: "31678599",
          location: { lat: 53.122821, lng: -1.261418 },
          distanceMetres: 201,
          type: "listed-building",
          name: "UNITED REFORMED CHURCH",
          grade: "II",
          coversLocation: false,
          shape: null,
        },
      ],
      statistics: {
        byType: [
          { type: "conservation-area", count: 1, coversLocation: true },
          { type: "listed-building", count: 2, coversLocation: false },
          { type: "article-4-direction", count: 0, coversLocation: false },
          { type: "tree-preservation-zone", count: 0, coversLocation: false },
          { type: "flood-zone", count: 1, coversLocation: true },
        ],
        coveringLocation: [
          {
            type: "conservation-area",
            name: "Sutton in Ashfield Church and Market Place",
          },
          { type: "flood-zone", name: "Flood zone 3" },
        ],
      },
      applications: null,
    };

    /** NG17 1AA, whose Planning Layer the backend answers with `planningRoute`. */
    const stubPlanningBackend = (planningRoute: (url: URL) => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/planning": planningRoute,
      });

    const planningToggle = () =>
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Planning" });

    const planningStatus = () =>
      document.getElementById("layer-planning-status")?.textContent;

    const mapLayers = () => screen.getByTestId("map-layers").textContent;

    const planningOverview = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).findByRole("region", { name: "Planning" });

    it("has a toggle for the Planning Layer, switched on, before there is a Search Area", () => {
      stubBackend({});

      render(<App />);

      expect(planningToggle().checked).toBe(true);
      expect(planningStatus()).toBeUndefined();
    });

    it("loads the Planning Layer with the Search Area, and draws its Planning Constraints", async () => {
      const fetchMock = stubPlanningBackend(() => Response.json(planningLayer));
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(mapLayers()).toBe("planning: 3");
      });
      expect(planningStatus()).toBe("3 planning constraints");
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/area/planning?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      );
    });

    it("lists the counts per type in the Location Overview, and the Planning Constraints the Location is inside", async () => {
      stubPlanningBackend(() => Response.json(planningLayer));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await planningOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(
          "Location is inside: Sutton in Ashfield Church and Market Place (conservation area) and Flood zone 3.",
        );
      });
      expect(
        [
          ...within(section)
            .getByRole("table", {
              name: "Planning Constraints in the Search Area",
            })
            .querySelectorAll("tr"),
        ].map((row) =>
          [...row.querySelectorAll("th, td")].map(
            ({ textContent }) => textContent,
          ),
        ),
      ).toEqual([
        ["Type", "In the Search Area", "Location inside"],
        ["Conservation areas", "1", "Yes"],
        ["Listed buildings", "2", "No"],
        ["Article 4 directions", "0", "No"],
        ["Tree preservation zones", "0", "No"],
        ["Flood zones", "1", "Yes"],
      ]);
      expect(section.textContent).toContain(
        "Planning Constraints come from planning.data.gov.uk, which holds only what each council has published to it",
      );
    });

    it("says when the Location is inside none of them", async () => {
      stubPlanningBackend(() =>
        Response.json({
          ...planningLayer,
          statistics: planningLayer.statistics && {
            ...planningLayer.statistics,
            coveringLocation: [],
          },
        }),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await planningOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(
          "Location is inside: none of these Planning Constraints.",
        );
      });
    });

    it("reads Unavailable when planning.data.gov.uk fails, and everything else still works", async () => {
      const unavailable: PlanningLayerResponse = {
        layer: "planning",
        status: "unavailable",
        sources: [{ ...planningData, status: "unavailable" }],
        features: [],
        statistics: null,
        applications: null,
      };
      stubPlanningBackend(() => Response.json(unavailable));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await planningOverview();
      await waitFor(() => {
        expect(planningStatus()).toBe("Unavailable");
      });
      expect(section.textContent).toContain(
        "Unavailable. planning.data.gov.uk didn't answer",
      );
      expect(mapLayers()).toBe("");
      expect(screen.getByTestId("search-area-map").textContent).toBe(
        "53.123664,-1.264078 0.5 mile",
      );
    });

    it("hides the Layer from the map, keeping it in the URL and its statistics in the Overview", async () => {
      stubPlanningBackend(() => Response.json(planningLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toBe("planning: 3");
      });
      const user = userEvent.setup();

      await user.click(planningToggle());

      expect(mapLayers()).toBe("");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&hidden=planning",
      );
      expect((await planningOverview()).textContent).toContain(
        "Location is inside: Sutton in Ashfield Church and Market Place",
      );
    });

    describe("its Planning Applications", () => {
      const application = (
        overrides: Partial<PlanningApplicationFeature>,
      ): PlanningApplicationFeature => ({
        id: "Ashfield/V/2025/0320",
        location: { lat: 53.124817, lng: -1.25829 },
        distanceMetres: 408,
        reference: "V/2025/0320",
        authority: "Ashfield",
        description:
          "Outline application with all matters reserved for 4 dwellings",
        address:
          "19 Portland Street, Sutton In Ashfield, Nottinghamshire, NG17 4AW",
        postcode: "NG17 4AW",
        status: "approved",
        applicationType: "minor",
        councilType: "Outline Planning Application",
        receivedOn: "2025-08-20",
        decidedOn: "2025-11-28",
        approximate: true,
        url: "https://planning.ashfield.gov.uk/planning-applications/planning-application/?RefType=GFPlanning&KeyNo=234546",
        providerUrl:
          "https://www.planit.org.uk/planapplic/Ashfield/V/2025/0320/",
        estimatedHomes: 4,
        impact:
          "Potential impact, estimated: 4 new homes, about 10 more residents, once built.",
        ...overrides,
      });

      /** Three of PlanIt's applications near NG17 1AA, newest first. */
      const found: PlanningApplications = {
        status: "ok",
        provider: {
          id: "planit",
          name: "PlanIt",
          url: "https://www.planit.org.uk/",
          note: "Planning Applications come from PlanIt, which gathers them from councils' planning websites.",
        },
        period: { from: "2023-10-09", to: "2026-10-08" },
        features: [
          application({
            id: "Ashfield/V/2025/0425",
            reference: "V/2025/0425",
            address:
              "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU",
            description:
              "Demolition of existing commercial building and construction of a 3 storey apartment block",
            status: "pending",
            applicationType: "major",
            councilType: "Major Full",
            receivedOn: "2025-09-21",
            decidedOn: null,
            estimatedHomes: null,
            impact:
              "Potential impact, estimated: no new homes in its description.",
          }),
          application({}),
          application({
            id: "Ashfield/V/2024/0101",
            reference: "V/2024/0101",
            description: "Two storey side extension",
            status: "refused",
            applicationType: "householder",
            councilType: "Householder Application",
            receivedOn: "2024-03-01",
            approximate: false,
            estimatedHomes: null,
            impact:
              "Potential impact, estimated: no new homes: it alters an existing home.",
          }),
        ],
        statistics: {
          count: 3,
          total: 3,
          approximate: 2,
          byStatus: [
            { status: "pending", count: 1 },
            { status: "approved", count: 1 },
            { status: "refused", count: 1 },
            { status: "withdrawn", count: 0 },
            { status: "other", count: 0 },
          ],
          byType: [
            { type: "householder", count: 1 },
            { type: "minor", count: 1 },
            { type: "major", count: 1 },
          ],
          major: ["Ashfield/V/2025/0425"],
          housing: {
            approved: 4,
            pending: 0,
            homes: 4,
            residents: 10,
            applications: 1,
            unstated: 1,
          },
        },
      };

      const queued: PlanningApplications = {
        ...found,
        status: "queued",
        features: [],
        statistics: null,
      };

      const withApplications = (
        applications: PlanningApplications,
      ): PlanningLayerResponse => ({ ...planningLayer, applications });

      /** What the Planning Layer's toggle says about its Planning Applications. */
      const applicationsStatus = () =>
        document.getElementById("layer-planning-applications-status")
          ?.textContent;

      /** The Planning Applications' part of the Planning Layer's statistics. */
      const applicationsOverview = async () => {
        const section = await planningOverview();
        return waitFor(() => {
          const part = section.querySelector<HTMLElement>(
            ".planning-applications",
          );
          if (!part) throw new Error("No Planning Applications yet");
          return part;
        });
      };

      const rows = (table: HTMLElement) =>
        [...table.querySelectorAll("tr")].map((row) =>
          [...row.querySelectorAll("th, td")].map(
            ({ textContent }) => textContent,
          ),
        );

      afterEach(() => {
        vi.useRealTimers();
      });

      it("draws them on the map apart from the Planning Constraints", async () => {
        stubPlanningBackend(() => Response.json(withApplications(found)));
        render(<App />);

        await searchFor("NG17 1AA");

        await waitFor(() => {
          expect(mapLayers()).toBe("planning: 3 and 3 apart");
        });
        expect(planningStatus()).toBe("3 planning constraints");
        // Once they have come, the Overview counts them.
        expect(applicationsStatus()).toBeUndefined();
        expect(planningToggle().getAttribute("aria-describedby")).toBe(
          "layer-planning-status",
        );
      });

      it("counts them in the Overview by status and type, lists the major ones, and credits PlanIt", async () => {
        stubPlanningBackend(() => Response.json(withApplications(found)));
        render(<App />);

        await searchFor("NG17 1AA");

        const section = await applicationsOverview();
        expect(section.textContent).toContain(
          "3 Planning Applications received in the Search Area since 9 October 2023.",
        );
        expect(section.textContent).toContain(
          "2 are approximate: placed at the middle of their postcode",
        );
        expect(
          rows(
            within(section).getByRole("table", {
              name: "Planning Applications by status",
            }),
          ),
        ).toEqual([
          ["Status", "In the Search Area"],
          ["Pending", "1"],
          ["Approved", "1"],
          ["Refused", "1"],
          ["Withdrawn", "0"],
          ["No decision, or not known", "0"],
        ]);
        expect(
          rows(
            within(section).getByRole("table", {
              name: "Planning Applications by type",
            }),
          ),
        ).toEqual([
          ["Type", "In the Search Area"],
          ["Householder applications", "1"],
          ["Minor applications", "1"],
          ["Major applications", "1"],
        ]);
        expect(
          within(section).getByRole("list", { name: "Major applications" })
            .textContent,
        ).toBe(
          "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU: Demolition of existing commercial building and construction of a 3 storey apartment block (pending, received 21 September 2025)",
        );
        expect(section.textContent).toContain(
          "Planning Applications from PlanIt, as it had them on 8 October 2026.",
        );
        expect(
          within(section)
            .getByRole("link", { name: "PlanIt" })
            .getAttribute("href"),
        ).toBe("https://www.planit.org.uk/");
        expect(section.textContent).toContain(
          "Planning Applications come from PlanIt, which gathers them from councils' planning websites.",
        );
      });

      it("gives the homes approved or pending and the residents they would bring, labelled estimated", async () => {
        stubPlanningBackend(() => Response.json(withApplications(found)));
        render(<App />);

        await searchFor("NG17 1AA");

        const section = await applicationsOverview();
        expect(section.textContent).toContain(
          "Estimated housing: 4 homes approved or pending in the Search Area → about 10 extra residents.",
        );
        expect(section.textContent).toContain(
          "4 approved and 0 pending, read from the descriptions of 1 Planning Application, at 2.4 residents a home. 1 more proposes homes without saying how many, so isn't counted.",
        );
      });

      it("says when no new homes are approved or pending", async () => {
        stubPlanningBackend(() =>
          Response.json(
            withApplications({
              ...found,
              statistics: found.statistics && {
                ...found.statistics,
                housing: {
                  approved: 0,
                  pending: 0,
                  homes: 0,
                  residents: 0,
                  applications: 0,
                  unstated: 0,
                },
              },
            }),
          ),
        );
        render(<App />);

        await searchFor("NG17 1AA");

        const section = await applicationsOverview();
        expect(section.textContent).toContain(
          "Estimated housing: no new homes approved or pending in the Search Area.",
        );
        expect(section.textContent).not.toContain("extra residents");
      });

      it("shows them in just the same way from PlanWire, crediting it and saying what the backend says of it", async () => {
        stubPlanningBackend(() =>
          Response.json(
            withApplications({
              ...found,
              provider: {
                id: "planwire",
                name: "PlanWire",
                url: "https://planwire.io/",
                note: "Planning Applications come from PlanWire, which gathers them from councils' planning websites.",
              },
              features: found.features.map((feature) => ({
                ...feature,
                id: feature.id.replace("Ashfield", "ashfield"),
                approximate: false,
                providerUrl: null,
              })),
              statistics: found.statistics && {
                ...found.statistics,
                total: null,
                approximate: 0,
                major: ["ashfield/V/2025/0425"],
              },
            }),
          ),
        );
        render(<App />);

        await searchFor("NG17 1AA");

        await waitFor(() => {
          expect(mapLayers()).toBe("planning: 3 and 3 apart");
        });
        const section = await applicationsOverview();
        expect(section.textContent).toContain(
          "3 Planning Applications received in the Search Area since 9 October 2023. PlanWire gave as many as it gives at once and doesn't say how many it has, so there may be more than are shown and counted.",
        );
        expect(section.textContent).not.toContain("are approximate");
        expect(
          within(section).getByRole("list", { name: "Major applications" })
            .textContent,
        ).toContain("71 High Pavement");
        expect(section.textContent).toContain(
          "Planning Applications come from PlanWire, which gathers them from councils' planning websites.",
        );
        expect(section.textContent).toContain(
          "Planning Applications from PlanWire, as it had them on 8 October 2026.",
        );
        expect(
          within(section)
            .getByRole("link", { name: "PlanWire" })
            .getAttribute("href"),
        ).toBe("https://planwire.io/");
        expect(section.textContent).not.toMatch(/PlanIt/);
      });

      it("says when PlanIt has more than it gave", async () => {
        stubPlanningBackend(() =>
          Response.json(
            withApplications({
              ...found,
              statistics: found.statistics && {
                ...found.statistics,
                total: 1234,
              },
            }),
          ),
        );
        render(<App />);

        await searchFor("NG17 1AA");

        expect((await applicationsOverview()).textContent).toContain(
          "PlanIt has 1,234: only the newest 3 are shown and counted.",
        );
      });

      it("says Loading planning applications (rate-limited) while PlanIt's queue holds them, with the Planning Constraints and every other Layer shown, and asks again until they come", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let answers = 0;
        const fetchMock = stubBackend({
          "/api/geocode": () => Response.json(ng17Geocode),
          "/api/area": areaRoute,
          "/api/area/planning": () =>
            Response.json(withApplications(answers++ < 2 ? queued : found)),
          "/api/area/crime": () =>
            Response.json({
              layer: "crime",
              status: "unavailable",
              sources: [],
              features: [],
              statistics: null,
            }),
        });
        render(<App />);

        await searchFor("NG17 1AA");

        await waitFor(() => {
          expect(applicationsStatus()).toBe(
            "Loading planning applications (rate-limited)",
          );
        });
        expect(planningStatus()).toBe("3 planning constraints");
        expect(planningToggle().getAttribute("aria-describedby")).toBe(
          "layer-planning-status layer-planning-applications-status",
        );
        expect(document.getElementById("layer-crime-status")?.textContent).toBe(
          "Unavailable",
        );
        expect(mapLayers()).toBe("planning: 3");
        expect((await applicationsOverview()).textContent).toContain(
          "Loading planning applications (rate-limited). PlanIt allows about one request a minute",
        );
        const planningRequests = () =>
          fetchMock.mock.calls.filter(([url]) =>
            url.startsWith("/api/area/planning?"),
          ).length;
        expect(planningRequests()).toBe(1);

        await act(() =>
          vi.advanceTimersByTimeAsync(PLANNING_APPLICATIONS_RETRY_MS),
        );
        expect(planningRequests()).toBe(2);
        expect(applicationsStatus()).toBe(
          "Loading planning applications (rate-limited)",
        );

        await act(() =>
          vi.advanceTimersByTimeAsync(PLANNING_APPLICATIONS_RETRY_MS),
        );
        await waitFor(() => {
          expect(applicationsStatus()).toBeUndefined();
        });
        expect(mapLayers()).toBe("planning: 3 and 3 apart");

        // Once they have come, it asks no more.
        await act(() =>
          vi.advanceTimersByTimeAsync(3 * PLANNING_APPLICATIONS_RETRY_MS),
        );
        expect(planningRequests()).toBe(3);
      });

      it("shows them though planning.data.gov.uk is unavailable, and says when PlanIt is", async () => {
        stubPlanningBackend(() =>
          Response.json({
            ...withApplications(found),
            status: "unavailable",
            sources: [{ ...planningData, status: "unavailable" }],
            features: [],
            statistics: null,
          }),
        );
        render(<App />);
        await searchFor("NG17 1AA");

        await waitFor(() => {
          expect(planningStatus()).toBe("Unavailable");
        });
        expect(applicationsStatus()).toBeUndefined();
        expect(mapLayers()).toBe("planning: 0 and 3 apart");
        const section = await planningOverview();
        expect(section.textContent).toContain(
          "Unavailable. planning.data.gov.uk didn't answer",
        );
        expect((await applicationsOverview()).textContent).toContain(
          "3 Planning Applications received",
        );
      });

      it("says when PlanIt is unavailable, with the Planning Constraints as ever", async () => {
        stubPlanningBackend(() =>
          Response.json(withApplications({ ...queued, status: "unavailable" })),
        );
        render(<App />);
        await searchFor("NG17 1AA");

        await waitFor(() => {
          expect(applicationsStatus()).toBe(
            "Planning applications unavailable",
          );
        });
        expect(planningStatus()).toBe("3 planning constraints");
        expect((await applicationsOverview()).textContent).toContain(
          "Unavailable. PlanIt didn't answer",
        );
        expect(mapLayers()).toBe("planning: 3");
      });
    });
  });

  describe("the Amenities Layer", () => {
    const overpass = {
      id: "overpass",
      name: "Overpass API",
      status: "ok",
      period: { from: "2026-10-08", to: "2026-10-08" },
    } as const;

    /** A café, a takeaway and an unnamed office near NG17 1AA. */
    const amenitiesLayer: AmenitiesLayerResponse = {
      layer: "amenities",
      status: "ok",
      sources: [overpass],
      features: [
        {
          id: "way/251921972",
          location: { lat: 53.124, lng: -1.2649 },
          distanceMetres: 110,
          type: "cafe",
          name: "Costa",
          osmTag: "amenity=cafe",
        },
        {
          id: "way/251922185",
          location: { lat: 53.1236, lng: -1.2632 },
          distanceMetres: 58,
          type: "takeaway",
          name: "Sea Fish",
          osmTag: "amenity=fast_food",
        },
        {
          id: "node/1",
          location: { lat: 53.1239, lng: -1.2646 },
          distanceMetres: 1234,
          type: "office",
          name: null,
          osmTag: "office=accountant",
        },
      ],
      statistics: {
        total: 3,
        byType: AMENITY_TYPES.map((type) => ({
          type,
          count: ["cafe", "takeaway", "office"].includes(type) ? 1 : 0,
          nearest:
            type === "cafe"
              ? { id: "way/251921972", name: "Costa", distanceMetres: 110 }
              : type === "takeaway"
                ? { id: "way/251922185", name: "Sea Fish", distanceMetres: 58 }
                : type === "office"
                  ? { id: "node/1", name: null, distanceMetres: 1234 }
                  : null,
        })),
      },
    };

    /** NG17 1AA, whose Amenities Layer the backend answers with `amenitiesRoute`. */
    const stubAmenitiesBackend = (amenitiesRoute: (url: URL) => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/amenities": amenitiesRoute,
      });

    const amenitiesToggle = () =>
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Amenities" });

    const amenitiesStatus = () =>
      document.getElementById("layer-amenities-status")?.textContent;

    const mapLayers = () => screen.getByTestId("map-layers").textContent;

    const amenitiesOverview = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).findByRole("region", { name: "Amenities" });

    /** The cells of each row of the Overview's table of amenities. */
    const tableRows = (section: HTMLElement) =>
      [
        ...within(section)
          .getByRole("table", {
            name: "Amenities in the Search Area, and the nearest of each",
          })
          .querySelectorAll("tr"),
      ].map((row) =>
        [...row.querySelectorAll("th, td")].map(
          ({ textContent }) => textContent,
        ),
      );

    it("has a toggle for the Amenities Layer, switched on, before there is a Search Area", () => {
      stubBackend({});

      render(<App />);

      expect(amenitiesToggle().checked).toBe(true);
      expect(amenitiesStatus()).toBeUndefined();
    });

    it("loads the Amenities Layer with the Search Area, and draws its amenities", async () => {
      const fetchMock = stubAmenitiesBackend(() =>
        Response.json(amenitiesLayer),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(mapLayers()).toBe("amenities: 3");
      });
      expect(amenitiesStatus()).toBe("3 amenities");
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/area/amenities?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      );
    });

    it("lists the count and the nearest of each type in the Location Overview", async () => {
      stubAmenitiesBackend(() => Response.json(amenitiesLayer));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await amenitiesOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(
          "3 amenities mapped in the Search Area.",
        );
      });
      expect(tableRows(section)).toEqual([
        ["Type", "In the Search Area", "Nearest"],
        ["Other shops", "0", "None"],
        ["Convenience stores", "0", "None"],
        ["Cafés", "1", "Costa, 110 m"],
        ["Restaurants", "0", "None"],
        ["Takeaways", "1", "Sea Fish, 60 m"],
        ["Pubs", "0", "None"],
        ["Supermarkets", "0", "None"],
        ["Gyms", "0", "None"],
        ["Hairdressers", "0", "None"],
        ["Dentists", "0", "None"],
        ["Nurseries", "0", "None"],
        ["Healthcare", "0", "None"],
        ["Offices", "1", "Unnamed office, 1.2 km"],
      ]);
      expect(section.textContent).toContain(
        "Amenities come from OpenStreetMap, which volunteers map",
      );
    });

    it("highlights the Business Scout Mode's competitors on the map, and names the nearest in the Overview", async () => {
      const cafeMode = {
        id: "business-cafe",
        name: "Business: Café",
        question: "Could I open a café here?",
        weights: { ...SCOUT_MODE_WEIGHTS, competition: 25, footfall: 20 },
        competitors: {
          name: "cafés",
          tags: [{ key: "amenity", values: ["cafe"] }],
        },
        highlightedLayers: ["amenities"],
        highlights: ["crime-rate-high"],
      } satisfies ScoutMode;
      stubBackend({
        "/api/modes": () =>
          Response.json({ modes: [...MODES.modes, cafeMode] }),
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/amenities": () => Response.json(amenitiesLayer),
      });
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toBe("amenities: 3");
      });

      await userEvent
        .setup()
        .selectOptions(screen.getByLabelText("Scout Mode"), "Business: Café");

      // Costa, the one café, is drawn apart from the takeaway and office.
      await waitFor(() => {
        expect(mapLayers()).toBe("amenities: 2 and 1 competitors");
      });
      const section = await amenitiesOverview();
      expect(section.querySelector(".competitors")?.textContent).toBe(
        "Competitors in the Business: Café Scout Mode (cafés): 1 in the Search Area, the nearest Costa, 110 m away. Each is starred on the map.",
      );
      expect(
        within(section).getByText(
          "Highlighted by the Business: Café Scout Mode",
        ),
      ).toBeTruthy();
      expect(
        document
          .querySelector(".layer-toggle[data-highlighted] input")
          ?.getAttribute("id"),
      ).toBe("layer-amenities");

      await userEvent
        .setup()
        .selectOptions(screen.getByLabelText("Scout Mode"), "General");

      await waitFor(() => {
        expect(mapLayers()).toBe("amenities: 3");
      });
      expect(section.querySelector(".competitors")).toBeNull();
    });

    it("says when none of the Scout Mode's competitors are in the Search Area", async () => {
      const gymMode = {
        id: "business-gym",
        name: "Business: Gym",
        question: "Could I open a gym here?",
        weights: { ...SCOUT_MODE_WEIGHTS, competition: 20, footfall: 15 },
        competitors: {
          name: "gyms",
          tags: [{ key: "leisure", values: ["fitness_centre"] }],
        },
        highlightedLayers: ["amenities"],
        highlights: ["crime-rate-high"],
      } satisfies ScoutMode;
      stubBackend({
        "/api/modes": () => Response.json({ modes: [...MODES.modes, gymMode] }),
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/amenities": () => Response.json(amenitiesLayer),
      });
      openAt("/?lat=53.123664&lng=-1.264078&radius=0.5&mode=business-gym");

      const section = await amenitiesOverview();
      await waitFor(() => {
        expect(section.querySelector(".competitors")?.textContent).toBe(
          "Competitors in the Business: Gym Scout Mode (gyms): none in the Search Area.",
        );
      });
      expect(mapLayers()).toBe("amenities: 3 and 0 competitors");
    });

    it("says when none are mapped in the Search Area", async () => {
      stubAmenitiesBackend(() =>
        Response.json({
          ...amenitiesLayer,
          features: [],
          statistics: {
            total: 0,
            byType: AMENITY_TYPES.map((type) => ({
              type,
              count: 0,
              nearest: null,
            })),
          },
        }),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await amenitiesOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(
          "No amenities mapped in the Search Area.",
        );
      });
      expect(amenitiesStatus()).toBe("None in this Search Area");
    });

    it("reads Unavailable when Overpass fails, and everything else still works", async () => {
      const unavailable: AmenitiesLayerResponse = {
        layer: "amenities",
        status: "unavailable",
        sources: [{ ...overpass, status: "unavailable", period: null }],
        features: [],
        statistics: null,
      };
      stubAmenitiesBackend(() => Response.json(unavailable));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await amenitiesOverview();
      await waitFor(() => {
        expect(amenitiesStatus()).toBe("Unavailable");
      });
      expect(section.textContent).toContain(
        "Unavailable. Overpass API didn't answer",
      );
      expect(mapLayers()).toBe("");
      expect(screen.getByTestId("search-area-map").textContent).toBe(
        "53.123664,-1.264078 0.5 mile",
      );
    });

    it("hides the Layer from the map, keeping it in the URL and its statistics in the Overview", async () => {
      stubAmenitiesBackend(() => Response.json(amenitiesLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toBe("amenities: 3");
      });
      const user = userEvent.setup();

      await user.click(amenitiesToggle());

      expect(mapLayers()).toBe("");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&hidden=amenities",
      );
      expect((await amenitiesOverview()).textContent).toContain(
        "3 amenities mapped in the Search Area.",
      );
    });
  });

  describe("the Schools Layer", () => {
    const gias = {
      id: "gias",
      name: "Get Information about Schools",
      status: "ok",
      period: { from: "2026-10-09", to: "2026-10-09" },
    } as const;
    const ofsted = {
      id: "ofsted",
      name: "Ofsted",
      status: "ok",
      period: { from: "2026-08-31", to: "2026-08-31" },
    } as const;
    const reportCard: OfstedInspection = {
      kind: "report-card",
      inspectedOn: "2026-04-21",
      grades: [{ area: "Achievement", grade: "needs-attention" }],
      safeguardingMet: true,
      outcome: null,
      ofPredecessor: false,
    };
    const graded: OfstedInspection = {
      kind: "graded",
      inspectedOn: "2022-07-19",
      grades: [],
      safeguardingMet: true,
      outcome: null,
      ofPredecessor: false,
    };
    const byJudgement = (counts: Record<string, number>) =>
      OFSTED_JUDGEMENTS.map((judgement) => ({
        judgement,
        count: counts[judgement] ?? 0,
      }));

    /** A secondary and a primary school near NG17 1AA, and the nearest primary just outside it. */
    const schoolsLayer: SchoolsLayerResponse = {
      layer: "schools",
      status: "ok",
      sources: [gias, ofsted],
      features: [
        {
          id: "139063",
          location: { lat: 53.123786, lng: -1.260611 },
          distanceMetres: 232,
          name: "Sutton Community Academy",
          phase: "secondary",
          establishmentType: "Academy sponsor led",
          ages: { from: 11, to: 16 },
          judgement: "report-card",
          inspection: reportCard,
          inspectorate: null,
        },
        {
          id: "122468",
          location: { lat: 53.1197, lng: -1.2722 },
          distanceMetres: 642,
          name: "Priestsic Primary and Nursery School",
          phase: "primary",
          establishmentType: "Community school",
          ages: { from: 3, to: 11 },
          judgement: "good",
          inspection: graded,
          inspectorate: null,
        },
      ],
      statistics: {
        total: 2,
        byPhase: SCHOOL_PHASES.map((phase) => ({
          phase,
          count: phase === "primary" || phase === "secondary" ? 1 : 0,
          byJudgement: byJudgement(
            phase === "primary"
              ? { good: 1 }
              : phase === "secondary"
                ? { "report-card": 1 }
                : {},
          ),
        })),
        byJudgement: byJudgement({ good: 1, "report-card": 1 }),
        nearestPrimary: {
          id: "122468",
          name: "Priestsic Primary and Nursery School",
          phase: "primary",
          distanceMetres: 642,
          inSearchArea: true,
          judgement: "good",
          inspection: graded,
        },
        primarySearchMetres: 2400,
        nearestSecondary: {
          id: "139063",
          name: "Sutton Community Academy",
          phase: "secondary",
          distanceMetres: 232,
          inSearchArea: true,
          judgement: "report-card",
          inspection: reportCard,
        },
        secondarySearchMetres: 6000,
      },
    };

    /** NG17 1AA, whose Schools Layer the backend answers with `schoolsRoute`. */
    const stubSchoolsBackend = (schoolsRoute: (url: URL) => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/schools": schoolsRoute,
      });

    const schoolsToggle = () =>
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Schools" });

    const schoolsStatus = () =>
      document.getElementById("layer-schools-status")?.textContent;

    const mapLayers = () => screen.getByTestId("map-layers").textContent;

    const schoolsOverview = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).findByRole("region", { name: "Schools" });

    /** The cells of each row of the Overview's table named `name`. */
    const tableRows = (section: HTMLElement, name: string) =>
      [
        ...within(section).getByRole("table", { name }).querySelectorAll("tr"),
      ].map((row) =>
        [...row.querySelectorAll("th, td")].map(
          ({ textContent }) => textContent,
        ),
      );

    /** Searches for NG17 1AA and waits for its Schools section to say `text`. */
    const overviewSays = async (text: string) => {
      render(<App />);
      await searchFor("NG17 1AA");
      const section = await schoolsOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(text);
      });
      return section;
    };

    it("loads the Schools Layer with the Search Area, and draws its schools", async () => {
      const fetchMock = stubSchoolsBackend(() => Response.json(schoolsLayer));
      render(<App />);

      expect(schoolsToggle().checked).toBe(true);
      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(mapLayers()).toBe("schools: 2");
      });
      expect(schoolsStatus()).toBe("2 schools");
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/area/schools?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      );
    });

    it("gives the nearest primary and secondary school with their Ofsted judgements, and counts by phase and judgement, in the Location Overview", async () => {
      stubSchoolsBackend(() => Response.json(schoolsLayer));

      const section = await overviewSays(
        "Nearest primary school: Priestsic Primary and Nursery School, 640 m. Ofsted: Good (graded inspection, 19 July 2022).",
      );

      expect(section.textContent).toContain(
        "Nearest secondary school: Sutton Community Academy, 230 m. Ofsted: Report card, no overall grade (report card, 21 April 2026).",
      );
      expect(section.textContent).toContain(
        "2 schools open in the Search Area.",
      );
      expect(tableRows(section, "Schools in the Search Area by phase")).toEqual(
        [
          ["Phase", "Schools", "Latest Ofsted judgements"],
          ["Nursery schools", "0", "–"],
          ["Primary schools", "1", "Good 1"],
          ["Secondary schools", "1", "Report card, no overall grade 1"],
          ["All-through schools", "0", "–"],
          ["Special schools", "0", "–"],
          ["Alternative provision", "0", "–"],
          ["Independent schools", "0", "–"],
        ],
      );
      expect(
        tableRows(
          section,
          "Schools in the Search Area by latest Ofsted judgement",
        ),
      ).toEqual([
        ["Judgement", "Schools"],
        ["Outstanding", "0"],
        ["Good", "1"],
        ["Requires improvement", "0"],
        ["Inadequate", "0"],
        ["Report card, no overall grade", "1"],
        ["Inspected, no overall grade", "0"],
        ["No Ofsted judgement here", "0"],
      ]);
      // Credited under the Open Government Licence (PRD FR-10.1a).
      expect(section.textContent).toContain(
        "From Get Information about Schools (9 October 2026) and Ofsted (31 August 2026). Contains public sector information from the Department for Education's Get Information about Schools and Ofsted, licensed under the Open Government Licence v3.0.",
      );
    });

    it("says when the nearest school is outside the Search Area, or there is none within reach", async () => {
      stubSchoolsBackend(() =>
        Response.json({
          ...schoolsLayer,
          features: [],
          statistics: {
            ...schoolsLayer.statistics,
            total: 0,
            nearestPrimary: {
              ...schoolsLayer.statistics?.nearestPrimary,
              distanceMetres: 1200,
              inSearchArea: false,
            },
            nearestSecondary: null,
          },
        }),
      );

      const section = await overviewSays(
        "Nearest primary school: Priestsic Primary and Nursery School, 1.2 km, outside the Search Area.",
      );

      expect(section.textContent).toContain(
        "Nearest secondary school: none within 6 km.",
      );
      expect(section.textContent).toContain(
        "No schools open in the Search Area.",
      );
      expect(
        within(section).queryByRole("table", {
          name: "Schools in the Search Area by phase",
        }),
      ).toBeNull();
    });

    it("says to run pnpm data:prepare before it has, and everything else still works", async () => {
      stubSchoolsBackend(() =>
        Response.json({
          layer: "schools",
          status: "not-prepared",
          sources: [
            { ...gias, status: "not-prepared", period: null },
            { ...ofsted, status: "not-prepared", period: null },
          ],
          features: [],
          statistics: null,
        } satisfies SchoolsLayerResponse),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await schoolsOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(
          "Not prepared. Run pnpm data:prepare to show this Layer.",
        );
      });
      expect(mapLayers()).toBe("");
      expect(screen.getByTestId("search-area-map").textContent).toBe(
        "53.123664,-1.264078 0.5 mile",
      );
    });

    it("hides the Layer from the map, keeping it in the URL and its statistics in the Overview", async () => {
      stubSchoolsBackend(() => Response.json(schoolsLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toBe("schools: 2");
      });
      const user = userEvent.setup();

      await user.click(schoolsToggle());

      expect(mapLayers()).toBe("");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&hidden=schools",
      );
      expect((await schoolsOverview()).textContent).toContain(
        "Primary schools1",
      );
    });
  });

  describe("the Transport Layer", () => {
    const overpass = {
      id: "overpass",
      name: "Overpass API",
      status: "ok",
      period: { from: "2026-10-08", to: "2026-10-08" },
    } as const;

    /** A bus stop, a car park and footpaths near NG17 1AA, with Sutton Parkway the nearest station. */
    const transportLayer: TransportLayerResponse = {
      layer: "transport",
      status: "ok",
      sources: [overpass],
      features: [
        {
          id: "node/502386902",
          location: { lat: 53.1224124, lng: -1.2622831 },
          distanceMetres: 184,
          type: "bus-stop",
          name: "Silk Street",
          osmTag: "highway=bus_stop",
          shape: null,
          lengthMetres: null,
        },
        {
          id: "way/459053927",
          location: { lat: 53.1236, lng: -1.2632 },
          distanceMetres: 81,
          type: "car-park",
          name: null,
          osmTag: "amenity=parking",
          shape: null,
          lengthMetres: null,
        },
        {
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
        },
      ],
      statistics: {
        facilities: [
          { type: "railway-station", count: 0 },
          { type: "bus-stop", count: 1 },
          { type: "car-park", count: 1 },
          { type: "ev-charger", count: 0 },
        ],
        routes: [
          { type: "footpath", lengthMetres: 9094 },
          { type: "cycle-route", lengthMetres: 0 },
        ],
        nearestStation: {
          id: "node/3170173970",
          name: "Sutton Parkway",
          distanceMetres: 1628,
          inSearchArea: false,
        },
        stationSearchMetres: 5000,
      },
    };

    /** NG17 1AA, whose Transport Layer the backend answers with `transportRoute`. */
    const stubTransportBackend = (transportRoute: (url: URL) => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/transport": transportRoute,
      });

    const transportToggle = () =>
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Transport" });

    const transportStatus = () =>
      document.getElementById("layer-transport-status")?.textContent;

    const mapLayers = () => screen.getByTestId("map-layers").textContent;

    const transportOverview = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).findByRole("region", { name: "Transport" });

    /** The cells of each row of the Overview's table of transport. */
    const tableRows = (section: HTMLElement) =>
      [
        ...within(section)
          .getByRole("table", { name: "Transport in the Search Area" })
          .querySelectorAll("tr"),
      ].map((row) =>
        [...row.querySelectorAll("th, td")].map(
          ({ textContent }) => textContent,
        ),
      );

    it("has a toggle for the Transport Layer, switched on, before there is a Search Area", () => {
      stubBackend({});

      render(<App />);

      expect(transportToggle().checked).toBe(true);
      expect(transportStatus()).toBeUndefined();
    });

    it("loads the Transport Layer with the Search Area, and draws its facilities and routes", async () => {
      const fetchMock = stubTransportBackend(() =>
        Response.json(transportLayer),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(mapLayers()).toBe("transport: 3");
      });
      expect(transportStatus()).toBe("3 transport Features");
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/area/transport?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      );
    });

    it("gives the nearest railway station, the count of each facility and the km of footpath and cycle route in the Location Overview", async () => {
      stubTransportBackend(() => Response.json(transportLayer));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await transportOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(
          "Nearest railway station: Sutton Parkway, 1.6 km, outside the Search Area.",
        );
      });
      expect(tableRows(section)).toEqual([
        ["Type", "In the Search Area"],
        ["Railway stations", "0"],
        ["Bus stops", "1"],
        ["Car parks", "1"],
        ["EV chargers", "0"],
        ["Footpaths", "9.1 km"],
        ["Cycle routes", "0.0 km"],
      ]);
      expect(section.textContent).toContain(
        "Transport comes from OpenStreetMap, which volunteers map",
      );
    });

    it("says when the nearest railway station is in the Search Area", async () => {
      stubTransportBackend(() =>
        Response.json({
          ...transportLayer,
          statistics: {
            ...transportLayer.statistics,
            nearestStation: {
              id: "node/1",
              name: null,
              distanceMetres: 420,
              inSearchArea: true,
            },
          },
        }),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await transportOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(
          "Nearest railway station: Unnamed railway station, 420 m.",
        );
      });
    });

    it("says when there is no railway station within 5 km", async () => {
      stubTransportBackend(() =>
        Response.json({
          ...transportLayer,
          statistics: { ...transportLayer.statistics, nearestStation: null },
        }),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await transportOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(
          "Nearest railway station: none within 5 km.",
        );
      });
    });

    it("reads Unavailable when Overpass fails, and everything else still works", async () => {
      const unavailable: TransportLayerResponse = {
        layer: "transport",
        status: "unavailable",
        sources: [{ ...overpass, status: "unavailable", period: null }],
        features: [],
        statistics: null,
      };
      stubTransportBackend(() => Response.json(unavailable));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await transportOverview();
      await waitFor(() => {
        expect(transportStatus()).toBe("Unavailable");
      });
      expect(section.textContent).toContain(
        "Unavailable. Overpass API didn't answer",
      );
      expect(mapLayers()).toBe("");
      expect(screen.getByTestId("search-area-map").textContent).toBe(
        "53.123664,-1.264078 0.5 mile",
      );
    });

    it("hides the Layer from the map, keeping it in the URL and its statistics in the Overview", async () => {
      stubTransportBackend(() => Response.json(transportLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toBe("transport: 3");
      });
      const user = userEvent.setup();

      await user.click(transportToggle());

      expect(mapLayers()).toBe("");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&hidden=transport",
      );
      expect((await transportOverview()).textContent).toContain(
        "Footpaths9.1 km",
      );
    });
  });

  describe("the Green space Layer", () => {
    const overpass = {
      id: "overpass",
      name: "Overpass API",
      status: "ok",
      period: { from: "2026-10-08", to: "2026-10-08" },
    } as const;

    /** A park and a playground near NG17 1AA, with the park the nearest. */
    const greenSpaceLayer: GreenSpaceLayerResponse = {
      layer: "green-space",
      status: "ok",
      sources: [overpass],
      features: [
        {
          id: "way/1289231258",
          location: { lat: 53.1237452, lng: -1.2625207 },
          distanceMetres: 104,
          type: "park",
          name: null,
          osmTag: "leisure=park",
          coversLocation: false,
          shape: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [-1.2625, 53.1237],
                  [-1.262, 53.1237],
                  [-1.262, 53.124],
                  [-1.2625, 53.1237],
                ],
              ],
            ],
          },
        },
        {
          id: "node/1",
          location: { lat: 53.1194, lng: -1.2628 },
          distanceMetres: 477,
          type: "playground",
          name: null,
          osmTag: "leisure=playground",
          coversLocation: false,
          shape: null,
        },
      ],
      statistics: {
        total: 2,
        byType: [
          { type: "park", count: 1 },
          { type: "playground", count: 1 },
          { type: "nature-reserve", count: 0 },
          { type: "wood", count: 0 },
        ],
        nearestPark: {
          id: "way/1289231258",
          name: null,
          distanceMetres: 104,
          inSearchArea: true,
          coversLocation: false,
        },
        parkSearchMetres: 2000,
      },
    };

    /** NG17 1AA, whose Green space Layer the backend answers with `greenSpaceRoute`. */
    const stubGreenSpaceBackend = (greenSpaceRoute: (url: URL) => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/green-space": greenSpaceRoute,
      });

    /** The backend's Green space Layer with a different nearest park. */
    const withNearestPark = (nearestPark: NearestPark | null) =>
      stubGreenSpaceBackend(() =>
        Response.json({
          ...greenSpaceLayer,
          statistics: { ...greenSpaceLayer.statistics, nearestPark },
        }),
      );

    const greenSpaceToggle = () =>
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Green space" });

    const greenSpaceStatus = () =>
      document.getElementById("layer-green-space-status")?.textContent;

    const mapLayers = () => screen.getByTestId("map-layers").textContent;

    const greenSpaceOverview = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).findByRole("region", { name: "Green space" });

    /** The cells of each row of the Overview's table of green space. */
    const tableRows = (section: HTMLElement) =>
      [
        ...within(section)
          .getByRole("table", { name: "Green space in the Search Area" })
          .querySelectorAll("tr"),
      ].map((row) =>
        [...row.querySelectorAll("th, td")].map(
          ({ textContent }) => textContent,
        ),
      );

    /** Searches for NG17 1AA and waits for its Green space section to say `text`. */
    const overviewSays = async (text: string) => {
      render(<App />);
      await searchFor("NG17 1AA");
      const section = await greenSpaceOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(text);
      });
      return section;
    };

    it("has a toggle for the Green space Layer, switched on, before there is a Search Area", () => {
      stubBackend({});

      render(<App />);

      expect(greenSpaceToggle().checked).toBe(true);
      expect(greenSpaceStatus()).toBeUndefined();
    });

    it("loads the Green space Layer with the Search Area, and draws its green spaces", async () => {
      const fetchMock = stubGreenSpaceBackend(() =>
        Response.json(greenSpaceLayer),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(mapLayers()).toBe("green-space: 2");
      });
      expect(greenSpaceStatus()).toBe("2 green spaces");
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/area/green-space?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      );
    });

    it("gives the distance to the nearest park and the count of each type in the Location Overview", async () => {
      stubGreenSpaceBackend(() => Response.json(greenSpaceLayer));

      const section = await overviewSays("Nearest park: Unnamed park, 100 m.");

      expect(section.textContent).toContain(
        "2 green spaces mapped in the Search Area.",
      );
      expect(tableRows(section)).toEqual([
        ["Type", "In the Search Area"],
        ["Parks", "1"],
        ["Playgrounds", "1"],
        ["Nature reserves", "0"],
        ["Woods", "0"],
      ]);
      expect(section.textContent).toContain(
        "Green space comes from OpenStreetMap, which volunteers map",
      );
    });

    it("says when the nearest park is outside the Search Area", async () => {
      withNearestPark({
        id: "way/309700889",
        name: "Sutton Lawn",
        distanceMetres: 1200,
        inSearchArea: false,
        coversLocation: false,
      });

      await overviewSays(
        "Nearest park: Sutton Lawn, 1.2 km, outside the Search Area.",
      );
    });

    it("says when the Location is inside the nearest park", async () => {
      withNearestPark({
        id: "way/309700889",
        name: "Sutton Lawn",
        distanceMetres: 0,
        inSearchArea: true,
        coversLocation: true,
      });

      await overviewSays(
        "Nearest park: Sutton Lawn, which the Location is inside.",
      );
    });

    it("says when there is no park within 2 km", async () => {
      withNearestPark(null);

      await overviewSays("Nearest park: none within 2 km.");
    });

    it("says when there are no green spaces in the Search Area", async () => {
      stubGreenSpaceBackend(() =>
        Response.json({
          ...greenSpaceLayer,
          features: [],
          statistics: {
            ...greenSpaceLayer.statistics,
            total: 0,
            byType: [],
            nearestPark: null,
          },
        }),
      );

      await overviewSays("No green spaces mapped in the Search Area.");
    });

    it("reads Unavailable when Overpass fails, and everything else still works", async () => {
      const unavailable: GreenSpaceLayerResponse = {
        layer: "green-space",
        status: "unavailable",
        sources: [{ ...overpass, status: "unavailable", period: null }],
        features: [],
        statistics: null,
      };
      stubGreenSpaceBackend(() => Response.json(unavailable));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await greenSpaceOverview();
      await waitFor(() => {
        expect(greenSpaceStatus()).toBe("Unavailable");
      });
      expect(section.textContent).toContain(
        "Unavailable. Overpass API didn't answer",
      );
      expect(mapLayers()).toBe("");
      expect(screen.getByTestId("search-area-map").textContent).toBe(
        "53.123664,-1.264078 0.5 mile",
      );
    });

    it("hides the Layer from the map, keeping it in the URL and its statistics in the Overview", async () => {
      stubGreenSpaceBackend(() => Response.json(greenSpaceLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toBe("green-space: 2");
      });
      const user = userEvent.setup();

      await user.click(greenSpaceToggle());

      expect(mapLayers()).toBe("");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&hidden=green-space",
      );
      expect((await greenSpaceOverview()).textContent).toContain("Parks1");
    });
  });

  describe("the Property Layer", () => {
    const postcodesIo = {
      id: "postcodes-io",
      name: "postcodes.io",
      status: "ok",
      period: null,
    } as const;
    const pricePaid = {
      id: "land-registry",
      name: "HM Land Registry Price Paid",
      status: "ok",
      period: { from: "2025-10-09", to: "2026-10-08" },
    } as const;

    const none = { count: 0, median: null, mean: null };

    /** Two sales near NG17 1AA: a detached house, and a new leasehold flat. */
    const statistics: PropertyStatistics = {
      period: { from: "2025-10-09", to: "2026-10-08" },
      all: { count: 2, median: 147500, mean: 147500 },
      byType: [
        { type: "detached", count: 1, median: 173000, mean: 173000 },
        { type: "semi-detached", ...none },
        { type: "terraced", ...none },
        { type: "flat", count: 1, median: 122000, mean: 122000 },
        { type: "other", ...none },
      ],
      byTenure: [
        { tenure: "freehold", count: 1, median: 173000, mean: 173000 },
        { tenure: "leasehold", count: 1, median: 122000, mean: 122000 },
      ],
      byNewBuild: [
        { newBuild: true, count: 1, median: 122000, mean: 122000 },
        { newBuild: false, count: 1, median: 173000, mean: 173000 },
      ],
      medianChange: {
        twelveMonths: {
          period: { from: "2024-10-09", to: "2025-10-08" },
          prices: { count: 3, median: 140000, mean: 151000 },
          change: 5.4,
        },
        fiveYears: {
          period: { from: "2020-10-09", to: "2021-10-08" },
          prices: { count: 2, median: 150000, mean: 150000 },
          change: -1.7,
        },
      },
      postcodes: {
        searched: 37,
        limit: 100,
        truncated: false,
        reachMetres: 790,
      },
    };

    const propertyLayer: PropertyLayerResponse = {
      layer: "property",
      status: "ok",
      sources: [postcodesIo, pricePaid],
      features: [
        {
          id: "5A7B802C-F597-1886-E063-4704A8C021AE",
          location: { lat: 53.122394, lng: -1.263681 },
          distanceMetres: 144,
          price: 173000,
          date: "2026-05-29",
          type: "detached",
          tenure: "freehold",
          newBuild: false,
          address: "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD",
          postcode: "NG17 1BT",
          history: [
            {
              id: "5A7B802C-F597-1886-E063-4704A8C021AE",
              price: 173000,
              date: "2026-05-29",
              change: -5.7,
            },
            {
              id: "44F406B6-B93C-1095-E063-4704A8C048D4",
              price: 183500,
              date: "2024-10-06",
              change: null,
            },
          ],
          epc: null,
        },
        {
          id: "1",
          location: { lat: 53.1194, lng: -1.2628 },
          distanceMetres: 477,
          price: 122000,
          date: "2026-03-02",
          type: "flat",
          tenure: "leasehold",
          newBuild: true,
          address: "FLAT 2, 4 STATION ROAD, SUTTON-IN-ASHFIELD",
          postcode: "NG17 5FF",
          history: null,
          epc: null,
        },
      ],
      statistics,
      epc: null,
    };

    /** NG17 1AA, whose Property Layer the backend answers with `propertyRoute`. */
    const stubPropertyBackend = (propertyRoute: (url: URL) => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/property": propertyRoute,
      });

    /** The backend's Property Layer with different statistics. */
    const withStatistics = (changes: Partial<PropertyStatistics>) =>
      stubPropertyBackend(() =>
        Response.json({
          ...propertyLayer,
          statistics: { ...statistics, ...changes },
        }),
      );

    const propertyToggle = () =>
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Property" });

    const propertyStatus = () =>
      document.getElementById("layer-property-status")?.textContent;

    const mapLayers = () => screen.getByTestId("map-layers").textContent;

    const propertyOverview = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).findByRole("region", { name: "Property" });

    /** The cells of each row of the Overview's table named `name`. */
    const tableRows = (section: HTMLElement, name: string) =>
      [
        ...within(section).getByRole("table", { name }).querySelectorAll("tr"),
      ].map((row) =>
        [...row.querySelectorAll("th, td")].map(
          ({ textContent }) => textContent,
        ),
      );

    /** Searches for NG17 1AA and waits for its Property section to say `text`. */
    const overviewSays = async (text: string) => {
      render(<App />);
      await searchFor("NG17 1AA");
      const section = await propertyOverview();
      await waitFor(() => {
        expect(section.textContent).toContain(text);
      });
      return section;
    };

    const PERIOD = "9 October 2025 to 8 October 2026";

    it("has a toggle for the Property Layer, switched on, before there is a Search Area", () => {
      stubBackend({});

      render(<App />);

      expect(propertyToggle().checked).toBe(true);
      expect(propertyStatus()).toBeUndefined();
    });

    it("loads the Property Layer with the Search Area, and draws its sales", async () => {
      const fetchMock = stubPropertyBackend(() => Response.json(propertyLayer));
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(mapLayers()).toBe("property: 2");
      });
      expect(propertyStatus()).toBe("2 sales");
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/area/property?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      );
    });

    it("gives the count, median and mean price, by property type, tenure and new build, in the Location Overview", async () => {
      stubPropertyBackend(() => Response.json(propertyLayer));

      const section = await overviewSays(
        `2 sales in the Search Area from ${PERIOD}: a median price of £147,500 and a mean of £147,500.`,
      );

      expect(tableRows(section, `Sales by property type, ${PERIOD}`)).toEqual([
        ["Property type", "Sales", "Median", "Mean"],
        ["Detached houses", "1", "£173,000", "£173,000"],
        ["Semi-detached houses", "0", "None", "None"],
        ["Terraced houses", "0", "None", "None"],
        ["Flats and maisonettes", "1", "£122,000", "£122,000"],
        ["Other property", "0", "None", "None"],
      ]);
      expect(tableRows(section, `Sales by tenure, ${PERIOD}`)).toEqual([
        ["Tenure", "Sales", "Median", "Mean"],
        ["Freehold", "1", "£173,000", "£173,000"],
        ["Leasehold", "1", "£122,000", "£122,000"],
      ]);
      expect(tableRows(section, `Sales of new builds, ${PERIOD}`)).toEqual([
        ["New build", "Sales", "Median", "Mean"],
        ["New builds", "1", "£122,000", "£122,000"],
        ["Not new builds", "1", "£173,000", "£173,000"],
      ]);
      expect(section.textContent).not.toContain("Search Area cut short");
      expect(section.textContent).toContain(
        "Sales come from HM Land Registry's Price Paid Data",
      );
    });

    const MEDIAN_CHANGE = "Change in median price, in the same postcodes";

    it("gives the change in median price from the same postcodes' sales a year and five years before", async () => {
      stubPropertyBackend(() => Response.json(propertyLayer));

      const section = await overviewSays(MEDIAN_CHANGE);

      expect(tableRows(section, MEDIAN_CHANGE)).toEqual([
        ["12 months", "Sales", "Median", "Change since"],
        [`Last 12 months, ${PERIOD}`, "2", "£147,500", ""],
        [
          "A year before, 9 October 2024 to 8 October 2025",
          "3",
          "£140,000",
          "+5.4%",
        ],
        [
          "Five years before, 9 October 2020 to 8 October 2021",
          "2",
          "£150,000",
          "-1.7%",
        ],
      ]);
      expect(section.textContent).toContain(
        "A median moves with the mix of properties sold, as well as with their prices.",
      );
    });

    it("says when Price Paid didn't answer for an earlier 12 months, and when they had no sales", async () => {
      withStatistics({
        medianChange: {
          twelveMonths: {
            period: { from: "2024-10-09", to: "2025-10-08" },
            prices: none,
            change: null,
          },
          fiveYears: {
            period: { from: "2020-10-09", to: "2021-10-08" },
            prices: null,
            change: null,
          },
        },
      });

      const section = await overviewSays(MEDIAN_CHANGE);

      expect(tableRows(section, MEDIAN_CHANGE).slice(2)).toEqual([
        [
          "A year before, 9 October 2024 to 8 October 2025",
          "0",
          "None",
          "None",
        ],
        [
          "Five years before, 9 October 2020 to 8 October 2021",
          "Unavailable: Price Paid didn't answer",
        ],
      ]);
    });

    it("shows HM Land Registry's Price Paid attribution, with the conditions on its address data", async () => {
      stubPropertyBackend(() => Response.json(propertyLayer));

      const section = await overviewSays(
        "Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0.",
      );

      expect(
        within(section).getByRole("link", {
          name: "Open Government Licence v3.0",
        }),
      ).toHaveProperty(
        "href",
        "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      );
      expect(section.textContent).toContain(
        "Price Paid Data contains address data processed against Ordnance Survey’s AddressBase Premium product, which incorporates Royal Mail’s PAF® database (Address Data).",
      );
    });

    it("says when postcodes.io gave as many postcodes as it can, so the Search Area may have been cut short", async () => {
      withStatistics({
        postcodes: {
          searched: 100,
          limit: 100,
          truncated: true,
          reachMetres: 430,
        },
      });

      await overviewSays(
        "Search Area cut short. postcodes.io gives at most 100 postcodes, and gave that many, so the Search Area may have more. Only sales in the 100 postcodes nearest the Location, up to 430 m away, are counted.",
      );
    });

    it("says when there were no sales in the Search Area", async () => {
      withStatistics({ all: none });

      const section = await overviewSays(
        `No sales recorded in the Search Area from ${PERIOD}.`,
      );

      expect(within(section).queryAllByRole("table")).toEqual([]);
      expect(section.textContent).toContain("Contains HM Land Registry data");
    });

    it("says when there are no postcodes in the Search Area", async () => {
      withStatistics({
        all: none,
        postcodes: {
          searched: 0,
          limit: 100,
          truncated: false,
          reachMetres: null,
        },
      });

      await overviewSays(
        "There are no postcodes in the Search Area, so there are no sales to find.",
      );
    });

    describe("Energy Performance Certificates", () => {
      const EPC_HEADING = "Energy Performance Certificates";
      const epcStatistics: EpcStatistics = {
        byBand: [
          { band: "A", count: 0 },
          { band: "B", count: 4 },
          { band: "C", count: 10 },
          { band: "D", count: 12 },
          { band: "E", count: 6 },
          { band: "F", count: 2 },
          { band: "G", count: 1 },
        ],
        homes: 35,
        postcodes: { searched: 100, unanswered: 0 },
        sales: { lookedFor: 20, matched: 19 },
        pricePerSquareMetre: { count: 18, median: 1894, mean: 1904 },
      };
      const withEpc = (epc: PropertyLayerResponse["epc"]) =>
        stubPropertyBackend(() => Response.json({ ...propertyLayer, epc }));

      it("gives the homes by EPC rating in the Search Area's postcodes, and the sales' price per m², credited as the EPC licence asks (PRD FR-2.6, FR-10.1a)", async () => {
        withEpc({ status: "ok", statistics: epcStatistics });

        const section = await overviewSays(EPC_HEADING);

        expect(section.textContent).toContain(
          "35 homes in the 100 postcodes searched have an EPC.",
        );
        expect(tableRows(section, "Homes by EPC rating")).toEqual([
          ["Rating", "Homes", "Share"],
          ["A", "0", "0%"],
          ["B", "4", "11%"],
          ["C", "10", "29%"],
          ["D", "12", "34%"],
          ["E", "6", "17%"],
          ["F", "2", "6%"],
          ["G", "1", "3%"],
        ]);
        expect(section.textContent).toContain(
          "19 of 20 sales of houses and flats matched to an EPC. Price per m², from the 18 sales with a floor area: a median of £1,894 and a mean of £1,904.",
        );
        expect(section.textContent).toContain(
          "A sale is matched to the certificates in its postcode by its flat, house number or name and street, only where exactly one home's fit",
        );
        const credit = within(section).getByText(
          /^Energy Performance Certificate data from MHCLG's/,
        );
        expect(credit.textContent).toBe(
          "Energy Performance Certificate data from MHCLG's Get energy performance of buildings data, licensed under the Open Government Licence v3.0.",
        );
        expect(
          within(credit)
            .getAllByRole("link")
            .map((link) => link.getAttribute("href")),
        ).toEqual([
          "https://get-energy-performance-data.communities.gov.uk/",
          "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
        ]);
      });

      it("says which postcodes the EPC API didn't answer for, and when no sale has a floor area", async () => {
        withEpc({
          status: "ok",
          statistics: {
            ...epcStatistics,
            postcodes: { searched: 100, unanswered: 3 },
            pricePerSquareMetre: { count: 0, median: null, mean: null },
          },
        });

        const section = await overviewSays(EPC_HEADING);

        expect(section.textContent).toContain(
          "The EPC API didn't answer for 3 postcodes, whose homes are left out.",
        );
        expect(section.textContent).toContain(
          "None has a floor area to give a price per m².",
        );
      });

      it("reads Unavailable when the EPC API didn't answer, with the sales still there", async () => {
        withEpc({ status: "unavailable", statistics: null });

        const section = await overviewSays(EPC_HEADING);

        expect(section.textContent).toContain(
          "Unavailable. The EPC API didn't answer, so energy ratings and price per m² can't be shown for now.",
        );
        expect(section.textContent).toContain("2 sales in the Search Area");
        expect(
          within(section).queryByRole("table", { name: "Homes by EPC rating" }),
        ).toBeNull();
      });

      it("shows nothing about EPCs without EPC_API_KEY", async () => {
        withEpc(null);

        const section = await overviewSays("2 sales in the Search Area");

        expect(section.textContent).not.toMatch(
          /EPC|Energy Performance|per m²/,
        );
      });
    });

    it("reads Unavailable when Price Paid fails, and everything else still works", async () => {
      const unavailable: PropertyLayerResponse = {
        layer: "property",
        status: "unavailable",
        sources: [
          postcodesIo,
          { ...pricePaid, status: "unavailable", period: null },
        ],
        features: [],
        statistics: null,
        epc: null,
      };
      stubPropertyBackend(() => Response.json(unavailable));
      render(<App />);

      await searchFor("NG17 1AA");

      const section = await propertyOverview();
      await waitFor(() => {
        expect(propertyStatus()).toBe("Unavailable");
      });
      expect(section.textContent).toContain(
        "Unavailable. HM Land Registry Price Paid didn't answer",
      );
      expect(mapLayers()).toBe("");
      expect(screen.getByTestId("search-area-map").textContent).toBe(
        "53.123664,-1.264078 0.5 mile",
      );
    });

    it("hides the Layer from the map, keeping it in the URL and its statistics in the Overview", async () => {
      stubPropertyBackend(() => Response.json(propertyLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toBe("property: 2");
      });
      const user = userEvent.setup();

      await user.click(propertyToggle());

      expect(mapLayers()).toBe("");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&hidden=property",
      );
      expect((await propertyOverview()).textContent).toContain(
        "Detached houses1£173,000",
      );
    });
  });

  describe("the Demographics Layer", () => {
    const square = {
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [-1.266, 53.122],
            [-1.262, 53.122],
            [-1.262, 53.125],
            [-1.266, 53.125],
            [-1.266, 53.122],
          ] satisfies [number, number][],
        ],
      ],
    };

    /** The output area NG17 1AA is in, and a denser, younger one beside it. */
    const outputAreas: OutputAreaFeature[] = [
      {
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
        shape: square,
      },
      {
        id: "E00142550",
        location: { lat: 53.1251, lng: -1.2602 },
        distanceMetres: 310,
        lsoa: null,
        msoaCode: null,
        population: 410,
        households: 190,
        populationDensity: 9000,
        medianAge: 30,
        householdIncome: null,
        deprivationDecile: 9,
        overlap: 0.5,
        coversLocation: false,
        shape: square,
      },
    ];

    const demographicsLayer: DemographicsLayerResponse = {
      layer: "demographics",
      status: "ok",
      sources: [
        {
          id: "ons-output-areas",
          name: "ONS Open Geography",
          status: "ok",
          period: { from: "2021-12", to: "2021-12" },
        },
        {
          id: "ons-census-2021",
          name: "ONS Census 2021",
          status: "ok",
          period: { from: "2021-03-21", to: "2021-03-21" },
        },
        {
          id: "ons-income-estimates",
          name: "ONS small area income estimates",
          status: "ok",
          period: { from: "2023-03", to: "2023-03" },
        },
        {
          id: "indices-of-deprivation",
          name: "English Indices of Deprivation",
          status: "ok",
          period: { from: "2025-10-30", to: "2025-10-30" },
        },
      ],
      features: outputAreas,
      statistics: {
        outputAreas: 44,
        population: 9052,
        households: 3951,
        ageProfile: [
          { group: "under-15", population: 1649, percent: 18.3 },
          { group: "15-to-24", population: 1038, percent: 11.5 },
          { group: "25-to-44", population: 2327, percent: 25.8 },
          { group: "45-to-64", population: 2247, percent: 24.9 },
          { group: "65-and-over", population: 1773, percent: 19.6 },
        ],
        medianAge: 40.1,
        householdIncome: {
          averagePounds: 38890,
          msoas: 5,
          englandMedianPounds: 44091,
        },
        deprivation: {
          atLocation: {
            code: "E01027976",
            name: "Ashfield 005E",
            decile: 2,
            rank: 4630,
          },
          lowestDecile: 1,
          highestDecile: 10,
          lsoas: 14,
        },
      },
    };

    /** NG17 1AA, whose Demographics Layer the backend answers with `route`. */
    const stubDemographicsBackend = (route: (url: URL) => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/demographics": route,
      });

    const demographicsStatus = () =>
      document.getElementById("layer-demographics-status")?.textContent;

    const mapLayers = () => screen.getByTestId("map-layers").textContent;

    const demographicsOverview = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).findByRole("region", { name: "Demographics" });

    /** The legend's shades, as their labels. */
    const legend = () =>
      within(
        screen.getByRole("list", {
          name: /^Residents|^Median|^Average|^Index/,
        }),
      )
        .getAllByRole("listitem")
        .map(({ textContent }) => textContent);

    it("loads the Demographics Layer with the Search Area, and shades its output areas by population density", async () => {
      const fetchMock = stubDemographicsBackend(() =>
        Response.json(demographicsLayer),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      // 2,725 and 9,000 residents per km²: the second and the darkest shades.
      await waitFor(() => {
        expect(mapLayers()).toBe("demographics: 2 shaded #ec7d45 #76300b");
      });
      expect(demographicsStatus()).toBe("2 output areas");
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/area/demographics?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      );
      expect(
        screen.getByLabelText<HTMLSelectElement>("Shade output areas by").value,
      ).toBe("population-density");
      expect(legend()).toEqual([
        "Under 1,500",
        "1,500 to 3,500",
        "3,500 to 5,500",
        "5,500 to 8,500",
        "8,500 or more",
      ]);
    });

    it.each([
      [
        "Median age",
        "#ad4615 #f2a070",
        ["Under 34", "34 to 39", "39 to 45", "45 to 51", "51 or more"],
      ],
      [
        "Household income",
        "#f2a070 #9e9e9e",
        [
          "Under £43,000",
          "£43,000 to £50,000",
          "£50,000 to £57,500",
          "£57,500 to £67,500",
          "£67,500 or more",
          "No figure",
        ],
      ],
      [
        "Deprivation",
        "#76300b #f2a070",
        [
          "9 to 10 (least deprived)",
          "7 to 8",
          "5 to 6",
          "3 to 4",
          "1 to 2 (most deprived)",
        ],
      ],
    ])(
      "shades the output areas by %s when it is chosen, with its legend",
      async (measure, shades, labels) => {
        stubDemographicsBackend(() => Response.json(demographicsLayer));
        render(<App />);
        await searchFor("NG17 1AA");
        await waitFor(() => {
          expect(mapLayers()).toContain("demographics: 2 shaded");
        });

        await userEvent
          .setup()
          .selectOptions(
            screen.getByLabelText("Shade output areas by"),
            measure,
          );

        expect(mapLayers()).toBe(`demographics: 2 shaded ${shades}`);
        expect(legend()).toEqual(labels);
      },
    );

    it("gives the estimated population, households, median age, income, deprivation and age profile in the Location Overview, crediting its sources under the Open Government Licence", async () => {
      stubDemographicsBackend(() => Response.json(demographicsLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      const section = await demographicsOverview();

      await waitFor(() => {
        expect(section.textContent).toContain(
          "Estimated population: 9,052, in 3,951 households, from the 44 output areas reaching into the Search Area.",
        );
      });
      const text = section.textContent;
      expect(text).toContain("Median age: 40.1");
      expect(text).toContain(
        "Average household income: £38,890 a year, across the 5 MSOAs the Search Area reaches into, weighed by their households in it.",
      );
      expect(text).toContain(
        "Deprivation: The Location's LSOA, Ashfield 005E, is in decile 2 of 10 of the Index of Multiple Deprivation, where 1 is the most deprived 10% of LSOAs in England: it ranks 4,630, where 1 is the most deprived. The 14 LSOAs the Search Area reaches into are in deciles 1 to 10.",
      );
      const rows = [
        ...within(section)
          .getByRole("table", {
            name: "Estimated age profile of the Search Area",
          })
          .querySelectorAll("tr"),
      ].map((row) =>
        [...row.querySelectorAll("th, td")].map(
          ({ textContent }) => textContent,
        ),
      );
      expect(rows).toEqual([
        ["Age", "Residents", "Share"],
        ["Under 15", "1,649", "18.3%"],
        ["15 to 24", "1,038", "11.5%"],
        ["25 to 44", "2,327", "25.8%"],
        ["45 to 64", "2,247", "24.9%"],
        ["65 and over", "1,773", "19.6%"],
      ]);
      expect(text).toContain(
        "From ONS Open Geography (December 2021), ONS Census 2021 (21 March 2021), ONS small area income estimates (March 2023), English Indices of Deprivation (30 October 2025).",
      );
      expect(text).toContain(
        "Source: Office for National Statistics licensed under the Open Government Licence v3.0.",
      );
      expect(
        within(section).getByRole("link", {
          name: "Open Government Licence v3.0",
        }),
      ).toHaveProperty(
        "href",
        "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      );
      expect(text).toContain("counted in proportion to the share of it inside");
    });

    it("says to run pnpm data:prepare before the demographics are prepared, with no shading to choose", async () => {
      stubDemographicsBackend(() =>
        Response.json({
          ...demographicsLayer,
          status: "not-prepared",
          sources: demographicsLayer.sources.map((source) => ({
            ...source,
            status: "not-prepared",
            period: null,
          })),
          features: [],
          statistics: null,
        }),
      );
      render(<App />);
      await searchFor("NG17 1AA");
      const section = await demographicsOverview();

      await waitFor(() => {
        expect(section.textContent).toContain(
          "Not prepared. Run pnpm data:prepare to show this Layer.",
        );
      });
      expect(demographicsStatus()).toBe("Not prepared");
      expect(screen.queryByLabelText("Shade output areas by")).toBeNull();
    });

    it("takes the shading off the map with the Layer switched off", async () => {
      stubDemographicsBackend(() => Response.json(demographicsLayer));
      render(<App />);
      await searchFor("NG17 1AA");
      await waitFor(() => {
        expect(mapLayers()).toContain("demographics: 2 shaded");
      });

      await userEvent
        .setup()
        .click(screen.getByRole("checkbox", { name: "Demographics" }));

      expect(mapLayers()).toBe("");
      expect(screen.queryByLabelText("Shade output areas by")).toBeNull();
    });
  });

  describe("the Land Layer and the Land panel", () => {
    const square = {
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [-1.266, 53.122],
            [-1.262, 53.122],
            [-1.262, 53.125],
            [-1.266, 53.125],
            [-1.266, 53.122],
          ] satisfies [number, number][],
        ],
      ],
    };
    const ASHFIELD = { code: "E07000170", name: "Ashfield" };

    /** Two of Price Paid's sales of property of type Other near the field: one is land. */
    const unit: LandSale = {
      id: "559C5AD5-F565-AFE3-E063-4804A8C004A4",
      price: 380000,
      date: "2026-05-28",
      address: "UNIT 3, DRAKEHOUSE COURT, HAMILTON ROAD, SUTTON-IN-ASHFIELD",
      postcode: "NG17 5ES",
      location: { lat: 53.1236, lng: -1.2489 },
      distanceMetres: 1012,
    };
    const plot: LandSale = {
      id: "E073986C-2D52-2134-E053-6C04A8C0233B",
      price: 110000,
      date: "2022-02-11",
      address: "PLOT D, SIDINGS ROAD, NOTTINGHAM",
      postcode: "NG17 7JZ",
      location: { lat: 53.1124, lng: -1.2525 },
      distanceMetres: 512,
    };
    /** The newest two of 76 within 1 mile of the field, as listed. */
    const fieldSales: NearbyLandSales = {
      status: "ok",
      period: { from: "2021-10-09", to: "2026-10-08" },
      found: { count: 76, medianPrice: 207000, sales: [unit, plot] },
    };

    /**
     * The Planning Applications within 500 m of the field: a major scheme
     * approved on it, and one refused.
     */
    const fieldApplications: NearbyPlanningApplications = {
      status: "ok",
      provider: "PlanIt",
      withinMetres: 500,
      found: {
        count: 2,
        approved: 1,
        major: 1,
        estimatedHomes: 120,
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
    };

    /** A farm field, and a scrubby corner Possibly Unregistered, in a flood zone. */
    const field: LandOpportunityFeature = {
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
      inspirePolygons: [
        {
          inspireId: "64151457",
          share: 0.724,
          ownershipCategory: "other-registered",
        },
        {
          inspireId: "64151706",
          share: 0.003,
          ownershipCategory: "other-registered",
        },
      ],
      ownershipCategory: "other-registered",
      // An overseas company's title is matched to a polygon 9 m away.
      matchedTitles: [
        {
          titleNumber: "ZZ200001",
          propertyAddress: "Metal Craft Group, Sutton-in-Ashfield (NG17 7LE)",
          proprietorshipCategory: "Limited Company or Public Limited Company",
          ownershipCategory: "company",
          dataset: "ocod",
          sourceDate: "2026-10-02",
          matchedBy: "named",
          inspireId: "25709295",
          distanceMetres: 9,
        },
      ],
      constraints: [],
      floodZone: null,
      onListedBuildingOutline: false,
      estimatedHomes: 351,
      shape: square,
      nearbyLandSales: fieldSales,
      nearbyPlanningApplications: fieldApplications,
    };
    const corner: LandOpportunityFeature = {
      ...field,
      id: "E07000170-9",
      name: "Kirkby Corner",
      landUse: ["natural=scrub"],
      areaHectares: 0.2,
      areaAcres: 0.494,
      roadDistanceMetres: 30,
      inspireCoverage: 0.1,
      possiblyUnregistered: true,
      inspirePolygons: [
        {
          inspireId: "28861445",
          share: 0.1,
          ownershipCategory: "council-or-public-body",
        },
      ],
      ownershipCategory: "possibly-unregistered",
      matchedTitles: [],
      constraints: [{ type: "flood-zone", name: "Flood zone 3" }],
      floodZone: 3,
      estimatedHomes: 3,
      distanceMetres: 0,
    };

    const landLayer = (
      changes: Partial<LandLayerResponse> = {},
    ): LandLayerResponse => ({
      layer: "land",
      status: "ok",
      sources: [
        {
          id: "land-parcels",
          name: "Land Parcels",
          status: "ok",
          period: { from: "2026-10-08", to: "2026-10-08" },
        },
      ],
      scope: "search-area",
      sort: "area",
      filters: DEFAULT_LAND_FILTERS,
      landCoverageAreas: [ASHFIELD],
      notCovered: [],
      features: [field, corner],
      landUse: [
        { id: "way-123", landUse: "industrial", name: null, shape: square },
      ],
      statistics: {
        parcels: 3,
        count: 2,
        totalHectares: 19.72,
        possiblyUnregistered: 1,
        ownershipCategories: {
          company: 0,
          "council-or-public-body": 0,
          "other-registered": 1,
          "possibly-unregistered": 1,
        },
        estimatedHomes: 354,
        listed: 2,
        nearbyLandSales: {
          ...fieldSales,
          found: {
            count: 76,
            medianPrice: 207000,
            sales: [{ ...unit, distanceMetres: 640 }, plot],
          },
        },
      },
      ...changes,
    });

    const parcel: LandParcelResponse = {
      // A Land Opportunity is a Land Parcel, with its distance besides.
      parcel: field,
      inspirePolygons: [
        ...field.inspirePolygons.map((overlap) => ({
          ...overlap,
          distanceMetres: 0,
          shape: square,
        })),
        {
          inspireId: "25709295",
          share: 0,
          ownershipCategory: "company",
          distanceMetres: 9,
          shape: square,
        },
      ],
      // Every land sale within 1 mile of it, here only two.
      nearbyLandSales: {
        ...fieldSales,
        found: { count: 2, medianPrice: 245000, sales: [unit, plot] },
      },
      sources: [],
    };

    /**
     * NG17 1AA, whose Land Layer the backend answers with `layer`, and whose
     * other searches with only the corner, across Ashfield if asked.
     */
    const stubLandBackend = (layer: LandLayerResponse = landLayer()) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/land": () => Response.json(layer),
        "/api/land": (url) => {
          // Land sales aren't looked for across a whole Land Coverage Area.
          const across = url.searchParams.get("scope") === "land-coverage-area";
          return Response.json(
            landLayer({
              scope: across ? "land-coverage-area" : "search-area",
              features: [
                {
                  ...corner,
                  nearbyLandSales: across ? null : fieldSales,
                  nearbyPlanningApplications: across ? null : fieldApplications,
                },
              ],
              statistics: {
                parcels: 3,
                count: 1,
                totalHectares: 0.2,
                possiblyUnregistered: 1,
                ownershipCategories: {
                  company: 0,
                  "council-or-public-body": 0,
                  "other-registered": 0,
                  "possibly-unregistered": 1,
                },
                estimatedHomes: 3,
                listed: 1,
                nearbyLandSales: across ? null : fieldSales,
              },
            }),
          );
        },
        "/api/land/E07000170-2": () => Response.json(parcel),
      });

    const landStatus = () =>
      document.getElementById("layer-land-status")?.textContent;

    const mapLayers = () => screen.getByTestId("map-layers").textContent;

    const landOverview = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).findByRole("region", { name: "Land" });

    const landPanel = () =>
      screen.getByRole("complementary", { name: "Land Opportunities" });

    /** The Land Opportunities the Land panel lists, as their buttons say. */
    const listed = () =>
      within(
        within(landPanel()).getByRole("list", { name: "Land Opportunities" }),
      )
        .getAllByRole("button")
        .map(({ textContent }) => textContent);

    /** Each `/api/land` search's query, in the order made. */
    const searches = (fetchMock: ReturnType<typeof stubBackend>) =>
      fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => url.startsWith("/api/land?"))
        .map((url) => new URL(url, "http://localhost").searchParams);

    const openLandPanel = async () => {
      await userEvent.setup().click(screen.getByRole("tab", { name: "Land" }));
      await within(landPanel()).findByRole("list", {
        name: "Land Opportunities",
      });
    };

    it("loads the Land Layer with the Search Area, drawing its Land Opportunities on the map and counting them in the Overview with FR-5.7's wording", async () => {
      const fetchMock = stubLandBackend();
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(landStatus()).toBe("2 Land Opportunities");
      });
      expect(mapLayers()).toContain("land: 2");
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/area/land?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
      );
      const overview = await landOverview();
      expect(overview.textContent).toContain(
        "Land Opportunities2 in the Search Area, of 3 Land Parcels",
      );
      expect(overview.textContent).toContain("Total area19.72 ha");
      expect(overview.textContent).toContain("Possibly Unregistered1");
      expect(overview.textContent).toContain(
        "Estimated capacityAbout 354 homes",
      );
      expect(overview.textContent).toContain(LAND_OPPORTUNITY_WORDING);
      expect(overview.textContent).toContain(INSPIRE_FREEHOLD_NOTE);
    });

    it.each([
      ["the toggle", () => landStatus()],
      ["the Overview", async () => (await landOverview()).textContent],
    ])(
      "says Land data not prepared for this area in %s, outside every Land Coverage Area",
      async (_where, text) => {
        stubLandBackend(
          landLayer({
            status: "not-prepared",
            landCoverageAreas: [],
            notCovered: [{ code: "E07000174", name: "Mansfield" }],
            features: [],
            landUse: [],
            statistics: null,
          }),
        );
        render(<App />);

        await searchFor("NG17 1AA");

        await waitFor(async () => {
          expect(await text()).toContain(
            "Land data not prepared for this area",
          );
        });
      },
    );

    it("says Land data not prepared for this area in the Land panel, saying how to add it", async () => {
      stubLandBackend(
        landLayer({
          status: "not-prepared",
          landCoverageAreas: [],
          notCovered: [{ code: "E07000174", name: "Mansfield" }],
          features: [],
          landUse: [],
          statistics: null,
        }),
      );
      render(<App />);
      await searchFor("NG17 1AA");

      await userEvent.setup().click(screen.getByRole("tab", { name: "Land" }));

      await waitFor(() => {
        expect(landPanel().textContent).toContain(
          'Land data not prepared for this area. Add Mansfield with pnpm data:prepare --area "Mansfield".',
        );
      });
      expect(landPanel().textContent).toContain(LAND_OPPORTUNITY_WORDING);
      expect(
        within(landPanel()).queryByRole("form", {
          name: "Find Land Opportunities",
        }),
      ).toBeNull();
    });

    it("lists them in the Land panel, the largest first, with their tags, FR-5.7's wording and FR-5.8's note", async () => {
      stubLandBackend();
      render(<App />);
      await searchFor("NG17 1AA");

      await openLandPanel();

      expect(listed()).toEqual([
        "48.2 acres (19.5 ha)Farmland, Other registered (indicative), road 10 m, about 351 homes, 140 m from the Location",
        "Kirkby Corner, 0.494 acres (0.2 ha)Scrub, Possibly Unregistered (indicative), road 30 m, flood zone 3, about 3 homes, 0 m from the Location",
      ]);
      expect(landPanel().textContent).toContain(
        "2 Land Opportunities in the Search Area, of 3 Land Parcels: 19.72 ha in all, 1 Possibly Unregistered, room for about 354 homes, estimated.",
      );
      expect(landPanel().textContent).toContain(LAND_OPPORTUNITY_WORDING);
      expect(landPanel().textContent).toContain(INSPIRE_FREEHOLD_NOTE);
      expect(
        screen.queryByRole("complementary", { name: "Location Overview" }),
      ).toBeNull();
    });

    it.each([
      [
        "looking across the whole Land Coverage Area",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.click(within(landPanel()).getByLabelText("Across Ashfield")),
        "scope",
        "land-coverage-area",
      ],
      [
        "listing those nearest a road first",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.selectOptions(
            within(landPanel()).getByLabelText("Order"),
            "Nearest a road first",
          ),
        "sort",
        "road-distance",
      ],
      [
        "listing those with room for the most homes first",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.selectOptions(
            within(landPanel()).getByLabelText("Order"),
            "Most homes first",
          ),
        "sort",
        "capacity",
      ],
      [
        "a smallest area",
        async (user: ReturnType<typeof userEvent.setup>) => {
          const input = within(landPanel()).getByLabelText(
            "Smallest area, in acres",
          );
          await user.clear(input);
          await user.type(input, "2.5");
        },
        "minAcres",
        "2.5",
      ],
      [
        "a largest area",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.type(
            within(landPanel()).getByLabelText("Largest area, in acres"),
            "10",
          ),
        "maxAcres",
        "10",
      ],
      [
        "a nearer road",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.selectOptions(
            within(landPanel()).getByLabelText("Furthest from a road"),
            "10 m",
          ),
        "maxRoadMetres",
        "10",
      ],
      [
        "any distance from a road",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.selectOptions(
            within(landPanel()).getByLabelText("Furthest from a road"),
            "Any distance",
          ),
        "maxRoadMetres",
        "any",
      ],
      [
        "flood zone 1 only",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.selectOptions(
            within(landPanel()).getByLabelText("Highest flood zone"),
            "1 only: not in flood zone 2 or 3",
          ),
        "maxFloodZone",
        "1",
      ],
      [
        "flood zone 2 at most",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.selectOptions(
            within(landPanel()).getByLabelText("Highest flood zone"),
            "Up to 2",
          ),
        "maxFloodZone",
        "2",
      ],
      [
        "Possibly Unregistered land only",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.click(
            within(landPanel()).getByLabelText("Possibly Unregistered only"),
          ),
        "possiblyUnregisteredOnly",
        "true",
      ],
      [
        "land on a listed building's outline kept",
        async (user: ReturnType<typeof userEvent.setup>) =>
          user.click(
            within(landPanel()).getByLabelText(
              "Leave out land on a listed building's outline",
            ),
          ),
        "excludeListedBuildingOutlines",
        "false",
      ],
      [
        "only company-owned and council land, indicatively",
        async (user: ReturnType<typeof userEvent.setup>) => {
          await user.click(within(landPanel()).getByLabelText("Company-owned"));
          await user.click(
            within(landPanel()).getByLabelText("Council or public-body owned"),
          );
        },
        "ownershipCategories",
        "company,council-or-public-body",
      ],
      [
        "flood zones and conservation areas left out",
        async (user: ReturnType<typeof userEvent.setup>) => {
          await user.click(within(landPanel()).getByLabelText("Flood zones"));
          await user.click(
            within(landPanel()).getByLabelText("Conservation areas"),
          );
        },
        "excludeConstraints",
        "flood-zone,conservation-area",
      ],
    ])(
      "finds them again with %s",
      async (_change, change, parameter, value) => {
        const fetchMock = stubLandBackend();
        render(<App />);
        await searchFor("NG17 1AA");
        await openLandPanel();
        expect(searches(fetchMock)).toEqual([]);

        await change(userEvent.setup());

        await waitFor(() => {
          expect(listed()).toHaveLength(1);
        });
        const last = searches(fetchMock).at(-1);
        expect(last?.get(parameter)).toBe(value);
        expect(last?.get("lat")).toBe("53.123664");
        expect(last?.get("postcode")).toBe("NG17 1AA");
        // The map draws what the search found, and the toggle counts it.
        expect(mapLayers()).toContain("land: 1");
        expect(landStatus()).toBe("1 Land Opportunity");
      },
    );

    it("puts back FR-5.3's defaults, and the Land Layer as it loaded", async () => {
      const fetchMock = stubLandBackend();
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");
      await openLandPanel();
      await user.click(
        within(landPanel()).getByLabelText("Possibly Unregistered only"),
      );
      await waitFor(() => {
        expect(listed()).toHaveLength(1);
      });

      await user.click(
        within(landPanel()).getByRole("button", {
          name: "Reset to the defaults",
        }),
      );

      expect(listed()).toHaveLength(2);
      expect(searches(fetchMock)).toHaveLength(1);
      expect(
        within(landPanel()).getByLabelText<HTMLInputElement>(
          "Possibly Unregistered only",
        ).checked,
      ).toBe(false);
      expect(
        within(landPanel()).getByLabelText<HTMLInputElement>(
          "Leave out land on a listed building's outline",
        ).checked,
      ).toBe(true);
      expect(
        within(landPanel()).getByLabelText<HTMLSelectElement>(
          "Furthest from a road",
        ).value,
      ).toBe("50");
    });

    it("shows a Land Opportunity chosen with its tags, the INSPIRE Index Polygons that overlap it and HM Land Registry's ownership checks", async () => {
      const fetchMock = stubLandBackend();
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");
      await openLandPanel();

      await user.click(
        within(landPanel()).getByRole("button", { name: /^48\.2 acres/ }),
      );

      const chosen = await within(landPanel()).findByRole("region", {
        name: "Land Opportunity: 48.2 acres (19.5 ha)",
      });
      expect(
        within(chosen)
          .getAllByRole("listitem")
          .map(({ textContent }) => textContent),
      ).toEqual(
        expect.arrayContaining([
          "Farmland",
          "INSPIRE Index Polygons cover 73% of it",
          "Nearest road 10 m away",
          "Flood zone 1",
          "No Planning Constraints recorded",
          "Room for about 351 homes, estimated",
        ]) as unknown,
      );
      await waitFor(() => {
        expect(
          within(
            within(chosen).getByRole("list", {
              name: "INSPIRE Index Polygons that overlap it",
            }),
          )
            .getAllByRole("listitem")
            .map(({ textContent }) => textContent),
        ).toEqual([
          "INSPIRE ID 64151457: 72% of it, Other registered (indicative)",
          "INSPIRE ID 64151706: under 1% of it, Other registered (indicative)",
        ]);
      });
      expect(
        within(chosen)
          .getAllByRole("link")
          .map((link) => [link.textContent, link.getAttribute("href")]),
      ).toEqual([
        // Price Paid's licence, which its land sales are under.
        [
          "Open Government Licence v3.0",
          "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
        ],
        [
          "HM Land Registry: Search the register",
          "https://www.gov.uk/search-property-information-land-registry",
        ],
        [
          "HM Land Registry: Search the index map",
          "https://www.gov.uk/get-information-about-property-and-land/search-the-index-map",
        ],
      ]);
      expect(chosen.textContent).toContain(LAND_OPPORTUNITY_WORDING);
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/land/E07000170-2",
      );
    });

    it("asks for the Land Layer again while the Planning Applications near its Land Opportunities are queued, until they come", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let answers = 0;
      const queuedField = {
        ...field,
        nearbyPlanningApplications: {
          ...fieldApplications,
          status: "queued" as const,
          found: null,
        },
      };
      const fetchMock = stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/land": () =>
          Response.json(
            landLayer(answers++ < 1 ? { features: [queuedField] } : {}),
          ),
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<App />);
      await searchFor("NG17 1AA");
      await openLandPanel();
      const landRequests = () =>
        fetchMock.mock.calls.filter(([url]) =>
          url.startsWith("/api/area/land?"),
        ).length;

      await user.click(
        await within(landPanel()).findByRole("button", {
          name: /^48\.2 acres/,
        }),
      );
      const chosen = await within(landPanel()).findByRole("region", {
        name: "Land Opportunity: 48.2 acres (19.5 ha)",
      });
      expect(chosen.textContent).toContain(
        "Nearby development activity: loading planning applications (rate-limited)",
      );
      expect(landRequests()).toBe(1);

      await act(() =>
        vi.advanceTimersByTimeAsync(PLANNING_APPLICATIONS_RETRY_MS),
      );
      await waitFor(() => {
        expect(landRequests()).toBe(2);
      });
      await act(() =>
        vi.advanceTimersByTimeAsync(3 * PLANNING_APPLICATIONS_RETRY_MS),
      );
      expect(landRequests()).toBe(2);
    });

    it("gives a Land Opportunity chosen its nearby development activity: the Planning Applications within 500 m, the approved and major ones listed", async () => {
      stubLandBackend();
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");
      await openLandPanel();

      await user.click(
        within(landPanel()).getByRole("button", { name: /^48\.2 acres/ }),
      );

      const chosen = await within(landPanel()).findByRole("region", {
        name: "Land Opportunity: 48.2 acres (19.5 ha)",
      });
      expect(
        within(chosen)
          .getAllByRole("listitem")
          .map(({ textContent }) => textContent),
      ).toContain(
        "Nearby development activity: 2 Planning Applications within 500 m in the Search Area, 1 approved and 1 major, for about 120 new homes approved or pending, estimated",
      );
      expect(
        within(
          within(chosen).getByRole("list", {
            name: "Approved and major Planning Applications within 500 m, nearest first",
          }),
        )
          .getAllByRole("listitem")
          .map(({ textContent }) => textContent),
      ).toEqual([
        "Land at Sutton Parkway: Erection of 120 dwellings (approved, major application, about 120 new homes, estimated), on this land",
      ]);
      expect(chosen.textContent).toContain(
        "Nearby development activity counts the Planning Applications received in the Search Area in the last 3 years, so none beyond its edge.",
      );
    });

    it("gives the newest land sales within 1 mile of them in the Overview, with price and date, marked indicative: may not be land, and credits Price Paid", async () => {
      stubLandBackend();
      render(<App />);
      await searchFor("NG17 1AA");

      const overview = await landOverview();
      await waitFor(() => {
        expect(overview.textContent).toContain(
          "Nearby land sales, indicative76 land sales within 1 mile since 9 October 2021, indicative: may not be land. Median £207,000.",
        );
      });
      expect(
        within(
          within(overview).getByRole("list", {
            name: "Land sales within 1 mile since 9 October 2021, newest first, indicative: may not be land",
          }),
        )
          .getAllByRole("listitem")
          .map(({ textContent }) => textContent),
      ).toEqual([
        "£380,000 on 28 May 2026: UNIT 3, DRAKEHOUSE COURT, HAMILTON ROAD, SUTTON-IN-ASHFIELD, NG17 5ES, 640 m from the nearest Land Opportunity",
        "£110,000 on 11 February 2022: PLOT D, SIDINGS ROAD, NOTTINGHAM, NG17 7JZ, 510 m from the nearest Land Opportunity",
        "and 74 more, older",
      ]);
      expect(overview.textContent).toContain(LAND_SALES_NOTE);
      expect(overview.textContent).toContain(
        "Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0. Price Paid Data contains address data processed against Ordnance Survey’s AddressBase Premium product",
      );
    });

    it.each([
      [
        "unavailable",
        "Land sales within 1 mile unavailable: HM Land Registry's Price Paid didn't answer.",
      ],
      [
        "not-prepared",
        "Land sales within 1 mile not prepared. Run pnpm data:prepare again to prepare the postcodes they are found in.",
      ],
    ] as const)(
      "says land sales are %s, and still gives the Land Opportunities",
      async (status, said) => {
        const layer = landLayer();
        const unknown = { ...fieldSales, status, found: null };
        stubLandBackend({
          ...layer,
          features: [{ ...field, nearbyLandSales: unknown }],
          statistics: layer.statistics && {
            ...layer.statistics,
            nearbyLandSales: unknown,
          },
        });
        render(<App />);
        await searchFor("NG17 1AA");

        const overview = await landOverview();
        await waitFor(() => {
          expect(overview.textContent).toContain(said);
        });
        expect(overview.textContent).toContain(
          "Land Opportunities2 in the Search Area",
        );
        expect(
          within(overview).queryByRole("list", { name: /^Land sales/ }),
        ).toBeNull();
      },
    );

    it("shows every land sale within 1 mile of a Land Opportunity chosen in the Land panel, and says across a whole Land Coverage Area that they are found for the one chosen", async () => {
      const user = userEvent.setup();
      stubLandBackend();
      render(<App />);
      await searchFor("NG17 1AA");
      await openLandPanel();
      expect(landPanel().textContent).toContain(
        "Nearby land sales: 76 land sales within 1 mile since 9 October 2021, indicative: may not be land. Median £207,000.",
      );

      await user.click(
        within(landPanel()).getByRole("button", { name: /^48\.2 acres/ }),
      );

      const chosen = await within(landPanel()).findByRole("region", {
        name: "Land Opportunity: 48.2 acres (19.5 ha)",
      });
      const sales = await within(chosen).findByRole("list", {
        name: "Land sales within 1 mile since 9 October 2021, newest first, indicative: may not be land",
      });
      expect(
        within(sales)
          .getAllByRole("listitem")
          .map(({ textContent }) => textContent),
      ).toEqual([
        "£380,000 on 28 May 2026: UNIT 3, DRAKEHOUSE COURT, HAMILTON ROAD, SUTTON-IN-ASHFIELD, NG17 5ES, 1.0 km away",
        "£110,000 on 11 February 2022: PLOT D, SIDINGS ROAD, NOTTINGHAM, NG17 7JZ, 510 m away",
      ]);
      expect(chosen.textContent).toContain(
        "2 land sales within 1 mile since 9 October 2021, indicative: may not be land. Median £245,000.",
      );
      expect(chosen.textContent).toContain(LAND_SALES_NOTE);

      await user.click(
        within(landPanel()).getByRole("button", { name: "Back to the list" }),
      );
      await user.click(
        within(landPanel()).getByRole("radio", { name: "Across Ashfield" }),
      );
      await waitFor(() => {
        expect(landPanel().textContent).toContain(
          "Nearby land sales: Land sales within 1 mile are found for the Land Opportunities in the Search Area, and for the one chosen in the Land panel.",
        );
      });
    });

    it("counts the Land Opportunities in each indicative Ownership Category, in the Overview and the Land panel, coloured as the map draws them", async () => {
      stubLandBackend();
      render(<App />);
      await searchFor("NG17 1AA");

      const overview = await landOverview();
      const counts = await within(overview).findByRole("list", {
        name: "By Ownership Category",
      });
      expect(
        within(counts)
          .getAllByRole("listitem")
          .map(({ textContent }) => textContent),
      ).toEqual([
        "Company-owned: 0",
        "Council or public-body owned: 0",
        "Other registered: 1",
        "Possibly Unregistered: 1",
      ]);
      expect(overview.textContent).toContain(OWNERSHIP_CATEGORY_NOTE);

      await openLandPanel();
      expect(
        within(landPanel()).getByRole("list", { name: "By Ownership Category" })
          .textContent,
      ).toBe(counts.textContent);
      const buttons = within(
        within(landPanel()).getByRole("list", { name: "Land Opportunities" }),
      ).getAllByRole("button");
      expect(
        buttons.map((button) => [
          button.dataset.ownershipCategory,
          button.style.borderLeftColor,
        ]),
      ).toEqual([
        ["other-registered", "rgb(130, 119, 23)"],
        ["possibly-unregistered", "rgb(230, 81, 0)"],
      ]);
    });

    it("shows a chosen Land Opportunity's indicative Ownership Category, the titles matched in and around it by their addresses, and HM Land Registry's statement", async () => {
      stubLandBackend();
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");
      await openLandPanel();

      await user.click(
        within(landPanel()).getByRole("button", { name: /^48\.2 acres/ }),
      );

      const chosen = await within(landPanel()).findByRole("region", {
        name: "Land Opportunity: 48.2 acres (19.5 ha)",
      });
      expect(chosen.textContent).toContain(
        "Ownership Category Other registered (indicative)",
      );
      expect(
        within(
          within(chosen).getByRole("list", {
            name: "Titles matched in and around it",
          }),
        )
          .getAllByRole("listitem")
          .map(({ textContent }) => textContent),
      ).toEqual([
        "Metal Craft Group, Sutton-in-Ashfield (NG17 7LE): title ZZ200001, Limited Company or Public Limited Company (overseas companies data), Company-owned (indicative), 10 m away",
      ]);
      expect(chosen.textContent).toContain(
        "Information produced by HM Land Registry. © Crown copyright 2026. UK and overseas companies that own property in England and Wales, as at 2 October 2026.",
      );
      expect(chosen.textContent).toContain(OWNERSHIP_CATEGORY_NOTE);
      // The polygon around it, which a title is matched to, isn't listed as overlapping it.
      await waitFor(() => {
        expect(
          within(chosen).getByRole("list", {
            name: "INSPIRE Index Polygons that overlap it",
          }).textContent,
        ).not.toContain("25709295");
      });
    });

    it("falls back to Possibly Unregistered or registered only without CCOD and OCOD, saying how to add them, with no Ownership Category to filter by", async () => {
      const uncategorised = (opportunity: LandOpportunityFeature) => ({
        ...opportunity,
        inspirePolygons: opportunity.inspirePolygons.map((polygon) => ({
          ...polygon,
          ownershipCategory: null,
        })),
        ownershipCategory: null,
        matchedTitles: [],
      });
      const layer = landLayer();
      stubLandBackend({
        ...layer,
        features: [uncategorised(field), uncategorised(corner)],
        statistics: layer.statistics && {
          ...layer.statistics,
          ownershipCategories: null,
        },
      });
      render(<App />);
      await searchFor("NG17 1AA");

      const overview = await landOverview();
      await waitFor(() => {
        expect(overview.textContent).toContain(
          "Ownership Categories, indicativeNot prepared, so land is only Possibly Unregistered or registered. Set LAND_REGISTRY_DATA_API_KEY in .env and run pnpm data:prepare to add them from HM Land Registry's CCOD and OCOD.",
        );
      });
      await openLandPanel();
      expect(listed()).toEqual([
        "48.2 acres (19.5 ha)Farmland, road 10 m, about 351 homes, 140 m from the Location",
        "Kirkby Corner, 0.494 acres (0.2 ha)Scrub, Possibly Unregistered, road 30 m, flood zone 3, about 3 homes, 0 m from the Location",
      ]);
      expect(within(landPanel()).queryByLabelText("Company-owned")).toBeNull();
      expect(
        within(landPanel()).getByRole("list", { name: "Land Opportunities" })
          .textContent,
      ).not.toContain("indicative");
    });
  });

  describe("the Scout Mode", () => {
    const TRANSPORT_SCORE = 88;
    const PROPERTY_ACTIVITY_SCORE = 24;

    /** Scores Transport and Property activity, weighed by the mode asked for. */
    const scoresIn = (url: URL): ScoresResponse => {
      const mode = url.searchParams.get("mode") ?? "general";
      const { weights } = MODES.modes.find(({ id }) => id === mode) ?? {
        weights: SCOUT_MODE_WEIGHTS,
      };
      const total = weights.transport + weights["property-activity"];
      const counted = (
        [
          ["transport", TRANSPORT_SCORE],
          ["property-activity", PROPERTY_ACTIVITY_SCORE],
        ] as const
      ).map(([id, score]) => ({
        id,
        score,
        weight: weights[id],
        share: Math.round((weights[id] / total) * 1000) / 10,
        points: Math.round((score * weights[id] * 10) / total) / 10,
      }));
      return {
        mode,
        categories: [],
        location: {
          score: Math.round(
            counted.reduce((sum, { points }) => sum + points, 0),
          ),
          counted,
          leftOut: [],
        },
      };
    };

    const highlightsIn = (url: URL): HighlightsResponse => {
      const mode = url.searchParams.get("mode") ?? "general";
      return {
        mode,
        highlights:
          mode === "investment"
            ? [
                {
                  rule: "prices-rising",
                  level: "good",
                  text: "Median price up 13.8% on a year before",
                  layer: "property",
                },
              ]
            : [
                {
                  rule: "park-nearby",
                  level: "good",
                  text: "Park 100 m away",
                  layer: "green-space",
                },
              ],
        leftOut: [],
      };
    };

    const stubModesBackend = (
      routes: Record<string, (url: URL) => Response> = {},
    ) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/scores": (url) => Response.json(scoresIn(url)),
        "/api/highlights": (url) => Response.json(highlightsIn(url)),
        ...routes,
      });

    const modeSelect = () =>
      screen.getByLabelText<HTMLSelectElement>("Scout Mode");

    const chooseMode = async (name: string) => {
      await userEvent.setup().selectOptions(modeSelect(), name);
    };

    const scoresSection = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).getByRole("region", { name: "Scores beta" });

    /** The Location Score's summary, once it shows. */
    const locationScore = async () =>
      (
        await within(scoresSection()).findByText("Location Score", {
          selector: "summary .score-name",
        })
      ).closest("summary")?.textContent;

    const highlightTexts = async () =>
      within(
        await within(
          screen.getByRole("region", { name: "What you need to know" }),
        ).findByRole("list", { name: "Highlights" }),
      )
        .getAllByRole("button")
        .map((button) => button.querySelector(".highlight-text")?.textContent);

    it("offers the backend's Scout Modes, General first and chosen, with the question it answers", async () => {
      stubModesBackend();
      render(<App />);

      await waitFor(() => {
        expect(modeSelect().disabled).toBe(false);
      });
      expect(
        [...modeSelect().options].map(({ value, text }) => [value, text]),
      ).toEqual([
        ["general", "General"],
        ["investment", "Investment"],
        ["development", "Development"],
      ]);
      expect(modeSelect().value).toBe("general");
      expect(
        screen.getByRole("combobox", {
          name: "Scout Mode",
          description: "What is it like here?",
        }),
      ).toBe(modeSelect());
      // A long name is cut short in the header, so it is given whole as the title.
      expect(modeSelect().title).toBe("General");
      await chooseMode("Development");
      expect(modeSelect().title).toBe("Development");
    });

    it("weighs the Location Score again in the Scout Mode chosen, with its Highlights, loading nothing else again", async () => {
      const fetchMock = stubModesBackend();
      render(<App />);
      await searchFor("NG17 1AA");
      // (88×15 + 24×10) ÷ 25 = 62.4
      expect(await locationScore()).toBe("Location Score 62/100 beta");
      expect(await highlightTexts()).toEqual(["Park 100 m away"]);
      fetchMock.mockClear();

      await chooseMode("Investment");

      // (88×15 + 24×25) ÷ 40 = 48
      await waitFor(async () => {
        expect(await locationScore()).toBe("Location Score 48/100 beta");
      });
      const table = within(scoresSection()).getByRole("table", {
        name: "How the Location Score is weighed, with the Investment Scout Mode's weights",
      });
      expect(
        within(table)
          .getAllByRole("row")
          .map((row) => row.textContent),
      ).toEqual([
        "CategoryScoreWeightSharePoints",
        "Transport881537.5%33",
        "Property activity242562.5%15",
        "Location Score48",
      ]);
      expect(await highlightTexts()).toEqual([
        "Median price up 13.8% on a year before",
      ]);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "/api/scores?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA&mode=investment",
        "/api/highlights?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA&mode=investment",
      ]);
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment",
      );
      expect(modeSelect().value).toBe("investment");
      expect(
        within(scoresSection()).getByText(
          "Scout Mode: Should I invest in property here?",
          { exact: false },
        ).textContent,
      ).toBe("Investment Scout Mode: Should I invest in property here?");
    });

    it("keeps the Scout Mode when the Search Area changes", async () => {
      const fetchMock = stubModesBackend();
      render(<App />);
      await searchFor("NG17 1AA");
      await locationScore();
      await chooseMode("Investment");
      fetchMock.mockClear();

      await chooseRadius(1);

      await waitFor(() => {
        expect(mapText()).toBe("53.123664,-1.264078 1 mile");
      });
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
        withLayers(
          "/api/area?lat=53.123664&lng=-1.264078&radius=1&postcode=NG17+1AA",
          "investment",
        ),
      );
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=1&mode=investment",
      );
    });

    it("opens a shared URL in its Scout Mode", async () => {
      const fetchMock = stubModesBackend();

      openAt("/?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment");

      await screen.findByText("53.123664,-1.264078 0.5 mile");
      expect(await locationScore()).toBe("Location Score 48/100 beta");
      await waitFor(() => {
        expect(modeSelect().value).toBe("investment");
      });
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        ...withLayers(
          "/api/area?lat=53.123664&lng=-1.264078&radius=0.5",
          "investment",
        ),
        "/api/modes",
        "/api/coverage",
        "/api/street-view",
        "/api/explain",
      ]);
    });

    it("puts a Scout Mode the backend doesn't have back to General, correcting the URL", async () => {
      stubModesBackend();

      openAt("/?lat=53.123664&lng=-1.264078&radius=0.5&mode=business-cafe");
      await screen.findByText("53.123664,-1.264078 0.5 mile");

      await waitFor(() => {
        expect(window.location.search).toBe(
          "?lat=53.123664&lng=-1.264078&radius=0.5",
        );
      });
      expect(modeSelect().value).toBe("general");
      expect(await locationScore()).toBe("Location Score 62/100 beta");
      expect(await highlightTexts()).toEqual(["Park 100 m away"]);
    });

    it("goes back to the previous Scout Mode, loading only its scores and Highlights", async () => {
      const fetchMock = stubModesBackend();
      render(<App />);
      await searchFor("NG17 1AA");
      await locationScore();
      await chooseMode("Investment");
      await waitFor(async () => {
        expect(await locationScore()).toBe("Location Score 48/100 beta");
      });
      fetchMock.mockClear();

      act(() => {
        window.history.back();
      });

      await waitFor(async () => {
        expect(await locationScore()).toBe("Location Score 62/100 beta");
      });
      expect(modeSelect().value).toBe("general");
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5",
      );
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "/api/scores?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA&mode=general",
        "/api/highlights?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA&mode=general",
      ]);
      // The postcode searched for is still named.
      expect(
        within(
          screen.getByRole("complementary", { name: "Location Overview" }),
        ).getByText("NG17 1AA"),
      ).toBeTruthy();
    });

    it("marks the Layers the Scout Mode highlights, in the Layers panel and the Overview", async () => {
      stubModesBackend();
      render(<App />);
      await searchFor("NG17 1AA");
      await locationScore();
      const highlighted = () =>
        [
          ...document.querySelectorAll(".layer-toggle[data-highlighted] input"),
        ].map((input) => input.id);
      expect(highlighted()).toEqual([]);

      await chooseMode("Investment");

      expect(highlighted()).toEqual(["layer-planning", "layer-property"]);
      const toggles = screen.getByRole("group", { name: "Layers" });
      expect(
        within(toggles).getAllByText(
          "Highlighted by the Investment Scout Mode",
        ),
      ).toHaveLength(2);
      const overview = screen.getByRole("complementary", {
        name: "Location Overview",
      });
      for (const name of ["Planning", "Property"]) {
        expect(
          within(within(overview).getByRole("region", { name })).getByText(
            "Highlighted by the Investment Scout Mode",
          ),
        ).toBeTruthy();
      }
      expect(
        within(
          within(overview).getByRole("region", { name: "Crime" }),
        ).queryByText("Highlighted by the Investment Scout Mode"),
      ).toBeNull();

      // Development highlights the Land Layer too (PRD FR-4.3a), in the
      // Layers panel, the Overview and the Land panel.
      await chooseMode("Development");

      expect(highlighted()).toEqual(["layer-planning", "layer-land"]);
      expect(
        within(toggles).getAllByText(
          "Highlighted by the Development Scout Mode",
        ),
      ).toHaveLength(2);
      expect(
        within(
          within(overview).getByRole("region", { name: "Land" }),
        ).getByText("Highlighted by the Development Scout Mode"),
      ).toBeTruthy();
      expect(
        within(
          screen.getByRole("complementary", {
            name: "Land Opportunities",
            hidden: true,
          }),
        ).getByText("Highlighted by the Development Scout Mode"),
      ).toBeTruthy();
    });

    it("can't be changed while the Scout Modes are unavailable, and everything else still works", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      stubModesBackend({
        "/api/modes": () => Response.json({ error: "Down" }, { status: 500 }),
      });
      render(<App />);

      await waitFor(() => {
        expect(modeSelect().textContent).toBe("Unavailable");
      });
      expect(modeSelect().disabled).toBe(true);
      await searchFor("NG17 1AA");
      expect(await locationScore()).toBe("Location Score 62/100 beta");
    });
  });

  describe("the scores", () => {
    const transport: CategoryScore = {
      id: "transport",
      layer: "transport",
      status: "ok",
      score: 88,
      breakdown: [
        {
          input: "Distance to the nearest railway station",
          value: 1_628,
          unit: "m",
          rule: "800 m or less: 60 points, falling in proportion to 0 at 5 km or more.",
          points: 48.2,
        },
        {
          input: "Bus stops in the Search Area",
          value: 58,
          unit: null,
          rule: "4 points each, up to 10 stops: 40 points.",
          points: 40,
        },
      ],
    };
    const planningFreedom: CategoryScore = {
      id: "planning-freedom",
      layer: "planning",
      status: "ok",
      score: 80,
      breakdown: [
        {
          input: "Starting score",
          value: null,
          unit: null,
          rule: "100 points, less a penalty for each type of Planning Constraint the Location is inside.",
          points: 100,
        },
        {
          input: "Location inside a conservation area",
          value: true,
          unit: null,
          rule: "−20 points if so.",
          points: -20,
        },
      ],
    };
    const scores: ScoresResponse = {
      mode: "general",
      categories: [
        {
          id: "safety",
          layer: "crime",
          status: "unavailable",
          score: null,
          breakdown: [],
        },
        transport,
        planningFreedom,
      ],
      location: {
        score: 85,
        counted: [
          { id: "transport", score: 88, weight: 15, share: 60, points: 52.8 },
          {
            id: "planning-freedom",
            score: 80,
            weight: 10,
            share: 40,
            points: 32,
          },
        ],
        leftOut: [
          { id: "safety", layer: "crime", status: "unavailable", weight: 25 },
        ],
      },
    };

    const stubScoresBackend = (scoresRoute: () => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/scores": scoresRoute,
      });

    const scoresSection = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).getByRole("region", { name: "Scores beta" });

    /** The score whose summary starts with `name`, once it shows. */
    const scoreNamed = async (name: string) => {
      const summary = await within(scoresSection()).findByText(name, {
        selector: "summary .score-name",
      });
      const details = summary.closest("details");
      if (!details) throw new Error(`${name} is not expandable`);
      return details;
    };

    it("shows that the scores are loading, then the Location Score and each Category Score, each labelled beta", async () => {
      let answer: (response: Response) => void = () => undefined;
      // The scores wait until the test answers them.
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string) => {
          const url = new URL(input, "http://localhost");
          if (url.pathname === "/api/scores") {
            return new Promise<Response>((resolve) => {
              answer = resolve;
            });
          }
          if (url.pathname === "/api/geocode") {
            return Promise.resolve(Response.json(ng17Geocode));
          }
          if (url.pathname === "/api/area") {
            return Promise.resolve(areaRoute(url));
          }
          return Promise.reject(new TypeError("Failed to fetch"));
        }),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(scoresSection().textContent).toContain("Loading…");
      });
      answer(Response.json(scores));

      const location = await scoreNamed("Location Score");
      expect(location.querySelector("summary")?.textContent).toBe(
        "Location Score 85/100 beta",
      );
      expect(
        (await scoreNamed("Transport")).querySelector("summary")?.textContent,
      ).toBe("Transport 88/100 beta");
      expect(
        (await scoreNamed("Planning freedom")).querySelector("summary")
          ?.textContent,
      ).toBe("Planning freedom 80/100 beta");
      expect(scoresSection().textContent).toContain("Scores are beta.");
    });

    it("expands a Category Score to its inputs, the thresholds used and the points given", async () => {
      stubScoresBackend(() => Response.json(scores));
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");

      const details = await scoreNamed("Transport");
      expect(details.open).toBe(false);
      const summary = details.querySelector("summary");
      if (!summary) throw new Error("no summary");
      await user.click(summary);

      expect(details.open).toBe(true);
      const table = within(details).getByRole("table", {
        name: "How the Transport score is reached",
      });
      const rows = within(table)
        .getAllByRole("row")
        .map((row) =>
          [...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
        );
      expect(rows).toEqual([
        ["Input and rule", "Figure", "Points"],
        [
          "Distance to the nearest railway station800 m or less: 60 points, falling in proportion to 0 at 5 km or more.",
          "1.6 km",
          "48.2",
        ],
        [
          "Bus stops in the Search Area4 points each, up to 10 stops: 40 points.",
          "58",
          "40",
        ],
        ["Transport score", "88"],
      ]);
    });

    it("gives a penalty with a minus sign, and a yes or no for a Planning Constraint over the Location", async () => {
      stubScoresBackend(() => Response.json(scores));
      render(<App />);
      await searchFor("NG17 1AA");

      const details = await scoreNamed("Planning freedom");
      const row = within(details).getByRole("row", {
        name: /Location inside a conservation area/,
      });

      expect(
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      ).toEqual(["Yes", "−20"]);
    });

    it("expands the Location Score to each category's weight, share and points", async () => {
      stubScoresBackend(() => Response.json(scores));
      render(<App />);
      await searchFor("NG17 1AA");

      const details = await scoreNamed("Location Score");
      const table = within(details).getByRole("table", {
        name: "How the Location Score is weighed, with the General Scout Mode's weights",
      });

      expect(
        within(table)
          .getAllByRole("row")
          .map((row) =>
            [...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
          ),
      ).toEqual([
        ["Category", "Score", "Weight", "Share", "Points"],
        ["Transport", "88", "15", "60%", "52.8"],
        ["Planning freedom", "80", "10", "40%", "32"],
        ["Location Score", "85"],
      ]);
    });

    it("says Development activity is loading while the Planning Applications are queued, and asks for the scores again until they come", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const developmentActivity: CategoryScore = {
        id: "development-activity",
        layer: "planning",
        status: "ok",
        score: 100,
        breakdown: [],
      };
      const queued: ScoresResponse = {
        ...scores,
        categories: [
          ...scores.categories,
          { ...developmentActivity, status: "queued", score: null },
        ],
        location: {
          ...scores.location,
          leftOut: [
            ...scores.location.leftOut,
            {
              id: "development-activity",
              layer: "planning",
              status: "queued",
              weight: 5,
            },
          ],
        },
      };
      let answers = 0;
      const fetchMock = stubScoresBackend(() =>
        Response.json(
          answers++ < 1
            ? queued
            : {
                ...scores,
                categories: [...scores.categories, developmentActivity],
              },
        ),
      );
      render(<App />);
      await searchFor("NG17 1AA");

      await scoreNamed("Location Score");
      expect(scoresSection().textContent).toContain(
        "Development activity Loading planning applications (rate-limited): the Planning Layer's Planning Applications are waiting for their provider's turn, so it is left out of the Location Score until they come, which the scores show without reloading.",
      );
      const scoresRequests = () =>
        fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/scores?"))
          .length;
      expect(scoresRequests()).toBe(1);

      await act(() =>
        vi.advanceTimersByTimeAsync(PLANNING_APPLICATIONS_RETRY_MS),
      );
      await scoreNamed("Development activity");
      expect(scoresSection().textContent).not.toContain("rate-limited");
      expect(scoresRequests()).toBe(2);

      // Once they have come, it asks no more.
      await act(() =>
        vi.advanceTimersByTimeAsync(3 * PLANNING_APPLICATIONS_RETRY_MS),
      );
      expect(scoresRequests()).toBe(2);
    });

    it("says Development activity is left out when the Planning Applications are unavailable", async () => {
      stubScoresBackend(() =>
        Response.json({
          ...scores,
          categories: [
            ...scores.categories,
            {
              id: "development-activity",
              layer: "planning",
              status: "unavailable",
              score: null,
              breakdown: [],
            },
          ],
        }),
      );
      render(<App />);
      await searchFor("NG17 1AA");

      await scoreNamed("Location Score");
      expect(scoresSection().textContent).toContain(
        "Development activity Unavailable: the Planning Layer's Planning Applications are unavailable, so it is left out of the Location Score.",
      );
    });

    it("says which category is left out of the Location Score, and why", async () => {
      stubScoresBackend(() => Response.json(scores));
      render(<App />);
      await searchFor("NG17 1AA");

      await scoreNamed("Location Score");
      const section = scoresSection();

      expect(section.textContent).toContain(
        "Left out: Safety (the Crime Layer is unavailable). The Location Score weighs the other categories, their weights renormalised to make up 100%.",
      );
      expect(section.textContent).toContain(
        "Safety Unavailable: the Crime Layer is unavailable, so it is left out of the Location Score.",
      );
      expect(
        within(section).queryByText("Safety", {
          selector: "summary .score-name",
        }),
      ).toBeNull();
    });

    it("says the scores are unavailable if they can't be loaded, and shows the rest", async () => {
      stubScoresBackend(() => new Response(null, { status: 500 }));
      render(<App />);
      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(scoresSection().textContent).toContain(
          "Unavailable. The scores can't be shown for now. Everything else still works.",
        );
      });
      expect(
        within(
          screen.getByRole("complementary", { name: "Location Overview" }),
        ).getByRole("region", { name: "Local geography" }),
      ).toBeDefined();
    });
  });
  describe("the weights", () => {
    /** NG17 1AA's Category Scores, as the fixture-backed API gives them. */
    const NG17_SCORES: Record<string, number> = {
      safety: 0,
      amenities: 100,
      transport: 88,
      "green-space": 100,
      "property-activity": 24,
      "planning-freedom": 80,
    };

    /** NG17 1AA's scores, weighed by the mode asked for, as the backend weighs them. */
    const scoresIn = (url: URL): ScoresResponse => {
      const mode = url.searchParams.get("mode") ?? "general";
      const { weights } = MODES.modes.find(({ id }) => id === mode) ?? {
        weights: SCOUT_MODE_WEIGHTS,
      };
      const categories = Object.entries(NG17_SCORES).map(
        ([id, score]): CategoryScore => {
          const category = id as CategoryScore["id"];
          return {
            id: category,
            layer: category === "safety" ? "crime" : "transport",
            status: "ok",
            score,
            breakdown: [],
          };
        },
      );
      return { mode, categories, location: locationScore(categories, weights) };
    };

    const stubWeightsBackend = () =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/scores": (url) => Response.json(scoresIn(url)),
      });

    const scoresSection = () =>
      within(
        screen.getByRole("complementary", { name: "Location Overview" }),
      ).getByRole("region", { name: "Scores beta" });

    /** The Location Score's summary, once it shows. */
    const locationScoreText = async () =>
      (
        await within(scoresSection()).findByText("Location Score", {
          selector: "summary .score-name",
        })
      ).closest("summary")?.textContent;

    const weightsToggle = () =>
      within(scoresSection()).getByRole("button", { name: /^Weights: / });

    const slider = (name: string) =>
      within(scoresSection()).getByRole<HTMLInputElement>("slider", { name });

    /** Each slider's category and per cent, as the user reads them. */
    const sliders = () =>
      within(
        within(scoresSection()).getByRole("group", {
          name: "Each category's weight in the Location Score",
        }),
      )
        .getAllByRole<HTMLInputElement>("slider")
        .map((input) => [
          input.labels?.[0]?.textContent,
          input.value,
          input.getAttribute("aria-valuetext"),
        ]);

    const resetButton = () =>
      within(scoresSection()).getByRole<HTMLButtonElement>("button", {
        name: "Reset to default",
      });

    const moveSlider = (name: string, value: number) => {
      fireEvent.change(slider(name), { target: { value: String(value) } });
    };

    const locationRows = () =>
      within(scoresSection())
        .getByRole("table", { name: /^How the Location Score is weighed/ })
        .closest("table");

    it("offers a slider for each category the Scout Mode weighs, at its share of the default weights, totalling 100%", async () => {
      stubWeightsBackend();
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");
      expect(await locationScoreText()).toBe("Location Score 57/100 beta");
      expect(weightsToggle().textContent).toBe(
        "Weights: the General Scout Mode's defaults",
      );
      expect(weightsToggle().getAttribute("aria-expanded")).toBe("false");

      await user.click(weightsToggle());

      expect(weightsToggle().getAttribute("aria-expanded")).toBe("true");
      // 25, 15, 15, 10, 10 and 10 of the 85 built so far.
      expect(sliders()).toEqual([
        ["Safety", "29", "29%"],
        ["Amenities", "18", "18%"],
        ["Transport", "17", "17%"],
        ["Green space", "12", "12%"],
        ["Property activity", "12", "12%"],
        ["Planning freedom", "12", "12%"],
      ]);
      expect(resetButton().disabled).toBe(true);
    });

    it("rebalances the others to total 100% when one moves, and weighs the Location Score again at once, loading nothing", async () => {
      const fetchMock = stubWeightsBackend();
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");
      await locationScoreText();
      await user.click(weightsToggle());
      const entries = window.history.length;
      fetchMock.mockClear();

      moveSlider("Safety", 40);

      expect(sliders()).toEqual([
        ["Safety", "40", "40%"],
        ["Amenities", "15", "15%"],
        ["Transport", "15", "15%"],
        ["Green space", "10", "10%"],
        ["Property activity", "10", "10%"],
        ["Planning freedom", "10", "10%"],
      ]);
      // (0×40 + 100×15 + 88×15 + 100×10 + 24×10 + 80×10) ÷ 100 = 48.6
      expect(await locationScoreText()).toBe("Location Score 49/100 beta");
      expect(weightsToggle().textContent).toBe("Weights: your own");
      expect(
        [...(locationRows()?.querySelectorAll("tr") ?? [])].map(
          (row) => row.textContent,
        ),
      ).toEqual([
        "CategoryScoreWeightSharePoints",
        "Safety04040%0",
        "Amenities1001515%15",
        "Transport881515%13.2",
        "Green space1001010%10",
        "Property activity241010%2.4",
        "Planning freedom801010%8",
        "Location Score49",
      ]);
      expect(
        within(scoresSection()).getByRole("table", {
          name: "How the Location Score is weighed, with your own weights for the General Scout Mode",
        }),
      ).toBeDefined();
      expect(resetButton().disabled).toBe(false);

      moveSlider("Transport", 100);

      expect(sliders().map(([, value]) => value)).toEqual([
        "0",
        "0",
        "100",
        "0",
        "0",
        "0",
      ]);
      expect(await locationScoreText()).toBe("Location Score 88/100 beta");

      // The URL follows once the sliders stop, without a history entry for each step.
      await waitFor(() => {
        expect(window.location.search).toBe(
          "?lat=53.123664&lng=-1.264078&radius=0.5&weights=safety:0,amenities:0,transport:100,green-space:0,property-activity:0,planning-freedom:0",
        );
      });
      expect(window.history.length).toBe(entries);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("restores the Scout Mode's default weights with Reset to default", async () => {
      const fetchMock = stubWeightsBackend();
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");
      await locationScoreText();
      await user.click(weightsToggle());
      moveSlider("Amenities", 70);
      expect(await locationScoreText()).not.toBe("Location Score 57/100 beta");
      fetchMock.mockClear();

      await user.click(resetButton());

      expect(await locationScoreText()).toBe("Location Score 57/100 beta");
      expect(sliders().map(([, value]) => value)).toEqual([
        "29",
        "18",
        "17",
        "12",
        "12",
        "12",
      ]);
      expect(weightsToggle().textContent).toBe(
        "Weights: the General Scout Mode's defaults",
      );
      expect(
        within(scoresSection()).getByRole("table", {
          name: "How the Location Score is weighed, with the General Scout Mode's weights",
        }),
      ).toBeDefined();
      expect(resetButton().disabled).toBe(true);
      await waitFor(() => {
        expect(window.location.search).toBe(
          "?lat=53.123664&lng=-1.264078&radius=0.5",
        );
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("opens a URL with its weights, showing the sliders, so custom weights survive a reload", async () => {
      stubWeightsBackend();

      openAt(
        "/?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment&weights=safety:10,amenities:10,transport:20,green-space:10,property-activity:40,planning-freedom:10",
      );

      // (0×10 + 100×10 + 88×20 + 100×10 + 24×40 + 80×10) ÷ 100 = 55.2
      await waitFor(async () => {
        expect(await locationScoreText()).toBe("Location Score 55/100 beta");
      });
      expect(weightsToggle().textContent).toBe("Weights: your own");
      expect(weightsToggle().getAttribute("aria-expanded")).toBe("true");
      expect(sliders().map(([, value]) => value)).toEqual([
        "10",
        "10",
        "20",
        "10",
        "40",
        "10",
      ]);
      expect(
        within(scoresSection()).getByRole("table", {
          name: "How the Location Score is weighed, with your own weights for the Investment Scout Mode",
        }),
      ).toBeDefined();
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment&weights=safety:10,amenities:10,transport:20,green-space:10,property-activity:40,planning-freedom:10",
      );
    });

    it("puts weights that don't suit the Scout Mode back to its defaults, correcting the URL", async () => {
      stubWeightsBackend();

      openAt(
        "/?lat=53.123664&lng=-1.264078&radius=0.5&weights=transport:60,footfall:40",
      );
      await screen.findByText("53.123664,-1.264078 0.5 mile");

      expect(await locationScoreText()).toBe("Location Score 57/100 beta");
      await waitFor(() => {
        expect(window.location.search).toBe(
          "?lat=53.123664&lng=-1.264078&radius=0.5",
        );
      });
      expect(weightsToggle().textContent).toBe(
        "Weights: the General Scout Mode's defaults",
      );
    });

    it("puts back the default weights when the Scout Mode changes", async () => {
      stubWeightsBackend();
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");
      await locationScoreText();
      await user.click(weightsToggle());
      moveSlider("Safety", 0);
      expect(await locationScoreText()).not.toBe("Location Score 57/100 beta");

      await user.selectOptions(
        screen.getByLabelText("Scout Mode"),
        "Investment",
      );

      // (0×25 + 100×15 + 88×15 + 100×10 + 24×25 + 80×10) ÷ 100 = 52.2
      await waitFor(async () => {
        expect(await locationScoreText()).toBe("Location Score 52/100 beta");
      });
      expect(weightsToggle().textContent).toBe(
        "Weights: the Investment Scout Mode's defaults",
      );
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment",
      );
    });

    it("keeps the weights when the Search Area changes", async () => {
      stubWeightsBackend();
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");
      await locationScoreText();
      await user.click(weightsToggle());
      moveSlider("Safety", 40);

      await chooseRadius(1);

      await waitFor(() => {
        expect(window.location.search).toBe(
          "?lat=53.123664&lng=-1.264078&radius=1&weights=safety:40,amenities:15,transport:15,green-space:10,property-activity:10,planning-freedom:10",
        );
      });
      expect(await locationScoreText()).toBe("Location Score 49/100 beta");
    });
  });

  describe("the Highlights", () => {
    const highlights: HighlightsResponse = {
      mode: "general",
      highlights: [
        {
          rule: "crime-rate-high",
          level: "concern",
          text: "High crime: 995 crimes a year per km²",
          layer: "crime",
        },
        {
          rule: "conservation-area",
          level: "watch",
          text: "Location is inside a conservation area: Sutton in Ashfield Church and Market Place",
          layer: "planning",
        },
        {
          rule: "park-nearby",
          level: "good",
          text: "Park 100 m away",
          layer: "green-space",
        },
      ],
      leftOut: [],
    };
    const planning: PlanningLayerResponse = {
      layer: "planning",
      status: "ok",
      sources: [],
      features: [],
      statistics: {
        byType: PLANNING_CONSTRAINT_TYPES.map((type) => ({
          type,
          count: 0,
          coversLocation: false,
        })),
        coveringLocation: [],
      },
      applications: null,
    };

    const stubHighlightsBackend = (highlightsRoute: () => Response) =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/area/planning": () => Response.json(planning),
        "/api/highlights": highlightsRoute,
      });

    const overview = () =>
      screen.getByRole("complementary", { name: "Location Overview" });

    const highlightsSection = () =>
      within(overview()).getByRole("region", { name: "What you need to know" });

    const highlightButtons = async () =>
      within(
        await within(highlightsSection()).findByRole("list", {
          name: "Highlights",
        }),
      ).getAllByRole("button");

    const planningToggle = () =>
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Planning" });

    /** jsdom doesn't scroll, so it has no `scrollIntoView`: a stand-in records each call. */
    const stubScrollIntoView = () => {
      const scrolled = vi.fn();
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        value: scrolled,
        configurable: true,
      });
      return scrolled;
    };

    afterEach(() => {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    });

    it("shows that the Highlights are loading, then each at the top of the Overview, Concerns first, naming its Layer", async () => {
      let answer: (response: Response) => void = () => undefined;
      // The Highlights wait until the test answers them.
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string) => {
          const url = new URL(input, "http://localhost");
          if (url.pathname === "/api/highlights") {
            return new Promise<Response>((resolve) => {
              answer = resolve;
            });
          }
          if (url.pathname === "/api/geocode") {
            return Promise.resolve(Response.json(ng17Geocode));
          }
          if (url.pathname === "/api/area") {
            return Promise.resolve(areaRoute(url));
          }
          return Promise.reject(new TypeError("Failed to fetch"));
        }),
      );
      render(<App />);

      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(highlightsSection().textContent).toContain("Loading…");
      });
      // Before the Location's details and every Layer's statistics.
      expect(overview().querySelector("h2 + section")).toBe(
        highlightsSection(),
      );
      answer(Response.json(highlights));

      expect(
        (await highlightButtons()).map((button) => button.textContent),
      ).toEqual([
        "Concern: High crime: 995 crimes a year per km² Crime",
        "Watch: Location is inside a conservation area: Sutton in Ashfield Church and Market Place Planning",
        "Good: Park 100 m away Green space",
      ]);
      expect(highlightsSection().textContent).toContain(
        "Highlights come from fixed rules over the figures below, never from AI.",
      );
    });

    it("focuses a Highlight's Layer: shows it on the map, points out its toggle and moves to its statistics", async () => {
      const scrolled = stubScrollIntoView();
      stubHighlightsBackend(() => Response.json(highlights));
      const user = userEvent.setup();
      openAt("/?lat=53.123664&lng=-1.264078&radius=0.5&hidden=planning");

      await waitFor(() => {
        expect(planningToggle().checked).toBe(false);
      });
      const [, conservation] = await highlightButtons();
      if (!conservation) throw new Error("no Planning Highlight");
      expect(conservation.title).toBe("Focus the Planning Layer");
      await user.click(conservation);

      expect(planningToggle().checked).toBe(true);
      expect(window.location.search).not.toContain("hidden=planning");
      await waitFor(() => {
        expect(screen.getByTestId("map-layers").textContent).toBe(
          "planning: 0",
        );
      });
      expect(
        planningToggle().closest(".layer-toggle")?.hasAttribute("data-focused"),
      ).toBe(true);
      const statistics = within(overview()).getByRole("region", {
        name: "Planning",
      });
      expect(document.activeElement).toBe(statistics);
      expect(scrolled.mock.contexts).toEqual([statistics]);
    });

    it("focuses a Layer by keyboard too, and points out only the last one focused", async () => {
      stubScrollIntoView();
      stubHighlightsBackend(() => Response.json(highlights));
      const user = userEvent.setup();
      render(<App />);
      await searchFor("NG17 1AA");

      const [crime, , park] = await highlightButtons();
      if (!crime || !park) throw new Error("no Highlights");
      crime.focus();
      await user.keyboard("{Enter}");
      expect(document.activeElement).toBe(
        within(overview()).getByRole("region", { name: "Crime" }),
      );
      park.focus();
      await user.keyboard(" ");

      expect(document.activeElement).toBe(
        within(overview()).getByRole("region", { name: "Green space" }),
      );
      const focused = [...document.querySelectorAll(".layer-toggle")]
        .filter((toggle) => toggle.hasAttribute("data-focused"))
        .map((toggle) => toggle.textContent);
      expect(focused).toHaveLength(1);
      expect(focused[0]).toContain("Green space");
    });

    it("says which Layers' Highlights are left out, and why", async () => {
      stubHighlightsBackend(() =>
        Response.json({
          ...highlights,
          leftOut: [
            { layer: "amenities", status: "unavailable" },
            { layer: "transport", status: "unavailable" },
          ],
        }),
      );
      render(<App />);
      await searchFor("NG17 1AA");

      await highlightButtons();
      expect(highlightsSection().textContent).toContain(
        "Left out: anything from the Amenities and Transport Layers, which are unavailable.",
      );
    });

    it("says so when nothing stands out", async () => {
      stubHighlightsBackend(() =>
        Response.json({ ...highlights, highlights: [] }),
      );
      render(<App />);
      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(highlightsSection().textContent).toContain(
          "Nothing stands out in this Search Area.",
        );
      });
      expect(within(highlightsSection()).queryByRole("list")).toBeNull();
    });

    it("says the Highlights are unavailable if they can't be loaded, and shows the rest", async () => {
      stubHighlightsBackend(() => new Response(null, { status: 500 }));
      render(<App />);
      await searchFor("NG17 1AA");

      await waitFor(() => {
        expect(highlightsSection().textContent).toContain(
          "Unavailable. The Highlights can't be shown for now. Everything else still works.",
        );
      });
      expect(
        within(overview()).getByRole("region", { name: "Local geography" }),
      ).toBeDefined();
    });
  });

  describe("Street View (PRD FR-2.13)", () => {
    /** The key the stubbed backend gives, as if GOOGLE_MAPS_API_KEY were set. */
    const KEY = "AIzaSyTestKey";

    /** Google's Street View, standing in: it finds no panorama anywhere. */
    const noPanoramas = {
      StreetViewPanorama: vi.fn(),
      StreetViewService: class {
        getPanorama = () =>
          Promise.reject(
            Object.assign(new Error("none"), { code: "ZERO_RESULTS" }),
          );
      },
      StreetViewPreference: { NEAREST: "nearest" },
      StreetViewSource: { OUTDOOR: "outdoor" },
    };

    const stubStreetViewBackend = () =>
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/street-view": () => Response.json({ enabled: true, apiKey: KEY }),
      });

    const streetViewPanel = () =>
      screen.queryByRole("region", { name: "Street View" });

    afterEach(() => {
      googleMaps.loadStreetView.mockReset();
      mapClicks.streetView = undefined;
    });

    it("is hidden without GOOGLE_MAPS_API_KEY, offering no button anywhere and loading nothing from Google", async () => {
      const fetchMock = stubNg17Backend();
      render(<App />);
      await searchFor("NG17 1AA");
      await screen.findByText("53.123664,-1.264078 0.5 mile");

      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        "/api/street-view",
      );
      expect(
        screen.queryByRole("button", { name: "Street View at the Location" }),
      ).toBeNull();
      expect(streetViewPanel()).toBeNull();
      // The map's popups offer it no more than the panel does.
      expect(mapClicks.streetView).toBeNull();
      expect(googleMaps.loadStreetView).not.toHaveBeenCalled();
      expect(document.querySelector("script")).toBeNull();
    });

    it("is hidden if the backend doesn't say whether it is on", async () => {
      stubBackend({
        "/api/geocode": () => Response.json(ng17Geocode),
        "/api/area": areaRoute,
        "/api/street-view": () => new Response(null, { status: 500 }),
      });
      render(<App />);
      await searchFor("NG17 1AA");
      await screen.findByText("53.123664,-1.264078 0.5 mile");

      expect(
        screen.queryByRole("button", { name: "Street View at the Location" }),
      ).toBeNull();
      expect(mapClicks.streetView).toBeNull();
    });

    it("opens at the Location with the key, loading Google's script only then", async () => {
      googleMaps.loadStreetView.mockResolvedValue(noPanoramas);
      stubStreetViewBackend();
      render(<App />);
      await searchFor("NG17 1AA");
      const open = await screen.findByRole("button", {
        name: "Street View at the Location",
      });
      expect(googleMaps.loadStreetView).not.toHaveBeenCalled();

      await userEvent.setup().click(open);

      const panel = streetViewPanel();
      expect(panel).not.toBeNull();
      if (!panel) return;
      expect(within(panel).getByText("The Location")).toBeTruthy();
      expect(googleMaps.loadStreetView).toHaveBeenCalledExactlyOnceWith(KEY);
      expect(
        await within(panel).findByText(
          "Google has no Street View within 100 m of this point.",
        ),
      ).toBeTruthy();
      expect(panel.textContent).toContain("Street View imagery: Google Maps");

      await userEvent
        .setup()
        .click(
          within(panel).getByRole("button", { name: "Close Street View" }),
        );
      expect(streetViewPanel()).toBeNull();
    });

    it("opens at a Feature from its popup, and closes when the Search Area changes", async () => {
      googleMaps.loadStreetView.mockResolvedValue(noPanoramas);
      stubStreetViewBackend();
      render(<App />);
      await searchFor("NG17 1AA");
      await screen.findByRole("button", {
        name: "Street View at the Location",
      });

      act(() => {
        mapClicks.streetView?.({
          location: { lat: 53.1237, lng: -1.2641 },
          name: "Crime: Shoplifting",
        });
      });

      const panel = streetViewPanel();
      expect(panel).not.toBeNull();
      if (!panel) return;
      expect(within(panel).getByText("Crime: Shoplifting")).toBeTruthy();
      expect(googleMaps.loadStreetView).toHaveBeenCalledExactlyOnceWith(KEY);

      await chooseRadius(1);
      await screen.findByText("53.123664,-1.264078 1 mile");
      expect(streetViewPanel()).toBeNull();
    });
  });

  describe("Saved Locations", () => {
    const INVESTMENT_URL =
      "?lat=53.123664&lng=-1.264078&radius=1&mode=investment&weights=safety:10,amenities:10,transport:20,green-space:10,property-activity:40,planning-freedom:10";
    const NG17_POSTCODE = { found: { kind: "postcode", label: "NG17 1AA" } };

    afterEach(() => {
      vi.restoreAllMocks();
      window.localStorage.clear();
    });

    const savedTab = () => screen.getByRole("tab", { name: "Saved" });
    const savedPanel = () =>
      screen.getByRole("complementary", { name: "Saved Locations" });

    it("saves the Search Area with its Scout Mode and weights, and opens it after a reload", async () => {
      const user = userEvent.setup();
      stubNg17Backend();
      const { unmount } = openAt(`/${INVESTMENT_URL}`, NG17_POSTCODE);
      await screen.findByText("53.123664,-1.264078 1 mile");

      await user.click(savedTab());
      expect(savedTab().getAttribute("aria-selected")).toBe("true");
      expect(
        await within(savedPanel()).findByText(
          "Saves 1 mile around NG17 1AA, in the Investment Scout Mode, with your own weights.",
        ),
      ).toBeTruthy();
      await user.type(
        within(savedPanel()).getByLabelText("Name"),
        "Investing near the market",
      );
      await user.click(
        within(savedPanel()).getByRole("button", {
          name: "Save this Search Area",
        }),
      );
      unmount();

      window.history.replaceState(null, "", "/");
      const fetchMock = stubNg17Backend();
      render(<App />);
      await user.click(savedTab());
      await user.click(
        within(savedPanel()).getByRole("button", {
          name: "Open Investing near the market",
        }),
      );

      expect(
        await screen.findByText("53.123664,-1.264078 1 mile"),
      ).toBeTruthy();
      expect(
        screen
          .getByRole("tab", { name: "Overview" })
          .getAttribute("aria-selected"),
      ).toBe("true");
      expect(window.location.search).toBe(INVESTMENT_URL);
      expect(screen.getByLabelText<HTMLSelectElement>("Scout Mode").value).toBe(
        "investment",
      );
      const overview = screen.getByRole("complementary", {
        name: "Location Overview",
      });
      expect(within(overview).getByText("NG17 1AA")).toBeTruthy();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "/api/modes",
        "/api/coverage",
        "/api/street-view",
        "/api/explain",
        ...withLayers(
          "/api/area?lat=53.123664&lng=-1.264078&radius=1&postcode=NG17+1AA",
          "investment",
        ),
      ]);
      // Back returns to the page as it was before it was opened.
      act(() => {
        window.history.back();
      });
      await waitFor(() => {
        expect(window.location.search).toBe("");
      });
    });

    it("opens a Saved Location of the Search Area shown by loading only its scores and Highlights in its Scout Mode", async () => {
      const user = userEvent.setup();
      stubNg17Backend();
      openAt(`/${INVESTMENT_URL}`, NG17_POSTCODE);
      await screen.findByText("53.123664,-1.264078 1 mile");
      await user.click(savedTab());
      await within(savedPanel()).findByText(/Investment Scout Mode/);
      await user.click(
        within(savedPanel()).getByRole("button", {
          name: "Save this Search Area",
        }),
      );
      expect(
        within(savedPanel()).getByRole("heading", { name: "NG17 1AA" }),
      ).toBeTruthy();
      await user.selectOptions(screen.getByLabelText("Scout Mode"), "General");
      await waitFor(() => {
        expect(window.location.search).toBe(
          "?lat=53.123664&lng=-1.264078&radius=1",
        );
      });
      const fetchMock = stubNg17Backend();

      await user.click(
        within(savedPanel()).getByRole("button", { name: "Open NG17 1AA" }),
      );

      await waitFor(() => {
        expect(window.location.search).toBe(INVESTMENT_URL);
      });
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
        withLayers(
          "/api/area?lat=53.123664&lng=-1.264078&radius=1&postcode=NG17+1AA",
          "investment",
        ).slice(-2),
      );
    });

    it("offers the postcode nearest a map click as its name", async () => {
      const user = userEvent.setup();
      stubNg17Backend();
      render(<App />);
      clickMap(NG17_1AA);
      await screen.findByText("53.123664,-1.264078 0.5 mile");

      await user.click(savedTab());

      expect(
        within(savedPanel()).getByLabelText<HTMLInputElement>("Name")
          .placeholder,
      ).toBe("Near NG17 0AZ");
      expect(
        await within(savedPanel()).findByText(
          "Saves 0.5 mile around 53.123664, -1.264078, in the General Scout Mode, with its default weights.",
        ),
      ).toBeTruthy();
    });

    it("says saving is off when the browser won't let it use storage, and works otherwise", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
        throw new DOMException(
          "Access is denied for this document.",
          "SecurityError",
        );
      });
      stubNg17Backend();
      render(<App />);

      await searchFor("NG17 1AA");
      expect(
        await screen.findByText("53.123664,-1.264078 0.5 mile"),
      ).toBeTruthy();
      await user.click(savedTab());

      expect(within(savedPanel()).getByRole("status").textContent).toMatch(
        /^Saving is off: /,
      );
      expect(within(savedPanel()).queryByRole("button")).toBeNull();
    });
  });

  describe("Compare", () => {
    afterEach(() => {
      window.localStorage.clear();
    });

    /** Two Saved Locations of NG17 1AA, in Scout Modes of their own. */
    const SAVED = {
      format: "location-scout.saved-locations",
      version: 1,
      savedLocations: [
        {
          id: "half-mile",
          name: "Half a mile",
          savedAt: "2026-10-09T09:15:00.000Z",
          location: NG17_1AA,
          radius: 0.5,
          mode: "investment",
          weights: null,
          found: { kind: "postcode", label: "NG17 1AA" },
        },
        {
          id: "a-mile",
          name: "A mile",
          savedAt: "2026-10-09T09:20:00.000Z",
          location: NG17_1AA,
          radius: 1,
          mode: "development",
          weights: null,
          found: null,
        },
      ],
    };

    const comparePanel = () =>
      screen.getByRole("complementary", { name: "Compare Saved Locations" });

    it("compares the Saved Locations chosen in the Scout Mode chosen above, and in another once it is chosen", async () => {
      const user = userEvent.setup();
      window.localStorage.setItem(
        "location-scout.saved-locations",
        JSON.stringify(SAVED),
      );
      const fetchMock = stubNg17Backend();
      render(<App />);
      await user.click(screen.getByRole("tab", { name: "Compare" }));
      expect(
        screen
          .getByRole("tab", { name: "Compare" })
          .getAttribute("aria-selected"),
      ).toBe("true");

      await user.click(
        within(comparePanel()).getByRole("checkbox", { name: "Half a mile" }),
      );
      await user.click(
        within(comparePanel()).getByRole("checkbox", { name: "A mile" }),
      );

      expect(
        await within(comparePanel()).findByText(
          "Compared in the General Scout Mode, with its default weights",
        ),
      ).toBeTruthy();
      // Each is loaded as a Search Area is, but for its own geography.
      await waitFor(() => {
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
          "/api/modes",
          "/api/coverage",
          "/api/street-view",
          "/api/explain",
          ...withLayers(
            "/api/area?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
          ).slice(1),
          ...withLayers("/api/area?lat=53.123664&lng=-1.264078&radius=1").slice(
            1,
          ),
        ]);
      });
      fetchMock.mockClear();

      await user.selectOptions(
        screen.getByLabelText("Scout Mode"),
        "Investment",
      );

      expect(
        await within(comparePanel()).findByText(
          "Compared in the Investment Scout Mode, with its default weights",
        ),
      ).toBeTruthy();
      await waitFor(() => {
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
          ...withLayers(
            "/api/area?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA",
            "investment",
          ).slice(-2),
          ...withLayers(
            "/api/area?lat=53.123664&lng=-1.264078&radius=1",
            "investment",
          ).slice(-2),
        ]);
      });
    });
  });

  describe("the report (PRD FR-7.4)", () => {
    const report = () =>
      screen.getByRole("article", {
        name: "Location Scout report: 0.5 mile around NG17 1AA",
      });

    it("opens a report of the Search Area shown, in a history entry of its own, and goes back to the map", async () => {
      const user = userEvent.setup();
      const fetchMock = stubNg17Backend();
      render(<App />);
      await searchFor("NG17 1AA");
      await screen.findByText("NG17 1AA");
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(4 + 13);
      });
      const before = window.history.length;

      await user.click(
        screen.getByRole("button", { name: "Printable report" }),
      );

      expect(report()).toBeTruthy();
      expect(screen.getByTestId("report-map").textContent).toBe(
        "0.5 mile around NG17 1AA",
      );
      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5&view=report",
      );
      expect(window.history.length).toBe(before + 1);
      // The map and its panel give way to it.
      expect(screen.queryByTestId("search-area-map")).toBeNull();
      expect(document.title).toBe(
        "Location Scout report: 0.5 mile around NG17 1AA",
      );
      // Made from what has loaded, asking the backend for nothing more.
      expect(fetchMock).toHaveBeenCalledTimes(4 + 13);

      await user.click(screen.getByRole("button", { name: "Back to the map" }));

      await waitFor(() => {
        expect(window.location.search).toBe(
          "?lat=53.123664&lng=-1.264078&radius=0.5",
        );
      });
      expect(screen.queryByRole("article")).toBeNull();
      expect(mapText()).toBe("53.123664,-1.264078 0.5 mile");
      expect(fetchMock).toHaveBeenCalledTimes(4 + 13);
    });

    it("opens the report from its URL, as a reload or bookmark does, and closes it in the same history entry", async () => {
      const user = userEvent.setup();
      stubNg17Backend();
      openAt("/?lat=53.123664&lng=-1.264078&radius=0.5&view=report", {
        found: { kind: "postcode", label: "NG17 1AA" },
      });

      expect(await screen.findByText("Coordinates")).toBeTruthy();
      expect(report()).toBeTruthy();
      const before = window.history.length;

      await user.click(screen.getByRole("button", { name: "Back to the map" }));

      expect(window.location.search).toBe(
        "?lat=53.123664&lng=-1.264078&radius=0.5",
      );
      expect(window.history.length).toBe(before);
      expect(mapText()).toBe("53.123664,-1.264078 0.5 mile");
    });
  });
});
