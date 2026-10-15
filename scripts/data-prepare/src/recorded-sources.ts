import { readFile } from "node:fs/promises";

import { PLANNING_CONSTRAINT_DATASETS } from "@location-scout/shared";

import {
  CENSUS_2021,
  INCOME_ESTIMATES,
  INDICES_OF_DEPRIVATION,
  OUTPUT_AREA_BOUNDARIES,
  censusTableUrl,
} from "./demographics";
import outputAreaLookup from "./fixtures/ons-output-area-lookup.json" with { type: "json" };
import outputAreas from "./fixtures/ons-output-areas.json" with { type: "json" };
import ofstedPage from "./fixtures/govuk-ofsted-management-information.json" with { type: "json" };
import { COMPANY_TITLES } from "./company-titles";
import { CODE_POINT_OPEN } from "./postcodes";
import { GEOFABRIK } from "./geofabrik";
import { INSPIRE } from "./inspire";
import { PLANNING_CONSTRAINTS } from "./planning-constraints";
import { recordedBoundaries } from "./recorded-boundaries";
import { GIAS, OFSTED_INSPECTIONS } from "./schools";

/**
 * Small parts of the Demographics Layer's sources, recorded on 8 October
 * 2026, around NG17 1AA and Sutton Parkway station in Ashfield
 * (`fixtures/`):
 *
 * - `ons-output-areas.json`: the 92 output areas whose boundaries reach into
 *   the box from -1.277, 53.110 to -1.239, 53.132, as ONS Open Geography
 *   answered `OUTPUT_AREAS_QUERY` for that box rather than for all England.
 * - `ons-output-area-lookup.json`: their LSOAs and MSOAs, 22 and 7 of them.
 * - `nomis-census2021-*.zip`: Nomis's bulk downloads of Census 2021 tables
 *   TS001, TS006, TS007A and TS041, with only those output areas' rows, and
 *   one in Wales, W00000001, which is left out.
 * - `ons-income-estimates.xlsx`: ONS's workbook, its title, header and other
 *   sheets as they are, with only the rows of those 7 MSOAs, and one in
 *   Wales, W02000001, on its income sheets.
 * - `iod2025-file-7.csv`: the Indices of Deprivation's File 7, with only
 *   those 22 LSOAs' rows.
 *
 * And of the Schools Layer's, recorded on 9 October 2026:
 *
 * - `gias-downloads.html` and `gias-generated.html`: the form of GIAS's
 *   Downloads page, and of the page saying the file it made is ready.
 * - `gias-extract.zip`: the zip it gave, its CSV
 *   `edubasealldata20261009.csv` in Windows-1252 as it was, with only the
 *   201 establishments within about 6.5 km of NG17 1AA (93 of them open,
 *   none independent), the two independent schools nearest it, Kingdom
 *   Christian School and Green Crescent School, St John’s CE Primary School
 *   in Kent, for its apostrophe, Nancy Reuben Primary School in London,
 *   whose council GIAS doesn't know yet, and a Welsh nursery, which is left
 *   out. Headteachers' and proprietors' names are blanked.
 * - `govuk-ofsted-management-information.json`: gov.uk's Content API for
 *   Ofsted's page, with 4 of its attachments: the latest inspections as at
 *   31 August and 31 July 2026, and two other files of August's.
 * - `ofsted-latest-inspections.csv`: the CSV as at 31 August 2026, with only
 *   the 86 rows of those schools Ofsted has, and The Aldgate School in
 *   London, which isn't in the recorded register and is left out.
 *
 * And of each Land Coverage Area's land data, recorded on 9 October 2026 by
 * `record-land-fixtures.ts` (`RECORDED_BOXES`, `RECORDED_CONSTRAINTS`) from
 * the files as downloaded:
 *
 * - `inspire-download.html`: HM Land Registry's INSPIRE download page, its
 *   files published on 4 October 2026, linking all 318 local authorities'.
 * - `inspire-ashfield.zip` and `inspire-mansfield.zip`: Ashfield's and
 *   Mansfield's zips, each GML as it was but for its other polygons: the 231
 *   of Ashfield's that reach into Sutton Parkway's 0.25 mile Search Area,
 *   where its boundary meets Mansfield's, or near Pinxton, and the 6 of
 *   Mansfield's there. The licence PDF beside each GML is left out.
 * - `geofabrik-index.json`: Geofabrik's index, with only England,
 *   Nottinghamshire and Derbyshire.
 * - `geofabrik-nottinghamshire.osm.pbf` and `geofabrik-derbyshire.osm.pbf`:
 *   their extracts of 8 October 2026, with only the ways with a node in
 *   those three boxes (573 and 32, 28 of them in both, near Pinxton), the
 *   5 multipolygons they are members of, and the nodes they need; and in
 *   Derbyshire's, Hartshorne Wood, a multipolygon whose 11 ways GEOS can
 *   build no area from.
 * - `planning-data-<dataset>.parquet`: each of planning.data.gov.uk's six
 *   Planning Constraint datasets, with only a few rows: NG17 1AA's
 *   conservation area, two listed buildings and a flood zone in Ashfield, a
 *   conservation area, a listed building, one whose listing ended in 2023
 *   and a flood zone in Mansfield, a flood zone reaching into both, and one
 *   far from either in each dataset.
 * - `ons-council-names.json`: ONS Open Geography's answer for the codes and
 *   names of England's 296 councils, without their boundaries.
 *
 * And of the titles Ownership Categories come from (PRD FR-5.4a):
 *
 * - `codepo_gb.zip`: Ordnance Survey's Code-Point Open as downloaded on 9
 *   October 2026 (its August 2026 release), with only the postcodes within
 *   2.5 km of the boxes the land data is recorded in (`recordCodePointOpen`
 *   in `record-land-fixtures.ts`), 2,860 of them in `Data/CSV/ng.csv`,
 *   `de.csv` and `le.csv`: every postcode within a mile of the Land Parcels
 *   built from the recordings, and the postcodes the titles below give.
 * - `land-registry-ccod.zip` and `land-registry-ocod.zip`: **made up, not
 *   recorded**, as CCOD and OCOD need an account and a key this project's
 *   tests can't have. Each is a zip of one CSV, `CCOD_FULL_2026_10.csv` and
 *   `OCOD_FULL_2026_10.csv`, in HM Land Registry's published layout (OCOD's
 *   columns capitalised as its technical specification writes them), whose
 *   titles are invented, with title numbers beginning ZZ, which HM Land
 *   Registry doesn't use, and placeholder proprietors. Their addresses name
 *   buildings OpenStreetMap maps in the recorded extracts, so some match
 *   one INSPIRE Index Polygon: Smart Aluminium's (a UK company's), Romo's
 *   (a council's), and Metal Craft Group's, 9 m from Sutton Parkway's farm
 *   field (an overseas company's). Kings Mill Hospital's (a corporate
 *   body's) names a building that covers two, so it matches neither. There
 *   is also a leasehold title, land described by its street, a title in
 *   Mansfield, one in Harrogate, a district no English council is named
 *   for now, and one in Wales, which is left out.
 *
 * HM Land Registry's API answers as its documentation shows
 * (https://use-land-property-data.service.gov.uk/api-documentation), to
 * `RECORDED_LAND_REGISTRY_API_KEY`.
 */
export const RECORDED_OUTPUT_AREAS = outputAreas;
export const RECORDED_OUTPUT_AREA_LOOKUP = outputAreaLookup;

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url));

/** The latest inspections, as at 31 August 2026, as the recorded page lists them. */
export const RECORDED_OFSTED_INSPECTIONS_URL =
  "https://assets.publishing.service.gov.uk/media/6aa0175392e72b8ac437ef37/Management_information_-_state-funded_schools_-_latest_inspections_as_at_31_August_2026.csv";

/** Where GIAS said the file it made is, as `gias-generated.html` gives it. */
const GIAS_GENERATED =
  "/Downloads/Generated/f6292a6b-6810-49f2-8426-8f66197fc04b";
const GIAS_FILE =
  "https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/File.xhtml?id=f6292a6b-6810-49f2-8426-8f66197fc04b";

/**
 * Cookies like those GIAS's Downloads page sets, its form's token and the
 * server it is on, which its form must send back.
 */
const GIAS_COOKIES = [
  "__RequestVerificationToken=B_YGvmIOQvM0MR3_Qdhothv4AsPSUzYfwmNYC815G8vqmeALdbhD9KKeVS84BlWABclb; path=/; samesite=strict; httponly",
  "ARRAffinity=fbc960897bb3cc074dacfbeddd0ca6e9ee3cf31bd3deddaf9c6ab7dc0f0068f8;Path=/;HttpOnly;Secure;Domain=get-information-schools.service.gov.uk",
];

/**
 * GIAS's three steps, as they answered: its form asks for the register only
 * when the request sends back the page's cookies and selects it, as GIAS
 * itself answers 500 otherwise.
 */
const recordedGias = async (url: string, init?: RequestInit) => {
  if (url === `${GIAS.site}${GIAS.downloadsPath}`) {
    const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
    for (const cookie of GIAS_COOKIES) headers.append("set-cookie", cookie);
    return new Response(await fixture("gias-downloads.html"), { headers });
  }
  const cookie = new Headers(init?.headers).get("cookie") ?? "";
  const cookiesSent = GIAS_COOKIES.every((set) =>
    cookie.includes(set.split(";")[0] ?? ""),
  );
  if (url === `${GIAS.site}${GIAS.collatePath}` && init?.method === "POST") {
    const form = new URLSearchParams(
      typeof init.body === "string" ? init.body : "",
    );
    const selected =
      form.get("Downloads[0].Tag") === GIAS.tag &&
      form.get("Downloads[0].Selected") === "true" &&
      form.has("__RequestVerificationToken");
    return selected && cookiesSent
      ? new Response(null, {
          status: 302,
          headers: { location: GIAS_GENERATED },
        })
      : new Response("An error occurred", { status: 500 });
  }
  if (url === `${GIAS.site}${GIAS_GENERATED}`) {
    return new Response(await fixture("gias-generated.html"));
  }
  if (url === GIAS_FILE) {
    return new Response(new Uint8Array(await fixture("gias-extract.zip")), {
      headers: { "content-type": "application/zip" },
    });
  }
  return null;
};

/** The INSPIRE download page's cookies, which it sets before it answers. */
const INSPIRE_COOKIES = [
  "anonymous=true; Path=/; HttpOnly=true",
  "AccessToken=05537355-4f63-489a-b0d5-f25179c1013d; Path=/; HttpOnly=true",
];

/** The councils whose INSPIRE zips are recorded, as the download page links them. */
const RECORDED_INSPIRE: ReadonlyMap<string, string> = new Map([
  [
    `${INSPIRE.site}${INSPIRE.downloadPath}/Ashfield_District_Council.zip`,
    "inspire-ashfield.zip",
  ],
  [
    `${INSPIRE.site}${INSPIRE.downloadPath}/Mansfield_District_Council.zip`,
    "inspire-mansfield.zip",
  ],
]);

/**
 * HM Land Registry, as it answered: the download page and each zip redirect
 * to themselves, setting cookies, until a request sends them back. The page
 * then answers, and a zip redirects to a short-lived link to the file, which
 * this gives straight away.
 */
const recordedInspire = async (url: string, init?: RequestInit) => {
  const page = `${INSPIRE.site}${INSPIRE.downloadPath}`;
  const zip = RECORDED_INSPIRE.get(url);
  if (url !== page && !zip) return null;
  const cookie = new Headers(init?.headers).get("cookie") ?? "";
  if (
    !INSPIRE_COOKIES.every((set) => cookie.includes(set.split(";")[0] ?? ""))
  ) {
    const headers = new Headers({ location: new URL(url).pathname });
    for (const set of INSPIRE_COOKIES) headers.append("set-cookie", set);
    return new Response(null, { status: 302, headers });
  }
  return zip
    ? new Response(new Uint8Array(await fixture(zip)))
    : new Response(await fixture("inspire-download.html"), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
};

/** Each recorded extract's `-latest` link, and the file it redirects to. */
const GEOFABRIK_ENGLAND =
  "https://download.geofabrik.de/europe/united-kingdom/england";
export const RECORDED_EXTRACTS: ReadonlyMap<
  string,
  { latest: string; dated: string }
> = new Map(
  ["derbyshire", "nottinghamshire"].map((county) => [
    county,
    {
      latest: `${GEOFABRIK_ENGLAND}/${county}-latest.osm.pbf`,
      dated: `${GEOFABRIK_ENGLAND}/${county}-261008.osm.pbf`,
    },
  ]),
);

/** When planning.data.gov.uk last wrote each dataset's Parquet, as it said on 9 October 2026. */
const PLANNING_DATA_LAST_MODIFIED: Readonly<Record<string, string>> = {
  "conservation-area": "Thu, 08 Oct 2026 01:14:22 GMT",
  "listed-building": "Thu, 08 Oct 2026 03:40:45 GMT",
  "listed-building-outline": "Thu, 08 Oct 2026 01:27:32 GMT",
  "article-4-direction-area": "Thu, 08 Oct 2026 00:52:42 GMT",
  "tree-preservation-zone": "Thu, 08 Oct 2026 01:19:26 GMT",
  "flood-risk-zone": "Thu, 08 Oct 2026 01:55:08 GMT",
};

/** Geofabrik's and planning.data.gov.uk's downloads, as they answered. */
const recordedLand = async (url: string) => {
  if (url === GEOFABRIK.index) {
    return new Response(await fixture("geofabrik-index.json"), {
      headers: { "content-type": "application/json" },
    });
  }
  for (const [county, { latest, dated }] of RECORDED_EXTRACTS) {
    if (url === latest) {
      return new Response(null, { status: 307, headers: { location: dated } });
    }
    if (url === dated) {
      return new Response(
        new Uint8Array(await fixture(`geofabrik-${county}.osm.pbf`)),
      );
    }
  }
  const dataset = PLANNING_CONSTRAINT_DATASETS.find(
    (candidate) => PLANNING_CONSTRAINTS.url(candidate) === url,
  );
  if (dataset) {
    return new Response(
      new Uint8Array(await fixture(`planning-data-${dataset}.parquet`)),
      {
        headers: {
          "last-modified": PLANNING_DATA_LAST_MODIFIED[dataset] ?? "",
        },
      },
    );
  }
  return null;
};

/** The key the stubbed HM Land Registry API accepts. */
export const RECORDED_LAND_REGISTRY_API_KEY = "fixture-land-registry-api-key";

/** Each dataset's full file, and the short-lived link to it the API gives. */
const LAND_REGISTRY_FILES = {
  ccod: {
    file: "CCOD_FULL_2026_10.zip",
    fixture: "land-registry-ccod.zip",
    link: "https://hmlr-datapub-fixture.s3.eu-west-2.amazonaws.com/ccod/CCOD_FULL_2026_10.zip?X-Amz-Expires=10&X-Amz-Signature=fixture",
  },
  ocod: {
    file: "OCOD_FULL_2026_10.zip",
    fixture: "land-registry-ocod.zip",
    link: "https://hmlr-datapub-fixture.s3.eu-west-2.amazonaws.com/ocod/OCOD_FULL_2026_10.zip?X-Amz-Expires=10&X-Amz-Signature=fixture",
  },
} as const;

/** Where the OS Downloads API redirected Code-Point Open, less its signature. */
export const RECORDED_CODE_POINT_OPEN =
  "https://omseprd1stdstordownload.blob.core.windows.net/downloads/CodePointOpen/2026-08/allGB/CSV/codepo_gb.zip?sv=2025-05-05&sr=b&sp=r";

/**
 * HM Land Registry's API, as its documentation says it answers: without the
 * key, 403; with another, 404; with it, each dataset's resources, then a
 * link to its full file, which answers only a request without the key, as
 * a signed S3 link does. And Ordnance Survey's redirect to Code-Point Open.
 */
const recordedTitles = async (url: string, init?: RequestInit) => {
  if (url === CODE_POINT_OPEN.url) {
    return new Response(null, {
      status: 307,
      headers: { location: RECORDED_CODE_POINT_OPEN },
    });
  }
  if (url === RECORDED_CODE_POINT_OPEN) {
    return new Response(new Uint8Array(await fixture("codepo_gb.zip")));
  }
  const authorization = new Headers(init?.headers).get("authorization");
  for (const [dataset, { file, fixture: zip, link }] of Object.entries(
    LAND_REGISTRY_FILES,
  )) {
    if (url === link) {
      return authorization
        ? new Response("<Error><Code>InvalidArgument</Code></Error>", {
            status: 400,
          })
        : new Response(new Uint8Array(await fixture(zip)));
    }
    const about = `${COMPANY_TITLES.api}/datasets/${dataset}`;
    if (url !== about && url !== `${about}/${file}`) continue;
    if (!authorization) {
      return Response.json(
        {
          error:
            "Access denied: You need to provide your API Key to perform this operation",
          success: false,
        },
        { status: 403 },
      );
    }
    if (authorization !== RECORDED_LAND_REGISTRY_API_KEY) {
      return Response.json(
        {
          error: "API Key provided is incorrect or does not exist",
          success: false,
        },
        { status: 404 },
      );
    }
    return url === about
      ? Response.json({
          success: true,
          result: {
            name: dataset,
            title:
              COMPANY_TITLES.datasets[
                dataset as keyof typeof LAND_REGISTRY_FILES
              ].name,
            last_updated: "2 October 2026",
            format: "CSV",
            resources: [
              {
                file_name: file.replace("_FULL_", "_COU_"),
                name: "Change Only File",
                format: "CSV",
              },
              { file_name: file, name: "Full File", format: "CSV" },
            ],
          },
        })
      : Response.json({
          success: true,
          result: { download_url: link, resource: file, valid_for_seconds: 10 },
        });
  }
  return null;
};

const RECORDED_FILES: ReadonlyMap<string, Promise<Buffer>> = new Map([
  ...Object.values(CENSUS_2021.tables).map(
    ({ table }) =>
      [
        censusTableUrl(table),
        fixture(`nomis-census2021-${table}.zip`),
      ] as const,
  ),
  [INCOME_ESTIMATES.url, fixture("ons-income-estimates.xlsx")],
  [INDICES_OF_DEPRIVATION.url, fixture("iod2025-file-7.csv")],
  [RECORDED_OFSTED_INSPECTIONS_URL, fixture("ofsted-latest-inspections.csv")],
]);

/**
 * A `fetch` that answers every download `pnpm data:prepare` makes from the
 * recordings: the council boundaries (`recordedBoundaries`), the
 * Demographics and Schools Layers' sources, Ashfield's and Mansfield's land
 * data, and CCOD, OCOD and Code-Point Open. It refuses anything else without sending it, so nothing reaches
 * the network.
 */
export const recordedSources = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith(`${OUTPUT_AREA_BOUNDARIES.url}/query?`)) {
    return Response.json(outputAreas);
  }
  if (url.startsWith(`${OUTPUT_AREA_BOUNDARIES.lookupUrl}/query?`)) {
    return Response.json(outputAreaLookup);
  }
  if (url === OFSTED_INSPECTIONS.content) return Response.json(ofstedPage);
  const gias = await recordedGias(url, init);
  if (gias) return gias;
  const inspire = await recordedInspire(url, init);
  if (inspire) return inspire;
  const land = await recordedLand(url);
  if (land) return land;
  const titles = await recordedTitles(url, init);
  if (titles) return titles;
  const file = RECORDED_FILES.get(url);
  if (file) return new Response(new Uint8Array(await file));
  return recordedBoundaries(input, init);
}) as typeof fetch;
