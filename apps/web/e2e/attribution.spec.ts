import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  HIGH_PAVEMENT,
  ONLY_PROPERTY,
  arrived,
  saleMarker,
} from "./sale-markers";

/**
 * Every Data Source's credit (PRD §6.15) against the fixture-backed API,
 * whose day is 8 October 2026: PRD FR-10.1's in the footer, every source's
 * in its dialog, each Feature's in its popup, and the report's.
 */
const NG17 = "/?lat=53.123664&lng=-1.264078&radius=0.5";

const ALL_BUT = (layer: string) =>
  `${NG17}&hidden=${[
    "crime",
    "planning",
    "amenities",
    "schools",
    "transport",
    "green-space",
    "property",
    "land",
    "demographics",
  ]
    .filter((id) => id !== layer)
    .join(",")}`;

const OGL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

const HISTORIC_ENGLAND =
  "Conservation areas and listed buildings: © Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. The Historic England GIS Data contained in this material was obtained on 8 October 2026. The most publicly available up to date Historic England GIS Data can be obtained from HistoricEngland.org.uk.";

const loaded = (page: Page) =>
  expect(
    page.getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();

/**
 * Opens the popup of a point of `layer`, the only Layer on the map, from
 * the keyboard, zooming in on the Location until there is one.
 */
const openPoint = async (page: Page, layer: string) => {
  const map = page.getByTestId("search-area-map");
  await arrived(page, map);
  const points = map.locator(`.feature-marker[data-layer="${layer}"]`);
  await expect(async () => {
    if ((await points.count()) === 0) {
      // MapLibre zooms in one level, around the middle, on "=".
      await map.locator("canvas").press("Equal");
    }
    await expect(points.first()).toBeAttached({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await points.first().press("Enter");
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toBeVisible();
  return popup;
};

const credits = (popup: Locator) => popup.locator(".feature-popup-credit");

test("the footer credits OpenStreetMap, police.uk, HM Land Registry, planning.data.gov.uk and Ordnance Survey, and lists every source's credit", async ({
  page,
}) => {
  await page.goto(NG17);
  await loaded(page);
  const footer = page.getByRole("contentinfo");

  const credit = footer.locator(".footer-credit");
  await expect(credit).toHaveText(
    "© OpenStreetMap contributors (ODbL). police.uk, HM Land Registry and planning.data.gov.uk data under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right.",
  );
  await expect(credit).toBeInViewport();
  await expect(
    credit.getByRole("link", { name: "OpenStreetMap contributors" }),
  ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  await expect(credit.getByRole("link", { name: "ODbL" })).toHaveAttribute(
    "href",
    "https://opendatacommons.org/licenses/odbl/",
  );
  await expect(
    credit.getByRole("link", { name: "Open Government Licence v3.0" }),
  ).toHaveAttribute("href", OGL);

  await footer
    .getByRole("button", { name: "Data sources and licences" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Data sources and licences",
  });
  await expect(dialog.getByRole("term")).toHaveText([
    "OpenStreetMap",
    "data.police.uk",
    "planning.data.gov.uk",
    "Historic England, via planning.data.gov.uk",
    "PlanIt",
    "PlanWire",
    "HM Land Registry Price Paid Data",
    "HM Land Registry INSPIRE Index Polygons",
    "HM Land Registry CCOD and OCOD",
    "Energy Performance Certificates (MHCLG)",
    "postcodes.io",
    "Ordnance Survey Code-Point Open",
    "ONS Open Geography",
    "ONS Census 2021, income estimates and English Indices of Deprivation",
    "Get Information about Schools and Ofsted",
    "Google Street View",
  ]);
  await expect(dialog).toContainText(
    "Contains HM Land Registry data © Crown copyright and database right [year]. This data is licensed under the Open Government Licence v3.0. Price Paid Data contains address data processed against Ordnance Survey’s AddressBase Premium product",
  );
  await expect(dialog).toContainText(
    "are subject to Crown copyright and database rights [year] Ordnance Survey AC0000851063. Conditions of use.",
  );
  await expect(dialog).toContainText("Street View imagery: Google Maps. Terms");
  await page
    .getByRole("button", { name: "Close data sources and licences" })
    .click();
  await expect(dialog).toBeHidden();
});

test("a crime's popup credits police.uk", async ({ page }) => {
  await page.goto(ALL_BUT("crime"));
  await loaded(page);

  const popup = await openPoint(page, "crime");

  await expect(credits(popup)).toHaveText([
    "Crime data from police.uk, licensed under the Open Government Licence v3.0.",
  ]);
  await expect(
    credits(popup).getByRole("link", { name: "police.uk" }),
  ).toHaveAttribute("href", "https://data.police.uk/");
});

test("the conservation area's popup and the Overview credit planning.data.gov.uk and Historic England, obtained on the day the backend asked", async ({
  page,
}) => {
  await page.goto(ALL_BUT("planning"));
  await loaded(page);

  const planning = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Planning" });
  await expect(planning).toContainText(
    "Planning Constraints from planning.data.gov.uk, licensed under the Open Government Licence v3.0.",
  );
  await expect(planning).toContainText(HISTORIC_ENGLAND);

  const map = page.getByTestId("search-area-map");
  await arrived(page, map);
  const area = map.locator(
    '.feature-marker[data-layer="planning"][aria-label^="Sutton in Ashfield Church and Market Place"]',
  );
  await expect(async () => {
    if ((await area.count()) === 0) {
      await map.locator("canvas").press("Equal");
    }
    await expect(area).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await area.press("Enter");
  const popup = page.locator(".maplibregl-popup .feature-popup");

  await expect(credits(popup)).toHaveText([
    "Planning Constraints from planning.data.gov.uk, licensed under the Open Government Licence v3.0.",
    HISTORIC_ENGLAND,
  ]);
  await expect(
    credits(popup).getByRole("link", { name: "HistoricEngland.org.uk" }),
  ).toHaveAttribute("href", "https://historicengland.org.uk");
});

test("a sale's popup gives HM Land Registry's Price Paid wording, with its address conditions", async ({
  page,
}) => {
  await page.goto(ONLY_PROPERTY);
  await loaded(page);
  const map = page.getByTestId("search-area-map");
  await arrived(page, map);

  await (await saleMarker(map, HIGH_PAVEMENT)).press("Enter");
  const popup = page.locator(".maplibregl-popup .feature-popup");

  await expect(credits(popup)).toHaveText([
    "Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0. Price Paid Data contains address data processed against Ordnance Survey’s AddressBase Premium product, which incorporates Royal Mail’s PAF® database (Address Data). Royal Mail and Ordnance Survey permit its use for personal and/or non-commercial use, and to display for the purpose of providing residential property price information services.",
  ]);
});

test("an amenity's popup credits OpenStreetMap's contributors, under the ODbL", async ({
  page,
}) => {
  await page.goto(ALL_BUT("amenities"));
  await loaded(page);

  const popup = await openPoint(page, "amenities");

  await expect(credits(popup)).toHaveText([
    "Map data © OpenStreetMap contributors, ODbL, from the Overpass API.",
  ]);
});

test("the report gives the footer's credit, Historic England's statement and the ONS Postcode Directory's", async ({
  page,
}) => {
  await page.goto(`${NG17}&view=report`);
  const attributions = page.getByRole("region", { name: "Attributions" });
  await expect(attributions).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print or save as PDF" }),
  ).toBeVisible();

  await expect(attributions.locator("> p").first()).toHaveText(
    "© OpenStreetMap contributors (ODbL). police.uk, HM Land Registry and planning.data.gov.uk data under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right.",
  );
  const definitions = attributions.getByRole("definition");
  await expect(definitions.nth(1)).toContainText(
    "Postcode data via postcodes.io: Contains OS data © Crown copyright and database right. Contains Royal Mail data © Royal Mail copyright and database right. Source: Office for National Statistics licensed under the Open Government Licence v3.0.",
  );
  await expect(definitions.nth(3)).toContainText(HISTORIC_ENGLAND);
});
