import { milesToMetres, type SearchArea } from "@location-scout/shared";

import ng17Overpass from "../sources/fixtures/overpass-ng17-1aa.json" with { type: "json" };
import suttonParkwayOverpass from "../sources/fixtures/overpass-sutton-parkway.json" with { type: "json" };
import { overpassBody } from "../sources/overpass";
import { NG17_1AA_AREA } from "./police-ng17-1aa";

/**
 * Overpass's answer for NG17 1AA's 0.5 mile Search Area, by the form body of
 * the query, as OpenStreetMap stood on 8 October 2026: 614 elements. For the
 * Amenities Layer, 197 amenities once the 41 vacant shops are left out. For
 * the Transport Layer, 58 bus stops, 33 car parks and an EV charger, 249
 * paths and cycleways with their lines, and the three railway stations within
 * 5 km, the nearest Sutton Parkway, 1,628 m away. For the Green space Layer,
 * the outlines of 3 playgrounds and 4 woods, and of the 23 parks within 2 km,
 * 6 of which reach into the Search Area, the nearest 104 m away. None is
 * mapped as a relation.
 */
export const NG17_1AA_OVERPASS: ReadonlyMap<string, unknown> = new Map<
  string,
  unknown
>([[overpassBody(NG17_1AA_AREA), ng17Overpass]]);

/**
 * A 0.25 mile Search Area 50 m from Sutton Parkway station, the nearest to
 * NG17 1AA, so that one railway station is inside a recorded Search Area.
 */
export const SUTTON_PARKWAY_AREA: SearchArea = {
  location: { lat: 53.1145, lng: -1.246 },
  searchRadius: { miles: 0.25, metres: milesToMetres(0.25) },
};

/**
 * Overpass's answer for `SUTTON_PARKWAY_AREA`, by the form body of the query,
 * as OpenStreetMap stood on 8 October 2026: Sutton Parkway station, 5 bus
 * stops, 12 car parks (2 of them private, so left out), 51 paths and
 * cycleways with their lines, and the outlines of 5 woods and of the 18 parks
 * within 2 km, 2 of which reach into the Search Area.
 */
export const SUTTON_PARKWAY_OVERPASS: ReadonlyMap<string, unknown> = new Map<
  string,
  unknown
>([[overpassBody(SUTTON_PARKWAY_AREA), suttonParkwayOverpass]]);
