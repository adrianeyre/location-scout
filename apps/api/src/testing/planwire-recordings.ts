import ng17Applications from "../sources/fixtures/planwire-ng17-1aa.json" with { type: "json" };
import { nearbyUrl } from "../sources/planwire";
import { NG17_1AA_AREA } from "./police-ng17-1aa";

/** The key tests give PlanWire, which its stubs answer to. */
export const TEST_PLANWIRE_API_KEY = "pw_test_location_scout";

/**
 * PlanWire's answer for NG17 1AA's 0.5 mile Search Area, by the URL asked.
 * **Made up**, as no PlanWire key was to hand: in PlanWire's published
 * schema (its OpenAPI document at planwire.io/openapi.json), from PlanIt's
 * recording of the same applications on 9 October 2026, the 97 nearest
 * the Location, with three more numbered ZZ, as no council's are, that are
 * left out: one received in 2019, one with no location and one with no
 * date. 100 in all, as many as PlanWire gives at once.
 */
export const NG17_1AA_PLANWIRE: ReadonlyMap<string, unknown> = new Map<
  string,
  unknown
>([[nearbyUrl(NG17_1AA_AREA), ng17Applications]]);
