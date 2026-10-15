import { parseArgs } from "node:util";

import { PrepareError, type PrepareOptions } from "./prepare";

export const USAGE = `Usage: pnpm data:prepare [--area <council>]… [--all]

Prepares the England-wide datasets, and the land data of each Land Coverage
Area, into data/ (PRD §6.7). Ashfield is prepared the first time, unless you
name another council. A re-run refreshes every council prepared before.

  --area <council>  Also prepare this council, by name or ONS code. Repeat it
                    for more: --area "Mansfield" --area "Gedling".
  --all             Prepare all 296 English councils: about 6.8 GB to
                    download (4.5 GB of it HM Land Registry's INSPIRE
                    Index Polygons), which takes hours.
  --help            Show this message.`;

/** What the command line asks for, or `null` if it asks for help. */
export const parseCommandLine = (
  args: readonly string[],
): Pick<PrepareOptions, "areas" | "all"> | null => {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        area: { type: "string", multiple: true },
        all: { type: "boolean" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new PrepareError(
      `${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`,
    );
  }
  if (values.help) return null;
  const areas = (values.area ?? []).map((area) => area.trim());
  if (areas.some((area) => area === "")) {
    throw new PrepareError(`--area needs the name of a council.\n\n${USAGE}`);
  }
  return { areas, all: values.all ?? false };
};
