import type { SearchArea } from "@location-scout/shared";

import ng17FiveYearsBefore from "../sources/fixtures/land-registry-ng17-1aa-five-years-before.json" with { type: "json" };
import ng17History from "../sources/fixtures/land-registry-ng17-1aa-history.json" with { type: "json" };
import ng17YearBefore from "../sources/fixtures/land-registry-ng17-1aa-year-before.json" with { type: "json" };
import ng17Sales from "../sources/fixtures/land-registry-ng17-1aa.json" with { type: "json" };
import suttonParkwayFiveYearsBefore from "../sources/fixtures/land-registry-sutton-parkway-five-years-before.json" with { type: "json" };
import suttonParkwayHistory from "../sources/fixtures/land-registry-sutton-parkway-history.json" with { type: "json" };
import suttonParkwayLandSalesPostcodes from "../sources/fixtures/land-registry-sutton-parkway-land-sales-postcodes.json" with { type: "json" };
import suttonParkwayLandSales from "../sources/fixtures/land-registry-sutton-parkway-land-sales.json" with { type: "json" };
import suttonParkwayYearBefore from "../sources/fixtures/land-registry-sutton-parkway-year-before.json" with { type: "json" };
import suttonParkwaySales from "../sources/fixtures/land-registry-sutton-parkway.json" with { type: "json" };
import ng17Postcodes from "../sources/fixtures/postcodes-io-ng17-1aa-search-area.json" with { type: "json" };
import suttonParkwayPostcodes from "../sources/fixtures/postcodes-io-sutton-parkway-search-area.json" with { type: "json" };
import {
  landSalesBody,
  lastTwelveMonths,
  mapPricePaid,
  pricePaidBody,
  saleHistoryBody,
  twelveMonthsBefore,
  yearsUpTo,
} from "../sources/land-registry";
import {
  mapPostcodesInSearchArea,
  postcodesInSearchAreaUrl,
} from "../sources/postcodes-io";
import { SUTTON_PARKWAY_AREA } from "./overpass-recordings";
import { NG17_1AA_AREA } from "./police-ng17-1aa";

/**
 * The day the Property Layer's fixtures were recorded. Its last 12 months end
 * on the day it is asked, so the fixture-backed app asks on this day, and
 * sends the query that was recorded.
 */
export const PROPERTY_RECORDED_ON = "2026-10-08";

/** Price Paid's recorded answers for one Search Area. */
interface PricePaidAnswers {
  /** Its sales in the last 12 months. */
  sales: unknown;
  /** Every sale at each of their addresses. */
  history: unknown;
  /** Its sales in the 12 months a year before. */
  yearBefore: unknown;
  /** Its sales in the 12 months five years before. */
  fiveYearsBefore: unknown;
}

/** A Search Area's recorded postcodes, by URL, and its Price Paid answers, by form body. */
const recordings = (
  area: SearchArea,
  postcodes: unknown,
  { sales, history, yearBefore, fiveYearsBefore }: PricePaidAnswers,
): {
  postcodes: ReadonlyMap<string, unknown>;
  pricePaid: ReadonlyMap<string, unknown>;
} => {
  const period = lastTwelveMonths(PROPERTY_RECORDED_ON);
  const searched = mapPostcodesInSearchArea(200, postcodes, area.location);
  const earlier = (years: number) => {
    const { from, to } = twelveMonthsBefore(period, years);
    return pricePaidBody(searched.postcodes, from, to);
  };
  return {
    postcodes: new Map([[postcodesInSearchAreaUrl(area), postcodes]]),
    pricePaid: new Map([
      [pricePaidBody(searched.postcodes, period.from), sales],
      [saleHistoryBody(mapPricePaid(200, sales, searched.postcodes)), history],
      [earlier(1), yearBefore],
      [earlier(5), fiveYearsBefore],
    ]),
  };
};

/**
 * NG17 1AA's 0.5 mile Search Area, as recorded on 8 October 2026.
 * postcodes.io gives its limit of 100 postcodes, the furthest 430 m from the
 * Location, so the rest of the Search Area is left out. Price Paid records 24
 * sales in them from 9 October 2025, the latest on 29 May 2026: 8 detached,
 * 6 semi-detached, 6 terraced and 4 other, all freehold and none new builds,
 * for a median of £182,000 and a mean of £187,000. 17 of their addresses
 * have sold before since 1995: 88 High Pavement for £183,500 on 6 October
 * 2024, so its sale for £173,000 was down 5.7%, and Wayside, Cowpasture Lane
 * three times, from £92,300 in 2000. In the same postcodes, 54 sold in the
 * 12 months a year before, for a median of £160,000, and 39 in the 12 months
 * five years before, from 9 October 2020, for a median of £150,000: changes
 * of +13.8% and +21.3%.
 */
export const NG17_1AA_PROPERTY = recordings(NG17_1AA_AREA, ng17Postcodes, {
  sales: ng17Sales,
  history: ng17History,
  yearBefore: ng17YearBefore,
  fiveYearsBefore: ng17FiveYearsBefore,
});

/**
 * `SUTTON_PARKWAY_AREA`, as recorded on 8 October 2026. postcodes.io gives 7
 * postcodes, the whole Search Area, and Price Paid records one sale in them
 * from 9 October 2025: 5 Maun View Gardens, terraced, for £150,000, up 10.3%
 * from £136,000 in 2007. 3 sold in them in the 12 months a year before, for
 * a median of £260,000, and 2 five years before, for £145,000.
 */
export const SUTTON_PARKWAY_PROPERTY = recordings(
  SUTTON_PARKWAY_AREA,
  suttonParkwayPostcodes,
  {
    sales: suttonParkwaySales,
    history: suttonParkwayHistory,
    yearBefore: suttonParkwayYearBefore,
    fiveYearsBefore: suttonParkwayFiveYearsBefore,
  },
);

/**
 * The land sales near Sutton Parkway's farm field, `E07000170-2`, the
 * prepared-data fixture's Land Opportunity in `SUTTON_PARKWAY_AREA` (PRD
 * FR-5.4b), as recorded on 9 October 2026, by the body of the query the
 * fixture-backed app sends, as if on 8 October. `postcodes` are the 494
 * postcodes within 1 mile of the field in the prepared-data fixture, which
 * `land-sales.test.ts` checks it still gives. Price Paid records 76 sales
 * of property of type "Other" in them from 9 October 2021: shops, pubs,
 * industrial units, a nursing home, a supermarket and a college, and one
 * sale plainly of land, Plot D on Sidings Road, for £110,000 on 11
 * February 2022.
 */
export const SUTTON_PARKWAY_LAND_SALES = {
  postcodes: suttonParkwayLandSalesPostcodes,
  pricePaid: new Map<string, unknown>([
    [
      landSalesBody(
        suttonParkwayLandSalesPostcodes,
        yearsUpTo(PROPERTY_RECORDED_ON, 5).from,
      ),
      suttonParkwayLandSales,
    ],
  ]),
};
