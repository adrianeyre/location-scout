/**
 * The report is a view of its own (PRD FR-7.4), kept in the URL beside the
 * Search Area's own view (`url-state.ts`), which keeps any parameter it
 * doesn't know: `?lat=53.123664&lng=-1.264078&radius=0.5&view=report`. So
 * reloading it, or a bookmark of it, opens the report again, and Back
 * returns to the map.
 */
const VIEW_PARAM = "view";
const REPORT_VIEW = "report";

/** Whether a URL's query string opens the report. */
export const isReportView = (search: string) =>
  new URLSearchParams(search).get(VIEW_PARAM) === REPORT_VIEW;

/**
 * A query string with `view` set to the view given, or taken away for
 * `null`, its other parameters as they were: starting with `?`, or empty if
 * nothing is left.
 */
export const viewSearch = (search: string, view: string | null) => {
  const params = new URLSearchParams(search);
  if (view) {
    params.set(VIEW_PARAM, view);
  } else {
    params.delete(VIEW_PARAM);
  }
  // Commas and colons are left alone, as `writeUrlState` leaves them.
  const next = params.toString().replaceAll("%2C", ",").replaceAll("%3A", ":");
  return next ? `?${next}` : "";
};

/** A query string with the report opened or closed, as `viewSearch` gives it. */
export const reportViewSearch = (search: string, report: boolean) =>
  viewSearch(search, report ? REPORT_VIEW : null);

const DASHBOARD_VIEW = "dashboard";

/**
 * Whether a URL's query string opens the Dashboard, a view of its own in the
 * same way: `?lat=53.123664&lng=-1.264078&radius=0.5&view=dashboard`.
 */
export const isDashboardView = (search: string) =>
  new URLSearchParams(search).get(VIEW_PARAM) === DASHBOARD_VIEW;

/** A query string with the Dashboard opened or closed, as `viewSearch` gives it. */
export const dashboardViewSearch = (search: string, dashboard: boolean) =>
  viewSearch(search, dashboard ? DASHBOARD_VIEW : null);
