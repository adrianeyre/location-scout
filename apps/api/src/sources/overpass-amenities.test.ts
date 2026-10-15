import { describe, expect, it } from "vitest";

import {
  AMENITY_TYPES,
  distanceMetres,
  isAmenityFeature,
  isAmenityStatistics,
} from "@location-scout/shared";

import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import ng17Overpass from "./fixtures/overpass-ng17-1aa.json" with { type: "json" };
import { mapOverpassResponse, type OsmElement } from "./overpass";
import {
  AMENITY_FILTERS,
  amenityStatistics,
  classifyAmenity,
  mapAmenities,
} from "./overpass-amenities";

const NG17_1AA = NG17_1AA_AREA.location;

const { elements: ng17Elements } = mapOverpassResponse(200, ng17Overpass);

const element = (
  id: string,
  tags: Record<string, string>,
  location = NG17_1AA,
): OsmElement => ({ id, location, tags });

describe("AMENITY_FILTERS", () => {
  it("asks for any shop, office or healthcare, and only the amenities and leisure the Layer shows", () => {
    expect(AMENITY_FILTERS).toEqual([
      '["shop"]',
      '["amenity"~"^(cafe|restaurant|fast_food|pub|dentist|kindergarten|childcare|doctors|clinic|hospital|pharmacy)$"]',
      '["leisure"="fitness_centre"]',
      '["healthcare"]',
      '["office"]',
    ]);
  });
});

describe("classifyAmenity", () => {
  it.each([
    [{ shop: "supermarket" }, "supermarket", "shop=supermarket"],
    [{ shop: "convenience" }, "convenience-store", "shop=convenience"],
    [{ shop: "hairdresser" }, "hairdresser", "shop=hairdresser"],
    [{ shop: "bakery" }, "shop", "shop=bakery"],
    [{ amenity: "cafe" }, "cafe", "amenity=cafe"],
    [{ amenity: "restaurant" }, "restaurant", "amenity=restaurant"],
    [{ amenity: "fast_food" }, "takeaway", "amenity=fast_food"],
    [{ amenity: "pub" }, "pub", "amenity=pub"],
    [{ leisure: "fitness_centre" }, "gym", "leisure=fitness_centre"],
    [{ amenity: "dentist" }, "dentist", "amenity=dentist"],
    [{ healthcare: "dentist" }, "dentist", "healthcare=dentist"],
    [{ amenity: "kindergarten" }, "nursery", "amenity=kindergarten"],
    [{ amenity: "childcare" }, "nursery", "amenity=childcare"],
    [{ amenity: "doctors" }, "healthcare", "amenity=doctors"],
    [{ amenity: "pharmacy" }, "healthcare", "amenity=pharmacy"],
    [
      { healthcare: "physiotherapist" },
      "healthcare",
      "healthcare=physiotherapist",
    ],
    [{ office: "estate_agent" }, "office", "office=estate_agent"],
  ])("makes %o a %s, by %s", (tags, type, osmTag) => {
    expect(classifyAmenity(tags)).toEqual({ type, osmTag });
  });

  it.each([
    [
      "a café that is also a bakery a café",
      { amenity: "cafe", shop: "bakery" },
      "cafe",
    ],
    [
      "a pharmacy also tagged as healthcare healthcare once",
      { amenity: "pharmacy", healthcare: "pharmacy" },
      "healthcare",
    ],
    [
      "a dentist also tagged as healthcare a dentist",
      { amenity: "dentist", healthcare: "dentist" },
      "dentist",
    ],
    [
      "a supermarket's office a supermarket",
      { shop: "supermarket", office: "company" },
      "supermarket",
    ],
  ])("makes %s", (_label, tags, type) => {
    expect(classifyAmenity(tags)?.type).toBe(type);
  });

  it.each([
    ["a vacant shop", { shop: "vacant" }],
    ["a shop that is no more", { shop: "no" }],
    ["a disused office", { office: "disused" }],
    ["an amenity the Layer doesn't show", { amenity: "bank" }],
    ["a bus stop, for the Transport Layer", { highway: "bus_stop" }],
  ])("leaves out %s", (_label, tags) => {
    expect(classifyAmenity(tags)).toBeNull();
  });
});

describe("mapAmenities", () => {
  it("maps NG17 1AA's recorded amenities, leaving out its 41 vacant shops", () => {
    const features = mapAmenities(ng17Elements, NG17_1AA);

    expect(features).toHaveLength(197);
    expect(features.every(isAmenityFeature)).toBe(true);
    expect(
      ng17Elements.filter(({ tags }) => tags.shop === "vacant"),
    ).toHaveLength(41);
  });

  it("names each amenity and gives its type, its tag and its distance from the Location", () => {
    const features = mapAmenities(ng17Elements, NG17_1AA);

    const costa = features.find(({ id }) => id === "way/251921972");
    expect(costa).toMatchObject({
      type: "cafe",
      name: "Costa",
      osmTag: "amenity=cafe",
      distanceMetres: 110,
    });
    for (const { location, distanceMetres: metres } of features) {
      expect(metres).toBe(Math.round(distanceMetres(NG17_1AA, location)));
      expect(metres).toBeLessThanOrEqual(NG17_1AA_AREA.searchRadius.metres);
    }
  });

  it("gives an amenity OpenStreetMap names nothing no name", () => {
    const [unnamed] = mapAmenities(
      [element("node/1", { amenity: "cafe", name: " " })],
      NG17_1AA,
    );

    expect(unnamed).toMatchObject({ name: null, type: "cafe" });
  });

  it("lists each type in turn, nearest first", () => {
    const north = (metres: number) => ({
      lat: NG17_1AA.lat + metres / 111_195,
      lng: NG17_1AA.lng,
    });
    const features = mapAmenities(
      [
        element("node/1", { office: "lawyer" }, north(10)),
        element("node/2", { amenity: "cafe", name: "B" }, north(300)),
        element("node/3", { shop: "bakery" }, north(500)),
        element("node/4", { amenity: "cafe", name: "A" }, north(100)),
      ],
      NG17_1AA,
    );

    expect(features.map(({ id }) => id)).toEqual([
      "node/3",
      "node/4",
      "node/2",
      "node/1",
    ]);
  });

  it("counts an element found twice once", () => {
    const pub = element("way/7", { amenity: "pub" });

    expect(mapAmenities([pub, pub], NG17_1AA)).toHaveLength(1);
  });
});

describe("amenityStatistics", () => {
  it("counts NG17 1AA's recorded amenities by type, and finds the nearest of each", () => {
    const statistics = amenityStatistics(mapAmenities(ng17Elements, NG17_1AA));

    expect(isAmenityStatistics(statistics)).toBe(true);
    expect(statistics.total).toBe(197);
    expect(
      statistics.byType.map(({ type, count, nearest }) => [
        type,
        count,
        nearest?.name,
        nearest?.distanceMetres,
      ]),
    ).toEqual([
      ["shop", 100, "Premier E Cigs", 43],
      ["convenience-store", 10, "Friend Mini Market", 141],
      ["cafe", 11, "Costa", 110],
      ["restaurant", 5, "Kera Dine", 40],
      ["takeaway", 17, "Sea Fish", 58],
      ["pub", 8, "Devonshire Arms", 187],
      ["supermarket", 4, "Heron Foods", 222],
      ["gym", 2, "Kickstart Gym", 369],
      ["hairdresser", 17, "Styles Barbers Shop", 73],
      ["dentist", 1, "Bupa Dental Care", 174],
      ["nursery", 2, "The Learning Tree Nursery", 550],
      ["healthcare", 6, "Boots", 179],
      ["office", 14, "Hopkins Solicitors", 45],
    ]);
  });

  it("gives every type, with none nearest, in a Search Area with no amenities", () => {
    expect(amenityStatistics([])).toEqual({
      total: 0,
      byType: AMENITY_TYPES.map((type) => ({ type, count: 0, nearest: null })),
    });
  });
});
