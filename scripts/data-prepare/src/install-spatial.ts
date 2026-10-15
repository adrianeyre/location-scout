import { openDuckDb } from "./duckdb";

/**
 * Run after `pnpm install`: installs DuckDB's spatial extension, which the
 * API and the tests load but never download themselves (ADR 0004). DuckDB
 * downloads it once from extensions.duckdb.org into `~/.duckdb/extensions`.
 * Offline, it only warns: `pnpm data:prepare` installs it too.
 */
try {
  const connection = await openDuckDb();
  connection.closeSync();
} catch (error) {
  console.warn(
    `DuckDB's spatial extension could not be installed, so prepared data can't be read until it is. Run pnpm install again once online, or pnpm data:prepare.\n${error instanceof Error ? error.message : String(error)}`,
  );
}
