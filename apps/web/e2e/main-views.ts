import type { Locator, Page } from "@playwright/test";

import { expect, visibleMap } from "./fixtures";

/*
 * The main views, each opened as a person would reach it, for the checks
 * every one of them must pass: axe, and nothing scrolling sideways on a
 * narrow screen (PRD FR-9.2, FR-9.5). NG17 1AA's 0.5 mile Search Area has a
 * recording for every Layer; Sutton Parkway's 0.25 mile one reaches into a
 * Land Opportunity.
 */

const NG17_1AA = "/?lat=53.123664&lng=-1.264078&radius=0.5";
const SUTTON_PARKWAY = "/?lat=53.1145&lng=-1.246&radius=0.25";

/** NG17 1AA with only its amenities on the map. */
const NG17_1AA_AMENITIES = `${NG17_1AA}&hidden=crime,planning,schools,transport,green-space,property,land,demographics`;

const savedLocation = (
  id: string,
  name: string,
  location: { lat: number; lng: number },
  radius: number,
) => ({
  id,
  name,
  savedAt: "2026-10-09T09:15:00.000Z",
  location,
  radius,
  mode: "general",
  weights: null,
  found: null,
});

const NG17_1AA_LOCATION = { lat: 53.123664, lng: -1.264078 };

/** Four Saved Locations, as many as can be compared, as the app keeps them. */
const SAVED = {
  format: "location-scout.saved-locations",
  version: 1,
  savedLocations: [
    savedLocation("e2e-ng17-1aa", "NG17 1AA", NG17_1AA_LOCATION, 0.5),
    savedLocation(
      "e2e-sutton-parkway",
      "Sutton Parkway",
      { lat: 53.1145, lng: -1.246 },
      0.25,
    ),
    savedLocation(
      "e2e-a-mile",
      "A mile around NG17 1AA, for a longer name",
      NG17_1AA_LOCATION,
      1,
    ),
    savedLocation("e2e-a-quarter", "A quarter mile", NG17_1AA_LOCATION, 0.25),
  ],
};

const overview = (page: Page) =>
  page.getByRole("complementary", { name: "Location Overview" });

const waitForOverview = (page: Page) =>
  expect(
    overview(page).getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();

/** The first of `markers` wholly inside `map`, away from its edges, if any. */
const inView = async (map: Locator, markers: Locator) => {
  const bounds = await map.boundingBox();
  if (!bounds) return null;
  // Only the part of the map the panel leaves can be clicked.
  const visible = await visibleMap(map.page(), map);
  for (const marker of await markers.all()) {
    const box = await marker.boundingBox();
    if (
      box &&
      box.x > bounds.x + 32 &&
      box.y > bounds.y + 32 &&
      box.x + box.width < bounds.x + visible.width - 32 &&
      box.y + box.height < bounds.y + visible.height - 32
    ) {
      return marker;
    }
  }
  return null;
};

export interface MainView {
  name: string;
  /** Opens the view on a page whose appearance may already be chosen. */
  open: (page: Page) => Promise<void>;
}

export const MAIN_VIEWS: MainView[] = [
  {
    name: "the Location Score's breakdown and weight sliders",
    open: async (page) => {
      await page.goto(NG17_1AA);
      await waitForOverview(page);
      const scores = overview(page).getByRole("region", {
        name: "Scores beta",
      });
      await scores.locator("summary").first().click();
      await scores.getByRole("button", { name: /^Weights: / }).click();
      await expect(
        scores.getByRole("slider", { name: "Safety" }),
      ).toBeVisible();
    },
  },
  {
    name: "the addresses a search matched",
    open: async (page) => {
      await page.goto("/");
      await page
        .getByLabel("Postcode or address")
        .fill("12 High Street, Sutton-in-Ashfield");
      await page.getByRole("button", { name: "Search" }).click();
      await expect(
        page
          .getByRole("region", { name: "Choose an address" })
          .getByRole("button"),
      ).toHaveCount(3);
    },
  },
  {
    name: "a map popup",
    open: async (page) => {
      await page.goto(NG17_1AA_AMENITIES);
      await waitForOverview(page);
      const map = page.getByTestId("search-area-map");
      // On a narrow map they may be clustered: zoom in until one is a point.
      await expect(async () => {
        const marker = await inView(
          map,
          map.locator('.feature-marker[data-layer="amenities"]'),
        );
        if (!marker) {
          await (await inView(map, map.locator(".feature-cluster")))?.click();
        }
        expect(marker).not.toBeNull();
        await marker?.click();
      }).toPass({ timeout: 20_000 });
      await expect(map.locator(".feature-popup")).toBeVisible();
    },
  },
  {
    name: "the Land panel with a Land Opportunity chosen",
    open: async (page) => {
      await page.goto(SUTTON_PARKWAY);
      await expect(page.locator("#layer-land-status")).toHaveText(
        "1 Land Opportunity",
      );
      await page.getByRole("tab", { name: "Land" }).click();
      const panel = page.getByRole("complementary", {
        name: "Land Opportunities",
      });
      await panel
        .getByRole("list", { name: "Land Opportunities" })
        .getByRole("button")
        .first()
        .click();
      await expect(
        panel.getByRole("region", { name: /^Land Opportunity: 48\.2 acres/ }),
      ).toBeVisible();
    },
  },
  {
    name: "the Saved tab",
    open: async (page) => {
      await page.addInitScript((saved) => {
        localStorage.setItem("location-scout.saved-locations", saved);
      }, JSON.stringify(SAVED));
      await page.goto(NG17_1AA);
      await waitForOverview(page);
      await page.getByRole("tab", { name: "Saved" }).click();
      await expect(
        page
          .getByRole("list", { name: "Saved Locations" })
          .getByRole("heading"),
      ).toHaveCount(4);
    },
  },
  {
    name: "four Saved Locations compared",
    open: async (page) => {
      await page.addInitScript((saved) => {
        localStorage.setItem("location-scout.saved-locations", saved);
      }, JSON.stringify(SAVED));
      await page.goto("/");
      await page.getByRole("tab", { name: "Compare" }).click();
      const panel = page.getByRole("complementary", {
        name: "Compare Saved Locations",
      });
      for (const box of await panel.getByRole("checkbox").all()) {
        await box.check();
      }
      await expect(panel.getByRole("status")).toHaveText(
        "Comparing 4 Saved Locations, as many as fit side by side: untick one to compare another.",
      );
      // Each loads its Search Area, NG17 1AA's data.police.uk's spaced out.
      await expect(
        panel
          .getByRole("table")
          .getByRole("row")
          .filter({ hasText: "Location Score" })
          .getByRole("cell"),
      ).toHaveText([/^\d+/, /^\d+/, /^\d+/, /^\d+/], { timeout: 20_000 });
    },
  },
  {
    name: "the printable report",
    open: async (page) => {
      await page.goto(`${NG17_1AA}&view=report`);
      await expect(page.getByRole("status")).toHaveText(
        "Everything has loaded. To keep a PDF, choose Save as PDF as the printer.",
      );
      await expect(
        page.getByRole("img", { name: /^Map of the Search Area/ }),
      ).toBeVisible();
    },
  },
  {
    name: "the Dashboard, with every Layer loaded",
    open: async (page) => {
      await page.goto(`${NG17_1AA}&view=dashboard`);
      const dashboard = page.getByRole("main", { name: "Dashboard" });
      await expect(
        dashboard.getByRole("region", { name: "Location Score beta" }),
      ).toContainText("62/100");
      await expect(dashboard.locator("[aria-busy]")).toHaveCount(0);
    },
  },
  {
    name: "the Data sources and licences dialog",
    open: async (page) => {
      await page.goto("/");
      await page
        .getByRole("button", { name: "Data sources and licences" })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Data sources and licences" }),
      ).toBeVisible();
    },
  },
];
