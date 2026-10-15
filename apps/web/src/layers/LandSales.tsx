import { LAND_SALES_NOTE, type NearbyLandSales } from "@location-scout/shared";

import { PricePaidAttribution } from "./PropertyStatistics";
import {
  landSaleText,
  landSalesName,
  landSalesSummary,
  moreLandSales,
} from "./layer-styles";

interface LandSalesProps {
  /** `null` where they aren't looked for: across a whole Land Coverage Area. */
  sales: NearbyLandSales | null;
  /** Whether each is as far as the nearest of several Land Opportunities. */
  fromNearest?: boolean;
  /** Whether to say how many there are first, unless it is said beside them. */
  withSummary?: boolean;
}

/**
 * The land sales within 1 mile of a Land Opportunity, or of any in the
 * Search Area (PRD FR-5.4b): how many, their median price, and each with
 * its price and date, marked "indicative: may not be land", with what Price
 * Paid's "Other" is and HM Land Registry's attribution (FR-10.3). Or why
 * they aren't known.
 */
export const LandSales = ({
  sales,
  fromNearest = false,
  withSummary = true,
}: LandSalesProps) => {
  const listed = sales?.found?.sales ?? [];
  const more = moreLandSales(sales);
  return (
    <>
      {withSummary && <p>{landSalesSummary(sales)}</p>}
      {sales && listed.length > 0 && (
        <>
          <ul className="land-sales" aria-label={landSalesName(sales)}>
            {listed.map((sale) => (
              <li key={sale.id}>{landSaleText(sale, fromNearest)}</li>
            ))}
            {more && <li>{more}</li>}
          </ul>
          <p className="layer-note">{LAND_SALES_NOTE}</p>
          <PricePaidAttribution year={sales.period.to.slice(0, 4)} />
        </>
      )}
    </>
  );
};
