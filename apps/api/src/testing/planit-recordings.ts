import ng17Applications from "../sources/fixtures/planit-ng17-1aa.json" with { type: "json" };
import { applicationsUrl } from "../sources/planit";
import { NG17_1AA_AREA } from "./police-ng17-1aa";

/**
 * PlanIt's answer for NG17 1AA's 0.5 mile Search Area, by the URL asked,
 * recorded on 9 October 2026: 126 Planning Applications received since 11
 * October 2023, all of Ashfield's placed at their postcode, two of them major.
 */
export const NG17_1AA_PLANIT: ReadonlyMap<string, unknown> = new Map<
  string,
  unknown
>([[applicationsUrl(NG17_1AA_AREA), ng17Applications]]);
