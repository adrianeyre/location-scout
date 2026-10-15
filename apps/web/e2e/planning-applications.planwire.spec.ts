import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { arrived } from "./sale-markers";

/**
 * The Planning Layer's Planning Applications from PlanWire, against the API
 * started with `PLANNING_APPLICATIONS_PROVIDER=planwire` and the tests'
 * `PLANWIRE_API_KEY`, and the very same frontend as every other test (ADR
 * 0003). PlanWire's answer for NG17 1AA's 0.5 mile Search Area
 * (`planwire-ng17-1aa.json`) is made up in PlanWire's published schema from
 * PlanIt's recording of the same applications: the 97 nearest the Location,
 * one of them major, and three made-up ones that are left out, 100 in all,
 * as many as PlanWire gives at once.
 */
const NG17 = "/?lat=53.123664&lng=-1.264078&radius=0.5";

/** Every other Layer switched off the map, so nothing covers a Planning Feature. */
const ONLY_PLANNING = `${NG17}&hidden=crime,amenities,schools,transport,green-space,property,land,demographics`;

const planningStatus = (page: Page) => page.locator("#layer-planning-status");

const overview = (page: Page) =>
  page.getByRole("complementary", { name: "Location Overview" });

/** The Planning Applications' part of the Planning Layer's statistics. */
const applicationsOverview = (page: Page) =>
  overview(page)
    .getByRole("region", { name: "Planning", exact: true })
    .locator(".planning-applications");

/** A table's rows, each as its cells' text. */
const rowsOf = (table: Locator) =>
  table
    .getByRole("row")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll("th, td")].map((cell) =>
          cell.textContent.trim(),
        ),
      ),
    );

/**
 * The point marker whose label starts with `name`, zooming in on the
 * Location, which is in the middle of the map, until there is one.
 */
const markerNamed = async (map: Locator, name: string) => {
  const marker = map.locator(
    `.feature-marker[data-layer="planning"][aria-label^="${name}"]`,
  );
  await expect(async () => {
    if ((await marker.count()) === 0) {
      // MapLibre zooms in one level, around the middle, on "=".
      await map.locator("canvas").press("Equal");
    }
    await expect(marker).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return marker;
};

test("with PlanWire, NG17 1AA's Planning Applications are counted by status and type in the same Overview, credited to PlanWire, which may have more", async ({
  page,
}) => {
  await page.goto(NG17);

  await expect(planningStatus(page)).toHaveText("9 planning constraints");
  const section = applicationsOverview(page);
  await expect(section).toContainText(
    "97 Planning Applications received in the Search Area since 9 October 2023. PlanWire gave as many as it gives at once and doesn't say how many it has, so there may be more than are shown and counted.",
  );
  // PlanWire doesn't say whether the council gave an application's point.
  await expect(section).not.toContainText("are approximate");
  expect(
    await rowsOf(
      section.getByRole("table", { name: "Planning Applications by status" }),
    ),
  ).toEqual([
    ["Status", "In the Search Area"],
    ["Pending", "14"],
    ["Approved", "72"],
    ["Refused", "10"],
    ["Withdrawn", "1"],
    ["No decision, or not known", "0"],
  ]);
  // Ashfield calls its major applications "Major Full".
  expect(
    await rowsOf(
      section.getByRole("table", { name: "Planning Applications by type" }),
    ),
  ).toEqual([
    ["Type", "In the Search Area"],
    ["Householder applications", "0"],
    ["Minor applications", "96"],
    ["Major applications", "1"],
  ]);
  await expect(
    section
      .getByRole("list", { name: "Major applications" })
      .getByRole("listitem"),
  ).toHaveText([
    "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU: Demolition of existing commercial building and construction of a 3 storey apartment block and 6 semi-detached houses (pending, received 21 July 2025)",
  ]);
  await expect(section).toContainText(
    "Planning Applications come from PlanWire, which gathers them from councils' planning websites",
  );
  await expect(section).not.toContainText("PlanIt");
  // The same descriptions as PlanIt's, but only the nearest 97.
  await expect(section).toContainText(
    "Estimated housing: 36 homes approved or pending in the Search Area → about 86 extra residents.",
  );
  await expect(section).toContainText(
    "Planning Applications from PlanWire, as it had them on 8 October 2026.",
  );
  await expect(section.getByRole("link", { name: "PlanWire" })).toHaveAttribute(
    "href",
    "https://planwire.io/",
  );
});

test("with PlanWire, each Planning Application is drawn coloured by its status, with the same popup, linking to the council's website", async ({
  page,
}) => {
  await page.goto(ONLY_PLANNING);
  await expect(applicationsOverview(page)).toContainText(
    "97 Planning Applications received",
  );
  const map = page.getByTestId("search-area-map");
  await arrived(page, map);

  const refused = await markerNamed(
    map,
    "19 King Street, Sutton In Ashfield, Nottinghamshire, NG17 1AT",
  );
  await expect(refused).toHaveAccessibleName(
    "19 King Street, Sutton In Ashfield, Nottinghamshire, NG17 1AT, Refused, 22 December 2025, 50 m from the Location",
  );
  await expect(refused).toHaveCSS("background-color", "rgb(198, 40, 40)");

  await refused.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup.getByRole("heading", { name: "Planning" })).toBeVisible();
  // PlanWire has no page of its own for an application.
  await expect(popup.locator("li > *")).toHaveText([
    "19 King Street, Sutton In Ashfield, Nottinghamshire, NG17 1AT",
    "Refused, 22 December 2025",
    "Minor application: Full Planning Application",
    "Received 25 June 2025",
    "Change of use from rear courtyard to car wash",
    "Potential impact, estimated: no new homes in its description.",
    "Ashfield District Council reference V/2025/0229",
    "See it on the council's website",
  ]);
  await expect(popup).toContainText("50 m from the Location");
});
