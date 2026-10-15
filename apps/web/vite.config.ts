import { existsSync, readFileSync } from "node:fs";

import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// API_ORIGIN and SITE_URL can be set in the repo's .env, as the backend's
// settings are. What is already in the environment, such as the end-to-end
// tests' API_ORIGIN, is kept.
const ROOT_ENV = new URL("../../.env", import.meta.url);
if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);

// The frontend only ever calls our own backend (ADR 0001), through this proxy.
// The end-to-end tests point it at their fixture-backed backend instead.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8787";

// The footer shows the root package.json's version.
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

const DEV_SITE_URL = "http://localhost:5173";

/**
 * The address the site is served from, with no trailing slash. Link
 * previews (Open Graph and X) need absolute URLs, so `index.html`'s
 * canonical link and preview image, `robots.txt` and `sitemap.xml` are all
 * written with it. Set `SITE_URL` when building for anywhere but localhost.
 */
const siteUrl = (process.env.SITE_URL ?? DEV_SITE_URL).replace(/\/+$/, "");

const robotsTxt = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`;

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

/** Puts `SITE_URL` into `index.html`, and serves `robots.txt` and `sitemap.xml`. */
const seo = (): Plugin => ({
  name: "location-scout-seo",
  transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", siteUrl),
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const file =
        request.url === "/robots.txt"
          ? { type: "text/plain", body: robotsTxt }
          : request.url === "/sitemap.xml"
            ? { type: "application/xml", body: sitemapXml }
            : null;
      if (!file) {
        next();
        return;
      }
      response.setHeader("Content-Type", `${file.type}; charset=utf-8`);
      response.end(file.body);
    });
  },
  generateBundle() {
    if (!process.env.SITE_URL) {
      this.warn(
        `SITE_URL is not set, so link previews and the sitemap point at ${DEV_SITE_URL}.`,
      );
    }
    this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt });
    this.emitFile({
      type: "asset",
      fileName: "sitemap.xml",
      source: sitemapXml,
    });
  },
});

export default defineConfig({
  plugins: [react(), seo()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
  },
  // MapLibre loads its web worker from a file beside its own bundle, which
  // Vite's dependency pre-bundling would leave behind.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": API_ORIGIN },
  },
  test: {
    environment: "jsdom",
    // e2e/ holds the Playwright tests, which `pnpm test:e2e` runs.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
