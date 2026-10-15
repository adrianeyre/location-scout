import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SERVED_LAYER_IDS,
  type AreaResponse,
  type ScoutMode,
} from "@location-scout/shared";

import {
  loadingLayers,
  unavailableLayer,
  type LayerStates,
  type SearchResult,
} from "../useSearchArea";
import { SettingsButton } from "../settings/SettingsButton";
import { Dashboard } from "./Dashboard";
import { dashboardOrder } from "./dashboard-data";
import { useDashboardLayout } from "./useDashboardLayout";

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
  council: {
    status: "ok",
    council: { code: "E07000170", name: "Ashfield" },
    inLandCoverageArea: true,
  },
  sources: [],
  layers: [],
};

const DEVELOPMENT: ScoutMode = {
  id: "development",
  name: "Development",
  question: "Is there development potential here?",
  weights: {
    safety: 0,
    amenities: 0,
    schools: 0,
    transport: 0,
    "green-space": 0,
    "property-activity": 50,
    "development-activity": 50,
    "planning-freedom": 0,
    demand: 0,
    competition: 0,
    footfall: 0,
  },
  competitors: null,
  highlightedLayers: ["land", "planning"],
  highlights: [],
};

const unavailable = (): LayerStates =>
  Object.fromEntries(
    SERVED_LAYER_IDS.map((id) => [id, unavailableLayer(id)]),
  ) as LayerStates;

const result = (changes: Partial<SearchResult> = {}): SearchResult => ({
  found: { kind: "postcode", label: "NG17 1AA" },
  area: AREA,
  layers: loadingLayers(),
  scores: { status: "loading" },
  highlights: { status: "loading" },
  ...changes,
});

/** The Dashboard with its Widgets' layout, kept above it as the app keeps it, and Settings beside it. */
const WithLayout = (
  props: Omit<ComponentProps<typeof Dashboard>, "widgetLayout">,
) => {
  const widgetLayout = useDashboardLayout(
    dashboardOrder(SERVED_LAYER_IDS, props.scoutMode?.highlightedLayers ?? []),
  );
  return (
    <>
      <SettingsButton widgetLayout={widgetLayout} />
      <Dashboard {...props} widgetLayout={widgetLayout} />
    </>
  );
};

const show = ({
  shown = result(),
  scoutMode = null,
  onClose = vi.fn(),
  onShowOnMap = vi.fn(),
}: {
  shown?: SearchResult | null;
  scoutMode?: ScoutMode | null;
  onClose?: () => void;
  onShowOnMap?: () => void;
} = {}) =>
  render(
    <WithLayout
      result={shown}
      scoutMode={scoutMode}
      weights={null}
      onClose={onClose}
      onShowOnMap={onShowOnMap}
    />,
  );

const card = (name: string) => screen.getByRole("region", { name });

describe("Dashboard", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("hides a Widget from its header, and Settings lists it hidden and shows it again", async () => {
    const user = userEvent.setup();
    show({ shown: result({ layers: unavailable() }) });
    await user.click(screen.getByRole("button", { name: "Hide Crime" }));
    expect(screen.queryByRole("region", { name: "Crime" })).toBeNull();
    expect(
      screen.getByText(/Crime hidden\. Show it again from Settings\./),
    ).toBeTruthy();
    // Focus goes on to the next Widget's grip, rather than being lost.
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(
      /^Move /,
    );

    await user.click(screen.getByRole("button", { name: "Settings" }));
    const settings = screen.getByRole("group", { name: "Dashboard Widgets" });
    const crime = within(settings).getByRole("checkbox", { name: "Crime" });
    expect((crime as HTMLInputElement).checked).toBe(false);
    expect(
      within(settings).getByText("1 of 12 hidden. Tick one to show it again."),
    ).toBeTruthy();
    expect(crime.closest("li")?.textContent).toContain("Hidden");
    expect(
      within(settings).getByRole("checkbox", { name: "Planning" }).closest("li")
        ?.textContent,
    ).toContain("Shown");

    await user.click(crime);
    expect((crime as HTMLInputElement).checked).toBe(true);
    expect(
      screen.getByRole("region", { name: "Crime", hidden: true }),
    ).toBeTruthy();
  });

  it("keeps the Widgets hidden for the next visit, until the layout is reset", async () => {
    const user = userEvent.setup();
    show({ shown: result({ layers: unavailable() }) });
    await user.click(screen.getByRole("button", { name: "Hide Land" }));
    cleanup();
    show({ shown: result({ layers: unavailable() }) });
    expect(screen.queryByRole("region", { name: "Land" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(screen.getByRole("region", { name: "Land" })).toBeTruthy();
  });

  it("says so when every Widget is hidden", async () => {
    const user = userEvent.setup();
    show({ shown: result({ layers: unavailable() }) });
    for (const button of screen.getAllByRole("button", { name: /^Hide / }))
      await user.click(button);
    expect(
      screen.getByText(
        "Every Widget is hidden. Show them again from Settings.",
      ),
    ).toBeTruthy();
  });

  it("says where it is and moves focus to its heading", () => {
    show();

    expect(
      screen.getByRole("main", { name: "Dashboard" }).textContent,
    ).toContain("NG17 1AA, 0.5 mile around it");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBe(
      document.activeElement,
    );
  });

  it("asks for a search before there is a Search Area", () => {
    show({ shown: null });

    expect(
      screen.getByText("Enter a postcode or an address to see its Dashboard."),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Crime" })).toBeNull();
  });

  it("marks each Layer's card busy while it loads, with no figures yet", () => {
    show();

    for (const name of ["Crime", "Property", "Demographics"]) {
      expect(card(name).getAttribute("aria-busy")).toBe("true");
      expect(within(card(name)).getByText("Loading…")).toBeTruthy();
    }
    expect(card("Location Score beta").textContent).toContain(
      "The scores follow once every Layer they need has loaded.",
    );
  });

  it("says a Layer is unavailable rather than drawing nothing", () => {
    show({ shown: result({ layers: unavailable() }) });

    expect(card("Crime").textContent).toContain(
      "Unavailable. Its Data Source didn't answer",
    );
    expect(card("Crime").getAttribute("aria-busy")).toBeNull();
  });

  it("puts the Layers the Scout Mode highlights first, marked as such", () => {
    show({ scoutMode: DEVELOPMENT });

    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map(({ textContent }) => textContent);
    expect(headings.slice(3, 6)).toEqual(["Planning", "Land", "Crime"]);
    expect(card("Land").textContent).toContain("Development");
  });

  it("goes back to the map, or to a Layer on it", async () => {
    const onClose = vi.fn();
    const onShowOnMap = vi.fn();
    show({ onClose, onShowOnMap });

    await userEvent.click(
      within(card("Transport")).getByRole("button", {
        name: "Show on the map: Transport",
      }),
    );
    expect(onShowOnMap).toHaveBeenCalledWith("transport");

    await userEvent.click(
      screen.getByRole("button", { name: "Back to the map" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
