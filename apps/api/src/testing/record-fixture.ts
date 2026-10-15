import { writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { parseArgs } from "node:util";

import { recordFixture } from "./fixtures";

/**
 * Records one Data Source response as a test fixture:
 *
 *   pnpm --filter @location-scout/api fixture:record <name> <url>
 *     [--method POST] [--body '...']
 *     [--header 'content-type: application/json'] [--user-agent '...']
 *
 * It calls the live service once, so mind its rate limits (Nominatim: one
 * request a second; PlanIt: one a minute) and give a User-Agent with a
 * contact address where the service asks for one.
 */
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    method: { type: "string", default: "GET" },
    body: { type: "string" },
    header: { type: "string", multiple: true, default: [] },
    "user-agent": {
      type: "string",
      default: "location-scout-dev fixture recorder",
    },
  },
});

const [name, url] = positionals;
if (name === undefined || url === undefined || positionals.length > 2) {
  console.error(
    "Usage: pnpm --filter @location-scout/api fixture:record <name> <url> [--method POST] [--body '...'] [--header 'name: value'] [--user-agent '...']",
  );
  process.exit(1);
}

const headers = new Headers({
  accept: "application/json",
  "user-agent": values["user-agent"],
});
for (const header of values.header) {
  const colon = header.indexOf(":");
  if (colon < 1) {
    console.error(`Write headers as "name: value", not "${header}".`);
    process.exit(1);
  }
  headers.set(header.slice(0, colon).trim(), header.slice(colon + 1).trim());
}

const { path, status } = await recordFixture({
  name,
  url,
  init: {
    method: values.method,
    headers,
    ...(values.body === undefined ? {} : { body: values.body }),
  },
  fetch,
  write: (file, text) => writeFile(file, text),
});

console.log(
  `Recorded ${values.method} ${url} (${String(status)}) to ${relative(process.cwd(), path)}`,
);
if (status !== 200) {
  console.log(
    `It answered ${String(status)}: replay it with that status, for example Response.json(fixture, { status: ${String(status)} }).`,
  );
}
