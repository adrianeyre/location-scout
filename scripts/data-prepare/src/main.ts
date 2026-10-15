import { parseCommandLine, USAGE } from "./args";
import { COMPANY_TITLES } from "./company-titles";
import { DATA_DIR } from "./paths";
import { PrepareError, prepareData } from "./prepare";

/**
 * `pnpm data:prepare`: downloads the source files and prepares them into
 * GeoParquet files in `data/`, with a manifest of their dates (PRD §6.7).
 */
try {
  const options = parseCommandLine(process.argv.slice(2));
  if (options === null) {
    console.log(USAGE);
  } else {
    const manifest = await prepareData({
      ...options,
      dataDir: DATA_DIR,
      fetch,
      // From .env, which the API's settings are in, if it isn't set.
      landRegistryApiKey:
        process.env[COMPANY_TITLES.keyVariable]?.trim() || null,
      log: (message) => {
        console.log(message);
      },
    });
    const names = manifest.landCoverageAreas.map(({ council }) => council.name);
    console.log(
      `Prepared ${String(manifest.datasets.length)} England-wide dataset${manifest.datasets.length === 1 ? "" : "s"} and ${String(names.length)} Land Coverage Area${names.length === 1 ? "" : "s"} (${names.join(", ")}) in ${DATA_DIR}.`,
    );
  }
} catch (error) {
  if (!(error instanceof PrepareError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
