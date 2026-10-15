import { Fragment } from "react";

import type { Credit } from "./attribution";

/** A Data Source's credit, its links as links (PRD §6.15). */
export const CreditText = ({ credit }: { credit: Credit }) => (
  <>
    {credit.map((part, index) =>
      typeof part === "string" ? (
        <Fragment key={index}>{part}</Fragment>
      ) : (
        <a key={index} href={part.url}>
          {part.text}
        </a>
      ),
    )}
  </>
);

/** A credit as a paragraph of its own, as a Layer's statistics end with. */
export const CreditLine = ({ credit }: { credit: Credit }) => (
  <p className="layer-attribution">
    <CreditText credit={credit} />
  </p>
);
