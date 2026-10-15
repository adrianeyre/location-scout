import { ISSUES_URL, POLICIES_REVIEWED } from "./links";

/** The privacy policy's text, shown in its dialog. */
export const PrivacyPolicy = () => (
  <>
    <p className="policy-updated">Last reviewed: {POLICIES_REVIEWED}</p>
    <p>
      Location Scout has no accounts and asks for nothing about you. This policy
      says what happens to the places you look up.
    </p>

    <h3>What you send</h3>
    <ul>
      <li>
        <strong>Searches and map clicks</strong> — the postcode or address you
        type, or the point you click, goes to Location Scout&apos;s own backend.
        The Location, Search Radius, Scout Mode and Layers you choose are kept
        in the page&apos;s address, so you can bookmark or share it.
      </li>
      <li>
        <strong>AI Explanations</strong> — when you press Explain, the figures
        on screen and the question you pick or type are sent to Anthropic to
        write the answer. Don&apos;t type personal details into the question.
      </li>
    </ul>

    <h3>Who else sees it</h3>
    <p>
      To answer, the backend asks public data services about the Location:
      postcodes.io, Nominatim (OpenStreetMap), data.police.uk,
      planning.data.gov.uk, the Overpass API, PlanIt or PlanWire, and, where
      switched on, the EPC register and Anthropic. They receive the Location or
      address, not who you are. Your browser loads the map&apos;s tiles from
      OpenStreetMap and, if you open Street View, imagery from Google, which see
      your IP address under their own privacy policies.
    </p>

    <h3>What is kept</h3>
    <p>
      The backend keeps answers in memory for a while so the same Search Area
      loads faster, then forgets them; nothing is written to a database. Your
      appearance setting is kept in your own browser, as the Cookie Policy
      describes.
    </p>

    <h3>Your rights</h3>
    <p>
      As no personal data is collected, there is normally nothing to access,
      correct or delete. To ask about this policy,{" "}
      <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
        raise an issue on the project&apos;s repository
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
      .
    </p>
  </>
);
