/**
 * Draws the icons and the link-preview image in `public/` from
 * `public/favicon.svg`, with Playwright's Chromium:
 *
 * - `favicon.ico` (16, 32 and 48 px), for browsers and tools that ask for it
 * - `apple-touch-icon.png` (180 px), for iOS home screens
 * - `icon-192.png` and `icon-512.png`, and `icon-maskable-512.png` with the
 *   pin inside the safe zone, for `site.webmanifest`
 * - `og-image.png` (1200 × 630), shown when a link is pasted into Slack,
 *   Teams, LinkedIn, X, Facebook or iMessage
 *
 * Run `pnpm --filter @location-scout/web brand:assets` after changing the
 * icon or the wording, and commit what it writes.
 */
import { readFile, writeFile } from "node:fs/promises";

import { chromium, type Page } from "@playwright/test";

const PUBLIC = new URL("../public/", import.meta.url);

const svg = await readFile(new URL("favicon.svg", PUBLIC), "utf8");

/** The pin and its radius alone, on a full-bleed tile, for maskable icons. */
const maskable = svg
  .replace('rx="14"', 'rx="0"')
  .replace(/<ellipse[^>]*\/>\s*<path/, (match) =>
    match.replace(
      "<ellipse",
      '<g transform="translate(6.4 6.4) scale(0.8)"><ellipse',
    ),
  )
  .replace(/(<circle[^>]*\/>)/, "$1</g>");

const browser = await chromium.launch();
const page = await browser.newPage();

/** `markup` drawn `width` × `height` CSS pixels, as a PNG. */
const draw = async (
  target: Page,
  markup: string,
  width: number,
  height: number,
) => {
  await target.setViewportSize({ width, height });
  await target.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;width:${String(width)}px;height:${String(height)}px;overflow:hidden}svg{display:block;width:100%;height:100%}</style></head><body>${markup}</body></html>`,
  );
  return target.screenshot({ omitBackground: true, type: "png" });
};

const write = (name: string, data: Buffer) =>
  writeFile(new URL(name, PUBLIC), data);

await write("apple-touch-icon.png", await draw(page, maskable, 180, 180));
await write("icon-192.png", await draw(page, svg, 192, 192));
await write("icon-512.png", await draw(page, svg, 512, 512));
await write("icon-maskable-512.png", await draw(page, maskable, 512, 512));

/** An ICO holding each PNG as it is, which every current browser reads. */
const ico = (pngs: { size: number; data: Buffer }[]) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(({ data }) => data)]);
};

const sizes = [16, 32, 48];
await write(
  "favicon.ico",
  ico(
    await Promise.all(
      sizes.map(async (size) => {
        const own = await browser.newPage();
        const data = await draw(own, svg, size, size);
        await own.close();
        return { size, data };
      }),
    ),
  ),
);

/** Coloured dots for the Layers, scattered round the Search Area. */
const LAYER_DOTS = [
  [430, 190, "#cf222e"],
  [520, 150, "#1a7f37"],
  [610, 230, "#8250df"],
  [470, 300, "#bc4c00"],
  [650, 330, "#0969da"],
  [380, 360, "#1a7f37"],
  [560, 400, "#cf222e"],
  [700, 180, "#bc4c00"],
  [340, 250, "#0969da"],
  [600, 470, "#8250df"],
] as const;

const preview = `
<div style="position:relative;width:1200px;height:630px;overflow:hidden;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:linear-gradient(135deg,#0a3069 0%,#0b1d3a 100%);color:#ffffff">
  <svg viewBox="0 0 1200 630" style="position:absolute;inset:0">
    <defs>
      <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
        <path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="1200" height="630" fill="url(#grid)"/>
    <g transform="translate(380 0)">
      <path d="M220 640 C 300 470, 340 380, 520 330 S 760 200, 900 40" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="18" stroke-linecap="round"/>
      <path d="M260 270 C 420 280, 560 280, 820 420" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="10" stroke-linecap="round"/>
      <circle cx="520" cy="315" r="210" fill="#1f6feb" fill-opacity="0.16" stroke="#79c0ff" stroke-width="3" stroke-dasharray="14 10"/>
      ${LAYER_DOTS.map(([x, y, colour]) => `<circle cx="${String(x)}" cy="${String(y)}" r="13" fill="${colour}" stroke="#ffffff" stroke-width="4"/>`).join("")}
      <g transform="translate(468 215) scale(1.6)">
        <path d="M32 9c-8.8 0-16 6.9-16 15.5C16 35.6 32 51 32 51s16-15.4 16-26.5C48 15.9 40.8 9 32 9z" fill="#ffffff"/>
        <circle cx="32" cy="24.5" r="6.5" fill="#1f6feb"/>
      </g>
    </g>
  </svg>
  <div style="position:absolute;left:72px;top:0;bottom:0;width:600px;display:flex;flex-direction:column;justify-content:center">
    <div style="display:flex;align-items:center;gap:20px">
      <div style="width:84px;height:84px">${svg}</div>
      <div style="font-size:56px;font-weight:800;letter-spacing:-1px;white-space:nowrap">Location Scout</div>
    </div>
    <div style="margin-top:32px;font-size:38px;font-weight:600;line-height:1.25">Understand everything around any location in England</div>
    <div style="margin-top:24px;font-size:24px;line-height:1.45;color:#c9d7ec">Crime, schools, transport, amenities, property prices, planning and land opportunities, scored for what matters to you.</div>
  </div>
</div>`;

await write("og-image.png", await draw(page, preview, 1200, 630));

await browser.close();
