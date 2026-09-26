import { assertPosition, resolve } from "./annotations.js";
import { el, text, type SvgNode } from "./svg.js";
import type { Point, Position, Pressure, PressureCentre, Size } from "./types.js";

/**
 * The weather layer: a pressure field built from centres, and its isobars.
 *
 * Isobars are contours of a field this package does not ship and never will —
 * there is no pressure anywhere in Natural Earth. So the field is made from what
 * the caller places: a 1013 hPa baseline that each centre pulls down or up
 * around itself, fading with distance on the ground. The contours of that are
 * the chart. Two centres near each other produce a trough or a ridge between
 * them because the field is a sum, not because anyone drew one.
 *
 * The field is sampled on a grid in user units, not in degrees, for the reason
 * the dot lattice in the plan gives: the lines are drawn on the paper, and a
 * lattice in longitude and latitude would crowd toward the poles and bend with
 * the projection. Each grid node is inverted to the ground, the field is read
 * there, and the pixel keeps the answer. A node off the globe has no ground and
 * no value, and the contouring treats it as a hole.
 */

/** Standard atmosphere at sea level, and the pressure a centre departs from. */
const BASELINE = 1013;
/** @see PressureCentre.radius */
const DEFAULT_RADIUS = 1200;
const DEFAULT_INTERVAL = 4;
/**
 * Grid spacing in user units.
 *
 * Coarse enough to be cheap — a 1000 × 1000 canvas is under 30,000 nodes — and
 * fine enough that the linear interpolation between nodes reads as a curve. The
 * smoothing pass does the rest.
 */
const STEP = 6;
/** An isobar shorter than this, in user units, is not given a value. */
const LABEL_MIN_LENGTH = 140;
/** Earth's mean radius, for turning angular distance into kilometres. */
const EARTH_KM = 6371;
const RADIANS = Math.PI / 180;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Distance in kilometres and initial bearing in radians from `a` to `b`. */
function distanceAndBearing(a: Position, b: Position): [number, number] {
  const lat1 = a[1] * RADIANS;
  const lat2 = b[1] * RADIANS;
  const dLon = (b[0] - a[0]) * RADIANS;
  const cosC =
    Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const angle = Math.acos(Math.max(-1, Math.min(1, cosC)));
  const bearing = Math.atan2(
    Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon),
  );
  return [angle * EARTH_KM, bearing];
}

/**
 * Pressure at a place, in hectopascals.
 *
 * Each centre adds a Gaussian bump of its own depth — `value - 1013` — whose
 * width is its radius, stretched along its axis. A sum rather than a maximum,
 * so neighbouring systems deepen the gradient between them, which is what makes
 * the isobars crowd where a real chart's do.
 */
export function pressureAt(centres: readonly PressureCentre[], at: Position): number {
  let value = BASELINE;
  for (const centre of centres) {
    const [distance, bearing] = distanceAndBearing(centre.at, at);
    const radius = centre.radius ?? DEFAULT_RADIUS;
    const stretch = centre.stretch ?? 1;
    const turn = bearing - (centre.angle ?? 0) * RADIANS;
    const along = (distance * Math.cos(turn)) / (radius * stretch);
    const across = (distance * Math.sin(turn)) / radius;
    value += (centre.value - BASELINE) * Math.exp(-(along * along + across * across));
  }
  return value;
}

function assertCentre(centre: PressureCentre, index: number): void {
  assertPosition(centre.at, index, "pressure.centres", "at");
  const where = `masen: pressure.centres[${index}]`;
  if (!Number.isFinite(centre.value) || centre.value < 850 || centre.value > 1100) {
    throw new Error(`${where}.value must be a pressure in hectopascals, got ${centre.value}`);
  }
  for (const field of ["radius", "stretch"] as const) {
    const value = centre[field];
    if (value !== undefined && !(Number.isFinite(value) && value > 0)) {
      throw new Error(`${where}.${field} must be a positive number, got ${value}`);
    }
  }
}

/** The field sampled on a grid over the canvas. `NaN` where there is no ground. */
interface Grid {
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  /** Row-major, `ys.length` rows of `xs.length`. */
  readonly values: Float64Array;
}

function axis(extent: number): number[] {
  const out: number[] = [];
  for (let at = 0; at < extent; at += STEP) out.push(at);
  out.push(extent);
  return out;
}

function sample(
  centres: readonly PressureCentre[],
  invert: (point: Point) => Position | null,
  [width, height]: Size,
): Grid {
  const xs = axis(width);
  const ys = axis(height);
  const values = new Float64Array(xs.length * ys.length);
  ys.forEach((y, row) => {
    xs.forEach((x, column) => {
      const ground = invert([x, y]);
      values[row * xs.length + column] = ground === null ? Number.NaN : pressureAt(centres, ground);
    });
  });
  return { xs, ys, values };
}

/**
 * One isobar level as polylines, by marching squares.
 *
 * Every crossing is keyed by the grid edge it lies on, not by its coordinates,
 * so the two cells sharing an edge agree on the point exactly and the pieces
 * join without a tolerance. A cell with a hole at any corner draws nothing, so
 * a line reaching the limb of a globe stops there rather than running along it.
 */
function contour(grid: Grid, level: number): { points: Point[]; closed: boolean }[] {
  const { xs, ys, values } = grid;
  const columns = xs.length;
  const at = (column: number, row: number): number => values[row * columns + column] as number;

  const crossings = new Map<string, Point>();
  const links = new Map<string, string[]>();

  // Where the level crosses the edge between two nodes, keyed by that edge.
  const crossing = (c0: number, r0: number, c1: number, r1: number): string => {
    const key = `${c0},${r0},${c1},${r1}`;
    if (!crossings.has(key)) {
      const v0 = at(c0, r0);
      const v1 = at(c1, r1);
      const t = v1 === v0 ? 0.5 : (level - v0) / (v1 - v0);
      const x0 = xs[c0] as number;
      const y0 = ys[r0] as number;
      crossings.set(key, [
        x0 + t * ((xs[c1] as number) - x0),
        y0 + t * ((ys[r1] as number) - y0),
      ]);
    }
    return key;
  };
  const link = (a: string, b: string): void => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };

  for (let row = 0; row < ys.length - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const tl = at(column, row);
      const tr = at(column + 1, row);
      const br = at(column + 1, row + 1);
      const bl = at(column, row + 1);
      if (Number.isNaN(tl) || Number.isNaN(tr) || Number.isNaN(br) || Number.isNaN(bl)) continue;

      const top = (): string => crossing(column, row, column + 1, row);
      const right = (): string => crossing(column + 1, row, column + 1, row + 1);
      const bottom = (): string => crossing(column, row + 1, column + 1, row + 1);
      const left = (): string => crossing(column, row, column, row + 1);

      const index =
        (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
      switch (index) {
        case 0:
        case 15:
          break;
        case 1:
        case 14:
          link(left(), bottom());
          break;
        case 2:
        case 13:
          link(bottom(), right());
          break;
        case 3:
        case 12:
          link(left(), right());
          break;
        case 4:
        case 11:
          link(top(), right());
          break;
        case 6:
        case 9:
          link(top(), bottom());
          break;
        case 7:
        case 8:
          link(left(), top());
          break;
        // The two saddles: opposite corners above the level. The middle of the
        // cell decides whether the high corners are joined across it or cut off.
        case 5:
        case 10: {
          const middleHigh = (tl + tr + br + bl) / 4 >= level;
          const tlHigh = index === 10;
          if (middleHigh === tlHigh) {
            link(left(), bottom());
            link(top(), right());
          } else {
            link(left(), top());
            link(bottom(), right());
          }
          break;
        }
      }
    }
  }

  // Walk the links into lines. Open lines start at an end, so they are taken
  // first; whatever is left over is a ring.
  const seen = new Set<string>();
  const lines: { points: Point[]; closed: boolean }[] = [];
  const walk = (start: string): { points: Point[]; closed: boolean } => {
    const keys = [start];
    seen.add(start);
    let current = start;
    for (;;) {
      const next = (links.get(current) ?? []).find((key) => !seen.has(key));
      if (next === undefined) break;
      seen.add(next);
      keys.push(next);
      current = next;
    }
    const closed = keys.length > 2 && (links.get(current) ?? []).includes(start);
    return { points: keys.map((key) => crossings.get(key) as Point), closed };
  };
  for (const [key, neighbours] of links) {
    if (neighbours.length === 1 && !seen.has(key)) lines.push(walk(key));
  }
  for (const key of links.keys()) {
    if (!seen.has(key)) lines.push(walk(key));
  }
  return lines;
}

/**
 * One pass of Chaikin corner-cutting.
 *
 * Marching squares on a grid gives a line that is right to within a cell and
 * visibly faceted at pin size. Two passes round it into the drawn curve a chart
 * has without moving it more than a fraction of a cell. The ends of an open
 * line are kept, so a line that met the frame still meets it.
 */
function smooth(points: readonly Point[], closed: boolean): Point[] {
  if (points.length < 3) return [...points];
  const out: Point[] = closed ? [] : [points[0] as Point];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = points[i] as Point;
    const b = points[(i + 1) % points.length] as Point;
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
    out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
  }
  if (!closed) out.push(points[points.length - 1] as Point);
  return out;
}

function lengthOf(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/**
 * The point halfway along a line, by length, and the line's direction there.
 *
 * The direction is in degrees and kept between -90 and 90, so a value written
 * along the line is never upside down, whichever way the contour was walked.
 */
function midpoint(points: readonly Point[]): { at: Point; angle: number } {
  let remaining = lengthOf(points) / 2;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const piece = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (piece >= remaining && piece > 0) {
      const t = remaining / piece;
      let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      return { at: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], angle };
    }
    remaining -= piece;
  }
  return { at: points[points.length - 1] as Point, angle: 0 };
}

function pathOf(points: readonly Point[], closed: boolean): string {
  const [first, ...rest] = points;
  if (first === undefined) return "";
  const body = rest.map((p) => `L${round(p[0])},${round(p[1])}`).join("");
  return `M${round(first[0])},${round(first[1])}${body}${closed ? "Z" : ""}`;
}

/**
 * What the pressure option draws, split by the layer it belongs in.
 *
 * The isobars and their values are context and go in `.mp-weather`, under the
 * names, so a line never strikes through a city. The H and L marks are the
 * point of the chart and a coordinate the caller placed, which is what the
 * annotation layer is for — drawn there, under the names they would otherwise
 * disappear beneath on the first render, which put "Belarus" across an H.
 */
export interface WeatherLayer {
  readonly lines: readonly SvgNode[];
  readonly marks: readonly SvgNode[];
}

/**
 * Build the weather layer.
 *
 * Isobars first, then the values written on them, so a value's halo breaks
 * every line it sits across rather than only its own.
 */
export function weatherLayer(
  pressure: Pressure,
  project: (position: Position) => Point | null,
  invert: (point: Point) => Position | null,
  size: Size,
): WeatherLayer {
  const centres = pressure.centres;
  centres.forEach(assertCentre);
  const interval = pressure.interval ?? DEFAULT_INTERVAL;
  if (!(Number.isFinite(interval) && interval > 0)) {
    throw new Error(`masen: pressure.interval must be a positive number, got ${interval}`);
  }
  if (centres.length === 0) return { lines: [], marks: [] };

  const grid = sample(centres, invert, size);
  let low = Infinity;
  let high = -Infinity;
  for (const value of grid.values) {
    if (Number.isNaN(value)) continue;
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  if (low === Infinity) return { lines: [], marks: [] };

  // Levels are multiples of the interval, so 4 hPa draws 1008, 1012, 1016 and
  // never 1013 — the baseline itself is flat and has no line to draw.
  const lines: SvgNode[] = [];
  const values: SvgNode[] = [];
  for (let level = Math.ceil(low / interval) * interval; level <= high; level += interval) {
    for (const line of contour(grid, level)) {
      if (line.points.length < 2) continue;
      const points = smooth(smooth(line.points, line.closed), line.closed);
      lines.push(
        el("path", {
          class: "mp-isobar",
          "data-value": level,
          fill: "none",
          d: pathOf(points, line.closed),
        }),
      );
      if (pressure.labels !== false && lengthOf(points) >= LABEL_MIN_LENGTH) {
        // Written along the line, the way a chart has it: the halo breaks the
        // stroke under the number, so the value reads as part of the line.
        const { at, angle } = midpoint(points);
        const [x, y] = at;
        values.push(
          el(
            "text",
            {
              class: "mp-label",
              "data-kind": "isobar",
              x: round(x),
              y: round(y),
              transform: `rotate(${round(angle)} ${round(x)} ${round(y)})`,
              "text-anchor": "middle",
              "dominant-baseline": "central",
            },
            [text(String(level))],
          ),
        );
      }
    }
  }

  const marks: SvgNode[] = [];
  centres.forEach((centre, index) => {
    const point = resolve(centre.at, index, "pressure.centres", project, invert);
    if (point === null) return;
    const [x, y] = point;
    const kind = centre.value < BASELINE ? "low" : "high";
    marks.push(
      el("g", { class: "mp-pressure", "data-kind": kind, "data-id": centre.id }, [
        el(
          "text",
          {
            class: "mp-pressure-mark",
            "data-kind": kind,
            x: round(x),
            y: round(y),
            "text-anchor": "middle",
            "dominant-baseline": "central",
          },
          [text(kind === "low" ? "L" : "H")],
        ),
        el(
          "text",
          {
            class: "mp-label",
            "data-kind": "pressure",
            x: round(x),
            y: round(y + 22),
            "text-anchor": "middle",
            "dominant-baseline": "central",
          },
          [text(String(Math.round(centre.value)))],
        ),
      ]),
    );
  });

  return { lines: [...lines, ...values], marks };
}
