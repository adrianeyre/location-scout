import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LAND_OPPORTUNITY_WORDING,
  isServedLayerId,
  type CategoryScore,
  type HighlightsResponse,
  type ScoresResponse,
  type ScoutMode,
  type ScoutModeId,
  type TransportLayerResponse,
} from "@location-scout/shared";

import {
  SAVED_LOCATIONS_KEY,
  writeSavedLocations,
  type SavedLocation,
} from "../saved/saved-locations";
import { useSavedLocations } from "../saved/useSavedLocations";
import { unavailableLayer } from "../useSearchArea";
import type { CustomWeights } from "../weights";
import { ComparePanel } from "./ComparePanel";

const WEIGHTS = {
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
};

const GENERAL: ScoutMode = {
  id: "general",
  name: "General",
  question: "What is it like here?",
  weights: WEIGHTS,
  competitors: null,
  highlightedLayers: [],
  highlights: [],
};

const INVESTMENT: ScoutMode = {
  ...GENERAL,
  id: "investment",
  name: "Investment",
  weights: { ...WEIGHTS, safety: 20, transport: 80 },
};

/** Five Saved Locations along a street, each a little further east. */
const SAVED: SavedLocation[] = [
  "Market",
  "Station",
  "Park",
  "School",
  "Mill",
].map((name, index) => ({
  id: name.toLowerCase(),
  name,
  savedAt: "2026-10-09T09:15:00.000Z",
  location: { lat: 53.1, lng: -1.26 + index / 100 },
  radius: 0.5,
  mode: "general",
  weights: null,
  found: index === 0 ? { kind: "postcode", label: "NG17 1AA" } : null,
}));

/** Which Saved Location a request is for, by its longitude. */
const indexOf = (url: URL) =>
  Math.round((Number(url.searchParams.get("lng")) + 1.26) * 100);

/** Each Saved Location's Safety and Transport scores, which differ in each. */
const SAFETY = [70, 40, 55, 90, 20];
const TRANSPORT = [88, 92, 60, 30, 75];

const category = (
  id: CategoryScore["id"],
  layer: CategoryScore["layer"],
  score: number,
): CategoryScore => ({ id, layer, status: "ok", score, breakdown: [] });

/** The scores the backend gives, weighed by the Scout Mode asked for. */
const scoresFor = (index: number, mode: ScoutModeId): ScoresResponse => {
  const { weights } = mode === "investment" ? INVESTMENT : GENERAL;
  const safety = SAFETY[index] ?? 0;
  const transport = TRANSPORT[index] ?? 0;
  return {
    mode,
    categories: [
      category("safety", "crime", safety),
      category("transport", "transport", transport),
    ],
    location: {
      score: Math.round(
        (safety * weights.safety + transport * weights.transport) / 100,
      ),
      counted: [],
      leftOut: [],
    },
  };
};

const highlightsFor = (
  index: number,
  mode: ScoutModeId,
): HighlightsResponse => ({
  mode,
  highlights: [
    {
      rule: "station-nearby",
      level: "good",
      text: `Station ${String(index)} nearby`,
      layer: "transport",
    },
  ],
  leftOut: [{ layer: "crime", status: "unavailable" }],
});

/** The Transport Layer, with as many bus stops as `index` and a station `index` km away. */
const transportFor = (index: number): TransportLayerResponse => ({
  layer: "transport",
  status: "ok",
  sources: [],
  features: [],
  statistics: {
    facilities: [{ type: "bus-stop", count: 10 + index }],
    routes: [],
    nearestStation: {
      id: "node/1",
      name: null,
      distanceMetres: 1000 * (index + 1),
      inSearchArea: false,
    },
    stationSearchMetres: 5000,
  },
});

/** Our backend, stubbed: every Layer is unavailable but Transport. */
const stubBackend = () => {
  const fetchMock = vi.fn((input: string) => {
    const url = new URL(input, "http://localhost");
    const index = indexOf(url);
    const mode = url.searchParams.get("mode") ?? "general";
    const layer = url.pathname.replace("/api/area/", "");
    if (url.pathname === "/api/scores") {
      return Promise.resolve(Response.json(scoresFor(index, mode)));
    }
    if (url.pathname === "/api/highlights") {
      return Promise.resolve(Response.json(highlightsFor(index, mode)));
    }
    if (isServedLayerId(layer)) {
      return Promise.resolve(
        Response.json(
          layer === "transport" ? transportFor(index) : unavailableLayer(layer),
        ),
      );
    }
    return Promise.reject(new TypeError("Failed to fetch"));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const requested = (fetchMock: ReturnType<typeof stubBackend>) =>
  fetchMock.mock.calls.map(([url]) => url);

interface HarnessProps {
  mode?: ScoutMode;
  weights?: CustomWeights | null;
}

/** The panel, with the Saved Locations kept in local storage. */
const Harness = ({ mode = GENERAL, weights = null }: HarnessProps) => {
  const saved = useSavedLocations();
  return (
    <ComparePanel
      saved={saved}
      mode={mode.id}
      scoutMode={mode}
      weights={weights}
    />
  );
};

const keep = (savedLocations: SavedLocation[]) => {
  window.localStorage.setItem(
    SAVED_LOCATIONS_KEY,
    writeSavedLocations(savedLocations),
  );
};

const panel = () =>
  screen.getByRole("complementary", { name: "Compare Saved Locations" });

const choose = async (...names: string[]) => {
  const user = userEvent.setup();
  for (const name of names) {
    await user.click(within(panel()).getByRole("checkbox", { name }));
  }
};

/** The table's column headings: each Saved Location's name and Search Area. */
const columnHeadings = () =>
  Array.from(
    screen.getByRole("table").querySelectorAll("thead th"),
    ({ textContent }) => textContent,
  );

/** A row's cells, by the name it is headed with. */
const rowCells = (name: string) => {
  const heading = within(screen.getByRole("table")).getByRole("rowheader", {
    name,
  });
  const row = heading.closest("tr");
  if (!row) throw new Error(`no row ${name}`);
  return within(row)
    .getAllByRole("cell")
    .map(({ textContent }) => textContent);
};

describe("ComparePanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("asks for two Saved Locations before there is anything to compare", () => {
    const fetchMock = stubBackend();
    keep(SAVED.slice(0, 1));
    render(<Harness />);

    expect(
      within(panel()).getByText(
        "Save at least 2 Search Areas in the Saved tab to compare them here.",
      ),
    ).toBeTruthy();
    expect(within(panel()).queryByRole("checkbox")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says saving is off when the browser won't let it use storage", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied.", "SecurityError");
    });
    render(<Harness />);

    expect(within(panel()).getByRole("status").textContent).toMatch(
      /^Saving is off: .* so there are no Saved Locations to compare\.$/,
    );
  });

  it("compares 2, then 3, then 4 Saved Locations side by side, and no more", async () => {
    stubBackend();
    keep(SAVED);
    render(<Harness />);
    expect(screen.queryByRole("table")).toBeNull();

    await choose("Market");
    expect(within(panel()).getByRole("status").textContent).toBe(
      "Choose another to compare it with.",
    );
    expect(screen.queryByRole("table")).toBeNull();

    await choose("Park");
    expect(within(panel()).getByRole("status").textContent).toBe(
      "Comparing 2 Saved Locations.",
    );
    expect(columnHeadings()).toEqual([
      "Market 0.5 mile around NG17 1AA",
      "Park 0.5 mile around 53.100000, -1.240000",
    ]);
    await waitFor(() => {
      expect(rowCells("Location Score")).toEqual(["79 ★ Best", "58"]);
    });

    await choose("Station");
    // In the order they are saved in.
    expect(columnHeadings().map((heading) => heading.split(" 0.5")[0])).toEqual(
      ["Market", "Station", "Park"],
    );
    await waitFor(() => {
      expect(rowCells("Location Score")).toEqual(["79 ★ Best", "66", "58"]);
    });

    await choose("School");
    expect(within(panel()).getByRole("status").textContent).toBe(
      "Comparing 4 Saved Locations, as many as fit side by side: untick one to compare another.",
    );
    expect(columnHeadings()).toHaveLength(4);
    expect(
      within(panel()).getByRole<HTMLInputElement>("checkbox", { name: "Mill" })
        .disabled,
    ).toBe(true);
    await waitFor(() => {
      expect(rowCells("Location Score")).toEqual([
        "79 ★ Best",
        "66",
        "58",
        "60",
      ]);
    });
    expect(rowCells("Safety")).toEqual(["70", "40", "55", "90 ★ Best"]);
    expect(rowCells("Transport")).toEqual(["88", "92 ★ Best", "60", "30"]);

    // Unticking one lets another be compared.
    await choose("Market");
    expect(
      within(panel()).getByRole<HTMLInputElement>("checkbox", { name: "Mill" })
        .disabled,
    ).toBe(false);
    expect(columnHeadings()).toHaveLength(3);
  });

  it("gives each column's Highlights and key statistics, marking the best", async () => {
    stubBackend();
    keep(SAVED);
    render(<Harness />);
    await choose("Market", "Station", "Park");

    await waitFor(() => {
      expect(rowCells("Bus stops")).toEqual(["10", "11", "12 ★ Best"]);
    });
    expect(rowCells("Nearest railway station")).toEqual([
      "1.0 km ★ Best",
      "2.0 km",
      "3.0 km",
    ]);
    expect(rowCells("Crimes in the last 12 months")).toEqual([
      "Unavailable",
      "Unavailable",
      "Unavailable",
    ]);
    expect(rowCells("Highlights")).toEqual([
      "Good: Station 0 nearbyLeft out: the Crime Layer",
      "Good: Station 1 nearbyLeft out: the Crime Layer",
      "Good: Station 2 nearbyLeft out: the Crime Layer",
    ]);
    expect(panel().textContent).toContain(LAND_OPPORTUNITY_WORDING);
    // Every Search Area is 0.5 mile, so counts are judged.
    expect(panel().textContent).not.toContain("differ in size");
  });

  it("marks no count best when the Search Areas differ in size", async () => {
    stubBackend();
    const [market, station] = SAVED;
    if (!market || !station) throw new Error("no Saved Locations");
    keep([market, { ...station, radius: 1 }]);
    render(<Harness />);
    await choose("Market", "Station");

    await waitFor(() => {
      expect(rowCells("Bus stops")).toEqual(["10", "11"]);
    });
    expect(rowCells("Nearest railway station")).toEqual([
      "1.0 km ★ Best",
      "2.0 km",
    ]);
    expect(panel().textContent).toContain(
      "These Search Areas differ in size, so counts of what is in them (",
    );
  });

  it("compares every column again in a new Scout Mode, loading only their scores and Highlights", async () => {
    const fetchMock = stubBackend();
    keep(SAVED);
    const { rerender } = render(<Harness />);
    await choose("Market", "Station", "School");
    await waitFor(() => {
      expect(rowCells("Location Score")).toEqual(["79 ★ Best", "66", "60"]);
    });
    expect(
      screen.getByRole("table").querySelector("caption")?.textContent,
    ).toBe("Compared in the General Scout Mode, with its default weights");
    expect(requested(fetchMock)).toHaveLength(3 * 11);
    fetchMock.mockClear();

    rerender(<Harness mode={INVESTMENT} />);

    expect(
      screen.getByRole("table").querySelector("caption")?.textContent,
    ).toBe("Compared in the Investment Scout Mode, with its default weights");
    await waitFor(() => {
      expect(rowCells("Location Score")).toEqual(["84 ★ Best", "82", "42"]);
    });
    expect(requested(fetchMock)).toEqual(
      SAVED.filter(({ name }) =>
        ["Market", "Station", "School"].includes(name),
      ).flatMap(({ location, found }) => {
        const query = `lat=53.1&lng=${String(location.lng)}&radius=0.5${found ? "&postcode=NG17+1AA" : ""}&mode=investment`;
        return [`/api/scores?${query}`, `/api/highlights?${query}`];
      }),
    );

    // Back to General, which has loaded already: nothing loads again.
    fetchMock.mockClear();
    rerender(<Harness mode={GENERAL} />);
    expect(rowCells("Location Score")).toEqual(["79 ★ Best", "66", "60"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("weighs every Location Score by the user's own weights", async () => {
    stubBackend();
    keep(SAVED);
    render(<Harness weights={{ safety: 100, transport: 0 }} />);
    await choose("Market", "Station");

    await waitFor(() => {
      expect(rowCells("Location Score")).toEqual(["70 ★ Best", "40"]);
    });
    expect(
      screen.getByRole("table").querySelector("caption")?.textContent,
    ).toBe("Compared in the General Scout Mode, with your own weights");
  });
});
