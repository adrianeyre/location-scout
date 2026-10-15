import { ISSUES_URL, POLICIES_REVIEWED } from "./links";

/** The terms and conditions' text, shown in its dialog. */
export const TermsAndConditions = () => (
  <>
    <p className="policy-updated">Last reviewed: {POLICIES_REVIEWED}</p>

    <h3>Using Location Scout</h3>
    <p>
      Location Scout brings together open data about places in England to help
      you understand an area. You may use it for your own research, personal or
      professional, free of charge.
    </p>

    <h3>Not advice</h3>
    <p>
      Scores, Highlights, Land Opportunities and AI Explanations are indications
      drawn from public data by fixed rules. They are not financial, legal,
      planning, surveying or property advice. A Land Opportunity only ever
      warrants investigation: always check ownership, planning and condition
      with the proper authority or a qualified professional before you act.
    </p>

    <h3>Accuracy</h3>
    <p>
      Data comes from third parties and may be incomplete, out of date or wrong,
      and a Data Source may be unavailable. Location Scout is provided &quot;as
      is&quot;, without warranty, and is not liable for decisions made using it,
      so far as the law allows.
    </p>

    <h3>Data licences</h3>
    <p>
      Each Data Source&apos;s data stays under its own licence, such as the Open
      Government Licence or the Open Database Licence, and its attribution is
      shown beside the data it supplies. Reuse it only as those licences allow.
    </p>

    <h3>Fair use</h3>
    <p>
      Don&apos;t scrape, overload or try to break the service; the public
      services behind it have limits that protect everyone.
    </p>

    <h3>Changes and contact</h3>
    <p>
      These terms may change as Location Scout does; the date above says when.
      For questions,{" "}
      <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
        raise an issue on the project&apos;s repository
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
      .
    </p>
  </>
);
