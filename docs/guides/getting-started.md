# Getting started

Install, configure and run Location Scout locally. Back to the [README](../../README.md).

## Prerequisites

- Node.js **26** or later and pnpm **12** or later. Both minimums are set in `package.json` (`engines` / `devEngines`), and pnpm refuses to run on anything older. CI and the Sandcastle image use Node 26.10.0 and pnpm 12.10.0.

## Install

```bash
pnpm install
```


## Configure

Copy `.env.example` to `.env` at the repo root and fill in what you need. The one file configures the backend, the frontend and the scripts:

```bash
cp .env.example .env
```

Only `NOMINATIM_USER_AGENT` is required; the API refuses to start without it. Everything else is optional and its feature stays off when unset. The frontend's `API_ORIGIN`, where the dev server sends `/api` requests, and `SITE_URL`, the address link previews, `robots.txt` and `sitemap.xml` give, default to localhost. `.env.example` says what each variable does. Never commit `.env`.

## Run

```bash
pnpm dev
```

This starts the backend on <http://localhost:8787> and the frontend on <http://localhost:5173>. The frontend sends `/api` requests to the backend through a proxy. The backend and the frontend read `.env` if it exists.

Search for a postcode or a free-text address. A postcode goes straight to its Location. An address is looked up with Nominatim in Great Britain; if it matches several places, pick one from the list to set the Location. Or click anywhere on the map to set the Location to that point.

However you choose it, the backend checks the Location is in England before it loads any Layer, from the country of its postcode on postcodes.io: the postcode you searched for, or else the nearest postcode. In Wales or Scotland you get "Location Scout currently covers England only" and nothing loads. A point with no postcode within 2 km (out at sea, or outside the UK) gets a message saying so. An unknown postcode or address also gets a message rather than an error.

The Location Overview names the Location's local geography from the same postcode: its ward, LSOA, MSOA, local authority and parliamentary constituency. Several postcodes can share one point (NG17 0AZ is at the same spot as NG17 1AA), so after a postcode search the frontend sends that postcode with the Search Area request, and the geography is that postcode's own. For a map click, an address or a shared URL it comes from the nearest postcode, and the Overview says which one.

The page URL keeps the Location, Search Radius and Scout Mode, for example <http://localhost:5173/?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment>, and any [weights of your own](scores-highlights-and-scout-modes.md#weights-of-your-own). Bookmark or share it to come back to the same Search Area. Back and Forward step through your searches. An invalid radius falls back to 0.5 mile, and a Scout Mode the backend doesn't have falls back to General, which the URL leaves out.
