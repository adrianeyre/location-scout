import { describe, expect, it } from "vitest";

import type {
  ConstraintShape,
  PlanningApplicationFeature,
  PlanningApplications,
} from "@location-scout/shared";

import { withEstimatedHomes } from "./estimated-housing";
import { nearbyPlanningApplications } from "./nearby-applications";

/** About 100 m square, near NG17 1AA. */
const LAND: ConstraintShape = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-1.26, 53.12],
        [-1.2585, 53.12],
        [-1.2585, 53.1209],
        [-1.26, 53.1209],
        [-1.26, 53.12],
      ],
    ],
  ],
};

const application = (
  id: string,
  [lat, lng]: [number, number],
  change: Partial<PlanningApplicationFeature>,
): PlanningApplicationFeature =>
  withEstimatedHomes({
    id,
    location: { lat, lng },
    distanceMetres: 0,
    reference: id,
    authority: "Ashfield",
    description: "Single storey rear extension",
    address: null,
    postcode: null,
    status: "approved",
    applicationType: "minor",
    councilType: null,
    receivedOn: "2025-08-20",
    decidedOn: null,
    approximate: false,
    url: null,
    providerUrl: null,
    ...change,
  });

const FEATURES = [
  // On the land.
  application("on-it", [53.1204, -1.2592], {
    applicationType: "major",
    description: "Erection of 120 dwellings",
  }),
  // About 200 m east of it.
  application("east", [53.1204, -1.2555], {
    status: "pending",
    description: "Erection of 4 dwellings",
  }),
  // About 450 m north of it.
  application("north", [53.12495, -1.2592], {
    status: "refused",
    applicationType: "major",
    description: "Erection of 30 dwellings",
  }),
  // About 600 m south of it.
  application("south", [53.1146, -1.2592], {
    description: "Erection of 10 dwellings",
  }),
];

const applications = (
  change: Partial<PlanningApplications> = {},
): PlanningApplications => ({
  status: "ok",
  provider: {
    id: "planit",
    name: "PlanIt",
    url: "https://www.planit.org.uk/",
    note: "Planning Applications come from PlanIt.",
  },
  period: { from: "2023-10-09", to: "2026-10-08" },
  features: FEATURES,
  statistics: null,
  ...change,
});

describe("nearbyPlanningApplications", () => {
  it("counts those within 500 m of the land, highlighting the approved and major ones, nearest first", () => {
    const nearby = nearbyPlanningApplications(LAND, applications());

    expect(nearby).toMatchObject({
      status: "ok",
      provider: "PlanIt",
      withinMetres: 500,
      found: {
        count: 3,
        approved: 1,
        major: 2,
        // The approved 120 and the pending 4: the refused 30 aren't counted.
        estimatedHomes: 124,
      },
    });
    const highlighted = nearby.found?.highlighted ?? [];
    expect(highlighted.map(({ id }) => id)).toEqual(["on-it", "north"]);
    expect(highlighted[0]).toEqual({
      id: "on-it",
      reference: "on-it",
      address: null,
      description: "Erection of 120 dwellings",
      status: "approved",
      applicationType: "major",
      receivedOn: "2025-08-20",
      estimatedHomes: 120,
      distanceMetres: 0,
    });
    expect(highlighted[1]?.distanceMetres).toBeGreaterThan(440);
    expect(highlighted[1]?.distanceMetres).toBeLessThan(460);
  });

  it("counts within the distance given", () => {
    expect(
      nearbyPlanningApplications(LAND, applications(), 250).found,
    ).toMatchObject({ count: 2, approved: 1, major: 1, estimatedHomes: 124 });
  });

  it("finds none where there are none", () => {
    expect(
      nearbyPlanningApplications(LAND, applications({ features: [] })).found,
    ).toEqual({
      count: 0,
      approved: 0,
      major: 0,
      estimatedHomes: 0,
      highlighted: [],
    });
  });

  it.each(["queued", "unavailable"] as const)(
    "is %s while the Planning Applications are",
    (status) => {
      expect(
        nearbyPlanningApplications(
          LAND,
          applications({ status, features: [] }),
        ),
      ).toEqual({ status, provider: "PlanIt", withinMetres: 500, found: null });
    },
  );
});
