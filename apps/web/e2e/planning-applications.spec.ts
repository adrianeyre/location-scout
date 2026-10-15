import type { Locator, Page } from "@playwright/test";

import type { PlanningLayerResponse } from "@location-scout/shared";

import { expect, test } from "./fixtures";
import { arrived } from "./sale-markers";

/**
 * The Planning Layer's Planning Applications against PlanIt's recorded
 * answer for NG17 1AA's 0.5 mile Search Area (`planit-ng17-1aa.json`,
 * recorded on 9 October 2026 and asked as if on 8 October): 126 received
 * since 11 October 2023, all placed at their postcode, as Ashfield gives
 * PlanIt no points, and two of them major. With the recorded
 * planning.data.gov.uk answer's 9 Planning Constraints.
 */
const NG17 = "/?lat=53.123664&lng=-1.264078&radius=0.5";

/** Every other Layer switched off the map, so nothing covers a Planning Feature. */
const ONLY_PLANNING = `${NG17}&hidden=crime,amenities,schools,transport,green-space,property,land,demographics`;

const planningStatus = (page: Page) => page.locator("#layer-planning-status");

/** What the Planning Layer's toggle says about its Planning Applications, on a line of their own. */
const applicationsStatus = (page: Page) =>
  page.locator("#layer-planning-applications-status");

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

test("NG17 1AA's Planning Applications are counted by status and type in the Overview, with its two major applications, and credited to PlanIt", async ({
  page,
}) => {
  await page.goto(NG17);

  await expect(planningStatus(page)).toHaveText("9 planning constraints");
  const section = applicationsOverview(page);
  await expect(section).toContainText(
    "126 Planning Applications received in the Search Area since 9 October 2023.",
  );
  await expect(section).toContainText(
    "All are approximate: placed at the middle of their postcode, as the council gave no closer location.",
  );
  expect(
    await rowsOf(
      section.getByRole("table", { name: "Planning Applications by status" }),
    ),
  ).toEqual([
    ["Status", "In the Search Area"],
    ["Pending", "16"],
    ["Approved", "94"],
    ["Refused", "14"],
    ["Withdrawn", "2"],
    ["No decision, or not known", "0"],
  ]);
  // Ashfield calls its householder applications full ones.
  expect(
    await rowsOf(
      section.getByRole("table", { name: "Planning Applications by type" }),
    ),
  ).toEqual([
    ["Type", "In the Search Area"],
    ["Householder applications", "0"],
    ["Minor applications", "124"],
    ["Major applications", "2"],
  ]);
  await expect(
    section
      .getByRole("list", { name: "Major applications" })
      .getByRole("listitem"),
  ).toHaveText([
    "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU: Demolition of existing commercial building and construction of a 3 storey apartment block and 6 semi-detached houses (pending, received 21 July 2025)",
    "The Lawn Visitor Centre, The Lawn Pleasure Grounds, Lawn Lane, Sutton In Ashfield, Nottinghamshire, NG17 5FU: Removal of 1no. 3G artificial grass pitches and creation of 2no. 3G artificial grass pitches with perimeter fencing, hardstanding areas, storage containers, floodlights, access footpaths and overflow car park (approved, received 13 August 2024)",
  ]);
  // From their descriptions: 41 homes approved and 9 pending.
  await expect(section).toContainText(
    "Estimated housing: 50 homes approved or pending in the Search Area → about 120 extra residents.",
  );
  await expect(section).toContainText(
    "41 approved and 9 pending, read from the descriptions of 16 Planning Applications, at 2.4 residents a home. 2 more propose homes without saying how many, so aren't counted.",
  );
  await expect(section).toContainText(
    "Planning Applications come from PlanIt, which gathers them from councils' planning websites",
  );
  await expect(section).toContainText(
    "Planning Applications from PlanIt, as it had them on 8 October 2026.",
  );
  await expect(section.getByRole("link", { name: "PlanIt" })).toHaveAttribute(
    "href",
    "https://www.planit.org.uk/",
  );
});

test("each Planning Application is drawn coloured by its status, and its popup gives its decision, type, potential impact and reference, says it is approximate, and links to it", async ({
  page,
}) => {
  await page.goto(ONLY_PLANNING);
  await expect(applicationsOverview(page)).toContainText(
    "126 Planning Applications received",
  );
  // Once they have come, the Overview counts them, not the Layers panel.
  await expect(applicationsStatus(page)).toHaveCount(0);
  const map = page.getByTestId("search-area-map");
  await arrived(page, map);

  // A refused application, alone at its postcode's point, 48 m away.
  const refused = await markerNamed(
    map,
    "19 King Street, Sutton In Ashfield, Nottinghamshire, NG17 1AT",
  );
  await expect(refused).toHaveAccessibleName(
    "19 King Street, Sutton In Ashfield, Nottinghamshire, NG17 1AT, Refused, 22 December 2025, 50 m from the Location",
  );
  // Refused applications are red.
  await expect(refused).toHaveCSS("background-color", "rgb(198, 40, 40)");

  await refused.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup.getByRole("heading", { name: "Planning" })).toBeVisible();
  await expect(popup.locator("li > *")).toHaveText([
    "19 King Street, Sutton In Ashfield, Nottinghamshire, NG17 1AT",
    "Refused, 22 December 2025",
    "Minor application: Full Planning Application",
    "Received 25 June 2025",
    "Change of use from rear courtyard to car wash",
    "Potential impact, estimated: no new homes in its description.",
    "Ashfield reference V/2025/0229",
    "Approximate: placed at the middle of its postcode, as the council gave no closer location.",
    "See it on the council's website",
    "See it on planit.org.uk",
  ]);
  await expect(
    popup.getByRole("link", { name: "See it on planit.org.uk" }),
  ).toHaveAttribute(
    "href",
    "https://www.planit.org.uk/planapplic/Ashfield/V/2025/0229/",
  );
  await expect(popup).toContainText("50 m from the Location");
});

test("while PlanIt's queue holds the Search Area's request, the Planning Layer says Loading planning applications (rate-limited) once every other Layer has loaded, and shows them once their turn has come", async ({
  page,
}) => {
  // The fixture-backed API never makes a request wait for PlanIt's turn, so
  // its first two answers are given as the API gives them while one waits:
  // the Planning Constraints, with the Planning Applications queued.
  let answered = 0;
  await page.route("**/api/area/planning?**", async (route) => {
    if (answered++ >= 2) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = (await response.json()) as PlanningLayerResponse;
    await route.fulfill({
      response,
      json: {
        ...body,
        sources: body.sources.filter(({ id }) => id !== "planit"),
        applications: body.applications && {
          ...body.applications,
          status: "queued",
          features: [],
          statistics: null,
        },
      } satisfies PlanningLayerResponse,
    });
  });
  await page.goto(NG17);

  await expect(applicationsStatus(page)).toHaveText(
    "Loading planning applications (rate-limited)",
  );
  await expect(planningStatus(page)).toHaveText("9 planning constraints");
  // Every other Layer loads meanwhile, Crime, data.police.uk's 24 months,
  // the slowest, and the Planning Applications are still waiting.
  await expect(page.locator("#layer-crime-status")).toHaveText(/\d+ crimes/);
  await expect(page.locator(".layer-toggle .layer-status")).toHaveCount(10);
  await expect(
    page.locator('.layer-toggle .layer-status[data-status="loading"]'),
  ).toHaveCount(0);
  await expect(applicationsStatus(page)).toHaveText(
    "Loading planning applications (rate-limited)",
  );
  await expect(applicationsOverview(page)).toContainText(
    "Loading planning applications (rate-limited). PlanIt allows about one request a minute, so a new Search Area waits its turn.",
  );
  // The Planning Constraints are shown as ever.
  await expect(
    overview(page).getByRole("table", {
      name: "Planning Constraints in the Search Area",
    }),
  ).toBeVisible();

  // Asked again every 5 seconds, until their turn has come.
  await expect(applicationsOverview(page)).toContainText(
    "126 Planning Applications received in the Search Area",
    { timeout: 20_000 },
  );
  await expect(applicationsStatus(page)).toHaveCount(0);
  expect(answered).toBe(3);
});

test("anywhere PlanIt has no recording, the Planning Applications read unavailable and the rest of the page still works", async ({
  page,
}) => {
  // Sutton Parkway's 0.25 mile Search Area: Overpass is recorded, but
  // neither planning.data.gov.uk nor PlanIt.
  await page.goto("/?lat=53.1145&lng=-1.246&radius=0.25");

  await expect(planningStatus(page)).toHaveText("Unavailable");
  await expect(applicationsStatus(page)).toHaveText(
    "Planning applications unavailable",
  );
  await expect(applicationsOverview(page)).toContainText(
    "Unavailable. PlanIt didn't answer",
  );
  await expect(page.locator("#layer-transport-status")).not.toHaveText(
    /Loading|Unavailable/,
  );
});
