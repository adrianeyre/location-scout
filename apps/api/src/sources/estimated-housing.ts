import {
  ESTIMATED_HOUSING_RULES,
  countsHomes,
  estimatedResidents,
  type EstimatedHousing,
  type PlanningApplicationFeature,
  type PlanningApplicationStatus,
} from "@location-scout/shared";

import { proposedHomes, type ProposedHomes } from "./dwellings";

/*
 * The homes Planning Applications would bring, estimated from their
 * descriptions (PRD FR-2.2), and each one's potential impact, by fixed
 * rules. Everything here is labelled "estimated" where it is shown.
 */

/** A Planning Application as its provider maps it, before its homes are estimated. */
export type ProviderApplication = Omit<
  PlanningApplicationFeature,
  "estimatedHomes" | "impact"
>;

const homesText = (homes: number) =>
  `${homes.toLocaleString("en-GB")} new ${homes === 1 ? "home" : "homes"}`;

const residentsText = (homes: number) => {
  const residents = estimatedResidents(homes);
  return `about ${residents.toLocaleString("en-GB")} more ${residents === 1 ? "resident" : "residents"}`;
};

/** Why homes a decided application proposed are not expected. */
const NOT_EXPECTED: Partial<Record<PlanningApplicationStatus, string>> = {
  refused: "it was refused",
  withdrawn: "it was withdrawn",
};

/**
 * A Planning Application's potential impact, by a fixed rule from the homes
 * its description proposes, its status and its type (PRD FR-2.2):
 * "Potential impact, estimated: 6 new homes, about 14 more residents, if it
 * is approved and built."
 */
export const potentialImpact = (
  proposed: ProposedHomes,
  {
    status,
    applicationType,
  }: Pick<PlanningApplicationFeature, "status" | "applicationType">,
): string => {
  const said = (text: string) => `Potential impact, estimated: ${text}`;
  const notExpected = NOT_EXPECTED[status];
  if (proposed?.kind === "counted") {
    const { homes } = proposed;
    if (notExpected) {
      return said(
        `no new homes, as ${notExpected}. It proposed ${homesText(homes)}.`,
      );
    }
    const scheme =
      homes >= ESTIMATED_HOUSING_RULES.majorHomes
        ? `a major housing scheme of ${homesText(homes)}`
        : homesText(homes);
    if (status === "approved") {
      return said(`${scheme}, ${residentsText(homes)}, once built.`);
    }
    if (status === "pending") {
      return said(
        `${scheme}, ${residentsText(homes)}, if it is approved and built.`,
      );
    }
    return said(
      `${scheme} proposed, but no decision is known, so they aren't counted.`,
    );
  }
  if (proposed?.kind === "unstated") {
    return notExpected
      ? said(`no new homes, as ${notExpected}.`)
      : said(
          "it proposes homes, but its description doesn't say how many, so none are counted.",
        );
  }
  return applicationType === "householder"
    ? said("no new homes: it alters an existing home.")
    : said("no new homes in its description.");
};

/** A Planning Application with the new homes its description proposes, and its potential impact. */
export const withEstimatedHomes = (
  application: ProviderApplication,
): PlanningApplicationFeature => {
  const proposed = proposedHomes(
    application.description,
    application.councilType,
  );
  return {
    ...application,
    estimatedHomes: proposed?.kind === "counted" ? proposed.homes : null,
    impact: potentialImpact(proposed, application),
  };
};

/**
 * The homes the approved and pending applications propose, and the
 * residents they would bring (PRD FR-2.2): "N homes approved or pending →
 * about N × 2.4 extra residents".
 */
export const estimatedHousing = (
  features: readonly PlanningApplicationFeature[],
): EstimatedHousing => {
  const homesOf = (status: PlanningApplicationStatus) =>
    features
      .filter((feature) => feature.status === status)
      .reduce((sum, { estimatedHomes }) => sum + (estimatedHomes ?? 0), 0);
  const counted = features.filter(({ status }) => countsHomes(status));
  const approved = homesOf("approved");
  const pending = homesOf("pending");
  return {
    approved,
    pending,
    homes: approved + pending,
    residents: estimatedResidents(approved + pending),
    applications: counted.filter(({ estimatedHomes }) => estimatedHomes).length,
    unstated: counted.filter(
      ({ estimatedHomes, description, councilType }) =>
        estimatedHomes === null &&
        proposedHomes(description, councilType)?.kind === "unstated",
    ).length,
  };
};
