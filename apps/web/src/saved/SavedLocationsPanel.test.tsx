import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScoutModesState } from "../useScoutModes";
import { SAVED_LOCATIONS_KEY, type SavedView } from "./saved-locations";
import { SavedLocationsPanel, type Saveable } from "./SavedLocationsPanel";
import { useSavedLocations } from "./useSavedLocations";

const WEIGHTS = {
  safety: 25,
  amenities: 15,
  schools: 10,
  transport: 15,
  "green-space": 10,
  "property-activity": 10,
  "development-activity": 5,
  "planning-freedom": 10,
  demand: 0,
  competition: 0,
  footfall: 0,
};

const MODES: ScoutModesState = {
  status: "ok",
  modes: [
    {
      id: "general",
      name: "General",
      question: "What is it like here?",
      weights: WEIGHTS,
      competitors: null,
      highlightedLayers: [],
      highlights: [],
    },
    {
      id: "investment",
      name: "Investment",
      question: "Should I invest in property here?",
      weights: WEIGHTS,
      competitors: null,
      highlightedLayers: [],
      highlights: [],
    },
  ],
};

const NG17_1AA: Saveable = {
  view: {
    location: { lat: 53.123664, lng: -1.264078 },
    radius: 0.5,
    mode: "general",
    weights: null,
    found: { kind: "postcode", label: "NG17 1AA" },
  },
  suggestedName: "NG17 1AA",
};

const MAP_CLICK: Saveable = {
  view: {
    location: { lat: 53.140824, lng: -1.277369 },
    radius: 1,
    mode: "investment",
    weights: { safety: 40, transport: 60 },
    found: null,
  },
  suggestedName: "Near NG17 1BB",
};

interface PanelProps {
  current?: Saveable | null;
  storage?: () => Storage | null;
  onOpen?: (view: SavedView) => void;
}

/** The Saved tab, with its Saved Locations kept in `storage`: jsdom's local storage unless given. */
const Panel = ({
  current = NG17_1AA,
  storage = () => window.localStorage,
  onOpen = () => undefined,
}: PanelProps) => {
  const saved = useSavedLocations(storage);
  return (
    <SavedLocationsPanel
      saved={saved}
      current={current}
      modes={MODES}
      onOpen={onOpen}
    />
  );
};

const savedList = () => screen.getByRole("list", { name: "Saved Locations" });

const savedNames = () =>
  within(savedList())
    .getAllByRole("heading")
    .map(({ textContent }) => textContent);

const save = async (name: string) => {
  const user = userEvent.setup();
  const input = screen.getByLabelText("Name");
  await user.clear(input);
  if (name) await user.type(input, name);
  await user.click(
    screen.getByRole("button", { name: "Save this Search Area" }),
  );
};

/** The JSON the Export button downloads, and the file's name. */
const exportJson = async () => {
  let blob: Blob | undefined;
  const createObjectURL = vi.fn((made: Blob) => {
    blob = made;
    return "blob:saved-locations";
  });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }),
  );
  const downloads: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Export as JSON" }));
  if (!blob) throw new Error("nothing was exported");
  return { text: await blob.text(), name: downloads[0], type: blob.type };
};

const importJson = async (text: string, name = "saved.json") => {
  await userEvent
    .setup()
    .upload(
      screen.getByLabelText("Import from JSON"),
      new File([text], name, { type: "application/json" }),
    );
};

describe("SavedLocationsPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("saves the Search Area shown under the name given, or the one offered, and keeps them through a reload", async () => {
    const { unmount, rerender } = render(<Panel />);
    expect(screen.getByText("No Saved Locations yet.")).toBeTruthy();
    expect(
      screen.getByText(
        "Saves 0.5 mile around NG17 1AA, in the General Scout Mode, with its default weights.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Name").placeholder).toBe(
      "NG17 1AA",
    );

    await save("");
    expect(screen.getByRole("status").textContent).toBe("Saved NG17 1AA.");
    rerender(<Panel current={MAP_CLICK} />);
    expect(
      screen.getByText(
        "Saves 1 mile around 53.140824, -1.277369, in the Investment Scout Mode, with your own weights.",
      ),
    ).toBeTruthy();
    await save("  Investment   by the station ");

    expect(savedNames()).toEqual(["NG17 1AA", "Investment by the station"]);
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("");

    // A reload reads them back from local storage.
    unmount();
    render(<Panel current={null} />);
    expect(savedNames()).toEqual(["NG17 1AA", "Investment by the station"]);
    const second = within(savedList()).getAllByRole("listitem")[1];
    if (!second) throw new Error("no second Saved Location");
    expect(
      within(second).getByText(
        "1 mile around 53.140824, -1.277369, in the Investment Scout Mode, with your own weights.",
      ),
    ).toBeTruthy();
    expect(
      within(second).getByText(/^Saved \d{1,2} [A-Z][a-z]+ \d{4}\D+\d\d:\d\d$/),
    ).toBeTruthy();
    // Nothing to save until a Search Area has loaded.
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Save this Search Area",
      }).disabled,
    ).toBe(true);
    expect(
      screen.getByText("Search for a Location first, then save it here."),
    ).toBeTruthy();
  });

  it("opens a Saved Location's view", async () => {
    const onOpen = vi.fn();
    render(<Panel current={MAP_CLICK} onOpen={onOpen} />);
    await save("By the station");

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Open By the station" }));

    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ name: "By the station", ...MAP_CLICK.view }),
    );
  });

  it("renames a Saved Location, keeping its name if the new one is blank or cancelled", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Panel />);
    await save("Home");

    await user.click(screen.getByRole("button", { name: "Rename Home" }));
    const rename = screen.getByRole("form", { name: "Rename Home" });
    const input = within(rename).getByLabelText("New name");
    expect(document.activeElement).toBe(input);
    await user.clear(input);
    expect(
      within(rename).getByRole<HTMLButtonElement>("button", {
        name: "Save name",
      }).disabled,
    ).toBe(true);
    await user.type(input, "Old home{Escape}");
    expect(savedNames()).toEqual(["Home"]);

    await user.click(screen.getByRole("button", { name: "Rename Home" }));
    const again = within(
      screen.getByRole("form", { name: "Rename Home" }),
    ).getByLabelText("New name");
    await user.clear(again);
    await user.type(again, "Sutton home{Enter}");

    expect(savedNames()).toEqual(["Sutton home"]);
    unmount();
    render(<Panel />);
    expect(savedNames()).toEqual(["Sutton home"]);
  });

  it("deletes a Saved Location once the user confirms it", async () => {
    const user = userEvent.setup();
    const { unmount, rerender } = render(<Panel />);
    await save("Home");
    rerender(<Panel current={MAP_CLICK} />);
    await save("Station");

    await user.click(screen.getByRole("button", { name: "Delete Home" }));
    expect(
      screen.getByText(
        "Delete Home? Nothing else keeps it unless you have exported it.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep Home" }));
    expect(savedNames()).toEqual(["Home", "Station"]);

    await user.click(screen.getByRole("button", { name: "Delete Home" }));
    await user.click(screen.getByRole("button", { name: "Delete Home" }));
    expect(savedNames()).toEqual(["Station"]);

    unmount();
    render(<Panel />);
    expect(savedNames()).toEqual(["Station"]);
  });

  it("exports them as JSON, which imports into another browser as they were", async () => {
    const { rerender, unmount } = render(<Panel />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Export as JSON" })
        .disabled,
    ).toBe(true);
    await save("Home");
    rerender(<Panel current={MAP_CLICK} />);
    await save("Station");
    const before = savedNames();
    const stored = window.localStorage.getItem(SAVED_LOCATIONS_KEY);

    const exported = await exportJson();

    expect(exported.name).toMatch(
      /^location-scout-saved-locations-\d{4}-\d\d-\d\d\.json$/,
    );
    expect(exported.type).toBe("application/json");
    expect(exported.text).toBe(stored);

    // Another browser: nothing saved yet.
    unmount();
    window.localStorage.clear();
    render(<Panel />);
    expect(screen.getByText("No Saved Locations yet.")).toBeTruthy();

    await importJson(exported.text);

    expect(await screen.findByText("Imported 2 Saved Locations.")).toBeTruthy();
    expect(savedNames()).toEqual(before);
    expect(window.localStorage.getItem(SAVED_LOCATIONS_KEY)).toBe(stored);

    // Imported again, each replaces itself rather than repeating.
    await importJson(exported.text);
    expect(savedNames()).toEqual(before);
  });

  it("says what was left out of an import, and why a file couldn't be imported", async () => {
    render(<Panel />);
    await save("Home");
    const exported = await exportJson();
    const file = JSON.parse(exported.text) as { savedLocations: unknown[] };

    await importJson(
      JSON.stringify({
        ...file,
        savedLocations: [
          ...file.savedLocations,
          { id: "x", name: "Broken" },
          { id: "y", name: "Broken too" },
        ],
      }),
    );
    expect(
      await screen.findByText(
        "Imported 1 Saved Location. 2 others were left out, as unreadable or repeated.",
      ),
    ).toBeTruthy();

    await importJson("name,lat,lng", "saved.csv");
    expect(
      await screen.findByText("Couldn't import it. It isn't a JSON file."),
    ).toBeTruthy();
    expect(savedNames()).toEqual(["Home"]);
  });

  it("says saving is off, and offers nothing, when the browser won't let it use storage", () => {
    render(
      <Panel
        storage={() => {
          throw new DOMException(
            "Access is denied for this document.",
            "SecurityError",
          );
        }}
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(
      /^Saving is off: this browser won't let Location Scout keep anything in its storage/,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByLabelText("Import from JSON")).toBeNull();
  });

  it("says when the browser refuses a change, and makes none", async () => {
    render(<Panel />);
    await save("Home");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    });

    await save("Station");

    expect(screen.getByRole("alert").textContent).toBe(
      "The browser refused to keep that change, so it wasn't made: its storage may be full.",
    );
    expect(savedNames()).toEqual(["Home"]);
  });

  it("follows Saved Locations changed in another tab", async () => {
    render(<Panel />);
    await save("Home");
    const stored = window.localStorage.getItem(SAVED_LOCATIONS_KEY) ?? "";
    window.localStorage.setItem(
      SAVED_LOCATIONS_KEY,
      stored.replace('"Home"', '"Renamed in another tab"'),
    );

    window.dispatchEvent(
      new StorageEvent("storage", { key: SAVED_LOCATIONS_KEY }),
    );

    expect(await screen.findByText("Renamed in another tab")).toBeTruthy();
  });
});
