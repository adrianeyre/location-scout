import { describe, expect, it } from "vitest";

import html from "../index.html?raw";

import { APPEARANCE_STORAGE_KEY } from "./theme/appearance";
import { DEFAULT_THEME_ID } from "./theme/themes";

const meta = (attribute: "name" | "property", key: string) =>
  new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]+)"`).exec(
    html.replace(/\s+/g, " "),
  )?.[1];

describe("index.html", () => {
  it("describes the site for search engines in under 160 characters", () => {
    const description = meta("name", "description");
    expect(description?.length).toBeGreaterThan(70);
    expect(description?.length).toBeLessThanOrEqual(160);
    expect(html).toContain('<link rel="canonical" href="__SITE_URL__/" />');
  });

  it("gives link previews a title, description and absolute 1200×630 image", () => {
    expect(meta("property", "og:title")).toBeTruthy();
    expect(meta("property", "og:description")).toBeTruthy();
    expect(meta("property", "og:image")).toBe("__SITE_URL__/og-image.png");
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
    expect(meta("property", "og:image:alt")).toBeTruthy();
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
  });

  it("reads the appearance from the key the app keeps it under", () => {
    expect(html).toContain(`localStorage.getItem("${APPEARANCE_STORAGE_KEY}")`);
    expect(html).toContain(`data-theme="${DEFAULT_THEME_ID}"`);
  });

  it("links every icon size", () => {
    for (const href of [
      "/favicon.ico",
      "/favicon.svg",
      "/apple-touch-icon.png",
      "/site.webmanifest",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
