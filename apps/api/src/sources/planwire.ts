import {
  distanceMetres,
  type DataPeriod,
  type PlanningApplicationStatus,
  type PlanningApplicationType,
  type SearchArea,
} from "@location-scout/shared";

import { DAY_MS, type DataSource } from "./data-source";
import {
  retryAfterMs,
  type FoundApplications,
  type PlanningApplicationsProvider,
} from "./planning-applications";
import type { ProviderApplication } from "./estimated-housing";

/**
 * PlanWire: Planning Applications (PRD §6.17, ADR 0003), the provider used
 * with `PLANNING_APPLICATIONS_PROVIDER=planwire` and `PLANWIRE_API_KEY`.
 * Paid plans give 1,000 or more requests a day; a free key gives 25, and
 * only samples.
 */
export const planWire: DataSource = {
  id: "planwire",
  name: "PlanWire",
  // Planning Applications are cached for 7 days (PRD NFR-1.4).
  cacheTtlMs: 7 * DAY_MS,
};

/** PlanWire's own pages, which the Location Overview credits. */
export const PLANWIRE_URL = "https://planwire.io/";

/** Finds applications within a radius of a point (planwire.io/docs). */
export const NEARBY_URL = "https://api.planwire.io/v1/applications/nearby";

/**
 * The most applications one request asks for: the most PlanWire gives on a
 * paid plan. It has no pages, date window or order to ask for beyond them.
 */
export const PLANWIRE_LIMIT = 100;

/**
 * PRD FR-2.2 and ADR 0003: where PlanWire's Planning Applications come from,
 * which are left out, and how their status and type are told.
 */
export const PLANWIRE_NOTE =
  "Planning Applications come from PlanWire, which gathers them from councils' planning websites, so each is as its council published it. PlanWire gives at most 100 in a Search Area, whenever they were received, and those received in the last 3 years are shown. Those it has no location for are left out. PlanWire doesn't say whether a council gave an application's point, so none is marked approximate. PlanWire has no type or size of its own for applications, so they are counted as householder or major only where the council's own type for them says so, and otherwise as minor. One is pending until PlanWire has a decision or a decision date for it.";

/**
 * How each of PlanWire's `decisionOutcome`s is shown (PRD FR-2.2). An
 * `unknown` one is pending if it has no decision yet; otherwise its decision
 * couldn't be told, so it is `other`, as are `other` ones.
 */
export const PLANWIRE_OUTCOMES: Readonly<
  Record<string, PlanningApplicationStatus>
> = {
  approved: "approved",
  refused: "refused",
  withdrawn: "withdrawn",
  other: "other",
};

/** How a council names a major application, in its own type for it. */
const MAJOR = /\bmajor\b/i;

/** How a council names a householder application, in its own type for it. */
const HOUSEHOLDER = /householder/i;

export class PlanWireError extends Error {
  override name = "PlanWireError";
}

/**
 * The radius PlanWire is asked to search, in km, rounded up to the metre so
 * the circle holds the whole Search Area.
 */
export const radiusKm = ({ searchRadius }: SearchArea) =>
  Math.ceil(searchRadius.metres) / 1000;

/**
 * The applications in a circle holding the Search Area, at most
 * `PLANWIRE_LIMIT`. The key goes in a header, never the URL, so the URL is
 * what the cache keeps it by.
 */
export const nearbyUrl = (area: SearchArea) =>
  `${NEARBY_URL}?${new URLSearchParams({
    lat: area.location.lat.toFixed(6),
    lng: area.location.lng.toFixed(6),
    radius_km: radiusKm(area).toFixed(3),
    limit: String(PLANWIRE_LIMIT),
  }).toString()}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const date = (value: unknown) =>
  typeof value === "string" && ISO_DATE.test(value) ? value : null;

const coordinate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Whether it is a householder, minor or major application (PRD FR-2.2), by
 * the council's own type for it, as PlanWire has no type or size of its own.
 */
export const applicationType = (
  councilType: string | null,
): PlanningApplicationType => {
  if (councilType !== null && MAJOR.test(councilType)) return "major";
  if (councilType !== null && HOUSEHOLDER.test(councilType)) {
    return "householder";
  }
  return "minor";
};

/**
 * Where it has got to (PRD FR-2.2), from PlanWire's `decisionOutcome`. A
 * free key's samples leave it out, with the decision, so their status isn't
 * known.
 */
export const applicationStatus = (
  record: Record<string, unknown>,
): PlanningApplicationStatus => {
  const outcome = record.decisionOutcome;
  if (typeof outcome !== "string") return "other";
  const status = PLANWIRE_OUTCOMES[outcome];
  if (status !== undefined) return status;
  return text(record.decision) === null && date(record.decisionDate) === null
    ? "pending"
    : "other";
};

/**
 * One of PlanWire's records as a Feature, or `null` for one that is not in
 * the Search Area in `period`, or has no location to show it at.
 */
const toFeature = (
  record: unknown,
  { location, searchRadius }: SearchArea,
  period: DataPeriod,
): ProviderApplication | null => {
  if (!isRecord(record)) return null;
  const councilId = text(record.councilId);
  const reference = text(record.reference);
  const council = isRecord(record.council) ? record.council : {};
  const authority = text(council.name) ?? councilId;
  // PlanWire's `applicationDate` is the day it was received, or else
  // validated.
  const receivedOn =
    date(record.receivedDate) ??
    date(record.applicationDate) ??
    date(record.validatedDate);
  const lat = coordinate(record.lat);
  const lng = coordinate(record.lng);
  if (!councilId || !reference || !authority || !receivedOn) return null;
  if (lat === null || lng === null) return null;
  if (receivedOn < period.from || receivedOn > period.to) return null;
  const point = { lat, lng };
  const metres = distanceMetres(location, point);
  if (metres > searchRadius.metres) return null;
  const councilType = text(record.applicationType);
  return {
    // PlanWire's own `id` can change; its council and reference don't.
    id: `${councilId}/${reference}`,
    location: point,
    distanceMetres: metres,
    reference,
    authority,
    description: text(record.description) ?? "",
    address: text(record.address),
    postcode: text(record.postcode),
    status: applicationStatus(record),
    applicationType: applicationType(councilType),
    councilType,
    receivedOn,
    decidedOn: date(record.decisionDate),
    // PlanWire doesn't say whether the council gave the point.
    approximate: false,
    url: text(record.url),
    // PlanWire has no page of its own for an application.
    providerUrl: null,
  };
};

const newestFirst = (a: ProviderApplication, b: ProviderApplication) =>
  b.receivedOn.localeCompare(a.receivedOn) || a.id.localeCompare(b.id);

/**
 * Maps a raw PlanWire `GET /v1/applications/nearby` answer to the Planning Applications in the Search Area received in
 * `period`, newest first. Records with no location are dropped (ADR 0003).
 * PlanWire doesn't say how many it has, so if it gave as many as it gives,
 * searched a smaller circle than it was asked, or gave a free key's
 * samples, it may have more, and `total` is `null`. Throws if the answer is
 * unusable.
 */
export const mapNearby = (
  body: unknown,
  area: SearchArea,
  period: DataPeriod,
): FoundApplications => {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new PlanWireError("PlanWire gave no data");
  }
  const { data } = body;
  const features = data
    .map((record) => toFeature(record, area, period))
    .filter((feature) => feature !== null)
    .sort(newestFirst);
  const askedKm = radiusKm(area);
  const searchedKm =
    isRecord(body.meta) && typeof body.meta.radius_km === "number"
      ? body.meta.radius_km
      : askedKm;
  const complete =
    data.length < PLANWIRE_LIMIT &&
    searchedKm >= askedKm &&
    // A free key's answer says what its samples leave out.
    !isRecord(body.access);
  return { features, total: complete ? features.length : null };
};

/** How long until PlanWire's daily allowance starts again, at midnight UTC. */
export const msUntilMidnightUtc = (now = Date.now()) => {
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return midnight.getTime() - now;
};

export interface PlanWireOptions {
  /** `PLANWIRE_API_KEY`, sent in PlanWire's `X-API-Key` header. */
  apiKey: string;
}

/**
 * PlanWire as a Planning Applications provider. A request that the cache
 * can't answer is sent at once, as PlanWire limits requests by the day, not
 * the minute. Once PlanWire answers `429 Too Many Requests`, it is asked
 * nothing more until its `Retry-After` has passed, or else until its
 * allowance starts again at midnight UTC. Each answer is cached for 7 days.
 */
export const createPlanWire = ({
  apiKey,
}: PlanWireOptions): PlanningApplicationsProvider => {
  let refusedUntil = 0;
  return {
    source: planWire,
    url: PLANWIRE_URL,
    note: PLANWIRE_NOTE,
    find: (area, period, callSource) => {
      const url = nearbyUrl(area);
      return callSource(planWire, url, async ({ fetch, signal }) => {
        if (Date.now() < refusedUntil) {
          throw new PlanWireError(
            `PlanWire is not asked until ${new Date(refusedUntil).toISOString()}, as it answered 429 Too Many Requests`,
          );
        }
        const response = await fetch(url, {
          headers: { accept: "application/json", "x-api-key": apiKey },
          signal,
        });
        if (response.status === 429) {
          const ms = retryAfterMs(
            response.headers.get("retry-after"),
            msUntilMidnightUtc(),
          );
          refusedUntil = Date.now() + ms;
          throw new PlanWireError(
            `PlanWire answered 429 Too Many Requests: asking it nothing more for ${String(Math.ceil(ms / 60_000))} min`,
          );
        }
        if (response.status === 401) {
          throw new PlanWireError(
            "PlanWire answered 401 Unauthorised: check PLANWIRE_API_KEY is the key PlanWire gave you",
          );
        }
        if (response.status === 402) {
          throw new PlanWireError(
            "PlanWire answered 402 Payment Required: this request needs a paid plan",
          );
        }
        if (!response.ok) {
          throw new PlanWireError(
            `PlanWire answered ${String(response.status)}`,
          );
        }
        return {
          data: mapNearby(await response.json(), area, period),
          period,
        };
      });
    },
  };
};
