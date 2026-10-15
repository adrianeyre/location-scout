import { ANY_YEAR, SOURCE_CREDITS } from "../attribution";
import { CreditText } from "../CreditText";

/**
 * Every Data Source and the credit its licence asks for (PRD §6.15), shown
 * in its dialog from the footer.
 */
export const DataSourcesAndLicences = () => (
  <>
    <p>
      Location Scout shows data from these sources, each under its own licence.
      Each is credited as below beside the data it supplies: in the Location
      Overview, in each map popup and in the printable report. Where a credit
      says {ANY_YEAR}, it is given with the year of the data wherever that data
      is shown.
    </p>
    <dl className="source-credits">
      {SOURCE_CREDITS.map(({ name, usedFor, credit }) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>
            <p className="source-credit-use">{usedFor}.</p>
            <p>
              <CreditText credit={credit} />
            </p>
          </dd>
        </div>
      ))}
    </dl>
  </>
);
