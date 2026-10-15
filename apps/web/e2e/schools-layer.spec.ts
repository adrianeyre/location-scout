import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { arrived } from "./sale-markers";

/**
 * The Schools Layer against the API's prepared-data fixture, made by `pnpm
 * data:prepare` from recordings of GIAS's register and Ofsted's latest
 * inspections around NG17 1AA: four schools are open in its 0.5 mile Search
 * Area, Sutton Community Academy, with a report card from April 2026, Croft
 * Primary School, graded with no overall grade in January 2025, Priestsic
 * Primary and Nursery School, Good, and Westbourne School, an independent
 * special school inspected by the Independent Schools Inspectorate.
 */

const searchNg17 = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/);
};

const schoolsSection = (page: Page) =>
  page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Schools" });

/** The rows of one of the Schools section's tables, each as its cells' text. */
const rowsOf = (table: Locator) =>
  table
    .getByRole("row")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
      ),
    );

/**
 * The point marker labelled `label`, zooming in on the Location, which is in
 * the middle of the map, until there is one.
 */
const markerLabelled = async (map: Locator, label: string) => {
  const marker = map.locator(
    `.feature-marker[data-layer="schools"][aria-label="${label}"]`,
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

/** Opens the marker's popup and returns it. */
const openPopup = async (page: Page, marker: Locator) => {
  await marker.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("heading", { name: "Schools" })).toBeVisible();
  return popup;
};

test("the Overview gives NG17 1AA's nearest primary and secondary schools, and counts its schools by phase and Ofsted judgement", async ({
  page,
}) => {
  await searchNg17(page);

  await expect(page.getByRole("checkbox", { name: "Schools" })).toBeChecked();
  await expect(page.locator("#layer-schools-status")).toHaveText("4 schools");
  const section = schoolsSection(page);
  await expect(section).toContainText(
    "Nearest primary school: Croft Primary School, 520 m. Ofsted: Inspected, no overall grade (graded inspection, 28 January 2025).",
  );
  await expect(section).toContainText(
    "Nearest secondary school: Sutton Community Academy, 230 m. Ofsted: Report card, no overall grade (report card, 21 April 2026).",
  );
  await expect(section).toContainText("4 schools open in the Search Area.");
  expect(
    await rowsOf(
      section.getByRole("table", {
        name: "Schools in the Search Area by phase",
      }),
    ),
  ).toEqual([
    ["Phase", "Schools", "Latest Ofsted judgements"],
    ["Nursery schools", "0", "–"],
    ["Primary schools", "2", "Good 1, Inspected, no overall grade 1"],
    ["Secondary schools", "1", "Report card, no overall grade 1"],
    ["All-through schools", "0", "–"],
    ["Special schools", "1", "No Ofsted judgement here 1"],
    ["Alternative provision", "0", "–"],
    ["Independent schools", "0", "–"],
  ]);
  expect(
    await rowsOf(
      section.getByRole("table", {
        name: "Schools in the Search Area by latest Ofsted judgement",
      }),
    ),
  ).toEqual([
    ["Judgement", "Schools"],
    ["Outstanding", "0"],
    ["Good", "1"],
    ["Requires improvement", "0"],
    ["Inadequate", "0"],
    ["Report card, no overall grade", "1"],
    ["Inspected, no overall grade", "1"],
    ["No Ofsted judgement here", "1"],
  ]);
  // PRD FR-10.1a: GIAS's and Ofsted's data under the Open Government Licence.
  await expect(section).toContainText(
    "From Get Information about Schools (9 October 2026) and Ofsted (31 August 2026). Contains public sector information from the Department for Education's Get Information about Schools and Ofsted, licensed under the Open Government Licence v3.0.",
  );
  await expect(
    section.getByRole("link", { name: "Open Government Licence v3.0" }),
  ).toHaveAttribute(
    "href",
    "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  );
  await expect(section).toContainText(
    "Independent schools, inspected by Ofsted or the Independent Schools Inspectorate, aren't in that data",
  );
});

test("a school's marker opens a popup giving its phase, its latest Ofsted judgement and the grades it gave", async ({
  page,
}) => {
  // A Search Area around Sutton Community Academy, so that zooming in on
  // the Location splits its marker from the others', with the Demographics
  // Layer's markers, which cluster over it, hidden.
  await page.goto(
    "/?lat=53.123786&lng=-1.260611&radius=0.25&hidden=demographics",
  );
  const map = page.getByTestId("search-area-map");
  await arrived(page, map);

  const academy = await openPopup(
    page,
    await markerLabelled(
      map,
      "Sutton Community Academy, Secondary school: Academy sponsor led, 0 m from the Location",
    ),
  );
  await expect(academy).toContainText("Ages 11 to 16");
  await expect(academy).toContainText("Ofsted: Report card, no overall grade");
  await expect(academy).toContainText("Report card on 21 April 2026");
  await expect(
    academy.getByRole("list", { name: "Grades" }).getByRole("listitem"),
  ).toHaveText([
    "Inclusion: Expected standard",
    "Curriculum and teaching: Expected standard",
    "Achievement: Needs attention",
    "Attendance and behaviour: Expected standard",
    "Personal development and wellbeing: Expected standard",
    "Post-16 provision: Expected standard",
    "Leadership and governance: Expected standard",
  ]);
});

test("an independent school's popup says why it has no Ofsted judgement here", async ({
  page,
}) => {
  // A Search Area around Westbourne School, which only the Schools and
  // Demographics Layers have recordings for, with the Demographics Layer's
  // markers, which cluster over it, hidden.
  await page.goto(
    "/?lat=53.124516&lng=-1.274003&radius=0.25&hidden=demographics",
  );
  const map = page.getByTestId("search-area-map");
  await arrived(page, map);

  const westbourne = await openPopup(
    page,
    await markerLabelled(
      map,
      "Westbourne School, Special school: Other independent special school, 0 m from the Location",
    ),
  );
  await expect(westbourne).toContainText(
    "No Ofsted judgement here: inspected by the Independent Schools Inspectorate, as an independent school",
  );
  await expect(westbourne.getByRole("list", { name: "Grades" })).toHaveCount(0);
});

test("switching the Schools Layer off hides its schools from the map and keeps it in the URL", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  const markers = map.locator(
    '.feature-cluster[data-layer="schools"], .feature-marker[data-layer="schools"]',
  );
  await expect(markers.first()).toBeVisible();

  await page.getByRole("checkbox", { name: "Schools" }).uncheck();

  await expect(markers).toHaveCount(0);
  await expect(page).toHaveURL(/&hidden=schools$/);
  await expect(schoolsSection(page)).toContainText(
    "4 schools open in the Search Area.",
  );
});

test("/api/area/schools gives the schools from the prepared data, with both datasets' dates", async ({
  page,
}) => {
  const response = await page.request.get(
    "/api/area/schools?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
  );

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    layer: "schools",
    status: "ok",
    sources: [
      { id: "gias", period: { from: "2026-10-09" } },
      { id: "ofsted", period: { from: "2026-08-31" } },
    ],
    statistics: {
      total: 4,
      nearestPrimary: { id: "122463", distanceMetres: 519 },
      nearestSecondary: { id: "139063", distanceMetres: 232 },
    },
  });
});
