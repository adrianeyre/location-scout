// Assembles the project website (GitHub Pages) in `site/dist/`: the page, its
// stylesheet, script (its types stripped) and fonts from `site/`; its product
// illustrations (`demos/`, drawn with the Stageshow kit in `kit/`), bundled
// by Vite into `demos.js` and `demos.css`; and the screenshots from
// `docs/screenshots/` and the icons from the web app, copied rather than kept
// twice in Git. `.github/workflows/pages.yml` runs it and publishes
// `site/dist/`; run it yourself with `pnpm site:build`, then open
// `site/dist/index.html`.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";

import { build } from "vite";

/** The repository, named once: every link to it on the page comes from here. */
export const repositoryUrl = "https://github.com/adrianeyre/location-scout";

/** The website's own address, which `CNAME` gives GitHub Pages. */
export const siteDomain = "location-scout.adrianeyre.co.uk";

const root = join(import.meta.dirname, "..");
const source = import.meta.dirname;
const output = join(source, "dist");

/** Each `{{NAME}}` placeholder in the page, and what it becomes. */
const placeholders: Record<string, string> = {
  REPO_URL: repositoryUrl,
  REPO_NAME: repositoryUrl.split("/").at(-1) ?? "location-scout",
  SITE_URL: `https://${siteDomain}`,
};
const siteUrl = `https://${siteDomain}`;

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const page = readFileSync(join(source, "index.html"), "utf8").replaceAll(
  /\{\{([A-Z_]+)\}\}/g,
  (match, name: string) => {
    const value = placeholders[name];
    if (value === undefined) {
      throw new Error(`site/index.html names an unknown placeholder ${match}`);
    }
    return value;
  },
);
writeFileSync(join(output, "index.html"), page);

// The illustrations, as one script and one stylesheet beside the page's.
await build({
  configFile: join(source, "vite.config.ts"),
  logLevel: "warn",
});
cpSync(join(source, "styles.css"), join(output, "styles.css"));
// The page's script, as the browser runs it: its types stripped, as Node
// strips them, so the build still needs no install.
writeFileSync(
  join(output, "script.js"),
  stripTypeScriptTypes(readFileSync(join(source, "script.mts"), "utf8")),
);
cpSync(join(source, "fonts"), join(output, "fonts"), { recursive: true });
writeFileSync(join(output, "CNAME"), `${siteDomain}\n`);

cpSync(join(root, "docs/screenshots"), join(output, "images"), {
  recursive: true,
});
for (const file of [
  "favicon.ico",
  "favicon.svg",
  "apple-touch-icon.png",
  "og-image.png",
]) {
  cpSync(join(root, "apps/web/public", file), join(output, file));
}

// Search engines and link previews: what crawlers may read, where the
// sitemap is, a 404 page for any other path, and a plain-text summary for
// AI assistants. Then the page's metadata is checked, so a broken tag
// fails the build rather than the next link someone pastes.
const screenshots = readdirSync(join(output, "images"))
  .filter((file) => file.endsWith(".png"))
  .sort();
writeFileSync(join(output, "sitemap.xml"), sitemap(lastChanged(), screenshots));
writeFileSync(
  join(output, "robots.txt"),
  `# Every crawler may read the whole site.\nUser-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
);
writeFileSync(join(output, "404.html"), notFoundPage());
writeFileSync(join(output, "llms.txt"), llmsText());
checkMetadata(page);

console.log(`Built the website in ${output}`);

/**
 * The day the website last changed: the newest commit to anything it is
 * built from, so the sitemap's date moves only when the page does. Today,
 * outside a Git checkout.
 */
function lastChanged(): string {
  try {
    const date = execFileSync(
      "git",
      [
        "log",
        "-1",
        "--format=%cs",
        "--",
        "site",
        "docs/screenshots",
        "apps/web/public",
      ],
      { cwd: root, encoding: "utf8" },
    ).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch {
    // Not a Git checkout: fall through to today.
  }
  return new Date().toISOString().slice(0, 10);
}

/** The one page, with the screenshots and card as its images (Google's image sitemap). */
function sitemap(lastmod: string, images: string[]): string {
  const imageEntries = [
    "og-image.png",
    ...images.map((file) => `images/${file}`),
  ]
    .map(
      (path) =>
        `    <image:image>\n      <image:loc>${siteUrl}/${path}</image:loc>\n    </image:image>\n`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
${imageEntries}  </url>
</urlset>
`;
}

/**
 * GitHub Pages serves `404.html` for any path it does not have. It is kept
 * out of search results, and its links are absolute, since it can be served
 * at any depth.
 */
function notFoundPage(): string {
  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Page not found · Location Scout</title>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta name="color-scheme" content="light dark" />
    <style>
      :root { --bg: #ffffff; --text: #1f2328; --muted: #59636e; --primary: #0550ae; --primary-foreground: #ffffff; --focus: #0969da; }
      @media (prefers-color-scheme: dark) {
        :root { --bg: #0d1117; --text: #e6edf3; --muted: #9198a1; --primary: #4493f8; --primary-foreground: #0d1117; --focus: #4493f8; }
      }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; box-sizing: border-box; background: var(--bg); color: var(--text); font: 1rem/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; text-align: center; }
      h1 { font-size: 1.75rem; line-height: 1.2; margin: 1rem 0 0.5rem; }
      p { color: var(--muted); margin: 0 0 1.5rem; }
      a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 1.25rem; border-radius: 8px; background: var(--primary); color: var(--primary-foreground); font-weight: 600; text-decoration: none; }
      a:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main>
      <img src="/favicon.svg" alt="" width="56" height="56" />
      <h1>Page not found</h1>
      <p>There is nothing at this address. The whole website is one page.</p>
      <a href="/">Go to Location Scout</a>
    </main>
  </body>
</html>
`;
}

/** A short Markdown summary of the project for AI assistants (llmstxt.org). */
function llmsText(): string {
  return `# Location Scout

> A web app you run on your own machine: pick any location in England by postcode, address or a click on the map and see its crime, planning, amenities, schools, transport, green space, property, land and demographics on one screen, with transparent, rule-based 0 to 100 scores. No accounts, and nothing about you is stored.

It uses open data (OpenStreetMap, data.police.uk, planning.data.gov.uk, PlanIt, HM Land Registry, Ordnance Survey, ONS and Census 2021, Get Information about Schools, Ofsted, the EPC register and postcodes.io), credited beside what each supplies. Scout Modes reweight the scores for homebuyers, buy-to-let, investment, development, retail and business.

## Links

- [Website](${siteUrl}/): features, screenshots, quick start and the full setup guide
- [Source code](${repositoryUrl}): the React frontend and Node.js backend
- [README](${repositoryUrl}/blob/main/README.md)
- [Guides](${repositoryUrl}/tree/main/docs/guides)
- [Glossary](${repositoryUrl}/blob/main/GLOSSARY.md): the project's terms, such as Layer, Search Area and Highlight
`;
}

/**
 * Fails the build when the page's search and sharing metadata is missing or
 * broken: each tag a link preview or search result needs is present and
 * absolute, the images it names were built, and the structured data parses.
 */
function checkMetadata(html: string): void {
  const problems: string[] = [];
  const meta = (attribute: "name" | "property", key: string) =>
    new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]+)"`).exec(
      html,
    )?.[1];

  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1]?.trim() ?? "";
  if (title.length < 30 || title.length > 65) {
    problems.push(
      `the title is ${String(title.length)} characters, not 30 to 65`,
    );
  }
  const description = meta("name", "description") ?? "";
  if (description.length < 70 || description.length > 160) {
    problems.push(
      `the description is ${String(description.length)} characters, not 70 to 160`,
    );
  }
  for (const key of [
    "og:title",
    "og:description",
    "og:url",
    "og:image",
    "og:image:alt",
  ]) {
    if (!meta("property", key)) problems.push(`there is no ${key}`);
  }
  for (const key of ["twitter:card", "twitter:title", "twitter:image"]) {
    if (!meta("name", key)) problems.push(`there is no ${key}`);
  }
  for (const key of ["og:url", "og:image"]) {
    const url = meta("property", key);
    if (url && !url.startsWith(`${siteUrl}/`)) {
      problems.push(`${key} is ${url}, not an address on ${siteUrl}`);
    }
  }
  const image = meta("property", "og:image");
  if (image && !existsSync(join(output, image.slice(siteUrl.length)))) {
    problems.push(`og:image names ${image}, which the build did not write`);
  }

  const structuredData = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  if (structuredData.length === 0) problems.push("there is no structured data");
  for (const [, json] of structuredData) {
    try {
      const graph =
        (
          JSON.parse(json ?? "") as {
            "@graph"?: { url?: string; screenshot?: string[] }[];
          }
        )["@graph"] ?? [];
      for (const url of graph.flatMap((node) => node.screenshot ?? [])) {
        if (!existsSync(join(output, url.slice(siteUrl.length)))) {
          problems.push(
            `the structured data names ${url}, which the build did not write`,
          );
        }
      }
    } catch (error) {
      problems.push(`the structured data does not parse: ${String(error)}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `site/index.html's metadata needs fixing:\n- ${problems.join("\n- ")}`,
    );
  }
}
