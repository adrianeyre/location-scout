import { Fragment, type ReactNode } from "react";

import type { LocalGeography as Geography } from "@location-scout/shared";

import type { Found } from "./useSearchArea";

/** What to show for an area postcodes.io doesn't name. */
const UNNAMED = "Not known";

interface LocalGeographyProps {
  geography: Geography;
  /** What the Location was found from, if it was a search. */
  found: Found | null;
}

/**
 * The ward, LSOA, MSOA, local authority and parliamentary constituency the
 * Location lies in (PRD FR-1.8). When they come from a postcode other than the
 * one searched for (a map click, an address or a shared URL), it says which.
 */
export const LocalGeography = ({ geography, found }: LocalGeographyProps) => {
  const fromSearch =
    found?.kind === "postcode" && found.label === geography.postcode;
  const areas: { key: string; label: ReactNode; name: string | null }[] = [
    { key: "ward", label: "Ward", name: geography.ward },
    {
      key: "lsoa",
      label: <abbr title="Lower layer Super Output Area">LSOA</abbr>,
      name: geography.lsoa,
    },
    {
      key: "msoa",
      label: <abbr title="Middle layer Super Output Area">MSOA</abbr>,
      name: geography.msoa,
    },
    {
      key: "local-authority",
      label: "Local authority",
      name: geography.localAuthority,
    },
    {
      key: "constituency",
      label: "Parliamentary constituency",
      name: geography.parliamentaryConstituency,
    },
  ];
  return (
    <section aria-labelledby="local-geography-heading">
      <h3 id="local-geography-heading">Local geography</h3>
      <dl>
        {!fromSearch && (
          <>
            <dt>Nearest postcode</dt>
            <dd>{geography.postcode}</dd>
          </>
        )}
        {areas.map(({ key, label, name }) => (
          <Fragment key={key}>
            <dt>{label}</dt>
            <dd>{name ?? UNNAMED}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
};
