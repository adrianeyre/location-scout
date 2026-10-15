import { describe, expect, it } from "vitest";

import type { Feature } from "@location-scout/shared";

import { FeatureClusters, groupSites, type Bounds } from "./feature-clusters";

const feature = (id: string, lat: number, lng: number): Feature => ({
  id,
  location: { lat, lng },
  distanceMetres: 0,
});

/** All of England, and more. */
const EVERYWHERE: Bounds = [-180, -85, 180, 85];

/** Three crimes at one point, one nearby, and one across town. */
const features = [
  feature("a", 53.1237, -1.2641),
  feature("b", 53.1237, -1.2641),
  feature("c", 53.1237, -1.2641),
  feature("d", 53.1238, -1.2642),
  feature("e", 53.13, -1.25),
];

const countOf = (items: ReturnType<FeatureClusters<Feature>["itemsIn"]>) =>
  items.reduce(
    (sum, item) =>
      sum + (item.kind === "cluster" ? item.count : item.features.length),
    0,
  );

describe("groupSites", () => {
  it("puts Features at the same point together, in the order first seen", () => {
    expect(
      groupSites(features).map(({ features: here }) =>
        here.map(({ id }) => id),
      ),
    ).toEqual([["a", "b", "c"], ["d"], ["e"]]);
  });
});

describe("FeatureClusters", () => {
  const clusters = new FeatureClusters(features);

  it("clusters nearby Features when zoomed out, counting every Feature", () => {
    const items = clusters.itemsIn(EVERYWHERE, 10);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "cluster", count: 5 });
  });

  it("splits clusters apart as the map zooms in", () => {
    const items = clusters.itemsIn(EVERYWHERE, 15);

    expect(items.map(({ kind }) => kind).sort()).toEqual(["cluster", "site"]);
    expect(countOf(items)).toBe(5);
  });

  it("shows every site on its own when zoomed right in, keeping Features at one point together", () => {
    const items = clusters.itemsIn(EVERYWHERE, 20);

    expect(items.every(({ kind }) => kind === "site")).toBe(true);
    expect(
      items.map((item) => (item.kind === "site" ? item.features.length : 0)),
    ).toEqual(expect.arrayContaining([3, 1, 1]) as unknown);
  });

  it("says the zoom at which a cluster splits apart", () => {
    const [cluster] = clusters.itemsIn(EVERYWHERE, 10);
    if (cluster?.kind !== "cluster") throw new Error("expected a cluster");

    const split = clusters.itemsIn(EVERYWHERE, cluster.expansionZoom);
    expect(split.length).toBeGreaterThan(1);
  });

  it("shows only what is in view", () => {
    const aroundE: Bounds = [-1.251, 53.129, -1.249, 53.131];

    expect(clusters.itemsIn(aroundE, 20)).toEqual([
      {
        kind: "site",
        key: "53.13,-1.25",
        location: { lat: 53.13, lng: -1.25 },
        features: [features[4]],
      },
    ]);
  });

  it("shows nothing for a Layer with no Features", () => {
    expect(new FeatureClusters([]).itemsIn(EVERYWHERE, 14)).toEqual([]);
  });
});
