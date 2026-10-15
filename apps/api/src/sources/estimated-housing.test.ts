import { describe, expect, it } from "vitest";

import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import { NG17_1AA_PLANIT } from "../testing/planit-recordings";
import {
  estimatedHousing,
  potentialImpact,
  withEstimatedHomes,
  type ProviderApplication,
} from "./estimated-housing";
import { yearsUpTo } from "./land-registry";
import { mapApplications } from "./planit";

/** A minor application, approved, as a provider maps it. */
const application = (
  change: Partial<ProviderApplication> = {},
): ProviderApplication => ({
  id: "Ashfield/V/2025/0320",
  location: { lat: 53.124817, lng: -1.25829 },
  distanceMetres: 408,
  reference: "V/2025/0320",
  authority: "Ashfield",
  description: "Outline application with all matters reserved for 4 dwellings",
  address: "19 Portland Street, Sutton In Ashfield, Nottinghamshire, NG17 4AW",
  postcode: "NG17 4AW",
  status: "approved",
  applicationType: "minor",
  councilType: null,
  receivedOn: "2025-08-20",
  decidedOn: "2025-11-28",
  approximate: true,
  url: null,
  providerUrl: null,
  ...change,
});

const counted = (homes: number) => ({ kind: "counted" as const, homes });

describe("potentialImpact", () => {
  it.each([
    [
      "approved",
      "Potential impact, estimated: 4 new homes, about 10 more residents, once built.",
    ],
    [
      "pending",
      "Potential impact, estimated: 4 new homes, about 10 more residents, if it is approved and built.",
    ],
    [
      "refused",
      "Potential impact, estimated: no new homes, as it was refused. It proposed 4 new homes.",
    ],
    [
      "withdrawn",
      "Potential impact, estimated: no new homes, as it was withdrawn. It proposed 4 new homes.",
    ],
    [
      "other",
      "Potential impact, estimated: 4 new homes proposed, but no decision is known, so they aren't counted.",
    ],
  ] as const)("says what homes a %s application brings", (status, text) => {
    expect(
      potentialImpact(counted(4), { status, applicationType: "minor" }),
    ).toBe(text);
  });

  it("calls 10 homes or more a major housing scheme, and 1 a home", () => {
    expect(
      potentialImpact(counted(10), {
        status: "approved",
        applicationType: "major",
      }),
    ).toBe(
      "Potential impact, estimated: a major housing scheme of 10 new homes, about 24 more residents, once built.",
    );
    expect(
      potentialImpact(counted(9), {
        status: "approved",
        applicationType: "minor",
      }),
    ).toBe(
      "Potential impact, estimated: 9 new homes, about 22 more residents, once built.",
    );
    expect(
      potentialImpact(counted(1), {
        status: "pending",
        applicationType: "minor",
      }),
    ).toBe(
      "Potential impact, estimated: 1 new home, about 2 more residents, if it is approved and built.",
    );
  });

  it("says when homes are proposed without a number", () => {
    expect(
      potentialImpact(
        { kind: "unstated" },
        { status: "approved", applicationType: "minor" },
      ),
    ).toBe(
      "Potential impact, estimated: it proposes homes, but its description doesn't say how many, so none are counted.",
    );
    expect(
      potentialImpact(
        { kind: "unstated" },
        { status: "refused", applicationType: "minor" },
      ),
    ).toBe("Potential impact, estimated: no new homes, as it was refused.");
  });

  it("says a householder application alters an existing home, and any other proposes none", () => {
    expect(
      potentialImpact(null, {
        status: "approved",
        applicationType: "householder",
      }),
    ).toBe(
      "Potential impact, estimated: no new homes: it alters an existing home.",
    );
    expect(
      potentialImpact(null, { status: "pending", applicationType: "major" }),
    ).toBe("Potential impact, estimated: no new homes in its description.");
  });
});

describe("withEstimatedHomes", () => {
  it("adds the homes its description proposes, and its potential impact", () => {
    expect(withEstimatedHomes(application())).toEqual({
      ...application(),
      estimatedHomes: 4,
      impact:
        "Potential impact, estimated: 4 new homes, about 10 more residents, once built.",
    });
  });

  it("gives no homes where it proposes none, or doesn't say how many", () => {
    expect(
      withEstimatedHomes(
        application({ description: "Single storey rear extension" }),
      ).estimatedHomes,
    ).toBeNull();
    expect(
      withEstimatedHomes(
        application({
          description: "Change of use from commercial to residential",
        }),
      ).estimatedHomes,
    ).toBeNull();
  });

  it("reads the council's own type, ignoring reserved matters", () => {
    expect(
      withEstimatedHomes(
        application({
          description: "Erection of 86 dwellings",
          councilType: "Reserved Matters",
        }),
      ).estimatedHomes,
    ).toBeNull();
  });
});

describe("estimatedHousing", () => {
  it("counts the homes approved and pending applications propose, and the residents they would bring", () => {
    const housing = estimatedHousing(
      [
        application(),
        application({
          status: "pending",
          description: "Erection of 86 dwellings",
        }),
        application({ status: "refused", description: "Erection of 5 flats" }),
        application({
          status: "withdrawn",
          description: "Erection of 3 flats",
        }),
        application({
          description:
            "Change of use from pet crematorium to residential units",
        }),
        application({
          status: "pending",
          description: "Single storey rear extension",
        }),
      ].map(withEstimatedHomes),
    );

    // 4 + 86 = 90 homes, × 2.4 = 216 residents.
    expect(housing).toEqual({
      approved: 4,
      pending: 86,
      homes: 90,
      residents: 216,
      applications: 2,
      unstated: 1,
    });
  });

  it("counts none where there are none", () => {
    expect(estimatedHousing([])).toEqual({
      approved: 0,
      pending: 0,
      homes: 0,
      residents: 0,
      applications: 0,
      unstated: 0,
    });
  });

  it("finds 50 homes approved or pending around NG17 1AA, about 120 more residents", () => {
    const [ng17] = NG17_1AA_PLANIT.values();
    const { features } = mapApplications(
      ng17,
      NG17_1AA_AREA,
      yearsUpTo("2026-10-08", 3),
    );

    expect(estimatedHousing(features.map(withEstimatedHomes))).toEqual({
      approved: 41,
      pending: 9,
      homes: 50,
      residents: 120,
      applications: 16,
      unstated: 2,
    });
  });
});
