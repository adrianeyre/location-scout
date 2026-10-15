import { describe, expect, it } from "vitest";

import { readUrlState, writeUrlState } from "../url-state";
import { isReportView, reportViewSearch } from "./report-view";

const NG17_1AA = "?lat=53.123664&lng=-1.264078&radius=0.5";

describe("isReportView", () => {
  it("opens the report only for view=report", () => {
    expect(isReportView(`${NG17_1AA}&view=report`)).toBe(true);
    expect(isReportView(NG17_1AA)).toBe(false);
    expect(isReportView(`${NG17_1AA}&view=map`)).toBe(false);
    expect(isReportView("")).toBe(false);
  });
});

describe("reportViewSearch", () => {
  it("adds view=report after the view's own parameters", () => {
    expect(
      reportViewSearch(
        `${NG17_1AA}&mode=investment&weights=transport:100`,
        true,
      ),
    ).toBe(`${NG17_1AA}&mode=investment&weights=transport:100&view=report`);
  });

  it("takes it away again, leaving the rest as it was", () => {
    expect(
      reportViewSearch(`${NG17_1AA}&hidden=crime,land&view=report`, false),
    ).toBe(`${NG17_1AA}&hidden=crime,land`);
  });

  it("leaves nothing of a URL that had only the report", () => {
    expect(reportViewSearch("?view=report", false)).toBe("");
    expect(reportViewSearch("", true)).toBe("?view=report");
  });

  it("is kept when the view's own parameters are written again", () => {
    const search = reportViewSearch(NG17_1AA, true);
    const view = readUrlState(search);
    expect(
      isReportView(writeUrlState({ ...view, mode: "homebuyer" }, search)),
    ).toBe(true);
  });
});
