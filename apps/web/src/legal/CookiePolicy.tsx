import { APPEARANCE_STORAGE_KEY } from "../theme/appearance";
import { POLICIES_REVIEWED } from "./links";

/** The cookie policy's text, shown in its dialog. */
export const CookiePolicy = () => (
  <>
    <p className="policy-updated">Last reviewed: {POLICIES_REVIEWED}</p>
    <p>
      Location Scout sets <strong>no cookies</strong>, and uses no analytics,
      advertising or tracking of any kind. So there is no cookie banner to
      accept or dismiss.
    </p>

    <h3>What is kept in your browser</h3>
    <p>
      One setting is kept in your browser&apos;s local storage, so the site
      looks the way you chose next time. It never leaves your device and is
      never sent to us.
    </p>
    <table className="policy-table">
      <caption className="visually-hidden">
        What Location Scout keeps in your browser
      </caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Type</th>
          <th scope="col">Purpose</th>
          <th scope="col">Kept for</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <code>{APPEARANCE_STORAGE_KEY}</code>
          </td>
          <td>Local storage</td>
          <td>
            Your light, dark or system mode and colour theme, from Settings
          </td>
          <td>Until you clear your browser&apos;s site data</td>
        </tr>
      </tbody>
    </table>

    <h3>Third parties</h3>
    <p>
      The map&apos;s tiles are loaded from OpenStreetMap&apos;s tile servers,
      and, if it is switched on, the Street View panel loads Google Maps. Each
      of them receives your IP address as any website does, under its own
      policy. Neither sets cookies on Location Scout&apos;s behalf.
    </p>

    <h3>Clearing it</h3>
    <p>
      Clear this site&apos;s data in your browser&apos;s settings to remove the
      setting above. The site then follows your device&apos;s light or dark mode
      with the default theme.
    </p>
  </>
);
