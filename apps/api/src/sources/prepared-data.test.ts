import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isPreparedManifest } from "@location-scout/shared";

import {
  PREPARED_DATA_FIXTURE,
  PREPARED_DATA_FIXTURE_DIR,
} from "../testing/app";
import { NotPreparedError } from "./data-source";
import { DATA_DIR, openPreparedData } from "./prepared-data";

let emptyDir: string;

beforeAll(async () => {
  emptyDir = await mkdtemp(join(tmpdir(), "location-scout-nothing-"));
});

afterAll(async () => {
  await rm(emptyDir, { recursive: true, force: true });
});

describe("DATA_DIR", () => {
  it("is the data/ folder at the repository root, which pnpm data:prepare fills", () => {
    expect(DATA_DIR).toBe(
      join(PREPARED_DATA_FIXTURE_DIR, "../../../../../data/"),
    );
  });
});

describe("openPreparedData", () => {
  it("reads the manifest pnpm data:prepare wrote", async () => {
    const manifest = await PREPARED_DATA_FIXTURE.manifest();

    expect(isPreparedManifest(manifest)).toBe(true);
    expect(manifest.preparedAt).toBe("2026-10-08T12:00:00.000Z");
  });

  it("queries a prepared GeoParquet file with DuckDB's spatial extension", async () => {
    const [boundaries] = (await PREPARED_DATA_FIXTURE.manifest()).datasets;
    if (!boundaries) throw new Error("The fixture has no datasets");

    const rows = await PREPARED_DATA_FIXTURE.query(
      boundaries,
      "SELECT code, name, ST_GeometryType(geometry) AS type FROM read_parquet($1) WHERE name = $2",
      ["Mansfield"],
    );

    expect(rows).toEqual([
      { code: "E07000174", name: "Mansfield", type: "POLYGON" },
    ]);
  });

  it("answers queries at the same time", async () => {
    const [boundaries] = (await PREPARED_DATA_FIXTURE.manifest()).datasets;
    if (!boundaries) throw new Error("The fixture has no datasets");

    const counts = await Promise.all(
      Array.from({ length: 5 }, () =>
        PREPARED_DATA_FIXTURE.query(
          boundaries,
          "SELECT count(*)::INTEGER AS councils FROM read_parquet($1)",
        ),
      ),
    );

    expect(counts).toEqual(Array(5).fill([{ councils: 2 }]));
  });

  it("is not prepared without a manifest", async () => {
    const prepared = openPreparedData(emptyDir);

    await expect(prepared.manifest()).rejects.toBeInstanceOf(NotPreparedError);
    await expect(prepared.manifest()).rejects.toThrow(/Run pnpm data:prepare/);
  });

  it("is not prepared when a file the manifest lists is missing", async () => {
    const [boundaries] = (await PREPARED_DATA_FIXTURE.manifest()).datasets;
    if (!boundaries) throw new Error("The fixture has no datasets");

    await expect(
      openPreparedData(emptyDir).query(boundaries, "SELECT 1"),
    ).rejects.toBeInstanceOf(NotPreparedError);
  });
});
