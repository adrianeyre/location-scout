import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DATA_DIR } from "./paths";

describe("DATA_DIR", () => {
  it("is the data/ folder at the repository root", () => {
    const repoRoot = join(DATA_DIR, "..");

    expect(DATA_DIR.endsWith(`${join("/", "data")}/`)).toBe(true);
    expect(existsSync(join(repoRoot, "pnpm-workspace.yaml"))).toBe(true);
  });
});
