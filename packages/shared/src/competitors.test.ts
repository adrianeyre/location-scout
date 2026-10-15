import { describe, expect, it } from "vitest";

import {
  competitorTagText,
  isCompetitor,
  isCompetitorTag,
  isCompetitors,
} from "./competitors";

const cafes = [{ key: "amenity", values: ["cafe"] }];
const shops = [{ key: "shop", values: null }];
const nurseries = [{ key: "amenity", values: ["kindergarten", "childcare"] }];

describe("isCompetitor", () => {
  it("matches the tag that made an amenity its type, by key and value", () => {
    expect(isCompetitor({ osmTag: "amenity=cafe" }, cafes)).toBe(true);
    expect(isCompetitor({ osmTag: "amenity=restaurant" }, cafes)).toBe(false);
    expect(isCompetitor({ osmTag: "shop=cafe" }, cafes)).toBe(false);
    expect(isCompetitor({ osmTag: "amenity=childcare" }, nurseries)).toBe(true);
    expect(isCompetitor({ osmTag: "amenity=kindergarten" }, nurseries)).toBe(
      true,
    );
  });

  it("matches any value of a key whose values are null, as shop=* does", () => {
    for (const osmTag of [
      "shop=convenience",
      "shop=hairdresser",
      "shop=charity",
      "shop=yes",
    ]) {
      expect(isCompetitor({ osmTag }, shops), osmTag).toBe(true);
    }
    expect(isCompetitor({ osmTag: "office=estate_agent" }, shops)).toBe(false);
    // A café is a café, even if it is a bakery too: its tag is amenity=cafe.
    expect(isCompetitor({ osmTag: "amenity=cafe" }, shops)).toBe(false);
  });

  it("matches nothing without tags, or with a tag it can't read", () => {
    expect(isCompetitor({ osmTag: "amenity=cafe" }, [])).toBe(false);
    expect(isCompetitor({ osmTag: "amenity" }, shops)).toBe(false);
  });

  it("splits a tag at its first =", () => {
    expect(
      isCompetitor({ osmTag: "shop=a=b" }, [{ key: "shop", values: ["a=b"] }]),
    ).toBe(true);
  });
});

describe("competitorTagText", () => {
  it("writes each tag as OpenStreetMap does", () => {
    expect(competitorTagText({ key: "shop", values: null })).toEqual([
      "shop=*",
    ]);
    expect(
      competitorTagText({
        key: "amenity",
        values: ["kindergarten", "childcare"],
      }),
    ).toEqual(["amenity=kindergarten", "amenity=childcare"]);
  });
});

describe("isCompetitors", () => {
  it("accepts a name and one or more tags", () => {
    expect(isCompetitors({ name: "cafés", tags: cafes })).toBe(true);
    expect(isCompetitors({ name: "shops", tags: shops })).toBe(true);
    expect(isCompetitorTag({ key: "shop", values: null })).toBe(true);
  });

  it.each([
    null,
    { name: "cafés" },
    { name: "", tags: cafes },
    { name: "cafés", tags: [] },
    { name: "cafés", tags: [{ key: "", values: null }] },
    { name: "cafés", tags: [{ key: "amenity", values: [] }] },
    { name: "cafés", tags: [{ key: "amenity", values: [""] }] },
    { name: "cafés", tags: [{ key: "amenity" }] },
  ])("rejects %j", (value) => {
    expect(isCompetitors(value)).toBe(false);
  });
});
