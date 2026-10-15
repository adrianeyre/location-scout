import { describe, expect, it } from "vitest";

import {
  NAME_MAX_LENGTH,
  SAVED_LOCATIONS_FORMAT,
  SAVED_LOCATIONS_KEY,
  describeView,
  exportFileName,
  loadSavedLocations,
  mergeSavedLocations,
  readSavedLocations,
  storeSavedLocations,
  tidyName,
  usableStorage,
  writeSavedLocations,
  type SavedLocation,
} from "./saved-locations";

const HOME: SavedLocation = {
  id: "a1",
  name: "Home",
  savedAt: "2026-10-09T09:15:00.000Z",
  location: { lat: 53.123664, lng: -1.264078 },
  radius: 0.5,
  mode: "general",
  weights: null,
  found: { kind: "postcode", label: "NG17 1AA" },
};

const CAFE: SavedLocation = {
  id: "b2",
  name: "Café on the high street",
  savedAt: "2026-10-09T10:30:00.000Z",
  location: { lat: 53.140824, lng: -1.277369 },
  radius: 0.25,
  mode: "business-cafe",
  // Out of order: the file gives them in `CATEGORY_IDS` order.
  weights: { competition: 40, safety: 10, demand: 50 },
  found: null,
};

/** A file of Saved Locations as `writeSavedLocations` gives one, with `savedLocations` swapped. */
const fileOf = (savedLocations: unknown[]) =>
  JSON.stringify({
    format: SAVED_LOCATIONS_FORMAT,
    version: 1,
    savedLocations,
  });

/** Local storage as jsdom gives it, emptied, or one that refuses writes. */
const memoryStorage = ({ refuse = false } = {}): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      if (refuse) {
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError",
        );
      }
      items.set(key, value);
    },
  };
};

describe("writeSavedLocations and readSavedLocations", () => {
  it("round-trip Saved Locations, with their weights in category order", () => {
    const text = writeSavedLocations([HOME, CAFE]);

    expect(JSON.parse(text)).toEqual({
      format: "location-scout.saved-locations",
      version: 1,
      savedLocations: [
        HOME,
        { ...CAFE, weights: { safety: 10, demand: 50, competition: 40 } },
      ],
    });
    expect(
      Object.keys(
        (JSON.parse(text) as { savedLocations: SavedLocation[] })
          .savedLocations[1]?.weights ?? {},
      ),
    ).toEqual(["safety", "demand", "competition"]);
    expect(readSavedLocations(text)).toEqual({
      ok: true,
      savedLocations: [HOME, CAFE],
      skipped: 0,
    });
  });

  it("skips and counts any Saved Location that is invalid or repeats an id", () => {
    const read = readSavedLocations(
      fileOf([
        HOME,
        { ...CAFE, radius: 2 },
        { ...CAFE, id: "c3", location: { lat: 91, lng: 0 } },
        { ...CAFE, id: "d4", name: "   " },
        { ...CAFE, id: "e5", mode: "Business Café" },
        { ...CAFE, id: "f6", weights: { safety: 60, demand: 50 } },
        { ...CAFE, id: "g7", weights: { safety: 50.5, demand: 49.5 } },
        { ...CAFE, id: "h8", weights: { colour: 100 } },
        { ...CAFE, id: "i9", savedAt: "yesterday" },
        { ...HOME, name: "Home again" },
        "Home",
        null,
        CAFE,
      ]),
    );

    expect(read).toEqual({
      ok: true,
      savedLocations: [HOME, CAFE],
      skipped: 11,
    });
  });

  it("tidies a name, and reads a missing postcode or weights as none", () => {
    const bare = {
      id: HOME.id,
      name: "  My\n  home  ",
      savedAt: HOME.savedAt,
      location: HOME.location,
      radius: HOME.radius,
      mode: HOME.mode,
    };

    expect(readSavedLocations(fileOf([bare]))).toEqual({
      ok: true,
      savedLocations: [
        { ...HOME, name: "My home", weights: null, found: null },
      ],
      skipped: 0,
    });
  });

  it("refuses text that isn't JSON, or isn't a file of Saved Locations, or is of a later version", () => {
    expect(readSavedLocations("<html>")).toEqual({
      ok: false,
      message: "It isn't a JSON file.",
    });
    expect(readSavedLocations(JSON.stringify([HOME]))).toEqual({
      ok: false,
      message: "It isn't a file of Saved Locations exported by Location Scout.",
    });
    expect(
      readSavedLocations(
        JSON.stringify({
          format: SAVED_LOCATIONS_FORMAT,
          version: 2,
          savedLocations: [],
        }),
      ),
    ).toEqual({
      ok: false,
      message:
        "It was exported by a version of Location Scout this one can't read.",
    });
  });
});

describe("tidyName", () => {
  it("trims a name, makes each run of spaces one, and cuts it to its longest", () => {
    expect(tidyName("  Sutton\t in  Ashfield ")).toBe("Sutton in Ashfield");
    expect(tidyName("x".repeat(NAME_MAX_LENGTH + 20))).toHaveLength(
      NAME_MAX_LENGTH,
    );
    expect(tidyName(" \n ")).toBe("");
  });
});

describe("mergeSavedLocations", () => {
  it("replaces one with the same id where it is, and adds the rest at the end", () => {
    const renamed = { ...HOME, name: "Home, renamed elsewhere" };
    const other = { ...CAFE, id: "z9" };

    expect(mergeSavedLocations([HOME, CAFE], [other, renamed])).toEqual([
      renamed,
      CAFE,
      other,
    ]);
  });
});

describe("exportFileName", () => {
  it("names the file with the day it was exported", () => {
    expect(exportFileName(new Date("2026-10-09T12:00:00Z"))).toBe(
      "location-scout-saved-locations-2026-10-09.json",
    );
  });
});

describe("describeView", () => {
  it("says what a Saved Location keeps, naming its Scout Mode once the modes have loaded", () => {
    expect(describeView(HOME, { status: "loading" })).toBe(
      "0.5 mile around NG17 1AA, in the general Scout Mode, with its default weights",
    );
    expect(
      describeView(CAFE, {
        status: "ok",
        modes: [
          {
            id: "business-cafe",
            name: "Business: Café",
            question: "Could I open a café here?",
            weights: {
              safety: 10,
              amenities: 5,
              schools: 0,
              transport: 15,
              "green-space": 0,
              "property-activity": 0,
              "development-activity": 0,
              "planning-freedom": 5,
              demand: 20,
              competition: 25,
              footfall: 20,
            },
            competitors: null,
            highlightedLayers: [],
            highlights: [],
          },
        ],
      }),
    ).toBe(
      "0.25 mile around 53.140824, -1.277369, in the Business: Café Scout Mode, with your own weights",
    );
  });
});

describe("browser storage", () => {
  it("keeps Saved Locations, and loads them again", () => {
    const storage = memoryStorage();

    expect(loadSavedLocations(storage)).toEqual([]);
    expect(storeSavedLocations(storage, [HOME, CAFE])).toBe(true);
    expect(storage.getItem(SAVED_LOCATIONS_KEY)).toBe(
      writeSavedLocations([HOME, CAFE]),
    );
    expect(loadSavedLocations(storage)).toEqual([HOME, CAFE]);
  });

  it("loads none from storage holding something else", () => {
    const storage = memoryStorage();
    storage.setItem(SAVED_LOCATIONS_KEY, "{not json");

    expect(loadSavedLocations(storage)).toEqual([]);
  });

  it("says when the browser refuses to keep them", () => {
    expect(storeSavedLocations(memoryStorage({ refuse: true }), [HOME])).toBe(
      false,
    );
  });

  it("uses storage only if it can be written to", () => {
    const storage = memoryStorage();

    expect(usableStorage(() => storage)).toBe(storage);
    // The probe leaves nothing behind.
    expect(storage.length).toBe(0);
    expect(usableStorage(() => memoryStorage({ refuse: true }))).toBeNull();
    expect(usableStorage(() => null)).toBeNull();
    expect(
      usableStorage(() => {
        throw new DOMException(
          "Access is denied for this document.",
          "SecurityError",
        );
      }),
    ).toBeNull();
  });
});
