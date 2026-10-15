import type { SearchArea } from "@location-scout/shared";

import cambridgeOutlines from "../sources/fixtures/planning-data-cambridge-outlines.json" with { type: "json" };
import cambridgePage2 from "../sources/fixtures/planning-data-cambridge-offset-500.json" with { type: "json" };
import cambridgePage1 from "../sources/fixtures/planning-data-cambridge.json" with { type: "json" };
import ng17Outlines from "../sources/fixtures/planning-data-ng17-1aa-outlines.json" with { type: "json" };
import ng17Constraints from "../sources/fixtures/planning-data-ng17-1aa.json" with { type: "json" };
import { constraintsUrl, outlinesAtUrl } from "../sources/planning-data";
import { NG17_1AA_AREA } from "./police-ng17-1aa";

/**
 * planning.data.gov.uk's answers for NG17 1AA's 0.5 mile Search Area, by the
 * URL asked: one page holding a conservation area, which the Location is
 * inside, and 8 listed buildings; and no listed building outlines at the
 * Location.
 */
export const NG17_1AA_PLANNING_DATA: ReadonlyMap<string, unknown> = new Map<
  string,
  unknown
>([
  [constraintsUrl(NG17_1AA_AREA), ng17Constraints],
  [outlinesAtUrl(NG17_1AA_AREA.location), ng17Outlines],
]);

/** The middle of Cambridge, by Great St Mary's, at 0.5 mile. */
export const CAMBRIDGE_AREA: SearchArea = {
  location: { lat: 52.2053, lng: 0.1218 },
  searchRadius: { miles: 0.5, metres: 804.672 },
};

/**
 * planning.data.gov.uk's answers for `CAMBRIDGE_AREA`, by the URL asked: two
 * pages, 635 entities of every type between them, and no listed building
 * outlines at the Location.
 */
export const CAMBRIDGE_PLANNING_DATA: ReadonlyMap<string, unknown> = new Map<
  string,
  unknown
>([
  [constraintsUrl(CAMBRIDGE_AREA), cambridgePage1],
  [constraintsUrl(CAMBRIDGE_AREA, 500), cambridgePage2],
  [outlinesAtUrl(CAMBRIDGE_AREA.location), cambridgeOutlines],
]);
