# Spike: which EPC API is current, and matching its certificates to Price Paid sales (OQ-8)

| | |
|---|---|
| **Issue** | #37 |
| **Question** | [PRD](../product-requirements-document/location-scout-prd.md) OQ-8: which EPC API is current (the register's open-data service has been changing), and what are its auth and rate limits? (FR-2.6: EPC rating distribution, and price per m² where an EPC floor area matches a sale) |
| **Date** | 2026-10-09 |
| **Results** | [`oq-8-epc-matching-results.md`](oq-8-epc-matching-results.md), written by `pnpm --filter @location-scout/data-prepare spike:epc-matching --out ../../docs/spikes` |
| **Recommendation** | Use MHCLG's **Energy Performance of Buildings Data API** at `https://api.get-energy-performance-data.communities.gov.uk`, with a GOV.UK One Login bearer token in `EPC_API_KEY`. Match each sale by UPRN where HM Land Registry's lookups give one, and otherwise by its flat, house number or name and street among the certificates in its postcode. Never show or keep the certificates' addresses. |

## Answer

- **The old API is gone.** `epc.opendatacommunities.org` answers every request, `/api/v1/domestic/search` included, with a `301` to MHCLG's new service, [Get energy performance of buildings data](https://get-energy-performance-data.communities.gov.uk/) (checked 9 October 2026). Its HTTP Basic email-and-key authentication no longer works. The new service is in beta.
- **The current API** is the [Energy Performance of Buildings Data API](https://get-energy-performance-data.communities.gov.uk/api-technical-documentation), base URL `https://api.get-energy-performance-data.communities.gov.uk`, described by an [OpenAPI 3 file](https://raw.githubusercontent.com/communitiesuk/epb-data-warehouse/main/api/api.yml) that MHCLG publishes from its [`epb-data-warehouse`](https://github.com/communitiesuk/epb-data-warehouse) repository.
- **Auth:** a bearer token, sent as `Authorization: Bearer <token>` with `Accept: application/json` on GET requests. You get the token by signing in to the service with **GOV.UK One Login**, which needs an email address and a second factor (its sign-in asks One Login for a medium level of confidence, `Cl.Cm`). The token is shown on the service's "my account" page. It is free. Without a valid token, every request is answered `403` with "Access denied. Bad authentication header."
- **Rate limits:** "Our standard limit is **6000 requests every 5 minutes per originating IP address**", which is 20 a second on average. Beyond it the API answers `429`, and MHCLG asks clients to "stop making additional API requests for a short period of time before retrying". It also asks developers "to avoid batching requests", because the limits "are designed to encourage real-time interactions". There is no daily cap.
- **Licence:** split in two (see [Licence](#licence)). Every field **except the address and postcode** is under the Open Government Licence v3.0, UPRNs included. **The address lines and postcode** are Ordnance Survey's and Royal Mail's, published with their consent for a list of energy-efficiency purposes only.
- **Fields:** the postcode search returns each certificate's number, address lines, postcode, UPRN, **current band** and registration date, but not the potential band or the floor area. Those come one certificate at a time from `/api/certificate`, as `potential_energy_efficiency_band` and `total_floor_area` (see [Fields](#fields)).
- **Coverage:** England and Wales, certificates registered **from 2012** onwards (the old service went back to 2008). The API's data is updated daily, and the bulk CSV on the 1st of each month.
- **Matching to Price Paid:** recommended approach below. **Estimated match rate on Ashfield's 844 sales in 2026: about 75–90%**, built from Ashfield's own sales and published match rates. It is not yet measured against certificates, because the sandbox has no One Login account. The spike command measures it as soon as someone runs it with a token.

## The API

### Endpoints

All are `GET`, with parameters in the query string ([making a request](https://get-energy-performance-data.communities.gov.uk/api-technical-documentation/making-a-request)).

| Endpoint | What it returns | Use in Location Scout |
|---|---|---|
| `/api/domestic/search` | Up to `page_size` (at most 5,000) domestic certificates, matching any of `postcode`, `uprn` (12 digits, zero-padded), `address` (partial), `council[]`, `constituency[]`, `efficiency_rating[]`, `date_start`/`date_end` (neither may be today), with `current_page` for more pages. `404` when nothing matches. | One request for each postcode with sales in the Search Area: every certificate there, for matching and for the current-band distribution |
| `/api/certificate?certificate_number=` | One certificate's full data, whose keys depend on its schema (RdSAP or SAP, versions 12 to 21). `404` if there is no such certificate. | One request for each matched sale: floor area and potential band |
| `/api/non-domestic/search`, `/api/display/search` | Non-domestic EPCs and Display Energy Certificates, searched the same way | Not needed |
| `/api/deltas?date_start=&date_end=` | Certificates removed, or whose UPRN changed, between two dates | Not needed while nothing is stored (ADR 0002) |
| `/api/files/domestic/csv` (and `/json`, `/info`) | A `302` to a signed S3 link for the full domestic file, about 2.9 GB zipped, refreshed on the 1st of each month | Not needed: Location Scout asks for one Search Area's postcodes at a time |
| `/api/codes`, `/api/codes/info` | The meaning of coded values, such as `property_type` and `built_form`, by schema | For a later popup that names the property type |

### Fields

The search's answer (from the OpenAPI file's `EnergyCertificateSearchResult`):

```json
{
  "data": [
    {
      "certificateNumber": "0000-0000-0000-0000-0000",
      "addressLine1": "1 Some Street", "addressLine2": null, "addressLine3": null, "addressLine4": null,
      "postTown": "Whitbury", "postcode": "SW10 0AA", "uprn": 100121241798,
      "council": "Hammersmith and Fulham", "constituency": "Chelsea and Fulham",
      "currentEnergyEfficiencyBand": "B", "registrationDate": "2020-05-04",
      "schemaType": "RdSAP-Schema-20.0.0"
    }
  ],
  "pagination": { "totalRecords": 1, "currentPage": 1, "totalPages": 1, "nextPage": null, "prevPage": null, "pageSize": 5000 }
}
```

A certificate's `data`, as in MHCLG's [JSON samples](https://github.com/communitiesuk/epb-data-warehouse/tree/main/spec/fixtures/json_samples) for every schema checked (RdSAP 17.0 and 21.0.1, SAP 16.3 and 19.2.0), always has these keys:

| Wanted | JSON API key | Bulk CSV column ([data dictionary](https://get-energy-performance-data.communities.gov.uk/guidance/data-dictionary)) |
|---|---|---|
| Current rating | `current_energy_efficiency_band` ("A"–"G"), `energy_rating_current` (SAP points) | `CURRENT_ENERGY_RATING` |
| Potential rating | `potential_energy_efficiency_band`, `energy_rating_potential` | `POTENTIAL_ENERGY_RATING` |
| Total floor area | `total_floor_area` (m², "measured to the internal face of the external walls") | `TOTAL_FLOOR_AREA` |
| Property | `uprn`, `uprn_source` ("Energy Assessor" or "Address Matched"), `property_type`, `built_form` (codes) | `UPRN`, `UPRN_SOURCE`, `PROPERTY_TYPE`, `BUILT_FORM` |
| When | `registration_date`, `inspection_date` | `LODGEMENT_DATE`, `INSPECTION_DATE` |
| Where | `address_line_1`…, `post_town`, `postcode` | `ADDRESS1`–`ADDRESS3`, `POSTTOWN`, `POSTCODE` |

MHCLG warns that the samples "are not a full specification of all possible keys". The data dictionary covers only the CSV, so #38 should read these keys defensively. `scripts/data-prepare/src/epc-api.ts` already does: it reads a floor area only when it is a positive number, and a band only when it is present.

### What else the service says about its data

From its [data limitations](https://get-energy-performance-data.communities.gov.uk/guidance/data-limitations) and [changes](https://get-energy-performance-data.communities.gov.uk/guidance/changes-to-the-format-and-methodology) pages:

- A property can have **several certificates**, expired or replaced ones included, so each must be grouped by property and one chosen for a sale.
- **Certificate numbers replaced `LMK_KEY` in March 2026.** The old key can't be linked to them, so any old fixture or third-party linkage keyed on `LMK_KEY` is obsolete.
- Some certificates are withheld: those opted out by their owner or tenant, and those with a Green Deal loan, among others.
- The CSV can hold `INVALID!`, `NO DATA!` and extreme values. MHCLG suggests medians rather than means.

## Licence

From the service's [licensing restrictions](https://get-energy-performance-data.communities.gov.uk/guidance/licensing-restrictions):

- **Everything except the address** ("all data fields other than the address and postcode data (address, address 1, address 2, address 3, postcode)") is under the **Open Government Licence v3.0**, UPRNs included. Ratings, floor area, dates and UPRNs can be shown and reused, credited "Contains public sector information licensed under the Open Government Licence v3.0" (the service gives no other wording).
- **The address and postcode** were matched against OS AddressBase Premium, which includes Royal Mail's PAF. Ordnance Survey and Royal Mail permit their use "solely for specific purposes related to the energy performance of buildings". The nearest of those to Location Scout is "promotion and better understanding of the current energy efficiency of buildings and potential improvement in the building sale or rental markets". Copyright exceptions, such as non-commercial research and private study, also apply. Anyone who publishes or shares the address data must include the notice with it. Any other use needs a licence from Ordnance Survey (PricingLicensing@os.uk) and Royal Mail (address.management@royalmail.com).
- **It is personal data.** "Address level data concerning the energy performance of buildings constitute personal data" under UK GDPR and the DPA 2018, so whoever processes it is a data controller ([data protection requirements](https://get-energy-performance-data.communities.gov.uk/guidance/data-protection-requirements)). MHCLG keeps the email address of everyone who signs in.

What this means for FR-2.6:

1. **Show the sale's Price Paid address, never the certificate's.** Location Scout already has each sale's address from Price Paid, under its own conditions (FR-10.3). The certificate's address is only needed to match, inside the backend, and is then dropped. The response carries only the OGL fields (bands, floor area, certificate number) and the UPRN.
2. **Matching by UPRN uses no address data.** Neither does showing a postcode's spread of ratings. Matching by address does use it. That use is within the copyright exceptions for a developer running Phase 1 on their own machine. Whether price per m² in a **hosted** product counts as "better understanding of the current energy efficiency of buildings … in the building sale … markets" is for the licence review OQ-4 already needs before Phase 2. If the answer is no, match by UPRN only. Its reach grows by a month each month, as HM Land Registry's lookups do.
3. **Keep nothing.** In-memory caching, as NFR-1.4 already requires, keeps Phase 1 clear of storing personal data. Phase 3's history would need a data-protection review before storing certificates.
4. **FR-10.1a's attribution:** "Energy Performance Certificate data from MHCLG's Get energy performance of buildings data, licensed under the Open Government Licence v3.0." No address notice is needed while no EPC address is shown or shared.

## Matching certificates to Price Paid sales

### What each side has

- **Price Paid** gives each sale PAON (house number or name), SAON (flat), street, locality, town and postcode, as HM Land Registry writes them. The SPARQL endpoint the Property Layer uses gives no UPRN. HM Land Registry's [Transaction unique identifier and UPRN look up table](https://www.gov.uk/government/statistical-data-sets/transaction-unique-identifier-and-uprn-look-up-table-dataset) does. It is free and under the OGL, a CSV (about 5 MB) published on the 20th working day of each month since 28 August 2026, covering the sales registered that month. It has no history before July 2026.
- **The EPC register** gives up to four free-text address lines, as each assessor lodged them, the postcode and, for most certificates, a UPRN. UPRN coverage, measured on the new service's bulk file in March 2026 by [huwd/houseprices](https://github.com/huwd/houseprices/blob/main/research/uprn-coverage-in-epc-data.md), is **95–98% of certificates lodged 2010–2024 and 88–89% of those lodged in 2025–2026**, where new builds lag AddressBase. MHCLG added UPRNs by "rules-based and machine-learning" address matching, and leaves one blank rather than guessing.

### Recommended approach

`matchSale` in `packages/shared/src/epc-matching.ts` implements this, with tests in `epc-matching.test.ts`. It was written in `scripts/data-prepare` for this spike, and #38 moved it, as it is, into `packages/shared`, where both the spike and the API's Property Layer use it.

1. **Ask once per postcode.** For each postcode with sales in the Search Area (FR-2.8 already finds them, at most 100), send `GET /api/domestic/search?postcode=…&page_size=5000`. A `404` means none. Group the certificates by property: by UPRN, or by normalised address where there is no UPRN.
2. **Match each sale by the first step that finds anything.** A step matches when it finds exactly one property. When it finds more, the sale is left **ambiguous** and unmatched. A looser step is never tried after an ambiguous one.
   1. **uprn**: the property with the sale's UPRN, where HM Land Registry's lookups give the sale one.
   2. **address**: the property whose address holds the sale's SAON, PAON and street, in that order, as whole words. Both sides are normalised: capitals, words only, short street types written out (`normaliseName`, shared with OQ-7), ordinals written out ("1st Floor" is "First Floor"), and "Flat", "Apartment" and "Apt" dropped, so "Apartment 2, 12 High St." and "FLAT 2 / 12 / HIGH STREET" both read "2 12 HIGH STREET".
   3. **building**: the SAON and PAON without the street, for a street written differently on the certificate. The certificate's address must begin with them, with no number next, so house 2 is never taken for "Flat 2, 12 Mill Lane".
3. **Choose the certificate current at the sale:** the last one registered on or before the sale date, or else the first one after it (a new build's).
4. **Ask for that certificate** (`GET /api/certificate`) for its `total_floor_area` and `potential_energy_efficiency_band`. Price per m² is the price over a positive floor area, with implausible areas left out. UCL's linkage removed areas of 0 or 0.01 m².
5. **Show the rating distribution** from the search's `currentEnergyEfficiencyBand`, taking each property's latest certificate, for every certificate in the Search Area's postcodes. That needs no matching and no address data.

A 0.5 mile Search Area costs at most about 100 searches plus one request for each matched sale: a few hundred requests, far inside 6,000 every 5 minutes. They should go out a few at a time, not all at once, as MHCLG asks. Certificates never change once lodged, so a fetched certificate can be cached until restart. Searches can be cached for 24 hours, as Price Paid is (NFR-1.4). A `429` should stop requests until its `Retry-After`, as PlanIt's does.

Where the UPRN lookups come from is #38's choice. They are monthly bulk files, so `data:prepare` could download them (ADR 0004). Alternatively the API could fetch and cache the 12 monthly files, about 60 MB, once a month. Until July 2027, sales registered before July 2026 fall back to the address steps.

### Estimated match rate on a sample

**The sample:** Ashfield's 844 standard-price sales of houses and flats in 2026 to date, from Price Paid. Every figure about the sales is measured; see the [results](oq-8-epc-matching-results.md):

- 299 (35.4%) have a UPRN from HM Land Registry's lookups (registered in July or August 2026);
- 830 (98.3%) are written with a house number, 10 (1.2%) with only a house name, and 4 (0.5%) with a flat;
- 38% are semi-detached, 30% terraced, 30% detached and 2% flats.

**Published match rates for each kind of sale:**

| Source | Method | Match rate |
|---|---|---|
| [Chi et al., UCL, 2021](https://bin-chi.github.io/Link-LR-PPD-and-Domestic-EPCs/) | 251 rules through OS AddressBase Plus (licensed), sales 2011–2019 | 93.15% overall; detached 93.3%, semi-detached 95.0%, terraced 94.2%, flats 88.6% |
| [huwd/houseprices](https://github.com/huwd/houseprices), March 2026, on the new service's data | UPRN (UBDC's lookup to January 2022), then exact postcode and normalised address | 76.9% of every sale since 1995. For 2022–2026 sales, which have no UPRN, the address join reaches only about 60%, although 99.5% of the unmatched sales are in postcodes with certificates. Detached houses match worst, because of house names. |
| [Anna Powell-Smith](https://houseprices.anna.ps/) | Normalised address, latest EPC | 79% |

**The estimate**, as the share matched to one property's certificate:

- **Sales with a UPRN (35.4%): about 90–97%.** Nearly every sale needs a current EPC, which lasts 10 years. 95–98% of certificates lodged before 2025 have a UPRN, and 88–89% of those lodged since do.
- **Sales without one (64.6%): about 65–85%.** The lower end is the exact-string join's 60%, raised because matching within one postcode needs only the number and street to agree, not every word. The upper end stays below UCL's 93–95% for houses, because UCL resolved addresses through AddressBase. 98% of Ashfield's sales have a house number, which is the easy case. House names and flats, 1.7% of them, are the hard ones.
- **Together: about 0.354 × 90–97% + 0.646 × 65–85%, so roughly 75–90%.** For comparison, nationally around 60% for 2022–2026 sales by address alone, and 93% with AddressBase.

This is an estimate, not a measurement. Running the spike with a token measures the real rate, step by step (see [What a person still has to do](#what-a-person-still-has-to-do)). For the 299 sales with a UPRN, the run also checks the address steps' matches against the UPRN, which shows whether the address and building steps can be trusted.

## What the spike could and couldn't do

- **No EPC certificates were read.** The API needs a GOV.UK One Login account with a second factor, which the sandbox can't create, and it answers `403` without one. The public [Find an energy certificate](https://find-energy-certificate.service.gov.uk/) service's `robots.txt` disallows every automated client, so it wasn't scraped. Unofficial copies of the data weren't used.
- **Everything else is from primary sources:** the service's pages and OpenAPI file, MHCLG's JSON samples, HM Land Registry's Price Paid Data and UPRN lookups (downloaded 9 October 2026), and the published linkage studies above.
- **Built and tested here:** `epc-matching.ts` (the matcher), `epc-api.ts` (search and certificate requests with the bearer token, `404` as none, waiting out a `429`'s `Retry-After`), and `spike-epc-matching.ts`, with unit tests on made-up certificates and the OpenAPI file's own example answer.

## Running the spike

```bash
EPC_API_KEY=<your bearer token> pnpm --filter @location-scout/data-prepare spike:epc-matching --out ../../docs/spikes
```

The token can also be set in `.env`, which the command reads. It downloads 2026's Price Paid Data (67 MB) and the UPRN lookups once into the git-ignored `data/spikes/oq-8/`. It then asks the API for each of the sample's 617 postcodes, one request every 150 ms. For each sale whose UPRN isn't in its postcode it asks by UPRN, and for each matched sale it fetches the certificate. That is at most about 1,800 requests, about 5 minutes, well inside the rate limit. It rewrites `oq-8-epc-matching-results.md` with:

- the match rate by step, UPRN first and by the address steps alone, overall, by property type and by how the address is written;
- the address steps' matches checked against the sale's UPRN: right or wrong, by step;
- where the sales' UPRNs have certificates: in their postcode, only elsewhere, or nowhere;
- how many matched certificates have a floor area, a current band and a potential band, and their floor areas.

Each sale's outcome is kept in `data/spikes/oq-8/oq-8-outcomes.json`, with certificate numbers and UPRNs but none of the certificates' addresses. `--district` matches another council's sales.

## What a person still has to do

1. **Get a token.** Sign in or create a GOV.UK One Login account at [Get energy performance of buildings data](https://get-energy-performance-data.communities.gov.uk/), choose "Use a developer API", and copy the bearer token from your account page. Note whether it expires, which the documentation doesn't say, and whether the sign-up asks you to accept any terms beyond the licensing page.
2. **Run the spike** as above, and commit the new `oq-8-epc-matching-results.md`.
3. **Record the measured rate.** Replace the estimate in this document and in the PRD's OQ-8 with the measured rate. Keep the building step only if its matches checked against the UPRN are right. If they aren't, drop it from `EPC_MATCH_STEPS` before #38 uses it.
4. **Settle the address licence before Phase 2.** Ask Ordnance Survey and Royal Mail, with OQ-4's review, whether matching by EPC address for price per m² in a hosted product is a permitted purpose. Until then, match by address only on a developer's machine.

## Attribution of the spike's sources

- Price Paid Data and its UPRN look up: Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0. UPRNs contain OS data © Crown copyright and database rights 2026, licensed under the Open Government Licence v3.0.
- The Energy Performance of Buildings Data API's documentation, OpenAPI file and JSON samples: © Crown copyright, Open Government Licence v3.0.
