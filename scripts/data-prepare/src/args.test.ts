import { describe, expect, it } from "vitest";

import { USAGE, parseCommandLine } from "./args";
import { PrepareError } from "./prepare";

describe("parseCommandLine", () => {
  it("asks for nothing in particular by default", () => {
    expect(parseCommandLine([])).toEqual({ areas: [], all: false });
  });

  it("takes each council named with --area", () => {
    expect(parseCommandLine(["--area", "Mansfield", "--area=Gedling"])).toEqual(
      { areas: ["Mansfield", "Gedling"], all: false },
    );
  });

  it("takes --all", () => {
    expect(parseCommandLine(["--all"])).toEqual({ areas: [], all: true });
  });

  it("gives no options for --help", () => {
    expect(parseCommandLine(["--help"])).toBeNull();
  });

  it("says how much --all downloads", () => {
    expect(USAGE).toContain(
      "--all             Prepare all 296 English councils: about 6.8 GB to",
    );
  });

  it.each([
    ["an unknown option", ["--areas", "Mansfield"]],
    ["a council without --area", ["Mansfield"]],
    ["--area without a council", ["--area"]],
    ["--area with only spaces", ["--area", "  "]],
  ])("refuses %s, with the usage", (_label, args) => {
    expect(() => parseCommandLine(args)).toThrow(PrepareError);
    expect(() => parseCommandLine(args)).toThrow(/Usage: pnpm data:prepare/);
  });
});
