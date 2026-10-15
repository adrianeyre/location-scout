import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * Opens an in-memory DuckDB with its spatial extension loaded, which reads
 * GeoJSON and writes GeoParquet (ADR 0004). DuckDB downloads the extension
 * from extensions.duckdb.org the first time, into `~/.duckdb/extensions`;
 * after that it is loaded from there.
 */
export const openDuckDb = async (): Promise<DuckDBConnection> => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  await connection.run("INSTALL spatial");
  await connection.run("LOAD spatial");
  return connection;
};

/** A string as an SQL literal, for the few places DuckDB takes no parameter. */
export const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Writes a query's rows to a GeoParquet file, in row groups of
 * `rowGroupSize` rows if it is given, or DuckDB's own otherwise.
 *
 * DuckDB writes GeoParquet's metadata from the shapes it writes, so a file
 * with no rows, such as a council's Article 4 directions where it has none,
 * would have none, and its shapes would be read back as bytes rather than
 * geometry. Such a file is written again with the metadata given.
 */
export const copyToParquet = async (
  connection: DuckDBConnection,
  query: string,
  file: string,
  rowGroupSize: number | null = null,
) => {
  await mkdir(dirname(file), { recursive: true });
  const options = [
    "FORMAT parquet",
    ...(rowGroupSize === null
      ? []
      : [`ROW_GROUP_SIZE ${String(rowGroupSize)}`]),
  ];
  const copy = (more: readonly string[]) =>
    connection.run(
      `COPY (${query}) TO ${sqlString(file)} (${[...options, ...more].join(", ")})`,
    );
  await copy([]);

  const columns = await connection.runAndReadAll(`DESCRIBE ${query}`);
  const shapes = columns
    .getRowObjectsJson()
    .flatMap(({ column_name, column_type }) =>
      typeof column_name === "string" &&
      typeof column_type === "string" &&
      column_type.startsWith("GEOMETRY")
        ? [column_name]
        : [],
    );
  const [primary] = shapes.includes("geometry") ? ["geometry"] : shapes;
  if (!primary) return;
  const metadata = await connection.runAndReadAll(
    `SELECT count(*) AS geo FROM parquet_kv_metadata(${sqlString(file)}) WHERE decode(key) = 'geo'`,
  );
  if (Number(metadata.getRowObjectsJson()[0]?.geo) > 0) return;
  const geo = {
    version: "1.0.0",
    primary_column: primary,
    columns: Object.fromEntries(
      shapes.map((column) => [column, { encoding: "WKB", geometry_types: [] }]),
    ),
  };
  await copy([`KV_METADATA {geo: ${sqlString(JSON.stringify(geo))}}`]);
};
