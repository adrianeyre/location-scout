import Supercluster from "supercluster";

import type { Feature, Location } from "@location-scout/shared";

/**
 * Features placed at exactly the same point, as police crimes often are. They
 * can never be told apart by zooming in, so they are shown as one marker.
 */
export interface Site<F extends Feature> {
  key: string;
  location: Location;
  features: F[];
}

/** What a Layer shows on the map at one view: clusters and single sites. */
export type MapItem<F extends Feature> =
  | {
      kind: "cluster";
      key: string;
      location: Location;
      /** How many Features it holds. */
      count: number;
      /** The zoom at which it splits apart. */
      expansionZoom: number;
    }
  | ({ kind: "site" } & Site<F>);

/** West, south, east, north. */
export type Bounds = [number, number, number, number];

interface SiteProperties {
  site: number;
  count: number;
}

/** Sites within this many pixels of each other are clustered (PRD FR-9.3). */
const CLUSTER_RADIUS_PX = 48;

/** Beyond this zoom every site is shown on its own. */
const CLUSTER_MAX_ZOOM = 17;

const siteKey = ({ lat, lng }: Location) => `${String(lat)},${String(lng)}`;

/** Groups Features at the same point into sites, in the order first seen. */
export const groupSites = <F extends Feature>(
  features: readonly F[],
): Site<F>[] => {
  const sites = new Map<string, Site<F>>();
  for (const feature of features) {
    const key = siteKey(feature.location);
    const site = sites.get(key);
    if (site) site.features.push(feature);
    else
      sites.set(key, { key, location: feature.location, features: [feature] });
  }
  return [...sites.values()];
};

/**
 * Clusters one Layer's Features so a dense Layer stays readable (PRD FR-9.3).
 * Each cluster counts the Features in it, not the sites.
 */
export class FeatureClusters<F extends Feature> {
  readonly #sites: Site<F>[];
  readonly #index: Supercluster<SiteProperties, { count: number }>;

  constructor(features: readonly F[]) {
    this.#sites = groupSites(features);
    this.#index = new Supercluster<SiteProperties, { count: number }>({
      radius: CLUSTER_RADIUS_PX,
      maxZoom: CLUSTER_MAX_ZOOM,
      map: ({ count }) => ({ count }),
      reduce: (accumulated, { count }) => {
        accumulated.count += count;
      },
    });
    this.#index.load(
      this.#sites.map(({ location, features: here }, site) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [location.lng, location.lat] },
        properties: { site, count: here.length },
      })),
    );
  }

  /** The clusters and sites to show within `bounds` at `zoom`. */
  itemsIn(bounds: Bounds, zoom: number): MapItem<F>[] {
    return this.#index
      .getClusters(bounds, Math.floor(zoom))
      .flatMap((point): MapItem<F>[] => {
        const [lng = 0, lat = 0] = point.geometry.coordinates;
        const { properties } = point;
        if ("cluster" in properties) {
          return [
            {
              kind: "cluster",
              key: `cluster-${String(properties.cluster_id)}`,
              location: { lat, lng },
              count: properties.count,
              expansionZoom: this.#index.getClusterExpansionZoom(
                properties.cluster_id,
              ),
            },
          ];
        }
        const site = this.#sites[properties.site];
        return site ? [{ kind: "site", ...site }] : [];
      });
  }
}
