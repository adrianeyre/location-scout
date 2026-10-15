import { join } from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";
import type { DatasetAttribution } from "@location-scout/shared";

import { DOWNLOAD_TIMEOUT_MS, USER_AGENT } from "./arcgis";
import { downloadFile } from "./demographics";
import { loadPostcodes } from "./title-matching";
import { zipMemberNames } from "./zip";

/**
 * Ordnance Survey's Code-Point Open: every postcode's point, a CSV per
 * postcode area in a zip. The OS Downloads API redirects to the latest,
 * whose path names the month of its release. It places the Price Paid sales
 * near each Land Coverage Area's Land Opportunities (PRD FR-5.4b), and each
 * company's or council's title while it is matched (FR-5.4a).
 */
export const CODE_POINT_OPEN = {
  name: "Code-Point Open",
  source: "Ordnance Survey",
  url: "https://api.os.uk/downloads/v1/products/CodePointOpen/downloads?area=GB&format=CSV&redirect",
  /** One CSV a postcode area, such as `Data/CSV/ng.csv`. */
  member: /^Data\/CSV\/([a-z]{1,2})\.csv$/,
  /** Its licence, the Open Government Licence. */
  licenceUrl:
    "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
} as const;

/** The statements Code-Point Open's licence requires, with the year of its release. */
export const codePointOpenAttribution = (year: string): DatasetAttribution => ({
  statements: [
    `Contains OS data © Crown copyright and database right ${year}.`,
    `Contains Royal Mail data © Royal Mail copyright and database right ${year}.`,
    `Contains National Statistics data © Crown copyright and database right ${year}.`,
  ],
  conditionsUrl: CODE_POINT_OPEN.licenceUrl,
});

/** Code-Point Open as the manifest lists each Land Coverage Area's postcodes. */
export interface PostcodesSource {
  name: string;
  source: string;
  url: string;
  /** The month of its release, which its link names: `2026-08`. */
  sourceDate: string;
  attribution: DatasetAttribution;
}

/**
 * Downloads Code-Point Open and loads every postcode's point into
 * `postcodes`, in British National Grid (`loadPostcodes`), once a run.
 * Returns it as the manifest lists it, dated by the month of its release, or
 * by `today`'s month if its link doesn't name one.
 *
 * If the download fails, it warns and returns `null`: the rest is prepared
 * without it, so nearby land sales can't be found, and CCOD's and OCOD's
 * titles, which it places, can't be matched.
 */
export const loadCodePointOpen = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
  today: string,
  log: (message: string) => void,
): Promise<PostcodesSource | null> => {
  log(
    `Downloading ${CODE_POINT_OPEN.source}'s ${CODE_POINT_OPEN.name}, to place postcodes…`,
  );
  try {
    const zip = join(workDir, "codepo_gb.zip");
    const response = await fetchFn(CODE_POINT_OPEN.url, {
      headers: { "user-agent": USER_AGENT },
      redirect: "manual",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) {
      throw new Error(
        `${CODE_POINT_OPEN.source} answered ${String(response.status)} for ${CODE_POINT_OPEN.url}`,
      );
    }
    await downloadFile(fetchFn, CODE_POINT_OPEN.source, location, zip);
    const areas = (await zipMemberNames(zip)).flatMap(
      (name) => CODE_POINT_OPEN.member.exec(name)?.slice(1, 2) ?? [],
    );
    if (areas.length === 0) {
      throw new Error(`${CODE_POINT_OPEN.name}'s zip holds no postcode area.`);
    }
    await loadPostcodes(connection, zip, areas);
    const release = /\/(\d{4}-\d{2})\//.exec(location)?.[1] ?? null;
    if (release) log(`${CODE_POINT_OPEN.name} is as at ${release}.`);
    const sourceDate = release ?? today.slice(0, 7);
    return {
      name: "Postcodes",
      source: `${CODE_POINT_OPEN.source}'s ${CODE_POINT_OPEN.name}`,
      url: CODE_POINT_OPEN.url,
      sourceDate,
      attribution: codePointOpenAttribution(sourceDate.slice(0, 4)),
    };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    log(
      `Warning: ${why.replace(/\.$/, "")}. ${CODE_POINT_OPEN.name} is skipped, so nearby land sales can't be found, and CCOD and OCOD are skipped too, as it places their titles.`,
    );
    await connection.run("DROP TABLE IF EXISTS postcodes");
    return null;
  }
};
