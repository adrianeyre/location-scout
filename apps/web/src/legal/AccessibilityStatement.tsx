import { ISSUES_URL, POLICIES_REVIEWED } from "./links";

/** The accessibility statement's text, shown in its dialog. */
export const AccessibilityStatement = () => (
  <>
    <p className="policy-updated">Last reviewed: {POLICIES_REVIEWED}</p>

    <div className="status-box">
      <p>
        <strong>Conformance status:</strong> Location Scout is built to meet the
        Web Content Accessibility Guidelines (WCAG) 2.2 at{" "}
        <strong>Level AA</strong>.
      </p>
    </div>

    <h3>What we have done</h3>
    <ul>
      <li>
        <strong>Keyboard access</strong> — every control, tab, Layer toggle,
        slider and dialog works with a keyboard alone, with a clear focus
        outline. A &quot;Skip to main content&quot; link comes first, every map
        marker is a button, and &quot;Skip past the map&quot; goes from the map
        straight to its Layers. Escape closes a marker&apos;s popup.
      </li>
      <li>
        <strong>Screen readers</strong> — labelled landmarks and regions, a
        label for every control, and each Layer's statistics are also given as
        text in the Location Overview.
      </li>
      <li>
        <strong>Colour and contrast</strong> — in all six themes, light and
        dark, text is at least 4.5:1 against its background, and focus outlines
        and control edges at least 3:1. Settings lists each theme&apos;s ratios.
        Nothing is shown by colour alone: Highlights, scores and highlighted
        Layers are also named.
      </li>
      <li>
        <strong>Themes</strong> — light, dark or matching your device, and a
        High contrast theme, from the Settings cog. Windows Contrast Themes are
        respected.
      </li>
      <li>
        <strong>Reflow and zoom</strong> — on narrow screens and at 400% zoom
        the panel stacks under the map, with nothing scrolling sideways but wide
        tables, which scroll on their own.
      </li>
      <li>
        <strong>Motion</strong> — animations are short, and switched off if your
        device is set to reduce motion.
      </li>
      <li>
        <strong>Target sizes</strong> — every control is at least 24 by 24
        pixels.
      </li>
      <li>
        <strong>Dialogs</strong> — focus moves into a dialog when it opens,
        stays there, and returns to what opened it; Escape closes it.
      </li>
    </ul>

    <h3>Known limitations</h3>
    <ul>
      <li>
        The base map&apos;s tiles come from OpenStreetMap and are not themed;
        everything on the map is also listed in the Location Overview.
      </li>
      <li>
        Google&apos;s Street View panorama, where switched on, is Google&apos;s
        own control, outside our control.
      </li>
    </ul>

    <h3>How we test</h3>
    <p>
      Automated axe checks run in the end-to-end tests on the main view and
      every dialog, every theme&apos;s contrast is checked by a unit test, and
      we test by keyboard alone.
    </p>

    <h3>Feedback</h3>
    <p>
      If something stops you using Location Scout,{" "}
      <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
        raise an issue on the project&apos;s repository
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>{" "}
      and say what you were trying to do and what you use, such as your browser
      and screen reader.
    </p>
  </>
);
