import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { ConfigError, readConfig, type ApiConfig } from "./config";

/** Refuses to start, saying why, when a required setting is missing. */
const loadConfig = (): ApiConfig => {
  try {
    return readConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
};

const {
  nominatimUserAgent,
  planItUserAgent,
  planWireApiKey,
  epcApiKey,
  googleMapsApiKey,
  anthropicApiKey,
  anthropicModel,
  warnings,
} = loadConfig();
const port = Number(process.env.PORT ?? 8787);
// Settings it starts without, saying what it does instead.
for (const warning of warnings) console.warn(warning);

serve(
  {
    fetch: createApp({
      nominatimUserAgent,
      planItUserAgent,
      planWireApiKey,
      epcApiKey,
      googleMapsApiKey,
      anthropicApiKey,
      anthropicModel,
    }).fetch,
    port,
  },
  ({ port }) => {
    console.log(
      `Location Scout API listening on http://localhost:${String(port)}`,
    );
  },
);
