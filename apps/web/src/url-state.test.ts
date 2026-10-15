import { describe, expect, it } from "vitest";

import { SEARCH_RADII_MILES } from "@location-scout/shared";

import {
  readUrlState,
  roundLocation,
  writeUrlState,
  type UrlState,
} from "./url-state";

const NG17_1AA = { lat: 53.123664, lng: -1.264078 };

describe("readUrlState", () => {
  it("reads the Location and Search Radius", () => {
    expect(readUrlState("?lat=53.123664&lng=-1.264078&radius=1")).toEqual({
      location: NG17_1AA,
      radius: 1,
      mode: "general",
      weights: null,
      hidden: [],
    });
  });

  it.each(SEARCH_RADII_MILES)("accepts a radius of %s mile", (miles) => {
    expect(readUrlState(`?radius=${String(miles)}`).radius).toBe(miles);
  });

  it("has no Location and a 0.5 mile radius for an empty URL", () => {
    expect(readUrlState("")).toEqual({
      location: null,
      radius: 0.5,
      mode: "general",
      weights: null,
      hidden: [],
    });
  });

  it.each(["2", "0", "-1", "0.3", "half", "", "Infinity", "1e999"])(
    "falls back to 0.5 mile for radius=%s",
    (radius) => {
      expect(
        readUrlState(`?lat=53.123664&lng=-1.264078&radius=${radius}`),
      ).toEqual({
        location: NG17_1AA,
        radius: 0.5,
        mode: "general",
        weights: null,
        hidden: [],
      });
    },
  );

  it.each([
    ["no longitude", "?lat=53.1"],
    ["no latitude", "?lng=-1.2"],
    ["a blank latitude", "?lat=&lng=-1.2"],
    ["a latitude beyond the pole", "?lat=91&lng=-1.2"],
    ["a longitude beyond 180°", "?lat=53.1&lng=181"],
    ["words", "?lat=north&lng=west"],
  ])("has no Location when given %s", (_, search) => {
    expect(readUrlState(search).location).toBeNull();
  });
});

describe("reading the hidden Layers", () => {
  it("shows every Layer when the URL hides none", () => {
    expect(readUrlState("?lat=53.123664&lng=-1.264078").hidden).toEqual([]);
  });

  it("reads the Layers the URL hides", () => {
    expect(readUrlState("?hidden=crime").hidden).toEqual(["crime"]);
  });

  it("puts them in the order Layers are listed, once each", () => {
    expect(readUrlState("?hidden=land,crime,land").hidden).toEqual([
      "crime",
      "land",
    ]);
  });

  it.each(["", "weather", "Crime", " crime"])(
    "ignores hidden=%s, which names no Layer",
    (hidden) => {
      expect(readUrlState(`?hidden=${hidden}`).hidden).toEqual([]);
    },
  );
});

describe("reading the Scout Mode", () => {
  it("is General when the URL names none", () => {
    expect(readUrlState("?lat=53.123664&lng=-1.264078").mode).toBe("general");
  });

  it("reads the Scout Mode the URL names, whichever it is", () => {
    expect(readUrlState("?mode=investment").mode).toBe("investment");
    // The modes are config: the backend's list says which exist.
    expect(readUrlState("?mode=fixture-commuter").mode).toBe(
      "fixture-commuter",
    );
  });

  it.each(["", "Buy to let", "INVESTMENT", "-cafe", "café"])(
    "falls back to General for mode=%s, which is no Scout Mode id",
    (mode) => {
      expect(readUrlState(`?mode=${encodeURIComponent(mode)}`).mode).toBe(
        "general",
      );
    },
  );
});

describe("reading the weights", () => {
  it("has none when the URL gives none, so the Scout Mode's defaults apply", () => {
    expect(readUrlState("?lat=53.123664&lng=-1.264078").weights).toBeNull();
  });

  it("reads the weights the URL gives, each a whole per cent", () => {
    expect(
      readUrlState("?mode=investment&weights=transport:60,property-activity:40")
        .weights,
    ).toEqual({ transport: 60, "property-activity": 40 });
  });

  it("reads a category given no weight", () => {
    expect(readUrlState("?weights=safety:0,amenities:100").weights).toEqual({
      safety: 0,
      amenities: 100,
    });
  });

  it.each([
    ["that don't total 100%", "safety:50,amenities:40"],
    ["over 100%", "safety:150,amenities:-50"],
    ["naming no category", "weather:50,amenities:50"],
    ["naming a category twice", "safety:50,safety:50"],
    ["that aren't whole", "safety:50.5,amenities:49.5"],
    ["with no weight", "safety,amenities:100"],
    ["with two", "safety:50:50,amenities:50"],
    ["that are blank", ""],
  ])("ignores weights %s", (_, weights) => {
    expect(readUrlState(`?weights=${weights}`).weights).toBeNull();
  });
});

describe("writeUrlState", () => {
  it("writes the Location and Search Radius", () => {
    expect(
      writeUrlState(
        {
          location: NG17_1AA,
          radius: 0.25,
          mode: "general",
          weights: null,
          hidden: [],
        },
        "",
      ),
    ).toBe("?lat=53.123664&lng=-1.264078&radius=0.25");
  });

  it("rounds coordinates to six decimal places", () => {
    expect(
      writeUrlState(
        {
          location: { lat: 53.12366412345, lng: -1.26407849 },
          radius: 0.5,
          mode: "general",
          weights: null,
          hidden: [],
        },
        "",
      ),
    ).toBe("?lat=53.123664&lng=-1.264078&radius=0.5");
  });

  it("replaces an invalid radius and drops a Location that is gone", () => {
    expect(
      writeUrlState(
        {
          location: null,
          radius: 0.5,
          mode: "general",
          weights: null,
          hidden: [],
        },
        "?lat=1&lng=2&radius=9&hidden=crime",
      ),
    ).toBe("?radius=0.5");
  });

  it("keeps parameters it doesn't know about", () => {
    expect(
      writeUrlState(
        {
          location: NG17_1AA,
          radius: 1,
          mode: "general",
          weights: null,
          hidden: [],
        },
        "?plan=pro&radius=0.5&layers=crime",
      ),
    ).toBe("?lat=53.123664&lng=-1.264078&radius=1&plan=pro&layers=crime");
  });

  it("writes the hidden Layers after the radius, in the order Layers are listed", () => {
    expect(
      writeUrlState(
        {
          location: NG17_1AA,
          radius: 0.5,
          mode: "general",
          weights: null,
          hidden: ["land", "crime"],
        },
        "?plan=pro",
      ),
    ).toBe(
      "?lat=53.123664&lng=-1.264078&radius=0.5&hidden=crime,land&plan=pro",
    );
  });

  it("writes the Scout Mode after the radius, and leaves General out", () => {
    const state: UrlState = {
      location: NG17_1AA,
      radius: 0.5,
      mode: "investment",
      weights: null,
      hidden: ["crime"],
    };

    expect(writeUrlState(state, "?mode=homebuyer")).toBe(
      "?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment&hidden=crime",
    );
    expect(
      writeUrlState({ ...state, mode: "general" }, "?mode=homebuyer"),
    ).toBe("?lat=53.123664&lng=-1.264078&radius=0.5&hidden=crime");
    expect(readUrlState(writeUrlState(state, ""))).toEqual(state);
  });

  it("writes the weights after the Scout Mode, in the order categories are listed, and leaves out the defaults", () => {
    const state: UrlState = {
      location: NG17_1AA,
      radius: 0.5,
      mode: "investment",
      weights: { "property-activity": 45, transport: 55 },
      hidden: ["crime"],
    };

    expect(writeUrlState(state, "?weights=safety:100")).toBe(
      "?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment&weights=transport:55,property-activity:45&hidden=crime",
    );
    expect(
      writeUrlState({ ...state, weights: null }, "?weights=safety:100"),
    ).toBe(
      "?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment&hidden=crime",
    );
    expect(readUrlState(writeUrlState(state, ""))).toEqual(state);
  });

  it("round-trips the hidden Layers through readUrlState", () => {
    const state: UrlState = {
      location: NG17_1AA,
      radius: 0.5,
      mode: "general",
      weights: null,
      hidden: ["crime", "planning"],
    };

    expect(readUrlState(writeUrlState(state, ""))).toEqual(state);
  });

  it("round-trips through readUrlState", () => {
    for (const radius of SEARCH_RADII_MILES) {
      const state = {
        location: NG17_1AA,
        radius,
        mode: "general",
        weights: null,
        hidden: [],
      };
      expect(readUrlState(writeUrlState(state, ""))).toEqual(state);
    }
  });
});

describe("roundLocation", () => {
  it("keeps a Location to the URL's six decimal places", () => {
    const clicked = { lat: 53.143512345678, lng: -1.198587654321 };

    expect(roundLocation(clicked)).toEqual({ lat: 53.143512, lng: -1.198588 });
    expect(
      readUrlState(
        writeUrlState(
          {
            location: clicked,
            radius: 0.5,
            mode: "general",
            weights: null,
            hidden: [],
          },
          "",
        ),
      ),
    ).toEqual({
      location: roundLocation(clicked),
      radius: 0.5,
      mode: "general",
      weights: null,
      hidden: [],
    });
  });
});
