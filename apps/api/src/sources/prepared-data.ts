import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DuckDBInstance,
  type DuckDBConnection,
  type DuckDBValue,
  type Json,
} from "@duckdb/node-api";
import {
  isPreparedManifest,
  type ManifestDataset,
  type PreparedManifest,
} from "@location-scout/shared";

import { NotPreparedError } from "./data-source";

/** The repository's git-ignored `data/` folder, which `pnpm data:prepare` fills (PRD FR-6.6). */
export const DATA_DIR = fileURLToPath(
  new URL("../../../../data/", import.meta.url),
);

const MANIFEST_FILE = "manifest.json";

/** What to tell someone whose prepared data is missing. */
export const RUN_DATA_PREPARE = "Run pnpm data:prepare.";

/**
 * The files `pnpm data:prepare` made, read with DuckDB inside this process
 * (PRD FR-6.3, ADR 0004). DuckDB reads them; the backend never writes to disk.
 */
export interface PreparedData {
  /**
   * `data/manifest.json`, read afresh each time, so a re-run of
   * `pnpm data:prepare` shows at once. Throws `NotPreparedError` if there is
   * none, and an `Error` if it isn't one `pnpm data:prepare` writes.
   */
  manifest: () => Promise<PreparedManifest>;
  /**
   * Runs a query with DuckDB's spatial extension, with its `$1`, `$2`…
   * parameters, over the file of a dataset the manifest lists, which is `$1`,
   * or over the files of several, which are `$1`, `$2`… in their order, with
   * `values` after them. Throws `NotPreparedError` if a file is missing.
   */
  query: (
    datasets: ManifestDataset | readonly ManifestDataset[],
    sql: string,
    values?: readonly DuckDBValue[],
  ) => Promise<Record<string, Json>[]>;
}

/**
 * Opens DuckDB in memory with the spatial extension, which `pnpm install`
 * and `pnpm data:prepare` install. The backend only loads it: it never
 * downloads anything, so without it the prepared data is not prepared.
 */
const openDuckDb = async () => {
  const instance = await DuckDBInstance.create(":memory:", {
    autoinstall_known_extensions: "false",
  });
  const connection = await instance.connect();
  try {
    await connection.run("LOAD spatial");
  } catch (error) {
    throw new NotPreparedError(
      `DuckDB's spatial extension is not installed. ${RUN_DATA_PREPARE}`,
      { cause: error },
    );
  } finally {
    connection.closeSync();
  }
  return instance;
};

/**
 * Reads the prepared data in `dataDir`. DuckDB is opened the first time it is
 * needed, and shared by every request after.
 */
export const openPreparedData = (dataDir: string): PreparedData => {
  let opening: Promise<DuckDBInstance> | undefined;

  /** Runs `use` on a connection of its own, so queries can run at once. */
  const withConnection = async <T>(
    use: (connection: DuckDBConnection) => Promise<T>,
  ) => {
    opening ??= openDuckDb();
    // Try again next time: the extension may be installed by then.
    const instance = await opening.catch((error: unknown) => {
      opening = undefined;
      throw error;
    });
    const connection = await instance.connect();
    try {
      return await use(connection);
    } finally {
      connection.closeSync();
    }
  };

  const rows = (
    connection: DuckDBConnection,
    sql: string,
    values: readonly DuckDBValue[],
  ) =>
    connection
      .runAndReadAll(sql, [...values])
      .then((reader) => reader.getRowObjectsJson());

  /** Whether a file is there, asked of DuckDB so that nothing here touches the file system. */
  const exists = async (connection: DuckDBConnection, path: string) =>
    (await rows(connection, "SELECT file FROM glob($1)", [path])).length > 0;

  return {
    manifest: () =>
      withConnection(async (connection) => {
        const path = join(dataDir, MANIFEST_FILE);
        if (!(await exists(connection, path))) {
          throw new NotPreparedError(
            `There is no ${path}. ${RUN_DATA_PREPARE}`,
          );
        }
        const [read] = await rows(
          connection,
          "SELECT content FROM read_text($1)",
          [path],
        );
        const content = read?.content;
        const manifest: unknown =
          typeof content === "string" ? JSON.parse(content) : null;
        if (!isPreparedManifest(manifest)) {
          throw new Error(
            `${path} is not a manifest pnpm data:prepare writes. ${RUN_DATA_PREPARE}`,
          );
        }
        return manifest;
      }),

    query: (datasets, sql, values = []) =>
      withConnection(async (connection) => {
        const paths = (Array.isArray(datasets) ? datasets : [datasets]).map(
          ({ file }: ManifestDataset) => join(dataDir, file),
        );
        for (const path of paths) {
          if (!(await exists(connection, path))) {
            throw new NotPreparedError(
              `${path} is missing. ${RUN_DATA_PREPARE}`,
            );
          }
        }
        return rows(connection, sql, [...paths, ...values]);
      }),
  };
};
