import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  EPC_MATCH_STEPS,
  matchSale,
  type Certificate,
  type EpcMatch,
  type EpcSale as Sale,
} from "@location-scout/shared";

import { LARGE_DOWNLOAD_TIMEOUT_MS } from "./arcgis";
import { downloadFile } from "./demographics";
import { openDuckDb, sqlString } from "./duckdb";
import {
  EPC_API,
  fetchCertificate,
  searchDomestic,
  type CertificateDetails,
} from "./epc-api";
import { DATA_DIR } from "./paths";

/**
 * `pnpm --filter @location-scout/data-prepare spike:epc-matching` runs
 * OQ-8's spike (docs/spikes/oq-8-epc-api.md): it matches 2026's Price Paid
 * sales in Ashfield to the Energy Performance Certificates in their
 * postcodes, and writes what it found to `oq-8-epc-matching-results.md` in
 * `--out`.
 *
 * It always reads the sales: how many there are of each type, how their
 * addresses are written, and how many HM Land Registry's lookups give a
 * UPRN. With the EPC API's bearer token in `EPC_API_KEY` it also asks the
 * API for every one of their postcodes' certificates, matches each sale by
 * `matchSale`'s steps, checks the address steps' matches against the UPRN
 * where the sale has one, and asks for each matched certificate's floor
 * area and ratings.
 *
 * Its downloads, and every sale's outcome (certificate numbers, never the
 * certificates' addresses, which the EPC licence restricts), are kept in
 * `--work` (`data/spikes/oq-8/` by default, which git ignores).
 */

const USAGE = `Usage: pnpm --filter @location-scout/data-prepare spike:epc-matching [options]

  --district <name>   The Price Paid District whose sales are matched (ASHFIELD).
  --work <dir>        Where Price Paid is downloaded (data/spikes/oq-8).
  --out <dir>         Where the report is written (the --work folder).
  --help              Show this message.

Set ${EPC_API.keyVariable} (in .env or the environment) to the bearer
token from get-energy-performance-data.communities.gov.uk to match the sales.`;

/** The open sources the spike downloads. */
const SOURCES = {
  pricePaid: {
    url: "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-2026.csv",
    file: "pp-2026.csv",
  },
  /** HM Land Registry's lookups from a sale to its UPRN, one a month since July 2026. */
  uprnLookups: [
    "https://price-paid-data.publicdata.landregistry.gov.uk/pp-uprn-lookup-jul-2026.csv",
    "https://price-paid-data.publicdata.landregistry.gov.uk/pp-uprn-lookup-aug-2026.csv",
  ],
} as const;

/** The report's file, in `--out`. */
const RESULTS_FILE = "oq-8-epc-matching-results.md";

/**
 * The pause before each request to the EPC API: about 6 a second, well
 * inside its 6,000 every 5 minutes, one at a time.
 */
const PACE_MS = 150;

/** Price Paid's property types, apart from Other, which has no domestic EPC. */
const PROPERTY_TYPES: Readonly<Record<string, string>> = {
  D: "Detached",
  S: "Semi-detached",
  T: "Terraced",
  F: "Flat or maisonette",
};

const exists = async (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

const today = () => new Date().toISOString().slice(0, 10);

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const download = async (work: string, log: (message: string) => void) => {
  const datesFile = join(work, "sources.json");
  const dates = (await exists(datesFile))
    ? (JSON.parse(await readFile(datesFile, "utf8")) as Record<string, string>)
    : {};
  const pricePaid = join(work, SOURCES.pricePaid.file);
  if (!(await exists(pricePaid))) {
    log("Downloading HM Land Registry's Price Paid Data for 2026…");
    await downloadFile(
      fetch,
      "HM Land Registry",
      SOURCES.pricePaid.url,
      pricePaid,
      { timeoutMs: LARGE_DOWNLOAD_TIMEOUT_MS },
    );
    dates.pricePaid = `downloaded ${today()}`;
  }
  const uprnLookups = [];
  for (const url of SOURCES.uprnLookups) {
    const name = url.slice(url.lastIndexOf("/") + 1);
    const file = join(work, name);
    if (!(await exists(file))) {
      log(`Downloading HM Land Registry's ${name}…`);
      await downloadFile(fetch, "HM Land Registry", url, file);
    }
    uprnLookups.push(file);
  }
  await writeFile(datesFile, `${JSON.stringify(dates, null, 2)}\n`);
  return { pricePaid, uprnLookups, dates };
};

/** A value DuckDB returns, as text. */
const textOf = (value: unknown) => (typeof value === "string" ? value : "");

/** A sale, with what the report counts it by. */
interface SpikeSale extends Sale {
  type: string;
  newBuild: boolean;
}

/**
 * The standard-price sales (category A) of houses and flats in `district`
 * in a year of Price Paid Data (no header: id, price, date, postcode,
 * type, new build, duration, PAON, SAON, street, locality, town,
 * district…), each with its UPRN where the lookups give one.
 */
const loadSales = async (
  csv: string,
  lookups: readonly string[],
  district: string,
): Promise<SpikeSale[]> => {
  const connection = await openDuckDb();
  const rows = (
    await connection.runAndReadAll(
      `WITH lookup AS (
         SELECT DISTINCT ON (id) column0 AS id, column1 AS uprn
         FROM read_csv([${lookups.map(sqlString).join(", ")}], header = false, all_varchar = true)
       )
       SELECT s.column00 AS id, left(s.column02, 10) AS date, s.column03 AS postcode,
         s.column04 AS type, s.column05 AS new_build, coalesce(s.column07, '') AS paon,
         coalesce(s.column08, '') AS saon, coalesce(s.column09, '') AS street, l.uprn
       FROM read_csv(${sqlString(csv)}, header = false, all_varchar = true) s
       LEFT JOIN lookup l ON l.id = s.column00
       WHERE upper(s.column12) = ${sqlString(district.toUpperCase())}
         AND s.column15 = 'A' AND s.column04 IN ('D', 'S', 'T', 'F')
         AND coalesce(s.column03, '') <> ''
       ORDER BY id`,
    )
  ).getRowObjectsJson();
  connection.closeSync();
  return rows.map((row) => ({
    id: textOf(row.id),
    date: textOf(row.date),
    postcode: textOf(row.postcode),
    paon: textOf(row.paon),
    saon: textOf(row.saon),
    street: textOf(row.street),
    uprn:
      typeof row.uprn === "string" && /^\d+$/.test(row.uprn)
        ? String(Number(row.uprn))
        : null,
    type: textOf(row.type),
    newBuild: row.new_build === "Y",
  }));
};

const percent = (part: number, whole: number) =>
  whole === 0 ? "–" : `${((100 * part) / whole).toFixed(1)}%`;

const count = (part: number, whole: number) =>
  `${part.toLocaleString("en-GB")} (${percent(part, whole)})`;

const table = (
  header: readonly string[],
  rows: readonly (readonly string[])[],
) =>
  [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

/** How a sale's address is written, which decides how hard it is to match. */
const shape = (sale: Sale) =>
  sale.saon !== ""
    ? "A flat (SAON) in a building"
    : /\d/.test(sale.paon)
      ? "A house number"
      : "A house name without a number";

/** The sales' types, address shapes and UPRNs, which need no EPC. */
const profile = (sales: readonly SpikeSale[]) => {
  const total = sales.length;
  const withUprn = sales.filter(({ uprn }) => uprn !== null).length;
  const by = (key: (sale: SpikeSale) => string) => {
    const counts = new Map<string, number>();
    for (const sale of sales)
      counts.set(key(sale), (counts.get(key(sale)) ?? 0) + 1);
    return [...counts].sort(([, a], [, b]) => b - a);
  };
  return [
    "## The sales",
    "",
    `${total.toLocaleString("en-GB")} standard-price sales (category A) of houses and flats, of which ${count(withUprn, total)} have a UPRN from HM Land Registry's lookups (sales registered in July and August 2026) and ${count(sales.filter(({ newBuild }) => newBuild).length, total)} are new builds.`,
    "",
    table(
      ["Property type", "Sales", "With a UPRN"],
      by(({ type }) => PROPERTY_TYPES[type] ?? type).map(([type, n]) => [
        type,
        count(n, total),
        count(
          sales.filter(
            (sale) =>
              (PROPERTY_TYPES[sale.type] ?? sale.type) === type &&
              sale.uprn !== null,
          ).length,
          n,
        ),
      ]),
    ),
    "",
    table(
      ["Address written as", "Sales"],
      by(shape).map(([written, n]) => [written, count(n, total)]),
    ),
    "",
  ].join("\n");
};

/** One sale's outcome, as kept in the work folder. */
interface Outcome {
  id: string;
  type: string;
  shape: string;
  uprn: string | null;
  postcodeCertificates: number;
  /** `matchSale`'s steps, UPRN first. */
  match: EpcMatch;
  /** The address steps alone, as if the sale had no UPRN. */
  addressMatch: EpcMatch;
  /** Whether a certificate has the sale's UPRN: in its postcode, elsewhere, or nowhere. */
  uprnFound: "postcode" | "elsewhere" | "nowhere" | null;
  details: CertificateDetails | null;
}

/** Matches every sale against the EPC API, one request at a time. */
const matchAll = async (
  sales: readonly SpikeSale[],
  token: string,
  log: (message: string) => void,
): Promise<Outcome[]> => {
  const ask = async <T>(request: () => Promise<T>) => {
    await sleep(PACE_MS);
    return request();
  };
  const postcodes = [...new Set(sales.map(({ postcode }) => postcode))];
  const byPostcode = new Map<string, Certificate[]>();
  for (const [index, postcode] of postcodes.entries()) {
    if (index % 100 === 0)
      log(
        `Asking for postcodes' certificates: ${String(index)} of ${String(postcodes.length)}…`,
      );
    byPostcode.set(
      postcode,
      await ask(() => searchDomestic(fetch, token, { postcode })),
    );
  }
  log("Matching the sales, and asking for their certificates…");
  const outcomes: Outcome[] = [];
  for (const sale of sales) {
    const certificates = byPostcode.get(sale.postcode) ?? [];
    const match = matchSale(sale, certificates);
    const addressMatch = matchSale({ ...sale, uprn: null }, certificates);
    let uprnFound: Outcome["uprnFound"] = null;
    if (sale.uprn !== null) {
      const { uprn } = sale;
      uprnFound = certificates.some((certificate) => certificate.uprn === uprn)
        ? "postcode"
        : (await ask(() => searchDomestic(fetch, token, { uprn }))).length > 0
          ? "elsewhere"
          : "nowhere";
    }
    const { certificate } = match;
    outcomes.push({
      id: sale.id,
      type: sale.type,
      shape: shape(sale),
      uprn: sale.uprn,
      postcodeCertificates: certificates.length,
      match,
      addressMatch,
      uprnFound,
      details:
        certificate === null
          ? null
          : await ask(() =>
              fetchCertificate(fetch, token, certificate.certificateNumber),
            ),
    });
  }
  return outcomes;
};

/** The outcomes by property type, then by how their addresses are written. */
const groups = (outcomes: readonly Outcome[]): [string, Outcome[]][] => [
  ...Object.entries(PROPERTY_TYPES).map(([type, name]): [string, Outcome[]] => [
    name,
    outcomes.filter((outcome) => outcome.type === type),
  ]),
  ...[...new Set(outcomes.map((outcome) => outcome.shape))].map(
    (written): [string, Outcome[]] => [
      written,
      outcomes.filter((outcome) => outcome.shape === written),
    ],
  ),
];

/** A match's outcome as the report counts it. */
const outcomeOf = ({ step, properties }: EpcMatch) =>
  step === null ? "none" : properties === 1 ? step : `${step}, ambiguous`;

/** What matching found, written up. */
const results = (outcomes: readonly Outcome[]) => {
  const total = outcomes.length;
  const tally = (
    rows: readonly Outcome[],
    key: (outcome: Outcome) => string,
  ) => {
    const counts = new Map<string, number>();
    for (const row of rows)
      counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
    return counts;
  };
  const matched = outcomes.filter(({ match }) => match.certificate !== null);
  const emptyPostcode = outcomes.filter(
    ({ postcodeCertificates }) => postcodeCertificates === 0,
  ).length;
  const steps = tally(outcomes, ({ match }) => outcomeOf(match));
  const addressSteps = tally(outcomes, ({ addressMatch }) =>
    outcomeOf(addressMatch),
  );
  const order = [
    ...EPC_MATCH_STEPS.flatMap((step) => [step, `${step}, ambiguous`]),
    "none",
  ];

  // The address steps' matches checked against the sale's UPRN, where the
  // sale has one and the matched certificate does too.
  const checked = outcomes.filter(
    ({ uprn, addressMatch }) =>
      uprn !== null && addressMatch.certificate?.uprn != null,
  );
  const right = (outcome: Outcome) =>
    outcome.addressMatch.certificate?.uprn === outcome.uprn;
  const withUprn = outcomes.filter(({ uprn }) => uprn !== null);
  const found = tally(withUprn, ({ uprnFound }) => String(uprnFound));
  const areas = matched
    .map(({ details }) => details?.totalFloorArea)
    .filter((area): area is number => typeof area === "number")
    .sort((a, b) => a - b);

  return [
    "## Matching",
    "",
    `${count(matched.length, total)} of the sales are matched to one property's certificate by \`matchSale\`'s steps, UPRN first. ${count(emptyPostcode, total)} are in a postcode the API has no domestic certificate for.`,
    "",
    table(
      ["Step", "UPRN first", "Address steps alone"],
      order.map((step) => [
        step,
        count(steps.get(step) ?? 0, total),
        count(addressSteps.get(step) ?? 0, total),
      ]),
    ),
    "",
    "### By property type and address",
    "",
    table(
      ["Sales", "Matched, UPRN first", "Matched, address steps alone"],
      groups(outcomes)
        .filter(([, rows]) => rows.length > 0)
        .map(([name, rows]) => [
          `${name} (${String(rows.length)})`,
          percent(
            rows.filter(({ match }) => match.certificate !== null).length,
            rows.length,
          ),
          percent(
            rows.filter(({ addressMatch }) => addressMatch.certificate !== null)
              .length,
            rows.length,
          ),
        ]),
    ),
    "",
    "### The address steps checked against the UPRN",
    "",
    `Of the sales with a UPRN whose address-step match has a UPRN too (${String(checked.length)}): ${count(checked.filter(right).length, checked.length)} right.`,
    "",
    table(
      ["Step", "Checked", "Right", "Wrong"],
      EPC_MATCH_STEPS.filter((step) => step !== "uprn").map((step) => {
        const rows = checked.filter(
          ({ addressMatch }) => addressMatch.step === step,
        );
        return [
          step,
          String(rows.length),
          String(rows.filter(right).length),
          String(rows.filter((row) => !right(row)).length),
        ];
      }),
    ),
    "",
    "### Where the sales' UPRNs have certificates",
    "",
    table(
      ["Sales with a UPRN", "Count"],
      [
        [
          "A certificate in the sale's postcode has it",
          count(found.get("postcode") ?? 0, withUprn.length),
        ],
        [
          "Only a certificate in another postcode has it",
          count(found.get("elsewhere") ?? 0, withUprn.length),
        ],
        [
          "No certificate has it",
          count(found.get("nowhere") ?? 0, withUprn.length),
        ],
      ],
    ),
    "",
    "### The matched certificates",
    "",
    table(
      ["Of the matched sales' certificates", "Count"],
      [
        [
          "Fetched",
          count(
            matched.filter(({ details }) => details !== null).length,
            matched.length,
          ),
        ],
        ["With a total floor area", count(areas.length, matched.length)],
        [
          "With a current band",
          count(
            matched.filter(({ details }) => details?.currentBand != null)
              .length,
            matched.length,
          ),
        ],
        [
          "With a potential band",
          count(
            matched.filter(({ details }) => details?.potentialBand != null)
              .length,
            matched.length,
          ),
        ],
        [
          "With a floor area under 20 m²",
          count(areas.filter((area) => area < 20).length, matched.length),
        ],
      ],
    ),
    "",
    areas.length === 0
      ? ""
      : `Floor areas: median ${String(areas[Math.floor(areas.length / 2)])} m², from ${String(areas[0])} to ${String(areas.at(-1))} m².`,
    "",
  ].join("\n");
};

const run = async () => {
  const { values } = parseArgs({
    options: {
      district: { type: "string", default: "ASHFIELD" },
      work: { type: "string", default: join(DATA_DIR, "spikes", "oq-8") },
      out: { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const log = (message: string) => {
    console.log(message);
  };
  const { work } = values;
  const out = values.out ?? work;
  await mkdir(work, { recursive: true });
  await mkdir(out, { recursive: true });
  const sources = await download(work, log);
  log(`Reading 2026's sales in ${values.district}…`);
  const sales = await loadSales(
    sources.pricePaid,
    sources.uprnLookups,
    values.district,
  );

  const token = process.env[EPC_API.keyVariable]?.trim() ?? "";
  const sections = [profile(sales)];
  if (token === "") {
    sections.push(
      "## Matching",
      "",
      `Not run: ${EPC_API.keyVariable} was not set, so the EPC API wasn't asked. Set it to the bearer token from [Get energy performance of buildings data](https://get-energy-performance-data.communities.gov.uk/) and run the spike again.`,
      "",
    );
  } else {
    const outcomes = await matchAll(sales, token, log);
    sections.push(results(outcomes));
    // Each sale's outcome stays in the git-ignored work folder: certificate
    // numbers and UPRNs, but none of the certificates' addresses.
    await writeFile(
      join(work, "oq-8-outcomes.json"),
      `${JSON.stringify(
        outcomes.map(({ match, addressMatch, ...outcome }) => ({
          ...outcome,
          match: outcomeOf(match),
          certificate: match.certificate?.certificateNumber ?? null,
          addressMatch: outcomeOf(addressMatch),
          addressCertificateUprn: addressMatch.certificate?.uprn ?? null,
        })),
        null,
        2,
      )}\n`,
    );
  }

  const markdown = [
    `# OQ-8: matching Price Paid sales in ${values.district} to EPCs, results`,
    "",
    `Written by \`pnpm --filter @location-scout/data-prepare spike:epc-matching\` on ${today()}. What it does, and what the results mean: [oq-8-epc-api.md](oq-8-epc-api.md).`,
    "",
    `Sources: HM Land Registry's Price Paid Data for 2026 (${sources.dates.pricePaid ?? "?"}) and its lookups from a sale to its UPRN for July and August 2026${token === "" ? "" : `; MHCLG's Energy Performance of Buildings Data API (asked ${today()})`}.`,
    "",
    ...sections,
  ].join("\n");
  await writeFile(join(out, RESULTS_FILE), `${markdown}\n`);
  log(`Wrote ${join(out, RESULTS_FILE)}.`);
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(USAGE);
  process.exitCode = 1;
}
