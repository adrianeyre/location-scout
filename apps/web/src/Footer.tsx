import { useState } from "react";

import { FOOTER_CREDIT } from "./attribution";
import { CreditText } from "./CreditText";
import { AccessibilityStatement } from "./legal/AccessibilityStatement";
import { CookiePolicy } from "./legal/CookiePolicy";
import { DataSourcesAndLicences } from "./legal/DataSourcesAndLicences";
import { REPOSITORY_URL } from "./legal/links";
import { PrivacyPolicy } from "./legal/PrivacyPolicy";
import { TermsAndConditions } from "./legal/TermsAndConditions";
import { Dialog } from "./ui/Dialog";

/** The footer's policies, and every source's credit, each opened in a dialog of its own. */
const POLICIES = [
  {
    id: "sources",
    name: "Data sources and licences",
    closeLabel: "Close data sources and licences",
    Body: DataSourcesAndLicences,
  },
  {
    id: "privacy",
    name: "Privacy Policy",
    closeLabel: "Close privacy policy",
    Body: PrivacyPolicy,
  },
  {
    id: "terms",
    name: "Terms and Conditions",
    closeLabel: "Close terms and conditions",
    Body: TermsAndConditions,
  },
  {
    id: "cookies",
    name: "Cookie Policy",
    closeLabel: "Close cookie policy",
    Body: CookiePolicy,
  },
  {
    id: "accessibility",
    name: "Accessibility",
    closeLabel: "Close accessibility statement",
    Body: AccessibilityStatement,
  },
] as const;

type PolicyId = (typeof POLICIES)[number]["id"];

/**
 * The footer, full width along the bottom of every view: the credit PRD
 * FR-10.1 asks for, the design credit, the version, every source's credit
 * and the policies.
 */
export const Footer = () => {
  const [open, setOpen] = useState<PolicyId | null>(null);
  return (
    <footer className="app-footer">
      <p className="footer-credit">
        <CreditText credit={FOOTER_CREDIT} />
      </p>
      <nav aria-label="About this site">
        <a
          className="footer-link"
          href={REPOSITORY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitHubMark />
          Website design
          <span className="visually-hidden">
            {" "}
            (source on GitHub, opens in a new tab)
          </span>
        </a>
        <span className="footer-version">
          Version: {import.meta.env.VITE_APP_VERSION}
        </span>
        {POLICIES.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            className="link-button"
            aria-haspopup="dialog"
            onClick={() => {
              setOpen(id);
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      {POLICIES.map(({ id, name, closeLabel, Body }) => (
        <Dialog
          key={id}
          open={open === id}
          onClose={() => {
            setOpen(null);
          }}
          title={name}
          closeLabel={closeLabel}
        >
          <Body />
        </Dialog>
      ))}
    </footer>
  );
};

/** GitHub's mark, as GitHub publishes it for linking to a repository. */
const GitHubMark = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.76.41-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.2-3.1-.12-.29-.52-1.46.11-3.05 0 0 .98-.31 3.2 1.18a11.1 11.1 0 0 1 5.82 0c2.22-1.5 3.2-1.18 3.2-1.18.63 1.59.23 2.76.11 3.05.75.81 1.2 1.84 1.2 3.1 0 4.43-2.7 5.41-5.26 5.69.42.36.8 1.08.8 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
  </svg>
);
