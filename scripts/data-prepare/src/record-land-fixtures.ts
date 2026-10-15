import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync, deflateSync } from "node:zlib";

import type { DuckDBConnection } from "@duckdb/node-api";
import { PLANNING_CONSTRAINT_DATASETS } from "@location-scout/shared";

import { copyToParquet, openDuckDb, sqlString } from "./duckdb";
import { INSPIRE } from "./inspire";
import { zipEntries } from "./zip";

/**
 * `pnpm --filter @location-scout/data-prepare fixture:record-land <dir>`
 * makes the land data's recordings in `fixtures/` from the files downloaded
 * into `<dir>`, keeping a small part of each, so `pnpm data:prepare` can be
 * tested without the network. It makes no network call itself. `<dir>` holds,
 * downloaded as they are:
 *
 * - `nottinghamshire.osm.pbf` and `derbyshire.osm.pbf`, Geofabrik's
 *   Nottinghamshire and Derbyshire extracts, and `index-v1.json`, its index.
 * - `inspire-download.html`, HM Land Registry's INSPIRE download page, and
 *   `Ashfield_District_Council.zip` and `Mansfield_District_Council.zip`
 *   from it.
 * - each of planning.data.gov.uk's six Planning Constraint datasets,
 *   `<dataset>.parquet`.
 * - `ons-council-names.json`, ONS Open Geography's answer for England's
 *   councils' codes and names (`COUNCIL_BOUNDARIES` without geometry).
 * - `codepo_gb.zip`, Ordnance Survey's Code-Point Open.
 */

/** The boxes kept, as west, south, east, north. */
export const RECORDED_BOXES = {
  /** Sutton Parkway station's 0.25 mile Search Area, in Ashfield. */
  suttonParkway: [-1.2521, 53.1109, -1.2399, 53.1181],
  /** About 300 m across where Ashfield's boundary meets Mansfield's. */
  ashfieldMansfield: [-1.2346, 53.1347, -1.23, 53.1375],
  /**
   * About 300 m across in Ashfield, near Pinxton, where Geofabrik's outlines
   * of Nottinghamshire and Derbyshire overlap, so both extracts have it.
   */
  ashfieldDerbyshire: [-1.312, 53.1097, -1.3074, 53.1123],
  /**
   * About 60 m across on the edge of Hartshorne Wood in South Derbyshire, a
   * multipolygon mapped so that GEOS can build no area from its ways.
   */
  hartshorneWood: [-1.5166, 52.793, -1.516, 52.7935],
} as const;

/**
 * The Planning Constraints kept, by planning.data.gov.uk's entity: in
 * Ashfield, NG17 1AA's conservation area, two listed buildings and a flood
 * zone; in Mansfield, a conservation area, a listed building, one whose
 * listing ended in 2023 and a flood zone; a flood zone reaching into both;
 * and in each dataset, one far from either.
 */
export const RECORDED_CONSTRAINTS: Readonly<
  Record<(typeof PLANNING_CONSTRAINT_DATASETS)[number], readonly number[]>
> = {
  "conservation-area": [44005909, 44005281, 44000041],
  "listed-building": [31853492, 31691397, 31857253, 31744790, 31479292],
  "listed-building-outline": [42110481],
  "article-4-direction-area": [7010002009],
  "tree-preservation-zone": [19100016],
  "flood-risk-zone": [65388948, 65399692, 65405620, 65000000],
};

/**
 * Code-Point Open's postcodes are kept within this distance of the boxes'
 * bounds, in metres: beyond a mile from any Land Parcel built from them, so
 * every postcode a land sale near one may be in is recorded (PRD FR-5.4b).
 */
export const RECORDED_POSTCODES_METRES = 2500;

/** The postcodes the made-up CCOD and OCOD titles give, which are kept wherever they are. */
export const RECORDED_TITLE_POSTCODES = [
  "NG17 1AA",
  "NG17 4JL",
  "NG17 5FS",
  "NG17 5LX",
  "NG17 7JR",
  "NG17 7LE",
];

/** The extracts recorded, and kept in Geofabrik's index with England. */
export const RECORDED_COUNTIES = ["derbyshire", "nottinghamshire"];

/** The extracts kept from Geofabrik's index: England, and two of its counties. */
export const RECORDED_EXTRACTS = ["england", ...RECORDED_COUNTIES];

const envelope = ([west, south, east, north]: readonly number[]) =>
  `ST_MakeEnvelope(${[west, south, east, north].map(String).join(", ")})`;

const BOXES = `ST_Collect([${Object.values(RECORDED_BOXES).map(envelope).join(", ")}])`;

// A minimal protocol buffers writer, for an `.osm.pbf` of a few thousand
// elements: https://wiki.openstreetmap.org/wiki/PBF_Format

const varint = (value: number) => {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) + 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
};

const zigzag = (value: number) => (value >= 0 ? value * 2 : -value * 2 - 1);

const key = (field: number, wireType: number) => varint(field * 8 + wireType);

const bytesField = (field: number, bytes: Buffer) =>
  Buffer.concat([key(field, 2), varint(bytes.length), bytes]);

const numberField = (field: number, value: number) =>
  Buffer.concat([key(field, 0), varint(value)]);

const packed = (field: number, values: readonly number[]) =>
  bytesField(field, Buffer.concat(values.map(varint)));

const deltas = (values: readonly number[]) =>
  values.map((value, index) => zigzag(value - (values[index - 1] ?? 0)));

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
}
interface OsmWay {
  id: number;
  tags: [string, string][];
  refs: number[];
}
interface OsmRelation {
  id: number;
  tags: [string, string][];
  members: { id: number; type: "node" | "way" | "relation"; role: string }[];
}

const MEMBER_TYPES = { node: 0, way: 1, relation: 2 } as const;

/** A file block: its header's length, its header and the zlib-compressed block. */
const fileBlock = (type: string, block: Buffer) => {
  const blob = Buffer.concat([
    numberField(2, block.length),
    bytesField(3, deflateSync(block)),
  ]);
  const header = Buffer.concat([
    bytesField(1, Buffer.from(type)),
    numberField(3, blob.length),
  ]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, blob]);
};

/** Nodes, ways and relations as an `.osm.pbf`, in one block of each. */
export const osmPbf = (
  nodes: readonly OsmNode[],
  ways: readonly OsmWay[],
  relations: readonly OsmRelation[],
) => {
  const strings = [""];
  const stringIndex = (text: string) => {
    const found = strings.indexOf(text);
    if (found >= 0) return found;
    strings.push(text);
    return strings.length - 1;
  };
  const tagFields = (tags: readonly [string, string][]) => [
    packed(
      2,
      tags.map(([k]) => stringIndex(k)),
    ),
    packed(
      3,
      tags.map(([, v]) => stringIndex(v)),
    ),
  ];
  const dense = Buffer.concat([
    packed(1, deltas(nodes.map(({ id }) => id))),
    packed(8, deltas(nodes.map(({ lat }) => Math.round(lat * 1e7)))),
    packed(9, deltas(nodes.map(({ lon }) => Math.round(lon * 1e7)))),
  ]);
  const wayGroup = Buffer.concat(
    ways.map((way) =>
      bytesField(
        3,
        Buffer.concat([
          numberField(1, way.id),
          ...tagFields(way.tags),
          packed(8, deltas(way.refs)),
        ]),
      ),
    ),
  );
  const relationGroup = Buffer.concat(
    relations.map((relation) =>
      bytesField(
        4,
        Buffer.concat([
          numberField(1, relation.id),
          ...tagFields(relation.tags),
          packed(
            8,
            relation.members.map(({ role }) => stringIndex(role)),
          ),
          packed(9, deltas(relation.members.map(({ id }) => id))),
          packed(
            10,
            relation.members.map(({ type }) => MEMBER_TYPES[type]),
          ),
        ]),
      ),
    ),
  );
  const block = Buffer.concat([
    bytesField(
      1,
      Buffer.concat(strings.map((text) => bytesField(1, Buffer.from(text)))),
    ),
    bytesField(2, bytesField(2, dense)),
    bytesField(2, wayGroup),
    bytesField(2, relationGroup),
  ]);
  const header = Buffer.concat([
    bytesField(4, Buffer.from("OsmSchema-V0.6")),
    bytesField(4, Buffer.from("DenseNodes")),
    bytesField(16, Buffer.from("location-scout record-land-fixtures")),
  ]);
  return Buffer.concat([
    fileBlock("OSMHeader", header),
    fileBlock("OSMData", block),
  ]);
};

const rows = async (connection: DuckDBConnection, sql: string) =>
  (await connection.runAndReadAll(sql)).getRowObjectsJson();

const tagsOf = (value: unknown): [string, string][] =>
  Array.isArray(value)
    ? value.flatMap((entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        "key" in entry &&
        "value" in entry
          ? [[String(entry.key), String(entry.value)] as [string, string]]
          : [],
      )
    : [];

const numbers = (value: unknown) =>
  Array.isArray(value) ? value.map(Number) : [];

/**
 * The extract's elements in the boxes: every way with a node in them, every
 * multipolygon relation with one of those ways as a member, all their member
 * ways, and every node those ways need, without the nodes' own tags.
 */
const recordOsm = async (connection: DuckDBConnection, pbf: string) => {
  const read = `ST_ReadOSM(${sqlString(pbf)})`;
  await connection.run(
    `CREATE TABLE boxed_nodes AS SELECT id FROM ${read}
     WHERE kind = 'node' AND ST_Intersects(ST_Point(lon, lat), ${BOXES})`,
  );
  await connection.run(
    `CREATE TABLE boxed_ways AS SELECT id, tags, refs FROM ${read}
     WHERE kind = 'way' AND list_has_any(refs, (SELECT list(id) FROM boxed_nodes))`,
  );
  await connection.run(
    `CREATE TABLE boxed_relations AS SELECT id, tags, refs, ref_types, ref_roles FROM ${read}
     WHERE kind = 'relation' AND tags['type'] = 'multipolygon'
       AND list_has_any(refs, (SELECT list(id) FROM boxed_ways))`,
  );
  await connection.run(
    `CREATE TABLE recorded_ways AS
       SELECT id, map_entries(tags) AS tags, refs FROM ${read}
       WHERE kind = 'way' AND (id IN (SELECT id FROM boxed_ways) OR id IN (
         SELECT ref FROM (SELECT unnest(refs) AS ref, unnest(ref_types) AS type FROM boxed_relations)
         WHERE type = 'way'))`,
  );
  const nodes = await rows(
    connection,
    `SELECT id, lat, lon FROM ${read}
     WHERE kind = 'node' AND id IN (SELECT unnest(refs) FROM recorded_ways) ORDER BY id`,
  );
  const ways = await rows(
    connection,
    "SELECT id, tags, refs FROM recorded_ways ORDER BY id",
  );
  const relations = await rows(
    connection,
    `SELECT id, map_entries(tags) AS tags, refs, ref_types, ref_roles
     FROM boxed_relations ORDER BY id`,
  );
  return osmPbf(
    nodes.map(({ id, lat, lon }) => ({
      id: Number(id),
      lat: Number(lat),
      lon: Number(lon),
    })),
    ways.map(({ id, tags, refs }) => ({
      id: Number(id),
      tags: tagsOf(tags),
      refs: numbers(refs),
    })),
    relations.map(({ id, tags, refs, ref_types, ref_roles }) => {
      const types = Array.isArray(ref_types) ? ref_types.map(String) : [];
      const roles = Array.isArray(ref_roles) ? ref_roles.map(String) : [];
      return {
        id: Number(id),
        tags: tagsOf(tags),
        members: numbers(refs).map((member, index) => ({
          id: member,
          type: (types[index] ?? "way") as "node" | "way" | "relation",
          role: roles[index] ?? "",
        })),
      };
    }),
  );
};

/** A zip of the files given, deflated, as HM Land Registry's are. */
export const zipOf = (files: readonly { name: string; data: Buffer }[]) => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of files) {
    const compressed = deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0); // version needed
    common.writeUInt16LE(0, 2); // flags
    common.writeUInt16LE(8, 4); // deflated
    common.writeUInt32LE(0, 6); // time and date
    common.writeUInt32LE(crc32(data), 10);
    common.writeUInt32LE(compressed.length, 14);
    common.writeUInt32LE(data.length, 18);
    common.writeUInt16LE(nameBytes.length, 22);
    common.writeUInt16LE(0, 24); // extra
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      common,
      nameBytes,
      compressed,
    ]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    common.copy(central, 6);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBytes]));
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
};

/**
 * A council's INSPIRE zip with only the polygons that reach into the boxes:
 * its GML as it is, but for the other members, and its counts.
 */
const recordInspire = async (connection: DuckDBConnection, zip: string) => {
  const kept = await rows(
    connection,
    `SELECT CAST(INSPIREID AS VARCHAR) AS id
     FROM ST_Read(${sqlString(`/vsizip/${zip}/${INSPIRE.member}`)}, open_options := ['DOWNLOAD_SCHEMA=NO'])
     WHERE ST_Intersects(ST_Transform(GEOMETRY, ${sqlString(INSPIRE.crs)}, 'EPSG:4326', always_xy := true)::GEOMETRY, ${BOXES})`,
  );
  const ids = new Set(
    kept.flatMap(({ id }) => (typeof id === "string" ? [id] : [])),
  );
  const gml = zipEntries(await readFile(zip))
    .find(({ name }) => name === INSPIRE.member)
    ?.read()
    .toString("utf8");
  if (!gml) throw new Error(`${zip} has no ${INSPIRE.member}`);
  const first = gml.indexOf("<wfs:member>");
  const last = gml.lastIndexOf("</wfs:member>") + "</wfs:member>".length;
  const members = gml
    .slice(first, last)
    .split("</wfs:member>")
    .filter((member) => member.trim() !== "")
    .map((member) => `${member}</wfs:member>`)
    .filter((member) => {
      const [, id] = /<LR:INSPIREID>(\d+)<\/LR:INSPIREID>/.exec(member) ?? [];
      return id !== undefined && ids.has(id);
    });
  const count = String(members.length);
  const head = gml
    .slice(0, first)
    .replace(/numberMatched="\d+"/, `numberMatched="${count}"`)
    .replace(/numberReturned="\d+"/, `numberReturned="${count}"`);
  return zipOf([
    {
      name: INSPIRE.member,
      data: Buffer.from(`${head}${members.join("")}${gml.slice(last)}`),
    },
  ]);
};

/**
 * Code-Point Open with only the postcodes within `RECORDED_POSTCODES_METRES`
 * of the boxes, in British National Grid, and those the titles give: each
 * postcode area's CSV with only their rows, as they are written.
 */
export const recordCodePointOpen = async (
  connection: DuckDBConnection,
  zip: string,
) => {
  const margin = String(RECORDED_POSTCODES_METRES);
  const boxes = await rows(
    connection,
    `SELECT ST_XMin(b) - ${margin} AS xmin, ST_YMin(b) - ${margin} AS ymin,
       ST_XMax(b) + ${margin} AS xmax, ST_YMax(b) + ${margin} AS ymax
     FROM (SELECT unnest([${Object.values(RECORDED_BOXES)
       .map(
         (box) =>
           `ST_Transform(${envelope(box)}, 'EPSG:4326', 'EPSG:27700', always_xy := true)`,
       )
       .join(", ")}]) AS b)`,
  );
  const near = (easting: number, northing: number) =>
    boxes.some(
      ({ xmin, ymin, xmax, ymax }) =>
        easting >= Number(xmin) &&
        easting <= Number(xmax) &&
        northing >= Number(ymin) &&
        northing <= Number(ymax),
    );
  const kept = zipEntries(await readFile(zip)).flatMap(({ name, read }) => {
    if (!/^Data\/CSV\/[a-z]{1,2}\.csv$/.test(name)) return [];
    const lines = read()
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => {
        const [postcode = "", , easting, northing] = line.split(",");
        return (
          RECORDED_TITLE_POSTCODES.includes(
            postcode.replaceAll('"', "").replace(/\s+/, " "),
          ) || near(Number(easting), Number(northing))
        );
      });
    return lines.length > 0
      ? [{ name, data: Buffer.from(`${lines.join("\r\n")}\r\n`) }]
      : [];
  });
  return zipOf(kept);
};

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir] = process.argv.slice(2);
  if (!dir) {
    throw new Error(
      "Give the folder the land data's sources were downloaded into.",
    );
  }
  const connection = await openDuckDb();
  try {
    for (const county of RECORDED_COUNTIES) {
      await writeFile(
        join(FIXTURES, `geofabrik-${county}.osm.pbf`),
        await recordOsm(connection, join(dir, `${county}.osm.pbf`)),
      );
      for (const table of [
        "boxed_nodes",
        "boxed_ways",
        "boxed_relations",
        "recorded_ways",
      ]) {
        await connection.run(`DROP TABLE ${table}`);
      }
    }
    for (const council of ["Ashfield", "Mansfield"]) {
      await writeFile(
        join(FIXTURES, `inspire-${council.toLowerCase()}.zip`),
        await recordInspire(
          connection,
          join(dir, `${council}_District_Council.zip`),
        ),
      );
    }
    for (const dataset of PLANNING_CONSTRAINT_DATASETS) {
      await copyToParquet(
        connection,
        `SELECT * FROM read_parquet(${sqlString(join(dir, `${dataset}.parquet`))})
         WHERE entity IN (${RECORDED_CONSTRAINTS[dataset].map(String).join(", ")})
         ORDER BY entity`,
        join(FIXTURES, `planning-data-${dataset}.parquet`),
      );
    }
    const index = JSON.parse(
      await readFile(join(dir, "index-v1.json"), "utf8"),
    ) as { features: { properties: { id: string } }[] };
    await writeFile(
      join(FIXTURES, "geofabrik-index.json"),
      `${JSON.stringify({
        type: "FeatureCollection",
        features: index.features.filter(({ properties }) =>
          RECORDED_EXTRACTS.includes(properties.id),
        ),
      })}\n`,
    );
    await copyFile(
      join(dir, "inspire-download.html"),
      join(FIXTURES, "inspire-download.html"),
    );
    await copyFile(
      join(dir, "ons-council-names.json"),
      join(FIXTURES, "ons-council-names.json"),
    );
    await writeFile(
      join(FIXTURES, "codepo_gb.zip"),
      await recordCodePointOpen(connection, join(dir, "codepo_gb.zip")),
    );
  } finally {
    connection.closeSync();
  }
  console.log(`Recorded the land data's sources in ${FIXTURES}`);
}
