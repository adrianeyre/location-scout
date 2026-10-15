import type { Page } from "@playwright/test";

import { drawnCircle, expect, test } from "./fixtures";

/*
 * The printable report (PRD FR-7.4, NFR-3.2) against the fixture-backed
 * API. NG17 1AA's 0.5 mile Search Area has a recording for every Layer, a
 * Location Score of 62 in the General Scout Mode, and no Land Opportunity.
 * Sutton Parkway's 0.25 mile Search Area reaches into a 48.2 acre farm
 * field, a Land Opportunity, but has no recording of data.police.uk,
 * planning.data.gov.uk or PlanIt, so its Crime and Planning Layers are
 * unavailable.
 */

const SUTTON_PARKWAY = "/?lat=53.1145&lng=-1.246&radius=0.25";

const LAYERS = [
  "Crime",
  "Planning",
  "Amenities",
  "Schools",
  "Transport",
  "Green space",
  "Property",
  "Land",
  "Demographics",
];

/** A4's width less the report's 12 mm margins either side, in CSS pixels. */
const A4_TEXT_WIDTH = Math.floor(((210 - 2 * 12) / 25.4) * 96);

/** A4 in PDF points, as Chromium writes it: 210 × 297 mm, to within a point. */
const A4_POINTS = { width: 595.28, height: 841.89 };

const report = (page: Page) => page.getByRole("article");

const section = (page: Page, name: string) =>
  report(page).getByRole("region", { name, exact: true });

/** Waits for every Layer, the scores, the Highlights and the map image. */
const loaded = async (page: Page) => {
  await expect(page.getByRole("status")).toHaveText(
    "Everything has loaded. To keep a PDF, choose Save as PDF as the printer.",
    { timeout: 15_000 },
  );
  await expect(page.locator(".report-map-image")).toBeVisible({
    timeout: 15_000,
  });
};

test("reports NG17 1AA's Search Area with its map image, Highlights, Overview, scores and every Layer's attribution, then goes back to the map", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Sutton Central & New Cross")).toBeVisible();

  await page.getByRole("button", { name: "Printable report" }).click();

  await expect(page).toHaveURL(
    "/?lat=53.123664&lng=-1.264078&radius=0.5&view=report",
  );
  await expect(page).toHaveTitle(
    "Location Scout report: 0.5 mile around NG17 1AA",
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Location Scout report: 0.5 mile around NG17 1AA",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("search-area-map")).toHaveCount(0);
  await loaded(page);

  // The static map image: the Search Area circle drawn in it, and a key.
  const image = page.getByRole("img", { name: /^Map of the Search Area/ });
  expect(
    await image.evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  const circle = await drawnCircle(page, image);
  expect(circle?.pixels).toBeGreaterThan(500);
  const key = page.getByRole("list", { name: "Map key" });
  await expect(key).toContainText("Crime: 185 crimes");
  await expect(key).toContainText("Amenities: 197 amenities");
  await expect(
    page.getByRole("figure").getByText(/Base map © OpenStreetMap contributors/),
  ).toBeVisible();

  await expect(
    section(page, "What you need to know").getByRole("listitem").first(),
  ).toHaveText(/^Concern: High crime/);

  const overview = section(page, "Location Overview");
  await expect(overview.getByText("Sutton Central & New Cross")).toBeVisible();
  for (const name of LAYERS) {
    await expect(
      overview.getByRole("region", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(overview.getByRole("button")).toHaveCount(0);

  const scores = section(page, "Scores beta");
  await expect(
    scores.getByRole("heading", { name: "Location Score 62/100" }),
  ).toBeVisible();
  await expect(
    scores.getByRole("table", {
      name: "How the Location Score is weighed, with the General Scout Mode's weights",
    }),
  ).toBeVisible();
  for (const name of [
    "Safety",
    "Amenities",
    "Schools",
    "Transport",
    "Green space",
    "Property activity",
    "Development activity",
    "Planning freedom",
  ]) {
    await expect(
      scores.getByRole("table", { name: `How the ${name} score is reached` }),
    ).toBeVisible();
  }

  // No Land Opportunity here, so no section of them.
  await expect(section(page, "Land Opportunities")).toHaveCount(0);

  const credits = section(page, "Attributions");
  await expect(credits.getByRole("term")).toHaveText([
    "Map",
    "Location",
    ...LAYERS,
  ]);
  const definitions = credits.getByRole("definition");
  await expect(definitions.nth(2)).toHaveText(
    "Crime data from police.uk, licensed under the Open Government Licence v3.0.",
  );
  await expect(definitions.nth(3)).toContainText(
    "Planning Constraints from planning.data.gov.uk, licensed under the Open Government Licence v3.0.",
  );
  await expect(definitions.nth(3)).toContainText(
    "Planning Applications from PlanIt, as it had them on 8 October 2026.",
  );
  await expect(definitions.nth(4)).toHaveText(
    "Map data © OpenStreetMap contributors, ODbL, from the Overpass API as at 8 October 2026.",
  );
  await expect(definitions.nth(8)).toContainText(
    "Contains HM Land Registry data © Crown copyright and database right 2026.",
  );
  await expect(definitions.nth(9)).toContainText(
    "INSPIRE Index Polygons: This information is subject to Crown copyright and database rights 2026",
  );
  await expect(definitions.nth(10)).toContainText(
    "Source: Office for National Statistics licensed under the Open Government Licence v3.0.",
  );

  await page.getByRole("button", { name: "Back to the map" }).click();

  await expect(page).toHaveURL("/?lat=53.123664&lng=-1.264078&radius=0.5");
  await expect(page.getByTestId("search-area-map")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("prints cleanly to A4 in Chromium: no buttons, nothing wider than the page, and A4 pages", async ({
  page,
}) => {
  await page.goto("/?lat=53.123664&lng=-1.264078&radius=0.5&view=report");
  await loaded(page);

  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: A4_TEXT_WIDTH, height: 1000 });

  await expect(
    page.getByRole("button", { name: "Print or save as PDF" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Back to the map" }),
  ).toBeHidden();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  // The map image fits the page's width.
  const image = await page
    .getByRole("img", { name: /^Map of the Search Area/ })
    .boundingBox();
  expect(image?.width).toBeLessThanOrEqual(A4_TEXT_WIDTH);
  // On paper, the attributions' links are given in full.
  expect(
    await page
      .getByRole("link", { name: "police.uk" })
      .evaluate((link) => getComputedStyle(link, "::after").content),
  ).toBe('" (https://data.police.uk/)"');

  // What the print dialog's Save as PDF makes, at the page size the report asks for.
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  const sizes = new Set(
    [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(
      ([, width, height]) => `${String(width)} × ${String(height)}`,
    ),
  );
  expect(sizes.size).toBe(1);
  const [size = ""] = sizes;
  const [width = 0, height = 0] = size.split(" × ").map(Number);
  expect(Math.abs(width - A4_POINTS.width)).toBeLessThan(1);
  expect(Math.abs(height - A4_POINTS.height)).toBeLessThan(1);
  const pages = pdf.match(/\/Type \/Page\b/g)?.length ?? 0;
  expect(pages).toBeGreaterThan(1);
  expect(pages).toBeLessThan(30);
});

test("reports Sutton Parkway's Land Opportunity under FR-5.7's wording, in the Development Scout Mode, and credits the Layers left out as unavailable", async ({
  page,
}) => {
  await page.goto(`${SUTTON_PARKWAY}&mode=development&view=report`);
  await loaded(page);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Location Scout report: 0.25 mile around 53.114500, -1.246000",
    }),
  ).toBeVisible();
  await expect(report(page)).toContainText(
    "Development: Could I build here? Weighed with its default weights.",
  );
  await expect(page.getByRole("list", { name: "Map key" })).toContainText(
    "Land: 1 Land Opportunity",
  );

  const land = section(page, "Land Opportunities");
  await expect(land).toContainText(
    "Our data suggests this parcel warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner.",
  );
  await expect(
    land.getByRole("heading", {
      name: /^Land Opportunity: 48\.2 acres \(19\.5 ha\), \d+ m from the Location$/,
    }),
  ).toBeVisible();
  await expect(land.getByRole("list", { name: "Its tags" })).toContainText(
    "Room for about 351 homes, estimated",
  );
  await expect(
    land.getByRole("link", { name: "Search the index map" }),
  ).toBeVisible();

  const credits = section(page, "Attributions").getByRole("definition");
  await expect(credits.nth(2)).toHaveText(
    "Unavailable, so nothing of it is in this report.",
  );
  await expect(credits.nth(3)).toHaveText(
    "Unavailable, so nothing of it is in this report.",
  );
  await expect(credits.nth(9)).toContainText(
    "Map data © OpenStreetMap contributors, ODbL, from Geofabrik's extracts, which Land Parcels are built from.",
  );
});
