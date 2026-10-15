import { useId, useState, type ReactNode } from "react";

import { niceTicks, share } from "./dashboard-data";

/**
 * The Dashboard's charts. Each bar chart is a table, its bars drawn in its
 * cells, so it reads the same with or without sight: every figure is text,
 * and the bars only show at a glance what the figures say (PRD FR-9.5). Bars
 * and lines are in the theme's accent, one hue for one series; parts of a
 * whole are in the colours the map draws them in, each named in a key.
 */

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  /** The value as written, such as "£182,000" or "12%". */
  shown: string;
  /** Said after the value, such as how many sales a median is of. */
  note?: ReactNode;
}

/**
 * A bar chart as a table: a row for each, its label, a bar as long as its
 * value against the largest (or `max`), and the value written at the bar's tip.
 */
export const BarTable = ({
  caption,
  label,
  value,
  rows,
  max,
}: {
  caption: string;
  /** The column headings, read out, though the bars stand in for them. */
  label: string;
  value: string;
  rows: readonly BarRow[];
  max?: number;
}) => {
  const largest = max ?? Math.max(0, ...rows.map((row) => row.value));
  return (
    <table className="bar-table">
      <caption className="visually-hidden">{caption}</caption>
      <thead className="visually-hidden">
        <tr>
          <th scope="col">{label}</th>
          <th scope="col">{value}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} data-empty={row.value === 0 || undefined}>
            <th scope="row">{row.label}</th>
            <td>
              <span className="bar-cell">
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar"
                    style={{
                      inlineSize: `${String(share(row.value, largest))}%`,
                    }}
                  />
                </span>
                <span className="bar-value">{row.shown}</span>
              </span>
              {row.note && <span className="bar-note">{row.note}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export interface Part {
  key: string;
  name: string;
  count: number;
  colour: string;
}

/**
 * Parts of a whole as one bar, a surface gap between its segments, and a
 * key under it naming each part with its count and share, which is the text
 * the bar draws.
 */
export const PartsBar = ({
  label,
  parts,
  unit,
}: {
  label: string;
  parts: readonly Part[];
  /** What is counted, such as "applications", for the key's totals. */
  unit: string;
}) => {
  const total = parts.reduce((sum, { count }) => sum + count, 0);
  if (total === 0) return <p className="chart-none">None to show.</p>;
  return (
    <figure className="parts">
      <div className="parts-bar" aria-hidden="true">
        {parts
          .filter(({ count }) => count > 0)
          .map(({ key, count, colour }) => (
            <span
              key={key}
              style={{ flexGrow: count, backgroundColor: colour }}
            />
          ))}
      </div>
      <figcaption className="visually-hidden">
        {label}: {String(total)} {unit} in all
      </figcaption>
      <ul className="parts-key" aria-label={label}>
        {parts.map(({ key, name, count, colour }) => (
          <li key={key} data-empty={count === 0 || undefined}>
            <span
              className="parts-swatch"
              style={{ backgroundColor: colour }}
              aria-hidden="true"
            />
            <span className="parts-name">{name}</span>
            <span className="parts-count">
              {String(count)}
              <span className="parts-share">
                {" "}
                ({Math.round((count / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
};

/**
 * A score out of 100 as an arc, the figure inside it: the Dashboard's one
 * hero figure. The arc is decoration; the figure says the score.
 */
export const ScoreGauge = ({
  score,
  label,
}: {
  score: number | null;
  label: string;
}) => {
  // Three quarters of a circle, open at the bottom.
  const radius = 52;
  const length = 2 * Math.PI * radius * 0.75;
  const filled = score === null ? 0 : (length * score) / 100;
  return (
    <div className="gauge">
      <svg viewBox="0 0 128 128" aria-hidden="true" focusable="false">
        <circle
          className="gauge-track"
          cx="64"
          cy="64"
          r={radius}
          strokeDasharray={`${String(length)} 999`}
          transform="rotate(135 64 64)"
        />
        {score !== null && score > 0 && (
          <circle
            className="gauge-fill"
            cx="64"
            cy="64"
            r={radius}
            strokeDasharray={`${String(filled)} 999`}
            transform="rotate(135 64 64)"
          />
        )}
      </svg>
      <p className="gauge-figure">
        <span className="gauge-value">{score ?? "–"}</span>
        <span className="gauge-out-of">/100</span>
        <span className="visually-hidden"> {label}</span>
      </p>
    </div>
  );
};

/** One headline figure, what it is, and optionally how it has changed. */
export const StatTile = ({
  label,
  value,
  icon,
  delta,
  detail,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  /** The change, said in words; its arrow points up or down. */
  delta?: { text: string; direction: "up" | "down" | "flat" } | null;
  detail?: ReactNode;
}) => (
  <div className="stat-tile">
    <dt>
      {icon}
      {label}
    </dt>
    <dd className="stat-value">{value}</dd>
    {delta && (
      <dd className="stat-delta" data-direction={delta.direction}>
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path
            d={
              delta.direction === "flat"
                ? "M2 6h8"
                : delta.direction === "up"
                  ? "M6 10V2M2.5 5.5 6 2l3.5 3.5"
                  : "M6 2v8M2.5 6.5 6 10l3.5-3.5"
            }
          />
        </svg>
        {delta.text}
      </dd>
    )}
    {detail && <dd className="stat-detail">{detail}</dd>}
  </div>
);

/**
 * Where a value sits on a scale with a marked point, such as an area's
 * income against England's median: a bar for the value, a tick for the mark.
 */
export const Bullet = ({
  value,
  mark,
  max,
  valueLabel,
  markLabel,
}: {
  value: number;
  mark: number;
  max: number;
  valueLabel: string;
  markLabel: string;
}) => (
  <div className="bullet">
    <div className="bullet-track" aria-hidden="true">
      <span
        className="bullet-bar"
        style={{ inlineSize: `${String(share(value, max))}%` }}
      />
      <span
        className="bullet-mark"
        style={{ insetInlineStart: `${String(share(mark, max))}%` }}
      />
    </div>
    <ul className="bullet-key">
      <li>
        <span className="bullet-key-bar" aria-hidden="true" />
        {valueLabel}
      </li>
      <li>
        <span className="bullet-key-mark" aria-hidden="true" />
        {markLabel}
      </li>
    </ul>
  </div>
);

/**
 * The ten deprivation deciles, 1 the most deprived, with the range across
 * the Search Area shaded and the Location's own decile marked.
 */
export const DecileScale = ({
  lowest,
  highest,
  at,
}: {
  lowest: number;
  highest: number;
  at: number | null;
}) => (
  <div className="deciles" aria-hidden="true">
    {Array.from({ length: 10 }, (_, index) => {
      const decile = index + 1;
      return (
        <span
          key={decile}
          className="decile"
          data-in-range={(decile >= lowest && decile <= highest) || undefined}
          data-at={decile === at || undefined}
        >
          {decile}
        </span>
      );
    })}
  </div>
);

/**
 * Two figures for each category, a period before and the latest, drawn as a
 * dumbbell: a hollow dot for before, a filled one for now, joined by a line.
 */
export const Dumbbell = ({
  caption,
  rows,
  beforeLabel,
  afterLabel,
}: {
  caption: string;
  rows: readonly {
    key: string;
    label: string;
    before: number;
    after: number;
    change: string;
  }[];
  beforeLabel: string;
  afterLabel: string;
}) => {
  const max = Math.max(
    1,
    ...rows.flatMap(({ before, after }) => [before, after]),
  );
  return (
    <>
      <ul className="dumbbell-key" aria-hidden="true">
        <li>
          <span className="dumbbell-dot" data-before />
          {beforeLabel}
        </li>
        <li>
          <span className="dumbbell-dot" />
          {afterLabel}
        </li>
      </ul>
      <table className="dumbbell">
        <caption className="visually-hidden">{caption}</caption>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Category</th>
            <th scope="col">{beforeLabel}</th>
            <th scope="col">{afterLabel}</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, before, after, change }) => {
            const from = share(Math.min(before, after), max);
            const to = share(Math.max(before, after), max);
            return (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td className="dumbbell-plot">
                  <span className="visually-hidden">{before}</span>
                  <span className="dumbbell-track" aria-hidden="true">
                    <span
                      className="dumbbell-line"
                      style={{
                        insetInlineStart: `${String(from)}%`,
                        inlineSize: `${String(to - from)}%`,
                      }}
                    />
                    <span
                      className="dumbbell-dot"
                      data-before
                      style={{
                        insetInlineStart: `${String(share(before, max))}%`,
                      }}
                    />
                    <span
                      className="dumbbell-dot"
                      style={{
                        insetInlineStart: `${String(share(after, max))}%`,
                      }}
                    />
                  </span>
                </td>
                <td className="dumbbell-after">{after}</td>
                <td className="dumbbell-change">{change}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
};

export interface LinePoint {
  key: string;
  /** Where it is along the x-axis, such as a year. */
  x: number;
  y: number;
  xLabel: string;
  yLabel: string;
  /** More for the tooltip, such as how many sales a median is of. */
  note?: string;
}

const PLOT = {
  width: 420,
  height: 180,
  top: 12,
  right: 12,
  bottom: 26,
  left: 48,
};

/**
 * One series over time: a 2 px line with a dot at each point, a hairline
 * grid, and, under the pointer or keyboard focus, a crosshair and a tooltip
 * for the nearest point. The table after it gives every point in words.
 */
export const LineChart = ({
  label,
  points,
  formatTick,
  xHeading,
  yHeading,
}: {
  label: string;
  points: readonly LinePoint[];
  formatTick: (value: number) => string;
  xHeading: string;
  yHeading: string;
}) => {
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  if (points.length === 0) return <p className="chart-none">None to show.</p>;
  const ticks = niceTicks(Math.max(...points.map(({ y }) => y)));
  const top = ticks.at(-1) ?? 1;
  const xs = points.map(({ x }) => x);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const innerWidth = PLOT.width - PLOT.left - PLOT.right;
  const innerHeight = PLOT.height - PLOT.top - PLOT.bottom;
  const xAt = (x: number) =>
    PLOT.left +
    (maxX === minX
      ? innerWidth / 2
      : ((x - minX) / (maxX - minX)) * innerWidth);
  const yAt = (y: number) => PLOT.top + innerHeight - (y / top) * innerHeight;
  const path = points
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? "M" : "L"}${String(xAt(x))} ${String(yAt(y))}`,
    )
    .join(" ");
  const shown = active === null ? null : points[active];
  const nearest = (clientX: number, box: DOMRect) => {
    const x = ((clientX - box.left) / box.width) * PLOT.width;
    let best = 0;
    points.forEach((point, index) => {
      const here = Math.abs(xAt(point.x) - x);
      const there = Math.abs(xAt(points[best]?.x ?? 0) - x);
      if (here < there) best = index;
    });
    return best;
  };
  return (
    <figure className="line-chart">
      <div className="line-chart-plot">
        <svg
          viewBox={`0 0 ${String(PLOT.width)} ${String(PLOT.height)}`}
          role="img"
          aria-label={`${label}. Each point is also in the table that follows.`}
          aria-describedby={tableId}
          tabIndex={0}
          onPointerMove={(event) => {
            setActive(
              nearest(
                event.clientX,
                event.currentTarget.getBoundingClientRect(),
              ),
            );
          }}
          onPointerLeave={() => {
            setActive(null);
          }}
          onFocus={() => {
            setActive(points.length - 1);
          }}
          onBlur={() => {
            setActive(null);
          }}
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : 0;
            if (step === 0) return;
            event.preventDefault();
            setActive((index) =>
              Math.max(0, Math.min(points.length - 1, (index ?? 0) + step)),
            );
          }}
        >
          {ticks.map((tick) => (
            <g key={tick} className="line-chart-grid">
              <line
                x1={PLOT.left}
                x2={PLOT.width - PLOT.right}
                y1={yAt(tick)}
                y2={yAt(tick)}
              />
              <text
                x={PLOT.left - 8}
                y={yAt(tick)}
                dy="0.32em"
                textAnchor="end"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {points.map(({ key, x, xLabel }) => (
            <text
              key={key}
              className="line-chart-x"
              x={xAt(x)}
              y={PLOT.height - 8}
              textAnchor="middle"
            >
              {xLabel}
            </text>
          ))}
          <path
            className="line-chart-area"
            d={`${path} L${String(xAt(maxX))} ${String(yAt(0))} L${String(xAt(minX))} ${String(yAt(0))} Z`}
          />
          <path className="line-chart-line" d={path} />
          {shown && (
            <line
              className="line-chart-crosshair"
              x1={xAt(shown.x)}
              x2={xAt(shown.x)}
              y1={PLOT.top}
              y2={PLOT.top + innerHeight}
            />
          )}
          {points.map(({ key, x, y }, index) => (
            <circle
              key={key}
              className="line-chart-dot"
              data-active={index === active || undefined}
              cx={xAt(x)}
              cy={yAt(y)}
              r={index === active ? 6 : 4}
            />
          ))}
        </svg>
        {shown && (
          <div
            className="chart-tooltip"
            role="status"
            style={{
              insetInlineStart: `${String((xAt(shown.x) / PLOT.width) * 100)}%`,
              insetBlockStart: `${String((yAt(shown.y) / PLOT.height) * 100)}%`,
            }}
          >
            <strong>{shown.xLabel}</strong>
            <span>{shown.yLabel}</span>
            {shown.note && (
              <span className="chart-tooltip-note">{shown.note}</span>
            )}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show as a table</summary>
        <table id={tableId} className="layer-statistics">
          <caption className="visually-hidden">{label}</caption>
          <thead>
            <tr>
              <th scope="col">{xHeading}</th>
              <th scope="col">{yHeading}</th>
            </tr>
          </thead>
          <tbody>
            {points.map(({ key, xLabel, yLabel, note }) => (
              <tr key={key}>
                <th scope="row">{xLabel}</th>
                <td>
                  {yLabel}
                  {note && <span className="score-rule">{note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
};
