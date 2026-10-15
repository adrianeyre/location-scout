import {
  EPC_RULES,
  type DataPeriod,
  type MedianPriceChange,
  type PostcodeCoverage,
  type PriceSummary,
  type PropertyEpc,
  type PropertyLayerResponse,
} from "@location-scout/shared";

import {
  formatChange,
  formatCount,
  formatDate,
  formatDistance,
  formatPrice,
} from "../format";
import { EPC_CREDIT, pricePaidCredit } from "../attribution";
import { CreditLine } from "../CreditText";
import {
  LAYER_STYLES,
  PROPERTY_TYPE_NAMES,
  TENURE_NAMES,
} from "./layer-styles";

const SALES = LAYER_STYLES.property.noun;

/** What a change in median price can and can't say. */
export const MEDIAN_CHANGE_NOTE =
  "Each change compares the median price of the sales in the same postcodes in each 12 months. A median moves with the mix of properties sold, as well as with their prices.";

/** One row of a table of prices: what the sales have in common, and their prices. */
interface PriceRow extends PriceSummary {
  name: string;
}

const price = (pounds: number | null) =>
  pounds === null ? "None" : formatPrice(pounds);

/** The count, median and mean price of each group of sales. */
const PriceTable = ({
  caption,
  heading,
  rows,
}: {
  caption: string;
  heading: string;
  rows: PriceRow[];
}) => (
  <table className="layer-statistics">
    <caption>{caption}</caption>
    <thead>
      <tr>
        <th scope="col">{heading}</th>
        <th scope="col">Sales</th>
        <th scope="col">Median</th>
        <th scope="col">Mean</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(({ name, count, median, mean }) => (
        <tr key={name}>
          <th scope="row">{name}</th>
          <td>{count.toLocaleString("en-GB")}</td>
          <td>{price(median)}</td>
          <td>{price(mean)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const written = ({ from, to }: DataPeriod) =>
  `${formatDate(from)} to ${formatDate(to)}`;

/**
 * The last 12 months' median price against the 12 months a year and five
 * years before, in the same postcodes (PRD FR-2.6). One Price Paid didn't
 * answer for says so, and gives no change.
 */
const MedianChangeTable = ({
  all,
  changes,
  period,
}: {
  all: PriceSummary;
  changes: [string, MedianPriceChange][];
  period: DataPeriod;
}) => (
  <table className="layer-statistics">
    <caption>Change in median price, in the same postcodes</caption>
    <thead>
      <tr>
        <th scope="col">12 months</th>
        <th scope="col">Sales</th>
        <th scope="col">Median</th>
        <th scope="col">Change since</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">Last 12 months, {written(period)}</th>
        <td>{all.count.toLocaleString("en-GB")}</td>
        <td>{price(all.median)}</td>
        <td />
      </tr>
      {changes.map(([name, { period, prices, change }]) => (
        <tr key={name}>
          <th scope="row">
            {name}, {written(period)}
          </th>
          {prices === null ? (
            <td colSpan={3}>Unavailable: Price Paid didn't answer</td>
          ) : (
            <>
              <td>{prices.count.toLocaleString("en-GB")}</td>
              <td>{price(prices.median)}</td>
              <td>{change === null ? "None" : formatChange(change)}</td>
            </>
          )}
        </tr>
      ))}
    </tbody>
  </table>
);

/**
 * PRD FR-2.8: postcodes.io gave as many postcodes as it can, so the Search
 * Area may have more, further out, whose sales are left out.
 */
const CutShort = ({ searched, limit, reachMetres }: PostcodeCoverage) => (
  <p className="property-cut-short">
    <strong>Search Area cut short.</strong> postcodes.io gives at most{" "}
    {limit.toLocaleString("en-GB")} postcodes, and gave that many, so the Search
    Area may have more. Only sales in the {searched.toLocaleString("en-GB")}{" "}
    postcodes nearest the Location
    {reachMetres === null
      ? ""
      : `, up to ${formatDistance(reachMetres)} away,`}{" "}
    are counted.
  </p>
);

/**
 * HM Land Registry's required attribution for Price Paid Data, with the
 * conditions on its address data (PRD FR-10.3).
 */
export const PricePaidAttribution = ({ year }: { year: string }) => (
  <CreditLine credit={pricePaidCredit(year)} />
);

/** How sales are matched to EPCs, and what their figures can and can't say (PRD FR-2.6). */
export const EPC_NOTE = `Each home is counted once, by its latest Energy Performance Certificate, from those registered since 2012. A sale is matched to the certificates in its postcode by its flat, house number or name and street, only where exactly one home's fit, and takes the certificate current when it sold. Price per m² is its price over that certificate's total floor area, left out where the floor area is under ${String(EPC_RULES.minFloorAreaSquareMetres)} m² or over ${String(EPC_RULES.maxFloorAreaSquareMetres)} m². A certificate may be up to 10 years older than the sale, and other property, such as a shop, has none.`;

const homes = (count: number) => formatCount(count, ["home", "homes"]);

/**
 * The Energy Performance Certificates in the Search Area's postcodes, and
 * the sales matched to them (PRD FR-2.6): the homes in each band, and the
 * sales' price per m², with the attribution their licence needs (FR-10.1a).
 * Nothing without `EPC_API_KEY`.
 */
export const EpcStatistics = ({ epc }: { epc: PropertyEpc }) => {
  const { statistics } = epc;
  return (
    // Part of the Property Layer's region, not a region of its own.
    <div className="property-epc">
      <h4>Energy Performance Certificates</h4>
      {statistics === null ? (
        <p>
          <strong>Unavailable.</strong> The EPC API didn't answer, so energy
          ratings and price per m² can't be shown for now.
        </p>
      ) : (
        <>
          <p>
            {statistics.homes === 0
              ? `No homes in the ${formatCount(statistics.postcodes.searched, ["postcode", "postcodes"])} searched have an EPC.`
              : `${homes(statistics.homes)} in the ${formatCount(statistics.postcodes.searched, ["postcode", "postcodes"])} searched have an EPC.`}
            {statistics.postcodes.unanswered > 0 &&
              ` The EPC API didn't answer for ${formatCount(statistics.postcodes.unanswered, ["postcode", "postcodes"])}, whose homes are left out.`}
          </p>
          {statistics.homes > 0 && (
            <table className="layer-statistics">
              <caption>Homes by EPC rating</caption>
              <thead>
                <tr>
                  <th scope="col">Rating</th>
                  <th scope="col">Homes</th>
                  <th scope="col">Share</th>
                </tr>
              </thead>
              <tbody>
                {statistics.byBand.map(({ band, count }) => (
                  <tr key={band}>
                    <th scope="row">{band}</th>
                    <td>{count.toLocaleString("en-GB")}</td>
                    <td>{`${String(Math.round((count / statistics.homes) * 100))}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p>
            {statistics.sales.lookedFor === 0
              ? "No sales of houses or flats to match to an EPC."
              : `${statistics.sales.matched.toLocaleString("en-GB")} of ${formatCount(statistics.sales.lookedFor, ["sale", "sales"])} of houses and flats matched to an EPC. `}
            {statistics.sales.lookedFor > 0 &&
              (statistics.pricePerSquareMetre.count === 0
                ? "None has a floor area to give a price per m²."
                : `Price per m², from the ${formatCount(statistics.pricePerSquareMetre.count, ["sale", "sales"])} with a floor area: a median of ${price(statistics.pricePerSquareMetre.median)} and a mean of ${price(statistics.pricePerSquareMetre.mean)}.`)}
          </p>
          <p className="layer-note">{EPC_NOTE}</p>
        </>
      )}
      <CreditLine credit={EPC_CREDIT} />
    </div>
  );
};

/**
 * The Property Layer's statistics: how many sales there were in the Search
 * Area in the last 12 months, and their median and mean price, overall and by
 * property type, tenure and new build, and the change in median price from a
 * year and five years before (PRD FR-2.6). If postcodes.io couldn't give
 * every postcode in the Search Area, it says so (FR-2.8). With
 * `EPC_API_KEY`, the homes' EPC ratings and the sales' price per m² follow.
 */
export const PropertyStatistics = ({
  statistics,
  epc,
}: PropertyLayerResponse) => {
  if (!statistics) return null;
  const { period, all, byType, byTenure, byNewBuild, medianChange, postcodes } =
    statistics;
  const twelveMonths = written(period);
  return (
    <>
      {postcodes.truncated && <CutShort {...postcodes} />}
      <p>
        {postcodes.searched === 0
          ? "There are no postcodes in the Search Area, so there are no sales to find."
          : all.count === 0
            ? `No sales recorded in the Search Area from ${twelveMonths}.`
            : `${formatCount(all.count, SALES)} in the Search Area from ${twelveMonths}: a median price of ${price(all.median)} and a mean of ${price(all.mean)}.`}
      </p>
      {all.count > 0 && (
        <>
          <MedianChangeTable
            all={all}
            period={period}
            changes={[
              ["A year before", medianChange.twelveMonths],
              ["Five years before", medianChange.fiveYears],
            ]}
          />
          <p className="layer-note">{MEDIAN_CHANGE_NOTE}</p>
          <PriceTable
            caption={`Sales by property type, ${twelveMonths}`}
            heading="Property type"
            rows={byType.map(({ type, ...prices }) => ({
              name: PROPERTY_TYPE_NAMES[type][1],
              ...prices,
            }))}
          />
          <PriceTable
            caption={`Sales by tenure, ${twelveMonths}`}
            heading="Tenure"
            rows={byTenure.map(({ tenure, ...prices }) => ({
              name: TENURE_NAMES[tenure],
              ...prices,
            }))}
          />
          <PriceTable
            caption={`Sales of new builds, ${twelveMonths}`}
            heading="New build"
            rows={byNewBuild.map(({ newBuild, ...prices }) => ({
              name: newBuild ? "New builds" : "Not new builds",
              ...prices,
            }))}
          />
        </>
      )}
      <PricePaidAttribution year={period.to.slice(0, 4)} />
      {epc && <EpcStatistics epc={epc} />}
    </>
  );
};
