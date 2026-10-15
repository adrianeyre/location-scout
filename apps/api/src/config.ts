import { DEFAULT_ANTHROPIC_MODEL } from "./explain/model";

/** The backend's settings, read once from the environment at startup. */
export interface ApiConfig {
  /**
   * Identifies us to Nominatim, as its usage policy requires (PRD NFR-1.5),
   * and to Overpass, which refuses requests that don't say who sends them.
   */
  nominatimUserAgent: string;
  /**
   * Identifies us to PlanIt, which asks for a User-Agent with a contact
   * email (NFR-1.5), or `null` if `PLANIT_USER_AGENT` isn't set, when PlanIt
   * is sent `nominatimUserAgent` instead.
   */
  planItUserAgent: string | null;
  /**
   * PlanWire's API key, when `PLANNING_APPLICATIONS_PROVIDER` is `planwire`
   * and `PLANWIRE_API_KEY` is set, so Planning Applications come from
   * PlanWire (ADR 0003); `null` for PlanIt, the default.
   */
  planWireApiKey: string | null;
  /**
   * `EPC_API_KEY`, the bearer token MHCLG's Energy Performance of
   * Buildings Data API is asked with, or `null` if it isn't set, when
   * EPCs aren't looked for and the Property Layer leaves them out.
   */
  epcApiKey: string | null;
  /**
   * `GOOGLE_MAPS_API_KEY`, which the frontend loads Google's Maps
   * JavaScript API with for the Street View panel (PRD FR-2.13), or `null`
   * if it isn't set, when the panel is hidden and nothing is loaded from
   * Google.
   */
  googleMapsApiKey: string | null;
  /**
   * `ANTHROPIC_API_KEY`, the user's own key AI Explanations are written
   * with (ADR 0005), or `null` if it isn't set, when they are off: no
   * Explain button is shown and nothing calls Anthropic.
   */
  anthropicApiKey: string | null;
  /** `ANTHROPIC_MODEL`, the model that writes them: `claude-sonnet-5-5` unless set. */
  anthropicModel: string;
  /**
   * What is wrong with a setting the backend starts without, and what it
   * does instead, for the server to print as it starts.
   */
  warnings: string[];
}

/** A setting is missing or wrong, so the backend must not start. */
export class ConfigError extends Error {
  override name = "ConfigError";
}

export const MISSING_NOMINATIM_USER_AGENT = `NOMINATIM_USER_AGENT is not set, so the API cannot start.

Address search uses the public Nominatim service, whose usage policy requires
every request to identify the app with a User-Agent that includes a way to
contact you. Without one, Nominatim may block this machine.

Add it to the .env file at the repo root (cp .env.example .env), for example:

  NOMINATIM_USER_AGENT="location-scout-dev (you@example.com)"`;

export const MISSING_PLANWIRE_API_KEY = `PLANNING_APPLICATIONS_PROVIDER is planwire, but PLANWIRE_API_KEY is not set,
so Planning Applications come from PlanIt instead.

PlanWire needs an API key with every request. Get one at https://planwire.io
(a free key gives only samples, without their status) and add it to the
.env file at the repo root:

  PLANNING_APPLICATIONS_PROVIDER=planwire
  PLANWIRE_API_KEY=pw_live_...

Or set PLANNING_APPLICATIONS_PROVIDER=planit, the default, which needs no key.`;

/** What the backend says when `PLANNING_APPLICATIONS_PROVIDER` names no provider it knows. */
export const unknownProvider = (
  value: string,
) => `PLANNING_APPLICATIONS_PROVIDER is "${value}", which is not a Planning Applications
provider, so Planning Applications come from PlanIt.

Set it in the repo's .env to planit, the default, which needs no key, or to
planwire, with PLANWIRE_API_KEY.`;

/** Reads the settings from `env`, or throws a ConfigError that says what to fix. */
export const readConfig = (
  env: Record<string, string | undefined>,
): ApiConfig => {
  const nominatimUserAgent = env.NOMINATIM_USER_AGENT?.trim() ?? "";
  if (nominatimUserAgent === "") {
    throw new ConfigError(MISSING_NOMINATIM_USER_AGENT);
  }
  const planItUserAgent = env.PLANIT_USER_AGENT?.trim() ?? "";
  const warnings: string[] = [];
  // A missing key or an unknown provider disables only PlanWire: the
  // Planning Applications still come, from PlanIt.
  let planWireApiKey: string | null = null;
  const provider = env.PLANNING_APPLICATIONS_PROVIDER?.trim() ?? "";
  const apiKey = env.PLANWIRE_API_KEY?.trim() ?? "";
  if (provider.toLowerCase() === "planwire") {
    if (apiKey === "") warnings.push(MISSING_PLANWIRE_API_KEY);
    else planWireApiKey = apiKey;
  } else if (provider !== "" && provider.toLowerCase() !== "planit") {
    warnings.push(unknownProvider(provider));
  }
  const epcApiKey = env.EPC_API_KEY?.trim() ?? "";
  const googleMapsApiKey = env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim() ?? "";
  const anthropicModel = env.ANTHROPIC_MODEL?.trim() ?? "";
  return {
    nominatimUserAgent,
    planItUserAgent: planItUserAgent === "" ? null : planItUserAgent,
    planWireApiKey,
    epcApiKey: epcApiKey === "" ? null : epcApiKey,
    googleMapsApiKey: googleMapsApiKey === "" ? null : googleMapsApiKey,
    anthropicApiKey: anthropicApiKey === "" ? null : anthropicApiKey,
    anthropicModel:
      anthropicModel === "" ? DEFAULT_ANTHROPIC_MODEL : anthropicModel,
    warnings,
  };
};
