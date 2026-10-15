import { Marker, Popup, type Map as MapLibreMap } from "maplibre-gl";

import type { ServedLayerId } from "@location-scout/shared";

import { creditText, type Credit, type FeatureCredits } from "../attribution";
import { formatCount, formatDistance } from "../format";
import type { StreetViewTarget } from "../street-view/StreetViewPanel";
import {
  LAYER_STYLES,
  featuresNoun,
  type LayerFeature,
} from "../layers/layer-styles";
import {
  FeatureClusters,
  type Bounds,
  type MapItem,
  type Site,
} from "./feature-clusters";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The Layer's icon, drawn in white (PRD FR-9.3). */
const iconElement = (path: string) => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("feature-icon");
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
};

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) => {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
};

/**
 * Features the Scout Mode highlights, such as its competitors (PRD FR-4.3),
 * drawn apart from the rest of their Layer and marked as such.
 */
export interface MarkerHighlight {
  /** What one is, and several are: "competitor", "competitors". */
  noun: readonly [string, string];
  /** What its popup says about it: "★ Competitor in the Business: Café Scout Mode". */
  note: string;
}

const capitalised = (text: string) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const distanceText = (site: Site<LayerFeature>) => {
  const [first] = site.features;
  return `${formatDistance(first?.distanceMetres ?? 0)} from the Location`;
};

/** Opens the Street View panel at a point (PRD FR-2.13). */
export type OpenStreetView = (target: StreetViewTarget) => void;

/**
 * What the Street View panel calls the Features at one point: their Layer,
 * and as their marker is labelled, the one's title and first line or how
 * many there are.
 */
const streetViewName = (layer: ServedLayerId, site: Site<LayerFeature>) => {
  const style = LAYER_STYLES[layer];
  const [only, ...others] = site.features;
  const what =
    only && others.length === 0
      ? [style.details(only).title, ...style.details(only).lines.slice(0, 1)]
      : [formatCount(site.features.length, featuresNoun(layer, site.features))];
  return `${style.name}: ${what.join(", ")}`;
};

/** A credit, its links opening apart from the map, as the popup's other links do. */
const creditElement = (credit: Credit) => {
  const paragraph = element("p", "feature-popup-credit");
  for (const part of credit) {
    if (typeof part === "string") {
      paragraph.append(part);
      continue;
    }
    const link = element("a", "", part.text);
    link.href = part.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    paragraph.append(link);
  }
  return paragraph;
};

/**
 * What a popup says about the Features at one point: each one's details and
 * their distance from the Location (PRD FR-2.10), with `credits`, those of
 * the Data Sources they come from, once each (§6.15), and, with
 * `onStreetView`, a button that opens Street View there (FR-2.13).
 */
export const popupContent = (
  layer: ServedLayerId,
  site: Site<LayerFeature>,
  highlight: MarkerHighlight | null = null,
  onStreetView: OpenStreetView | null = null,
  credits: FeatureCredits | null = null,
): HTMLElement => {
  const style = LAYER_STYLES[layer];
  const popup = element("section", "feature-popup");
  popup.dataset.layer = layer;
  popup.style.setProperty("--layer-colour", style.colour);

  const heading = element("h2", "feature-popup-layer", style.name);
  heading.prepend(iconElement(style.icon));
  popup.append(heading);
  if (highlight) {
    popup.append(element("p", "feature-popup-highlight", highlight.note));
  }
  if (site.features.length > 1) {
    popup.append(
      element(
        "p",
        "feature-popup-count",
        `${formatCount(site.features.length, featuresNoun(layer, site.features))} at this point`,
      ),
    );
  }

  const list = element("ul", "feature-popup-list");
  for (const feature of site.features) {
    const { title, lines, lists, notes, links } = style.details(feature);
    const item = element("li", "");
    item.append(element("strong", "", title));
    for (const line of lines) item.append(element("span", "", line));
    for (const sublist of lists ?? []) {
      const items = element("ul", "feature-popup-sublist");
      items.setAttribute("aria-label", sublist.name);
      for (const text of sublist.items) items.append(element("li", "", text));
      item.append(
        element("span", "feature-popup-sublist-name", sublist.name),
        items,
      );
    }
    for (const note of notes ?? []) {
      item.append(element("span", "feature-popup-item-note", note));
    }
    for (const { name, url } of links ?? []) {
      const link = element("a", "feature-popup-link", name);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link);
    }
    list.append(item);
  }
  popup.append(list);

  popup.append(element("p", "feature-popup-distance", distanceText(site)));
  if (style.popupNote) {
    popup.append(element("p", "feature-popup-note", style.popupNote));
  }
  const given = new Map<string, Credit>();
  for (const feature of site.features) {
    for (const credit of credits?.(feature) ?? []) {
      given.set(creditText(credit), credit);
    }
  }
  for (const credit of given.values()) popup.append(creditElement(credit));
  if (onStreetView) {
    const button = element(
      "button",
      "feature-popup-street-view",
      "Street View here",
    );
    button.type = "button";
    button.addEventListener("click", (event) => {
      // The map would take a click that reaches it as a new Location.
      event.stopPropagation();
      onStreetView({
        location: site.location,
        name: streetViewName(layer, site),
      });
    });
    popup.append(button);
  }
  return popup;
};

/**
 * What a marker is called by a screen reader, and as its tooltip. A
 * highlighted one says what it is first: "Competitor: Costa, Café, …".
 */
const markerLabel = (
  layer: ServedLayerId,
  item: MapItem<LayerFeature>,
  highlight: MarkerHighlight | null,
  clustered: readonly [string, string],
) => {
  const style = LAYER_STYLES[layer];
  if (item.kind === "cluster") {
    return `${formatCount(item.count, highlight?.noun ?? clustered)} clustered: zoom in`;
  }
  const noun = highlight?.noun ?? featuresNoun(layer, item.features);
  const [only, ...others] = item.features;
  const what =
    only && others.length === 0
      ? [style.details(only).title, ...style.details(only).lines.slice(0, 1)]
      : [formatCount(item.features.length, noun)];
  const label = [...what, distanceText(item)].join(", ");
  return highlight && only && others.length === 0
    ? `${capitalised(highlight.noun[0])}: ${label}`
    : label;
};

/**
 * One Layer's Features on the map, clustered (PRD FR-9.3). Each cluster and
 * each point is a button, so it can be reached by keyboard (FR-9.5): a cluster
 * zooms in until it splits apart, and a point opens a popup about its
 * Features. The markers are redrawn whenever the map stops moving. With a
 * `highlight`, they are the Features a Scout Mode highlights, clustered only
 * with one another and marked with a ★. With `onStreetView`, each popup
 * can open Street View at its point. With `credits`, each popup credits the
 * Data Sources of the Features in it.
 */
export class FeatureMarkers {
  readonly #map: MapLibreMap;
  readonly #layer: ServedLayerId;
  readonly #clusters: FeatureClusters<LayerFeature>;
  readonly #highlight: MarkerHighlight | null;
  readonly #onStreetView: OpenStreetView | null;
  readonly #credits: FeatureCredits | null;
  /** What the Features it clusters are called, as they are all of a kind. */
  readonly #noun: readonly [string, string];
  readonly #markers = new Map<string, Marker>();
  #popup: Popup | null = null;

  constructor(
    map: MapLibreMap,
    layer: ServedLayerId,
    features: readonly LayerFeature[],
    highlight: MarkerHighlight | null = null,
    onStreetView: OpenStreetView | null = null,
    credits: FeatureCredits | null = null,
  ) {
    this.#map = map;
    this.#layer = layer;
    this.#highlight = highlight;
    this.#onStreetView = onStreetView;
    this.#credits = credits;
    this.#noun = featuresNoun(layer, features);
    this.#clusters = new FeatureClusters(features);
    map.on("moveend", this.update);
    this.update();
  }

  /** Shows the clusters and points in view at the map's zoom. */
  readonly update = () => {
    const bounds = this.#map.getBounds();
    const view: Bounds = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const items = this.#clusters.itemsIn(view, this.#map.getZoom());
    const shown = new Set(items.map(({ key }) => key));
    let focusLost = false;
    for (const [key, marker] of this.#markers) {
      if (shown.has(key)) continue;
      focusLost ||= marker.getElement().contains(document.activeElement);
      marker.remove();
      this.#markers.delete(key);
    }
    for (const item of items) {
      if (this.#markers.has(item.key)) continue;
      const { lat, lng } = item.location;
      const marker = new Marker({ element: this.#button(item) })
        .setLngLat([lng, lat])
        .addTo(this.#map);
      this.#markers.set(item.key, marker);
    }
    // A marker redrawn away, such as a cluster zoomed into, leaves the focus
    // on the map, rather than lost at the top of the page (PRD FR-9.5).
    if (focusLost) this.#map.getCanvas().focus();
  };

  /** Takes every marker and popup off the map. */
  remove() {
    this.#map.off("moveend", this.update);
    for (const marker of this.#markers.values()) marker.remove();
    this.#markers.clear();
    this.#popup?.remove();
    this.#popup = null;
  }

  #button(item: MapItem<LayerFeature>) {
    const style = LAYER_STYLES[this.#layer];
    const button = element(
      "button",
      item.kind === "cluster" ? "feature-cluster" : "feature-marker",
    );
    button.type = "button";
    button.dataset.layer = this.#layer;
    // A point may be coloured by what it marks; a cluster is the Layer's colour.
    button.style.setProperty(
      "--layer-colour",
      item.kind === "site"
        ? (style.markerColour?.(item.features) ?? style.colour)
        : style.colour,
    );
    if (this.#highlight) {
      button.dataset.highlighted = "";
      const star = element("span", "feature-marker-highlight", "★");
      star.setAttribute("aria-hidden", "true");
      button.append(star);
    }
    const label = markerLabel(this.#layer, item, this.#highlight, this.#noun);
    button.setAttribute("aria-label", label);
    button.title = label;

    if (item.kind === "cluster") {
      button.dataset.count = String(item.count);
      button.prepend(item.count.toLocaleString("en-GB"));
      // Bigger clusters are drawn bigger: 30, 36 or 42 pixels across.
      button.dataset.size =
        item.count < 10 ? "small" : item.count < 100 ? "medium" : "large";
    } else {
      button.dataset.count = String(item.features.length);
      button.append(iconElement(style.icon));
      if (item.features.length > 1) {
        button.append(
          element("span", "feature-marker-count", String(item.features.length)),
        );
      }
      const label = style.label?.(item.features);
      if (label) button.append(element("span", "feature-marker-label", label));
    }

    button.addEventListener("click", (event) => {
      // The map would take a click that reaches it as a new Location.
      event.stopPropagation();
      if (item.kind === "cluster") {
        this.#map.easeTo({
          center: [item.location.lng, item.location.lat],
          zoom: item.expansionZoom,
        });
      } else {
        this.#open(item, button);
      }
    });
    return button;
  }

  /**
   * Opens a popup about a point, which takes the focus. Escape closes it,
   * and closing it from inside, with Escape or its cross, gives the focus
   * back to its marker, so a keyboard isn't left at the top of the page
   * (PRD FR-9.5).
   */
  #open(site: Site<LayerFeature>, marker: HTMLButtonElement) {
    this.#popup?.remove();
    const { lat, lng } = site.location;
    // Narrow enough on a phone to fit beside a marker on either half of the map.
    const popup = new Popup({
      offset: 16,
      maxWidth: "min(18rem, calc(100vw - 8rem))",
    })
      .setLngLat([lng, lat])
      .setDOMContent(
        popupContent(
          this.#layer,
          site,
          this.#highlight,
          this.#onStreetView,
          this.#credits,
        ),
      )
      .addTo(this.#map);
    popup.getElement().addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      popup.remove();
    });
    // Closed with the focus in it, which went with it to the top of the page.
    popup.on("close", () => {
      const lost =
        document.activeElement === null ||
        document.activeElement === document.body;
      if (lost && marker.isConnected) marker.focus();
    });
    this.#popup = popup;
  }
}
