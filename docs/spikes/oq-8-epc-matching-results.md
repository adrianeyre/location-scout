# OQ-8: matching Price Paid sales in ASHFIELD to EPCs, results

Written by `pnpm --filter @location-scout/data-prepare spike:epc-matching` on 2026-10-09. What it does, and what the results mean: [oq-8-epc-api.md](oq-8-epc-api.md).

Sources: HM Land Registry's Price Paid Data for 2026 (downloaded 2026-10-09) and its lookups from a sale to its UPRN for July and August 2026.

## The sales

844 standard-price sales (category A) of houses and flats, of which 299 (35.4%) have a UPRN from HM Land Registry's lookups (sales registered in July and August 2026) and 2 (0.2%) are new builds.

| Property type | Sales | With a UPRN |
|---|---|---|
| Semi-detached | 323 (38.3%) | 128 (39.6%) |
| Terraced | 255 (30.2%) | 73 (28.6%) |
| Detached | 249 (29.5%) | 92 (36.9%) |
| Flat or maisonette | 17 (2.0%) | 6 (35.3%) |

| Address written as | Sales |
|---|---|
| A house number | 830 (98.3%) |
| A house name without a number | 10 (1.2%) |
| A flat (SAON) in a building | 4 (0.5%) |

## Matching

Not run: EPC_API_KEY was not set, so the EPC API wasn't asked. Set it to the bearer token from [Get energy performance of buildings data](https://get-energy-performance-data.communities.gov.uk/) and run the spike again.

