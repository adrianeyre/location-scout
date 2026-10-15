import {
  LAND_PARCEL_RULES,
  countsHomes,
  type ConstraintShape,
  type NearbyPlanningApplications,
  type PlanningApplications,
} from "@location-scout/shared";

import { placeShape } from "../shapes";

/**
 * A Land Opportunity's nearby development activity (PRD FR-5.4): the
 * Planning Applications within `withinMetres` of its outline, among the
 * Search Area's `applications`, with the approved and the major ones
 * highlighted, nearest first, and the homes the approved and pending ones
 * propose, estimated. Only the Search Area's applications are known, so
 * none beyond its edge is counted. While they are queued or unavailable,
 * so is this.
 */
export const nearbyPlanningApplications = (
  shape: ConstraintShape,
  applications: PlanningApplications,
  withinMetres: number = LAND_PARCEL_RULES.developmentActivityMetres,
): NearbyPlanningApplications => {
  const { status, provider, features } = applications;
  if (status !== "ok") {
    return { status, provider: provider.name, withinMetres, found: null };
  }
  const near = features
    .map((application) => ({
      application,
      // From the application's point to the land's outline: 0 inside it.
      distanceMetres: placeShape(shape, application.location).distanceMetres,
    }))
    .filter(({ distanceMetres }) => distanceMetres <= withinMetres)
    .sort((a, b) => a.distanceMetres - b.distanceMetres);
  return {
    status,
    provider: provider.name,
    withinMetres,
    found: {
      count: near.length,
      approved: near.filter(
        ({ application }) => application.status === "approved",
      ).length,
      major: near.filter(
        ({ application }) => application.applicationType === "major",
      ).length,
      estimatedHomes: near
        .filter(({ application }) => countsHomes(application.status))
        .reduce(
          (sum, { application }) => sum + (application.estimatedHomes ?? 0),
          0,
        ),
      highlighted: near
        .filter(
          ({ application }) =>
            application.status === "approved" ||
            application.applicationType === "major",
        )
        .map(({ application, distanceMetres }) => ({
          id: application.id,
          reference: application.reference,
          address: application.address,
          description: application.description,
          status: application.status,
          applicationType: application.applicationType,
          receivedOn: application.receivedOn,
          estimatedHomes: application.estimatedHomes,
          distanceMetres,
        })),
    },
  };
};
