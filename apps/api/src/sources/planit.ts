import {
  PLANNING_APPLICATION_RULES,
  distanceMetres,
  type DataPeriod,
  type PlanningApplicationStatus,
  type PlanningApplicationType,
  type SearchArea,
} from "@location-scout/shared";

import { DAY_MS, type DataSource } from "./data-source";
import {
  RateLimitedError,
  createSourceQueue,
  retryAfterMs,
  type FoundApplications,
  type PlanningApplicationsProvider,
} from "./planning-applications";
import type { ProviderApplication } from "./estimated-housing";
import { createRateLimiter, type HoldingRateLimiter } from "./rate-limiter";

/**
 * PlanIt: Planning Applications (PRD §6.17, ADR 0003), the default provider.
 * Free, no key, but it asks for a User-Agent with a contact email, and for
 * at most one request a minute.
 */
export const planIt: DataSource = {
  id: "planit",
  name: "PlanIt",
  // Planning Applications are cached for 7 days (PRD NFR-1.4).
  cacheTtlMs: 7 * DAY_MS,
};

/** PlanIt's own pages, which the Location Overview credits. */
export const PLANIT_URL = "https://www.planit.org.uk/";

/**
 * PRD FR-2.2 and ADR 0003: where PlanIt's Planning Applications come from,
 * which are left out, which are approximate, and what their types mean.
 */
export const PLANIT_NOTE =
  "Planning Applications come from PlanIt, which gathers them from councils' planning websites, so each is as its council published it. Those PlanIt has no location for are left out, and those the council gave no point for are placed at the middle of their postcode, so are approximate. PlanIt has no type of its own for householder applications, so they are counted as householder only where the council's own type for them says so, and otherwise as minor. Major applications are those PlanIt counts as large developments.";

/** Searches applications by place, date and more (planit.org.uk/api). */
export const APPLICS_URL = "https://www.planit.org.uk/api/applics/json";

/**
 * PlanIt's FAQ: "you can safely make one request to the /api/applics
 * endpoint every minute" (PRD NFR-1.5).
 */
export const PLANIT_INTERVAL_MS = 60_000;

/**
 * The one limiter for every PlanIt request this process makes, however many
 * apps it creates, so the limit holds across the whole process.
 */
export const PLANIT_LIMITER = createRateLimiter(PLANIT_INTERVAL_MS);

/**
 * The most applications one request asks for, the newest. PlanIt gives at
 * most 1,000 kB an answer, which this many fit in.
 */
export const PLANIT_PAGE_SIZE = 1000;

/**
 * PlanIt is asked for the applications received in the last this many days:
 * 3 years and a leap day, so that the request is the same every day and the
 * 7-day cache can answer it. Those older than 3 years are then left out.
 */
const RECENT_DAYS = PLANNING_APPLICATION_RULES.years * 365 + 1;

/**
 * Only the fields the Planning Layer uses, which leaves out the applicants'
 * and agents' addresses. `lat` and `lng` are the point the council gave, if
 * it gave one; PlanIt places an application without one at its postcode.
 */
const FIELDS = [
  "name",
  "uid",
  "area_name",
  "description",
  "address",
  "postcode",
  "location_x",
  "location_y",
  "start_date",
  "decided_date",
  "app_state",
  "app_size",
  "link",
  "url",
  "other_fields->application_type",
  "other_fields->development_type",
  "other_fields->lat",
  "other_fields->lng",
];

/**
 * How each of PlanIt's `app_state`s is shown (PRD FR-2.2). An application
 * referred to the government or another authority is still waiting for a
 * decision. "Unresolved" ones are no longer active, with no decision, such
 * as a split decision; "Other" ones' status isn't known.
 */
export const PLANIT_STATUSES: Readonly<
  Record<string, PlanningApplicationStatus>
> = {
  Undecided: "pending",
  Referred: "pending",
  Permitted: "approved",
  Conditions: "approved",
  Rejected: "refused",
  Withdrawn: "withdrawn",
  Unresolved: "other",
  Other: "other",
};

/** PlanIt's `app_size` for "major, large scale developments". */
const MAJOR_SIZE = "Large";

/** How a council names a householder application, in its own type for it. */
const HOUSEHOLDER = /householder/i;

export class PlanItError extends Error {
  override name = "PlanItError";
}

/**
 * The applications received in the Search Area in the last 3 years and a
 * day, newest first, at most `PLANIT_PAGE_SIZE` of them. `krad` is rounded up
 * to the metre, so the circle holds the whole Search Area.
 */
export const applicationsUrl = ({ location, searchRadius }: SearchArea) =>
  `${APPLICS_URL}?${new URLSearchParams({
    lat: location.lat.toFixed(6),
    lng: location.lng.toFixed(6),
    krad: (Math.ceil(searchRadius.metres) / 1000).toFixed(3),
    recent: String(RECENT_DAYS),
    pg_sz: String(PLANIT_PAGE_SIZE),
    sort: "-start_date",
    select: FIELDS.join(","),
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
 * Whether it is a householder, minor or major application (PRD FR-2.2).
 * PlanIt calls major developments "Large". It has no type of its own for
 * householder applications, which it counts as full ones, so they are
 * known only where the council's own type for them says so.
 */
export const applicationType = (
  record: Record<string, unknown>,
): PlanningApplicationType => {
  if (record.app_size === MAJOR_SIZE) return "major";
  const councilTypes = [record.application_type, record.development_type];
  return councilTypes.some(
    (type) => typeof type === "string" && HOUSEHOLDER.test(type),
  )
    ? "householder"
    : "minor";
};

/**
 * One of PlanIt's records as a Feature, or `null` for one that is not in the
 * Search Area in `period`, or has no location to show it at.
 */
const toFeature = (
  record: unknown,
  { location, searchRadius }: SearchArea,
  period: DataPeriod,
): ProviderApplication | null => {
  if (!isRecord(record)) return null;
  const id = text(record.name);
  const reference = text(record.uid);
  const authority = text(record.area_name);
  const receivedOn = date(record.start_date);
  const lng = coordinate(record.location_x);
  const lat = coordinate(record.location_y);
  if (!id || !reference || !authority || !receivedOn) return null;
  if (lat === null || lng === null) return null;
  if (receivedOn < period.from || receivedOn > period.to) return null;
  const point = { lat, lng };
  const metres = distanceMetres(location, point);
  if (metres > searchRadius.metres) return null;
  return {
    id,
    location: point,
    distanceMetres: metres,
    reference,
    authority,
    description: text(record.description) ?? "",
    address: text(record.address),
    postcode: text(record.postcode),
    status:
      PLANIT_STATUSES[
        typeof record.app_state === "string" ? record.app_state : ""
      ] ?? "other",
    applicationType: applicationType(record),
    councilType: text(record.application_type) ?? text(record.development_type),
    receivedOn,
    decidedOn: date(record.decided_date),
    // PlanIt places an application at its postcode unless the council gave
    // it a point of its own, which it keeps as `lat` and `lng`.
    approximate:
      coordinate(record.lat) === null || coordinate(record.lng) === null,
    url: text(record.url),
    providerUrl: text(record.link),
  };
};

const newestFirst = (a: ProviderApplication, b: ProviderApplication) =>
  b.receivedOn.localeCompare(a.receivedOn) || a.id.localeCompare(b.id);

/**
 * Maps a raw PlanIt `GET /api/applics/json` answer to the Planning
 * Applications in the Search Area received in `period`, newest first.
 * Records with no location are dropped (ADR 0003). If PlanIt has more than
 * it gave, `total` says how many. Throws if the answer is unusable.
 */
export const mapApplications = (
  body: unknown,
  area: SearchArea,
  period: DataPeriod,
): FoundApplications => {
  if (!isRecord(body) || !Array.isArray(body.records)) {
    throw new PlanItError("PlanIt gave no records");
  }
  const { records } = body;
  const features = records
    .map((record) => toFeature(record, area, period))
    .filter((feature) => feature !== null)
    .sort(newestFirst);
  // Those it didn't give, beyond those it did.
  const notGiven =
    typeof body.total === "number"
      ? Math.max(0, body.total - records.length)
      : 0;
  return { features, total: features.length + notGiven };
};

export interface PlanItOptions {
  /**
   * Identifies us to PlanIt, which asks for a User-Agent with a contact
   * email and blocks requests without one (PRD NFR-1.5).
   */
  userAgent: string;
  /** Spaces out PlanIt requests, at most one a minute. */
  limiter?: HoldingRateLimiter;
}

/**
 * PlanIt as a Planning Applications provider. Its requests wait in a queue
 * for a turn at most once a minute; a `429 Too Many Requests` holds the
 * queue back for its `Retry-After`, and the request is sent again after it.
 * Each answer is cached for 7 days.
 */
export const createPlanIt = ({
  userAgent,
  limiter = PLANIT_LIMITER,
}: PlanItOptions): PlanningApplicationsProvider => {
  const queue = createSourceQueue(limiter);
  return {
    source: planIt,
    url: PLANIT_URL,
    note: PLANIT_NOTE,
    find: (area, period, callSource) => {
      const url = applicationsUrl(area);
      return queue.call(callSource, planIt, url, async ({ fetch, signal }) => {
        const response = await fetch(url, {
          headers: { accept: "application/json", "user-agent": userAgent },
          signal,
        });
        if (response.status === 429) {
          const ms = retryAfterMs(
            response.headers.get("retry-after"),
            PLANIT_INTERVAL_MS,
          );
          limiter.holdFor(ms);
          throw new RateLimitedError(
            `PlanIt answered 429 Too Many Requests: waiting ${String(Math.ceil(ms / 1000))} s before asking again`,
          );
        }
        if (!response.ok) {
          throw new PlanItError(`PlanIt answered ${String(response.status)}`);
        }
        return {
          data: mapApplications(await response.json(), area, period),
          period,
        };
      });
    },
  };
};
