import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import ofstedPage from "./fixtures/govuk-ofsted-management-information.json" with { type: "json" };
import {
  RECORDED_OFSTED_INSPECTIONS_URL,
  recordedSources,
} from "./recorded-sources";
import {
  GIAS,
  downloadGiasZip,
  formFields,
  latestOfstedInspections,
} from "./schools";
import { zipEntries } from "./zip";

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url));

const GENERATED = `${GIAS.site}/Downloads/Generated/f6292a6b-6810-49f2-8426-8f66197fc04b`;

describe("latestOfstedInspections", () => {
  it("is the latest month's CSV of latest inspections, and the day it is as at", () => {
    expect(latestOfstedInspections(ofstedPage)).toEqual({
      url: RECORDED_OFSTED_INSPECTIONS_URL,
      asAt: "2026-08-31",
    });
  });

  it("reads a month written short, and leaves out other files", () => {
    const attachment = (title: string, url: string) => ({ title, url });
    expect(
      latestOfstedInspections({
        details: {
          attachments: [
            attachment(
              "Management information - state-funded schools - latest inspections as at 30 Sept 2026",
              "https://example.gov.uk/september.csv",
            ),
            attachment(
              "Management information - state-funded schools - latest inspections as at 31 Oct 2026",
              "https://example.gov.uk/october.ods",
            ),
            attachment(
              "Management information - state-funded schools - all inspections - year to date published by 31 October 2026",
              "https://example.gov.uk/all.csv",
            ),
          ],
        },
      }),
    ).toEqual({
      url: "https://example.gov.uk/september.csv",
      asAt: "2026-09-30",
    });
  });

  it("is null for a page with none", () => {
    expect(
      latestOfstedInspections({ details: { attachments: [] } }),
    ).toBeNull();
    expect(latestOfstedInspections(null)).toBeNull();
  });
});

describe("formFields", () => {
  it("are the hidden fields of GIAS's Downloads form, in order", async () => {
    const fields = formFields(
      (await fixture("gias-downloads.html")).toString(),
      GIAS.collatePath,
    );

    expect(fields?.slice(1, 4)).toEqual([
      ["Skip", ""],
      ["SearchType", "Latest"],
      ["FilterDate.Day", "9"],
    ]);
    expect(fields).toContainEqual(["Downloads[0].Tag", GIAS.tag]);
    expect(fields).toContainEqual([
      "Downloads[0].FileGeneratedDate",
      "10/9/2026 12:00:00 AM",
    ]);
  });

  it("are null for a page without the form", () => {
    expect(
      formFields('<form action="/Search"></form>', GIAS.collatePath),
    ).toBeNull();
  });
});

describe("downloadGiasZip", () => {
  it("waits while GIAS makes the file", async () => {
    let asked = 0;
    const slow = ((url: string, init?: RequestInit) => {
      if (url === GENERATED && asked++ < 2) {
        return Promise.resolve(
          new Response("<h1>Generating your download</h1>"),
        );
      }
      return recordedSources(url, init);
    }) as typeof fetch;
    const said: string[] = [];

    const zip = await downloadGiasZip(slow, (message) => said.push(message), {
      ms: 0,
      times: 3,
    });

    expect(asked).toBe(3);
    expect(said).toEqual([
      "Waiting for Get Information about Schools to make the file…",
    ]);
    expect(zipEntries(zip).map(({ name }) => name)).toEqual([
      "edubasealldata20261009.csv",
    ]);
  });

  it("gives up if GIAS never makes it", async () => {
    const never = ((url: string, init?: RequestInit) =>
      url === GENERATED
        ? Promise.resolve(new Response("<h1>Generating your download</h1>"))
        : recordedSources(url, init)) as typeof fetch;

    await expect(
      downloadGiasZip(never, () => undefined, { ms: 0, times: 2 }),
    ).rejects.toThrow(/didn't make the file in 0 seconds/);
  });

  it("says so if GIAS refuses the form", async () => {
    const refusing = ((url: string, init?: RequestInit) =>
      url === `${GIAS.site}${GIAS.collatePath}`
        ? Promise.resolve(new Response("An error occurred", { status: 500 }))
        : recordedSources(url, init)) as typeof fetch;

    await expect(downloadGiasZip(refusing, () => undefined)).rejects.toThrow(
      /Get Information about Schools answered 500 for https:\/\/get-information-schools\.service\.gov\.uk\/Downloads\/Collate/,
    );
  });
});

describe("zipEntries", () => {
  it("reads a zip's files", async () => {
    const [csv] = zipEntries(await fixture("gias-extract.zip"));

    expect(csv?.name).toBe("edubasealldata20261009.csv");
    expect(csv?.read().subarray(0, 6).toString()).toBe('"URN",');
  });

  it("refuses what isn't a zip", () => {
    expect(() => zipEntries(Buffer.from("not a zip at all, honestly"))).toThrow(
      /Not a zip file/,
    );
  });
});
