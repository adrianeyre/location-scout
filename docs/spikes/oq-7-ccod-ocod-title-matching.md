# Spike: matching CCOD/OCOD titles to INSPIRE Index Polygons on Ashfield (OQ-7)

| | |
|---|---|
| **Issue** | #31 |
| **Question** | [PRD](../product-requirements-document/location-scout-prd.md) OQ-7: how reliably can CCOD/OCOD titles be matched to INSPIRE polygons by address, and is the result useful enough to show? (FR-5.4a) |
| **Date** | 2026-10-09 |
| **Results** | [`oq-7-title-matching-results.md`](oq-7-title-matching-results.md), written by `pnpm --filter @location-scout/data-prepare spike:title-matching --out ../../docs/spikes` |
| **Recommendation** | **Drop Ownership Categories as FR-5.4a specifies them.** Keep Possibly Unregistered, which doesn't depend on matching. |

## Answer

Using only free data, about **1 in 20** of Ashfield's freehold titles can be placed on one INSPIRE Index Polygon by its address. Those few matches are accurate: in a 20-sample check against independent ground truth, **17 were right and 3 were within 25 m**. Every other title is either ambiguous or placed wrongly:

- **Postal addresses** (Price Paid sales as the proxy): **6.6%** matched (56 of 844). OpenStreetMap has an address (a house number or name) in only **7%** of Ashfield's INSPIRE Index Polygons, so most numbered addresses can't be found at all.
- **Council land and buildings** (Ashfield District Council's own register as the proxy): **5.0%** matched (11 of 222). For its **155 "Land Only" assets, the kind of title a Land Opportunity is, it was 1.9%** (3 of 155).
- **Land described by a street** ("land on the north side of Station Road") never narrows to one polygon: a median of **42–53 candidate polygons** beside the street.
- **The postcode's point** names one polygon, but it is usually a neighbour's: **9 of 55** right for council assets and **2 of 23** for sales.

So FR-5.4a's four Ownership Categories can't be assigned as specified. "Other registered" would become the label for every company's and council's land that failed to match, which is nearly all of it, and the map would read as if most land held by companies and councils were held by someone else.

## Why titles have to be matched by address

- **INSPIRE Index Polygons carry no title number.** Each has only an `INSPIREID`, its outline and dates. HM Land Registry links polygons to title numbers only in the **National Polygon Service**, a licensed product (about £20,000 a year plus VAT). That service also includes the **Title Number and UPRN Look Up** dataset ([technical specification](https://use-land-property-data.service.gov.uk/datasets/nps/tech-spec/2), [data.gov.uk listing](https://data.gov.uk/dataset/567838f0-517a-4bc4-a459-bcf2bef5e282/title-number-and-uprn-look-up-dataset)), which isn't sold on its own.
- **CCOD/OCOD give no geometry.** Their columns are Title Number, Tenure, Property Address, District, County, Region, Postcode, Multiple Address Indicator, Price Paid, then up to four proprietors (name, company number, Proprietorship Category, addresses), Date Proprietor Added and Additional Proprietor Indicator ([CCOD technical specification](https://use-land-property-data.service.gov.uk/datasets/ccod/tech-spec)). **Property Address is the register's own text, not a postal address.** HM Land Registry's own example rows are "Land lying to the south of West Parley Road, Bournemouth" (no postcode) and "67 Arthur Green Walk, Tuckton, BH99 9ZZ". Postcode may be blank. A "Y" in Multiple Address Indicator means the register lists more addresses in a schedule that the dataset doesn't include.
- **CCOD lists leasehold titles as well as freehold ones.** INSPIRE Index Polygons outline only freehold titles (FR-5.8), so a leasehold title has no polygon of its own to match.

## What the spike could and couldn't use

- **CCOD and OCOD themselves were not available.** Downloading them needs a Use land and property data account, an accepted licence and an API key (`LAND_REGISTRY_DATA_API_KEY`, FR-6.0). The sandbox has none, and the API answers 403 without one. No unofficial copy was used.
- **HM Land Registry's map search can't be used from the sandbox.** `search-property-information.service.gov.uk` answers every scripted request with a Cloudflare challenge (`cf-mitigated: challenge`). It is meant for people, so the spot-check against it is left to a person (see [What a person still has to do](#what-a-person-still-has-to-do)).
- So the spike measured matching on **two proxies for CCOD's titles, each with an independent record of where each title truly is**:
  1. **Ashfield District Council's land and property register**, published under the Local Government Transparency Code ([land and property transparency data, 27 February 2018](https://www.ashfield.gov.uk/your-council/legal-information-and-public-data/transparency-code), OGL). It lists 251 assets with the council's own name for each ("153 Portland Road, Hucknall, Land", "Walesby Drive, Kirkby in Ashfield, Substation"), postcode, tenure, holding type (Land Only, Buildings Only, Land/Building) and the council's easting and northing. These are the titles CCOD would list under the Proprietorship Category "Local Authority", and the council's names for them read like register text. The council's point for 11 of them is more than 1 km outside Ashfield (one is 148 km away). These are mistakes in the register, so they are not checked.
  2. **2026's Price Paid sales in Ashfield** (HM Land Registry, OGL): 861 sales, each with a postal address written as a register writes one ("71 SYLVAN AVENUE, KIRKBY IN ASHFIELD, NOTTINGHAM") and its postcode. HM Land Registry's new free [Transaction unique identifier and UPRN Look Up Table](https://www.gov.uk/government/statistical-data-sets/transaction-unique-identifier-and-uprn-look-up-table-dataset) (published 28 August 2026, OGL) gives the UPRN of each sale lodged in July and August 2026. [OS Open UPRN](https://www.ordnancesurvey.co.uk/products/os-open-uprn) (OGL) gives each UPRN's point, so 296 of the sales have a true place found without their address.

  The council's register stands in for the land and buildings CCOD lists for councils. The sales stand in for its titles with a postal address.

## Method

`scripts/data-prepare/src/title-addresses.ts` reads a title's Property Address. `title-matching.ts` matches it to the polygons. `spike-title-matching.ts` downloads the sources into the git-ignored `data/spikes/oq-7/`, runs the matching and writes the results. Everything is matched in British National Grid, in which the INSPIRE Index Polygons are published.

**Sources.** HM Land Registry's INSPIRE Index Polygons for Ashfield (published 4 October 2026: 58,066 polygons). Geofabrik's Nottinghamshire and Derbyshire extracts (8 October 2026), from which every node and closed way with an `addr:housenumber` or `addr:housename`, every named feature that isn't a road, every named road and every `place` is read. Ordnance Survey's Code-Point Open, for each postcode's point.

**Reading an address.** Each title's address is split at its commas and normalised: capitals, words only, short street types written out ("Rd" becomes "ROAD", and a final "St" becomes "STREET"). Each part is read against the streets OpenStreetMap names in and around Ashfield (4,647) and its place names. The reader finds:

- **house numbers** before a known street ("12", "12A", "12-16" read as every number between, "12 and 14" as two houses);
- **a building's or premises' name** ("Byron Business Centre", "North Sutton Car Park");
- **whether it describes land** ("Land", "Substation", "Allotment", "Car Park") and **whether that land is beside what it names rather than at it** ("adjoining", "rear of", "lying to the south of"). Land adjoining number 12 is not number 12;
- **the side of the street** the land is on, and **the postcode** from the Postcode column or from the address itself.

**Matching.** A title is placed by the first of these steps that finds it any polygon. Steps 1–3 look only within 2 km of the title's postcode, if it has one. A title is **matched** when that step finds exactly one polygon, and **ambiguous** when it finds more.

1. **address**: OpenStreetMap addresses with the title's number and street (and the same postcode, where both have one). The match is the polygons those addresses are in.
2. **named**: OpenStreetMap features, or `addr:housename`s, with the title's building or premises name, compared without "The" or plural "s". The match is the polygons the feature's point is in, or that are at least half inside its outline.
3. **street**: the polygons within 10 m of the named street, on the side the title gives.
4. **postcode**: the polygon the postcode's Code-Point Open point is in.

**Checking.** A match is **right** if its polygon holds the title's true point (the council's point, or the sale's UPRN's point), and **next to it** if the polygon is within 25 m of that point. For ambiguous titles, the spike counts whether the right polygon is among the candidates.

The **address** and **named** steps are the ones whose matches can be trusted (`TRUSTED_STEPS`). The **match rate** counts only titles matched by one of them.

## Results

The full results, with every table, are in [`oq-7-title-matching-results.md`](oq-7-title-matching-results.md). In summary:

| | Council's land and buildings | 2026's sales |
|---|---|---|
| Freehold titles matched | 222 | 844 |
| **Matched to one polygon by the address or named step** | **11 (5.0%)** | **56 (6.6%)** |
| … of which right / within 25 m, where the true place is known | 8 of 10 / 10 of 10 | 13 of 14 / 14 of 14 |
| Placed by the street step, all ambiguous | 141, median 42 polygons | 728, median 53 polygons |
| … with the right polygon among the candidates | 121 of 134 | 252 of 258 |
| Placed by the postcode step | 59 | 51 |
| … right / within 25 m | 9 of 55 / 14 of 55 | 2 of 23 / 15 of 23 |
| True place inside any INSPIRE Index Polygon | 195 of 208 (93.8%) | 296 of 296 |

For the council's assets, by holding type: Land Only 3 of 155 matched (1.9%), Buildings Only 6 of 46 (13.0%), Land/Building 2 of 21 (9.5%).

**20-sample accuracy check.** The 20 are drawn in a fixed order (by the hash of each asset code or sale id) from the 24 matches by the address or named step whose true place is known. Result: **17 right, 3 next to it (2 m, 1.4 m and 0.3 m: the council's or UPRN's point lies just outside the matched polygon), 0 wrong.** Each match is listed with a link to its point in the [results](oq-7-title-matching-results.md#20-sample-accuracy-check).

## What the results mean

1. **When a match is found, it is right.** The address and named steps put a title on the polygon that holds it, or on the polygon next to the boundary it sits on. That is as good as an indicative label needs.
2. **But almost nothing is found, and the limit is the free data, not the matching.** OpenStreetMap has 18,919 addressed nodes and buildings in and around Ashfield, but an address in only 7.0% of its INSPIRE Index Polygons. That figure caps the address step for any title with a postal address: 52 of 773 sales with a number and a known street were found. Free sources with better address coverage don't exist. AddressBase and the Title Number and UPRN Look Up are licensed products, and Nominatim is OpenStreetMap again, limited to 1 request a second.
3. **Land, which is what a Land Opportunity is, almost never matches.** Land titles are described by the street they are on or beside. That narrows them to about 40–50 polygons, which usually include the right one (121 of 134 and 252 of 258), but never to one. Only premises with a name OpenStreetMap shares (a leisure centre, a reservoir, a church) match, so 1.9% of the council's Land Only assets do.
4. **Falling back to the postcode would mislabel land.** The postcode's point lands on a neighbour's polygon at least 4 times in 5. Using it would put a company's or council's category on the wrong land, which FR-5.7's wording can't excuse.
5. **A missing match can't be read as "other registered".** With 93–95% of titles unmatched, "other registered" would mostly mean "registered, owner type unknown". Most land held by companies and councils would then be shown as held by someone else.

## Recommendation

**Drop Ownership Categories as FR-5.4a specifies them**, for Phase 1:

- **Don't** colour Land Opportunities or INSPIRE Index Polygons by company-owned, council or public-body owned or other registered, and don't offer them as a filter (FR-2.7, FR-5.5).
- **Keep Possibly Unregistered and registered**, as FR-5.4 already defines them from INSPIRE coverage alone, with FR-5.7's wording, FR-5.8's note and the links to HM Land Registry's ownership checks (FR-5.6). None of these depends on matching.
- **If #32 still wants to use CCOD/OCOD**, the honest version is a list, not a category. A Land Opportunity's popup could list "Titles held by companies or councils whose register address names this street", each with its Property Address, Proprietorship Category and "not matched to this parcel". The street step found the right polygon among its candidates 90–98% of the time. This version needs no polygon-level match, and it is the most the data supports. Whether that list is worth building is a product decision for the issue's owner.
- **Revisit** if the product can license the National Polygon Service (title numbers on polygons), or if OpenStreetMap's address coverage in a Land Coverage Area grows. Re-running this spike measures both.

No ADR was written. Dropping a feature, or replacing it with a list, is a product-scope decision recorded in the PRD (OQ-7). It doesn't choose between architectural approaches.

## What a person still has to do

1. **Run the spike on real CCOD and OCOD.** Sign in to [Use land and property data](https://use-land-property-data.service.gov.uk/), accept the licences for "UK companies that own property in England and Wales" and "Overseas companies that own property in England and Wales", download each full file and unzip them. Then run:

   ```bash
   pnpm --filter @location-scout/data-prepare spike:title-matching \
     --ccod /path/to/CCOD_FULL_2026_10.csv --ocod /path/to/OCOD_FULL_2026_10.csv \
     --out ../../docs/spikes
   ```

   The command checks whether Ashfield's District column reads `ASHFIELD` (`--district` changes it). It adds a section for each file to the results, with its match rate by step and by Proprietorship Category.
2. **Spot-check 20 CCOD matches against HM Land Registry's map search.** The results list 20 matches, each with a link to the matched polygon's point. For each, open [Search for land and property information](https://search-property-information.service.gov.uk/), search by map at that point, select the polygon, and compare its title number with the row's title number. Fill in "Title number on the map" and "Right?", and record the tally in this document.
3. **Confirm or revise the recommendation** with the CCOD numbers. The proxies predict about 5–7% matched and very few of them land. If CCOD differs materially, for example because a large share of its titles have postal addresses that OpenStreetMap knows, revisit it.
4. **Decide what changes in the PRD and #32.** This spike updates only OQ-7. FR-2.7, FR-5.4a, FR-5.5, FR-6.0, NFR-3.2, §10's risk row, the glossary's Ownership Category and #32's scope all still describe the categories as specified.

## Attribution of the spike's sources

- INSPIRE Index Polygons: This information is subject to Crown copyright and database rights 2026 and is reproduced with the permission of HM Land Registry. © Crown copyright and database rights 2026 Ordnance Survey AC0000851063. ([Conditions](https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions))
- Price Paid Data and its UPRN look up: Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0. UPRNs contain OS data © Crown copyright and database rights 2026, licensed under the Open Government Licence v3.0.
- OS Open UPRN and Code-Point Open: Contains OS data © Crown copyright and database right 2026. Code-Point Open also contains Royal Mail data © Royal Mail copyright and database right 2026, and National Statistics data © Crown copyright and database right 2026.
- Ashfield District Council's land and property transparency data: Open Government Licence v3.0.
- OpenStreetMap: © OpenStreetMap contributors, ODbL.
