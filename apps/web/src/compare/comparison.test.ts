import { describe, expect, it } from "vitest";

import type {
  CategoryScore,
  CrimeLayerResponse,
  LayerResponse,
  PlanningLayerResponse,
  ScoresResponse,
  TransportLayerResponse,
} from "@location-scout/shared";

import type { SavedLocation } from "../saved/saved-locations";
import {
  loadingLayers,
  unavailableLayer,
  type LayerStates,
  type ScoresState,
} from "../useSearchArea";
import {
  KEY_STATISTICS,
  bestOf,
  sameSearchRadius,
  scoreRows,
  statisticRows,
  type ComparedColumn,
  type ComparedFigure,
} from "./comparison";

const saved = (id: string, radius: SavedLocation["radius"] = 0.5) =>
  ({
    id,
    name: id,
    savedAt: "2026-10-09T09:15:00.000Z",
    location: { lat: 53.123664, lng: -1.264078 },
    radius,
    mode: "general",
    weights: null,
    found: null,
  }) satisfies SavedLocation;

const ok = (value: number | null, text = String(value)): ComparedFigure => ({
  status: "ok",
  value,
  text,
});

const crime = (
  last12Months: number,
  change: number | null,
  complete = true,
): CrimeLayerResponse => ({
  layer: "crime",
  status: "ok",
  sources: [],
  features: [],
  statistics: {
    month: "2026-08",
    total: 10,
    byCategory: [],
    trend: {
      last12Months: { from: "2025-09", to: "2026-08" },
      previous12Months: { from: "2024-09", to: "2025-08" },
      complete,
      missingMonths: complete ? [] : ["2026-01"],
      total: { last12Months, previous12Months: 100, change },
      byCategory: [],
    },
  },
});

const transport = (
  busStops: number,
  stationMetres: number | null,
): TransportLayerResponse => ({
  layer: "transport",
  status: "ok",
  sources: [],
  features: [],
  statistics: {
    facilities: [
      { type: "railway-station", count: 0 },
      { type: "bus-stop", count: busStops },
      { type: "car-park", count: 0 },
      { type: "ev-charger", count: 0 },
    ],
    routes: [],
    nearestStation:
      stationMetres === null
        ? null
        : {
            id: "node/1",
            name: "Sutton Parkway",
            distanceMetres: stationMetres,
            inSearchArea: false,
          },
    stationSearchMetres: 5000,
  },
});

const PLANIT = {
  id: "planit",
  name: "PlanIt",
  url: "https://www.planit.org.uk/",
  note: "",
};

const planning = (
  atLocation: number,
  applications: { count: number; homes: number } | "queued" | "unavailable",
): PlanningLayerResponse => ({
  layer: "planning",
  status: "ok",
  sources: [],
  features: [],
  statistics: {
    byType: [],
    coveringLocation: Array.from({ length: atLocation }, (_, index) => ({
      type: "conservation-area" as const,
      name: `Conservation area ${String(index + 1)}`,
    })),
  },
  applications: {
    status: typeof applications === "string" ? applications : "ok",
    provider: PLANIT,
    period: { from: "2023-10-09", to: "2026-10-08" },
    features: [],
    statistics:
      typeof applications === "string"
        ? null
        : {
            count: applications.count,
            total: applications.count,
            approximate: 0,
            byStatus: [],
            byType: [],
            major: [],
            housing: {
              approved: applications.homes,
              pending: 0,
              homes: applications.homes,
              residents: applications.homes * 2.4,
              applications: 1,
              unstated: 0,
            },
          },
  },
});

/** Every Layer unavailable, but those given. */
const layers = (...given: LayerResponse[]): LayerStates => {
  const states = Object.fromEntries(
    Object.keys(loadingLayers()).map((id) => [
      id,
      unavailableLayer(id as keyof LayerStates),
    ]),
  ) as LayerStates;
  for (const layer of given) states[layer.layer] = layer;
  return states;
};

const category = (
  id: CategoryScore["id"],
  score: number | null,
  status: CategoryScore["status"] = "ok",
): CategoryScore => ({
  id,
  layer:
    id === "safety" ? "crime" : id === "transport" ? "transport" : "planning",
  status,
  score,
  breakdown: [],
});

const scored = (
  location: number | null,
  categories: CategoryScore[],
): ScoresState => {
  const scores: ScoresResponse = {
    mode: "general",
    categories,
    location: { score: location, counted: [], leftOut: [] },
  };
  return { status: "ok", scores };
};

const column = (
  id: string,
  {
    radius = 0.5,
    states = layers(),
    scores = { status: "loading" },
  }: {
    radius?: SavedLocation["radius"];
    states?: LayerStates;
    scores?: ScoresState;
  } = {},
): ComparedColumn => ({
  saved: saved(id, radius),
  layers: states,
  scores,
  highlights: { status: "loading" },
});

const rowOf = (rows: ReturnType<typeof statisticRows>, id: string) => {
  const found = rows.find((row) => row.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
};

describe("bestOf", () => {
  it("marks the highest where higher is better, and the lowest where lower is", () => {
    const figures = [ok(62), ok(53), ok(70)];
    expect(bestOf(figures, "higher")).toEqual([false, false, true]);
    expect(bestOf(figures, "lower")).toEqual([false, true, false]);
  });

  it("marks every column that shares the best value", () => {
    expect(bestOf([ok(80), ok(53), ok(80), ok(12)], "higher")).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("marks none where every figure is the same, or fewer than two can be compared", () => {
    expect(bestOf([ok(62), ok(62)], "higher")).toEqual([false, false]);
    expect(
      bestOf(
        [ok(62), { status: "unavailable" }, ok(null, "Not known")],
        "higher",
      ),
    ).toEqual([false, false, false]);
    expect(
      bestOf([{ status: "loading" }, { status: "loading" }], "lower"),
    ).toEqual([false, false]);
  });

  it("marks none in a row that isn't judged", () => {
    expect(bestOf([ok(182000), ok(150000)], null)).toEqual([false, false]);
  });

  it("counts none found within the distance looked as further than any found", () => {
    expect(
      bestOf(
        [ok(Number.POSITIVE_INFINITY, "None within 5.0 km"), ok(1600)],
        "lower",
      ),
    ).toEqual([false, true]);
  });
});

describe("statisticRows", () => {
  it("gives a row for every key statistic, in order", () => {
    expect(
      statisticRows([column("A"), column("B")]).map(({ name }) => name),
    ).toEqual(KEY_STATISTICS.map(({ name }) => name));
  });

  it("compares each Layer's figures, marking the fewest crimes, the most bus stops and the nearest station", () => {
    const rows = statisticRows([
      column("A", {
        states: layers(crime(1234, 23.4), transport(58, null)),
      }),
      column("B", {
        states: layers(crime(310, -8.3), transport(12, 1600)),
      }),
      column("C", {
        states: layers(crime(980, null), transport(30, 640)),
      }),
    ]);

    expect(rowOf(rows, "crimes")).toMatchObject({
      better: "lower",
      figures: [ok(1234, "1,234"), ok(310), ok(980)],
      best: [false, true, false],
    });
    expect(rowOf(rows, "crime-change")).toMatchObject({
      figures: [ok(23.4, "+23.4%"), ok(-8.3, "-8.3%"), ok(null, "Not known")],
      best: [false, true, false],
    });
    expect(rowOf(rows, "bus-stops")).toMatchObject({
      figures: [ok(58), ok(12), ok(30)],
      best: [true, false, false],
    });
    expect(rowOf(rows, "station")).toMatchObject({
      figures: [
        ok(Number.POSITIVE_INFINITY, "None within 5.0 km"),
        ok(1600, "1.6 km"),
        ok(640, "640 m"),
      ],
      best: [false, false, true],
    });
  });

  it("compares distances as they read, so two that read the same are the same", () => {
    const rows = statisticRows([
      column("A", { states: layers(transport(58, 104)) }),
      column("B", { states: layers(transport(5, 97)) }),
      column("C", { states: layers(transport(5, 1640)) }),
    ]);
    expect(rowOf(rows, "station")).toMatchObject({
      figures: [ok(100, "100 m"), ok(100, "100 m"), ok(1600, "1.6 km")],
      best: [true, true, false],
    });
  });

  it("doesn't compare a count of crimes with months missing", () => {
    const rows = statisticRows([
      column("A", { states: layers(crime(1234, null, false)) }),
      column("B", { states: layers(crime(310, null)) }),
    ]);
    expect(rowOf(rows, "crimes")).toMatchObject({
      figures: [ok(null, "1,234 (months missing)"), ok(310)],
      best: [false, false],
    });
  });

  it("says why a Layer has no figure: loading, unavailable, not prepared or outside a Land Coverage Area", () => {
    const outside = {
      ...unavailableLayer("land"),
      status: "not-prepared",
      notCovered: [{ code: "E07000174", name: "Mansfield" }],
    } as LayerResponse;
    const rows = statisticRows([
      column("A", { states: loadingLayers() }),
      column("B", {
        states: layers(
          { ...unavailableLayer("schools"), status: "not-prepared" },
          outside,
        ),
      }),
    ]);
    expect(rowOf(rows, "primary").figures).toEqual([
      { status: "loading" },
      { status: "not-prepared" },
    ]);
    expect(rowOf(rows, "land-opportunities").figures).toEqual([
      { status: "loading" },
      { status: "outside-coverage" },
    ]);
    expect(rowOf(rows, "amenities").figures).toEqual([
      { status: "loading" },
      { status: "unavailable" },
    ]);
  });

  it("gives the Planning Constraints at the Location and the Planning Applications, which wait apart for their provider's turn", () => {
    const rows = statisticRows([
      column("A", { states: layers(planning(1, { count: 126, homes: 50 })) }),
      column("B", { states: layers(planning(0, "queued")) }),
      column("C", { states: layers(planning(2, "unavailable")) }),
    ]);
    expect(rowOf(rows, "constraints")).toMatchObject({
      figures: [ok(1), ok(0), ok(2)],
      best: [false, true, false],
    });
    expect(rowOf(rows, "applications")).toMatchObject({
      better: null,
      figures: [ok(126), { status: "queued" }, { status: "unavailable" }],
    });
    expect(rowOf(rows, "homes").figures).toEqual([
      ok(50),
      { status: "queued" },
      { status: "unavailable" },
    ]);
  });

  it("marks no count of what is in Search Areas of different sizes, but still the nearest station", () => {
    const columns = [
      column("A", { radius: 0.5, states: layers(transport(58, 1600)) }),
      column("B", { radius: 1, states: layers(transport(90, 640)) }),
    ];
    expect(sameSearchRadius(columns)).toBe(false);
    const rows = statisticRows(columns);
    expect(rowOf(rows, "bus-stops")).toMatchObject({
      better: null,
      best: [false, false],
    });
    expect(rowOf(rows, "station").best).toEqual([false, true]);
  });
});

describe("scoreRows", () => {
  const a = scored(62, [category("safety", 70), category("transport", 88)]);
  const b = scored(53, [
    category("safety", null, "unavailable"),
    category("transport", 92),
  ]);

  it("gives the Location Score, then each Category Score the Scout Mode weighs, the highest marked best", () => {
    const rows = scoreRows(
      [column("A", { scores: a }), column("B", { scores: b })],
      ["safety", "transport"],
      null,
    );
    expect(rows.map(({ name }) => name)).toEqual([
      "Location Score",
      "Safety",
      "Transport",
    ]);
    expect(rows.map(({ figures }) => figures)).toEqual([
      [ok(62), ok(53)],
      [ok(70), { status: "unavailable" }],
      [ok(88), ok(92)],
    ]);
    expect(rows.map(({ best }) => best)).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it("weighs each Location Score again by the user's own weights", () => {
    const rows = scoreRows(
      [column("A", { scores: a }), column("B", { scores: b })],
      ["safety", "transport"],
      { safety: 0, transport: 100 },
    );
    expect(rows[0]).toMatchObject({
      figures: [ok(88), ok(92)],
      best: [false, true],
    });
  });

  it("says how many Category Scores a Location Score is weighed from when some are left out", () => {
    const leftOut: ScoresState = {
      status: "ok",
      scores: {
        mode: "general",
        categories: [
          category("safety", null, "unavailable"),
          category("transport", 80),
        ],
        location: {
          score: 80,
          counted: [
            { id: "transport", score: 80, weight: 15, share: 100, points: 80 },
          ],
          leftOut: [
            { id: "safety", layer: "crime", status: "unavailable", weight: 25 },
          ],
        },
      },
    };
    const [location] = scoreRows(
      [column("A", { scores: a }), column("B", { scores: leftOut })],
      ["safety", "transport"],
      null,
    );
    expect(location).toMatchObject({
      figures: [ok(62), ok(80, "80 (1 of 2 Category Scores)")],
      best: [false, true],
    });
  });

  it("says when the scores are loading or unavailable, or a Category Score waits for Planning Applications", () => {
    const rows = scoreRows(
      [
        column("A"),
        column("B", { scores: { status: "unavailable" } }),
        column("C", {
          scores: scored(60, [
            category("development-activity", null, "queued"),
          ]),
        }),
      ],
      ["development-activity"],
      null,
    );
    expect(rows.map(({ figures }) => figures)).toEqual([
      [{ status: "loading" }, { status: "unavailable" }, ok(60)],
      [{ status: "loading" }, { status: "unavailable" }, { status: "queued" }],
    ]);
  });
});
