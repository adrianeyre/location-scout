import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const SHARED_INDEX = resolve(SRC, "../../../packages/shared/src/index.ts");

const IMPORT = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
const FILE_SYSTEM = /^(node:)?fs(\/promises)?$/;

/** Follows a module's own imports and returns every module it reaches. */
const reachableModules = (entry: string) => {
  const seen = new Map<string, string[]>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    const specifiers = [...readFileSync(file, "utf8").matchAll(IMPORT)].map(
      ([, specifier]) => specifier ?? "",
    );
    seen.set(file, specifiers);
    for (const specifier of specifiers) {
      if (specifier === "@location-scout/shared") visit(SHARED_INDEX);
      else if (specifier.startsWith(".")) {
        const base = resolve(dirname(file), specifier);
        visit(base.endsWith(".json") ? base : `${base}.ts`);
      }
    }
  };
  visit(entry);
  return seen;
};

describe("the API server", () => {
  // The cache is in memory and Phase 1 keeps no history (ADR 0002). Prepared
  // land data is read through DuckDB (ADR 0004), not written by the server.
  it("never touches the file system, so nothing is written to disk", () => {
    const modules = reachableModules(resolve(SRC, "server.ts"));

    expect(modules.size).toBeGreaterThan(5);
    const fileSystemUsers = [...modules]
      .filter(([, specifiers]) => specifiers.some((s) => FILE_SYSTEM.test(s)))
      .map(([file]) => file);
    expect(fileSystemUsers).toEqual([]);
  });

  it("would notice a module that imports the file system", () => {
    const modules = reachableModules(resolve(SRC, "testing/record-fixture.ts"));

    expect(
      [...modules].some(([, specifiers]) =>
        specifiers.some((s) => FILE_SYSTEM.test(s)),
      ),
    ).toBe(true);
  });
});
