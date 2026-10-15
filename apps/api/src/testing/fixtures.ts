import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

/** Where recorded Data Source responses live, next to the adapters that map them. */
export const FIXTURES_DIR = fileURLToPath(
  new URL("../sources/fixtures/", import.meta.url),
);

/** Fixtures are named `<source id>-<what was asked>`, for example `postcodes-io-ng17-1aa`. */
const FIXTURE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Long enough for a slow public service; this is a one-off developer call. */
const RECORD_TIMEOUT_MS = 30_000;

export interface RecordFixtureOptions {
  name: string;
  url: string;
  /** The method, headers (including a User-Agent) and body to send. */
  init: RequestInit;
  fetch: typeof fetch;
  write: (path: string, text: string) => Promise<void>;
}

/**
 * Makes one live call to a Data Source and saves its JSON body as a fixture,
 * formatted the way `pnpm lint` expects. Tests replay it through a stub
 * `fetch`, so no test calls the network (PRD NFR-3.1, NFR-3.3).
 */
export const recordFixture = async ({
  name,
  url,
  init,
  fetch: fetchFn,
  write,
}: RecordFixtureOptions): Promise<{ path: string; status: number }> => {
  if (!FIXTURE_NAME.test(name)) {
    throw new Error(
      `Name fixtures in lower-case words joined by hyphens, not "${name}".`,
    );
  }
  const response = await fetchFn(url, {
    ...init,
    signal: AbortSignal.timeout(RECORD_TIMEOUT_MS),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `${url} answered ${String(response.status)} with a body that is not JSON.`,
    );
  }
  const path = join(FIXTURES_DIR, `${name}.json`);
  const options = await resolveConfig(path);
  await write(
    path,
    await format(JSON.stringify(body), { ...options, filepath: path }),
  );
  return { path, status: response.status };
};
