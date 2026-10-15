import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { MAIN_VIEWS } from "./main-views";

/*
 * WCAG 2.2 AA, checked by axe on the main view with NG17 1AA's Search Area
 * loaded, in every theme in light and dark, on every other main view in
 * light and dark, and on every dialog; and by hand
 * where axe can't tell: the skip link, the sticky full-width footer, the
 * dialogs' scrolling bodies, and reflow at 320 px wide (400% zoom).
 */

/** Settings' six themes, as `src/theme/themes.ts` lists them. */
const THEMES = [
  { id: "scout", name: "Scout" },
  { id: "ocean", name: "Ocean" },
  { id: "forest", name: "Forest" },
  { id: "heather", name: "Heather" },
  { id: "sunset", name: "Sunset" },
  { id: "high-contrast", name: "High contrast" },
];

const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

/**
 * Map markers sit where their Features are, so they may touch or overlap:
 * WCAG 2.5.8's "Essential" exception. Every other target is held to 24 px.
 */
const MAP_MARKERS = ".maplibregl-marker";

/** What axe finds, as rule ids and the elements they failed on, for a readable failure. */
const violations = async (page: Page, include?: string) => {
  const everything = new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .disableRules(["target-size"]);
  const targets = new AxeBuilder({ page })
    .withRules(["target-size"])
    .exclude(MAP_MARKERS);
  if (include) {
    everything.include(include);
    targets.include(include);
  }
  const found = [
    ...(await everything.analyze()).violations,
    ...(await targets.analyze()).violations,
  ];
  return found.map(({ id, nodes }) => ({
    id,
    targets: nodes.map(({ target }) => target.join(" ")),
  }));
};

/** Opens the page with the appearance already chosen, as Settings keeps it. */
const openWith = async (page: Page, theme: string, mode: string) => {
  await page.addInitScript((kept) => {
    localStorage.setItem("location-scout:appearance", kept);
  }, JSON.stringify({ theme, mode }));
  await page.goto("/?lat=53.123664&lng=-1.264078&radius=0.5");
  await expect(
    page.getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();
};

for (const theme of THEMES) {
  for (const mode of ["light", "dark"] as const) {
    test(`the main view passes axe in ${theme.name}, ${mode}`, async ({
      page,
    }) => {
      await openWith(page, theme.id, mode);
      await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        theme.id,
      );
      expect(await violations(page)).toEqual([]);
    });
  }
}

for (const view of MAIN_VIEWS) {
  for (const mode of ["light", "dark"] as const) {
    test(`${view.name} passes axe in ${mode}`, async ({ page }) => {
      await page.addInitScript(
        (kept) => {
          localStorage.setItem("location-scout:appearance", kept);
        },
        JSON.stringify({ theme: "scout", mode }),
      );
      await view.open(page);
      await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
      expect(await violations(page)).toEqual([]);
    });
  }
}

for (const [opener, name] of [
  ["Data sources and licences", "Data sources and licences"],
  ["Privacy Policy", "Privacy Policy"],
  ["Terms and Conditions", "Terms and Conditions"],
  ["Cookie Policy", "Cookie Policy"],
  ["Accessibility", "Accessibility"],
  ["Settings", "Settings"],
] as const) {
  test(`the ${name} dialog passes axe in light and dark`, async ({ page }) => {
    for (const mode of ["light", "dark"]) {
      await page.addInitScript(
        (kept) => {
          localStorage.setItem("location-scout:appearance", kept);
        },
        JSON.stringify({ theme: "scout", mode }),
      );
      await page.goto("/");
      await page.getByRole("button", { name: opener, exact: true }).click();
      const dialog = page.getByRole("dialog", { name });
      await expect(dialog).toBeVisible();
      expect(await violations(page, "dialog[open]")).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole("button", { name: opener, exact: true }),
      ).toBeFocused();
    }
  });
}

test("the first Tab reaches a skip link to the main content", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("the footer runs the full width of the page and stays at its foot", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?lat=53.123664&lng=-1.264078&radius=0.5");
  await expect(
    page.getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();
  const footer = page.getByRole("contentinfo");
  const box = await footer.boundingBox();
  expect(box?.x).toBe(0);
  expect(box?.width).toBe(1280);
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(800);

  // Still there with the Overview scrolled to its end.
  await page.locator("#panel-overview").evaluate((panel) => {
    panel.scrollTop = panel.scrollHeight;
  });
  await expect(footer).toBeInViewport({ ratio: 1 });
});

test("a dialog's body scrolls sideways when its content is too wide, and its title and cross stay put", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Cookie Policy" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie Policy" });
  const body = dialog.getByRole("region", { name: "Cookie Policy" });
  const { scrollWidth, clientWidth, overflowX } = await body.evaluate(
    (element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
    }),
  );
  expect(overflowX).toBe("auto");
  expect(scrollWidth).toBeGreaterThan(clientWidth);

  // Scrolled by keyboard from the body, the title and cross stay in view.
  await body.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowRight");
  await expect(
    dialog.getByRole("heading", { name: "Cookie Policy" }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "Close cookie policy" }),
  ).toBeInViewport();
});

test("at 320 px wide (400% zoom) nothing scrolls sideways, and on a screen too short for a sheet the panel stacks under the map", async ({
  page,
}) => {
  const sideways = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/?lat=53.123664&lng=-1.264078&radius=0.5");
  await expect(
    page.getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();
  expect(await sideways()).toBeLessThanOrEqual(0);

  // 400% zoom of a 1280 by 1024 screen: nothing floats; the page scrolls as one.
  await page.setViewportSize({ width: 320, height: 256 });
  expect(await sideways()).toBeLessThanOrEqual(0);
  const map = await page.getByTestId("search-area-map").boundingBox();
  const panel = await page.locator(".side-panel").boundingBox();
  expect(panel?.y).toBeGreaterThanOrEqual((map?.y ?? 0) + (map?.height ?? 0));
});

test("Settings' mode and theme are applied at once and kept after a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");

  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("radio", { name: "Dark" }).check();
  await dialog.getByRole("radio", { name: "High contrast" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    "high-contrast",
  );
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    "high-contrast",
  );

  // System follows the device as it changes.
  await page.getByRole("button", { name: "Settings" }).click();
  await dialog.getByRole("radio", { name: "System" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
});

test("the page has the title, description and link preview a search engine and Slack read", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(
    "Location Scout — understand any location in England",
  );
  const content = (selector: string) =>
    page.locator(selector).getAttribute("content");
  expect(await content('meta[name="description"]')).toMatch(/England/);
  // The dev server writes its own address where SITE_URL isn't set.
  expect(await content('meta[property="og:image"]')).toMatch(
    /^http:\/\/localhost:\d+\/og-image\.png$/,
  );
  const image = await page.request.get("/og-image.png");
  expect(image.headers()["content-type"]).toBe("image/png");
  const robots = await page.request.get("/robots.txt");
  expect(await robots.text()).toContain("Sitemap: ");
  const sitemap = await page.request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("<loc>");
  expect(baseURL).toBeTruthy();
});

test("the Settings cog sits at the top right of the header, in its one row at 1280 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const cog = await page
    .getByRole("button", { name: "Settings" })
    .boundingBox();
  const title = await page
    .getByRole("heading", { name: "Location Scout", level: 1 })
    .boundingBox();
  expect(Math.round((cog?.x ?? 0) + (cog?.width ?? 0))).toBe(1280 - 16);
  // Level with the title, not wrapped onto a row of its own.
  expect(cog?.y ?? 0).toBeLessThan((title?.y ?? 0) + (title?.height ?? 0));
});
