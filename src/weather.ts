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
/**
 * Where along an isobar its value may go, in the order they are tried.
 *
 * Halfway first. But the rings round one centre are all walked from the same
 * side, so their halfway points line up, and a deep low wrote its dozen values
 * in a single column, each on top of the next. A value that would touch one
 * already written moves along its own line instead, and a line with no room
 * anywhere goes without.
 */
const LABEL_STOPS = [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875];
/**
 * The room a value takes, as a circle: half its width at a place-label size of
 * 11, which is what four of the five themes set, plus a gap. A circle because
 * the value turns with its line and a circle does not care which way.
 */
const LABEL_RADIUS_PER_DIGIT = 3.4;
const LABEL_GAP = 3;
/**
 * The departures from normal, in hectopascals, at which the tint deepens a step
 * — eight steps, the last open-ended.
 *
 * Fixed in pressure rather than counted in isobars, so a band means the same
 * departure whatever interval the lines are drawn at. And stretching rather
 * than even, because charts live at both ends: a tropical low is 3 hPa under
 * normal and a typhoon 50. Even 4 hPa steps left the whole of a tropical chart
 * bare — an H of 1014 got no tint at all — while steps this fine all the way
 * down would flatten a typhoon's core into one colour ten rings out.
 */
const DEPTH_FROM = [1.5, 3, 5, 8, 12, 18, 26];
/** How far, in user units, thinning may move a line. A third of a pixel. */
const TOLERANCE = 0.3;
/**
 * The wind grid: an arrow every `WIND_SPACING` user units, none within
 * `WIND_CLEAR` of a letter, none below `WIND_CALM` knots.
 */
const WIND_SPACING = 44;
const WIND_CLEAR = 30;
const WIND_CALM = 3;
/** Air density at sea level, kg/m³, and the Earth's rotation, rad/s. */
const AIR = 1.2;
const OMEGA = 7.2921e-5;
/**
 * What friction does to the wind the isobars imply, near the ground: it slows
 * to about 0.7 of it and turns about 20° toward the lower pressure. Both vary
 * between sea and land; one value each is what an illustration needs.
 */
const SURFACE = 0.7;
const INFLOW = 20;
const KNOTS = 1.943844;
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
  /** Kept to find where the ground ends between two nodes. */
  readonly invert: (point: Point) => Position | null;
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
  return { xs, ys, values, invert };
}

/**
 * Where the ground ends between a node on it and a node off it: the limb of a
 * globe, found by halving the gap until it is far below a pixel.
 */
function limb(invert: (point: Point) => Position | null, on: Point, off: Point): Point {
  let inside = on;
  let outside = off;
  for (let i = 0; i < 16; i += 1) {
    const middle: Point = [(inside[0] + outside[0]) / 2, (inside[1] + outside[1]) / 2];
    if (invert(middle) === null) outside = middle;
    else inside = middle;
  }
  return inside;
}

interface Line {
  readonly points: Point[];
  readonly closed: boolean;
}

/**
 * One isobar level as polylines, by marching squares — or, with `fill`, the
 * outline of everywhere at or above it, as closed rings.
 *
 * Every crossing is keyed by the grid edge it lies on, not by its coordinates,
 * so the two cells sharing an edge agree on the point exactly and the pieces
 * join without a tolerance. For a line, a cell with a hole at any corner draws
 * nothing, so a line reaching the limb of a globe stops there rather than
 * running along it.
 *
 * A region has to close, so `fill` walks one ring of phantom nodes beyond the
 * grid and counts them, and every node off the globe, as below any level. The
 * edge of a region that runs off the canvas is then drawn half a step outside
 * it, where the viewport cuts it square, and the edge that runs off a globe is
 * drawn on the limb itself rather than a cell short of it.
 */
function contour(grid: Grid, level: number, fill = false): Line[] {
  const { xs, ys, values } = grid;
  const columns = xs.length;
  const rows = ys.length;
  const inGrid = (column: number, row: number): boolean =>
    column >= 0 && row >= 0 && column < columns && row < rows;
  const at = (column: number, row: number): number =>
    inGrid(column, row) ? (values[row * columns + column] as number) : Number.NaN;
  const place = (column: number, row: number): Point => [
    column < 0 ? -STEP : column >= columns ? (xs[columns - 1] as number) + STEP : (xs[column] as number),
    row < 0 ? -STEP : row >= rows ? (ys[rows - 1] as number) + STEP : (ys[row] as number),
  ];
  const above = (value: number): boolean => !Number.isNaN(value) && value >= level;

  const crossings = new Map<string, Point>();
  const links = new Map<string, string[]>();

  // Where the level crosses the edge between two nodes, keyed by that edge.
  const crossing = (c0: number, r0: number, c1: number, r1: number): string => {
    const key = `${c0},${r0},${c1},${r1}`;
    if (!crossings.has(key)) {
      const v0 = at(c0, r0);
      const v1 = at(c1, r1);
      const p0 = place(c0, r0);
      const p1 = place(c1, r1);
      let point: Point;
      if (!Number.isNaN(v0) && !Number.isNaN(v1)) {
        const t = v1 === v0 ? 0.5 : (level - v0) / (v1 - v0);
        point = [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])];
      } else {
        // Only a region reaches here: one end is the node inside it, and the
        // other is off the canvas or off the globe.
        const [on, off, offColumn, offRow] = Number.isNaN(v0) ? [p1, p0, c0, r0] : [p0, p1, c1, r1];
        point = inGrid(offColumn, offRow)
          ? limb(grid.invert, on, off)
          : [(on[0] + off[0]) / 2, (on[1] + off[1]) / 2];
      }
      crossings.set(key, point);
    }
    return key;
  };
  const link = (a: string, b: string): void => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };

  const first = fill ? -1 : 0;
  for (let row = first; row < rows - 1 - first; row += 1) {
    for (let column = first; column < columns - 1 - first; column += 1) {
      const tl = at(column, row);
      const tr = at(column + 1, row);
      const br = at(column + 1, row + 1);
      const bl = at(column, row + 1);
      if (!fill && (Number.isNaN(tl) || Number.isNaN(tr) || Number.isNaN(br) || Number.isNaN(bl))) {
        continue;
      }

      const top = (): string => crossing(column, row, column + 1, row);
      const right = (): string => crossing(column + 1, row, column + 1, row + 1);
      const bottom = (): string => crossing(column, row + 1, column + 1, row + 1);
      const left = (): string => crossing(column, row, column, row + 1);

      const index =
        (above(tl) ? 8 : 0) | (above(tr) ? 4 : 0) | (above(br) ? 2 : 0) | (above(bl) ? 1 : 0);
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
        // cell decides whether the high corners are joined across it or cut
        // off — the same answer for a line and a region, so a band's edge is
        // always the isobar drawn on it. A hole at a corner leaves the middle
        // undecided, and undecided is low.
        case 5:
        case 10: {
          const middleHigh = above((tl + tr + br + bl) / 4);
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
  const lines: Line[] = [];
  const walk = (start: string): Line => {
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

/**
 * Drop the points a line would pass within `TOLERANCE` of anyway, by
 * Douglas–Peucker.
 *
 * Smoothing quadruples the points, and most of them sit on a line that is
 * nearly straight at that scale — a band along the frame is a straight run of
 * hundreds. Measured on Europe at 800 × 700, the shading was 530 KB before this
 * and the isobars 114 KB, for a picture a third of a unit would not change.
 */
function simplify(points: readonly Point[], closed: boolean): Point[] {
  if (points.length < 4) return [...points];
  const keep = new Uint8Array(points.length);
  const distance = (p: Point, a: Point, b: Point): number => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / length;
  };
  // A ring has no ends to anchor on, so it is cut at its first point and the
  // point farthest from it, and each half is simplified as a line.
  let far = points.length - 1;
  if (closed) {
    const first = points[0] as Point;
    let most = -1;
    points.forEach((p, i) => {
      const d = Math.hypot(p[0] - first[0], p[1] - first[1]);
      if (d > most) {
        most = d;
        far = i;
      }
    });
  }
  const spans: [number, number][] = closed ? [[0, far], [far, points.length]] : [[0, far]];
  keep[0] = 1;
  keep[far] = 1;
  while (spans.length > 0) {
    const [start, end] = spans.pop() as [number, number];
    const a = points[start] as Point;
    const b = points[end % points.length] as Point;
    let worst = -1;
    let at = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = distance(points[i] as Point, a, b);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > TOLERANCE) {
      keep[at] = 1;
      spans.push([start, at], [at, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Smoothed, then thinned: the shape a contour is drawn in. */
function drawn(points: readonly Point[], closed: boolean): Point[] {
  return simplify(smooth(smooth(points, closed), closed), closed);
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
 * The point a fraction of the way along a line, by length, and the line's
 * direction there.
 *
 * The direction is in degrees and kept between -90 and 90, so a value written
 * along the line is never upside down, whichever way the contour was walked.
 */
function along(points: readonly Point[], fraction: number): { at: Point; angle: number } {
  let remaining = lengthOf(points) * fraction;
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
 * The tint between isobars, one path per band.
 *
 * A band is everywhere between two levels, and it is drawn as the rings of
 * both with the even-odd rule: the region above the lower level with the
 * region above the upper one cut out of it. So the bands never overlap, which
 * is what lets them be translucent — and each band's edge is the same ring its
 * neighbour's is cut by, so no ground is left between them.
 *
 * Only the band that holds normal pressure itself is left bare, where 1013
 * falls inside it rather than on its edge. Everything under it is the low's
 * colour and everything over it the high's, however faintly, so a weak system
 * is tinted out to the line where the chart turns — the tint does not stop
 * short of it and leave the system floating on bare ground.
 */
function shading(grid: Grid, levels: readonly number[], low: number, high: number): SvgNode[] {
  const rings = new Map<number, string>();
  const ringsAt = (level: number): string => {
    if (!rings.has(level)) {
      const outline = contour(grid, level, true)
        .filter((ring) => ring.points.length >= 3)
        .map((ring) => pathOf(drawn(ring.points, true), true))
        .join("");
      rings.set(level, outline);
    }
    return rings.get(level) as string;
  };

  const bands: SvgNode[] = [];
  // The first band starts at the ground itself, and the last runs to the top.
  const bounds = [-Infinity, ...levels, Infinity];
  for (let k = 0; k < bounds.length - 1; k += 1) {
    const from = bounds[k] as number;
    const to = bounds[k + 1] as number;
    if (from < BASELINE && to > BASELINE) continue;
    // A band the field never enters: the ground far from every centre reads
    // 1013 exactly, which puts it on the 1013 line and in no band below it.
    if (Math.min(to, high) <= Math.max(from, low)) continue;
    const middle = (Math.max(from, low) + Math.min(to, high)) / 2;
    const departure = Math.abs(middle - BASELINE);
    const depth = 1 + DEPTH_FROM.filter((step) => departure >= step).length;
    const d = ringsAt(from) + (to === Infinity ? "" : ringsAt(to));
    if (d === "") continue;
    bands.push(
      el("path", {
        class: "mp-pressure-band",
        "data-kind": middle < BASELINE ? "low" : "high",
        "data-depth": depth,
        "data-from": from === -Infinity ? undefined : from,
        "data-to": to === Infinity ? undefined : to,
        "fill-rule": "evenodd",
        d,
      }),
    );
  }
  return bands;
}

/** A place `east` and `north` kilometres from `at`, on a local flat patch. */
function offset(at: Position, east: number, north: number): Position {
  const lat = at[1] + north / 111.32;
  const lon = at[0] + east / (111.32 * Math.max(0.01, Math.cos(at[1] * RADIANS)));
  return [lon, lat];
}

/**
 * The surface wind at a place, as a speed in knots and a bearing in degrees
 * clockwise from north — or `null` where it is calm.
 *
 * The balance is the gradient wind rather than the geostrophic one, because the
 * geostrophic wind knows only how tightly the isobars crowd and not how sharply
 * they curve. On a flat chart that is the same answer. Round a typhoon it is
 * not: the geostrophic formula gave a 962 hPa storm at 16°N a wind of four
 * hundred knots, where the curved balance gives the seventy a storm of that
 * depth has. The curvature is read off the field itself — the curvature of the
 * isobar through the point, from the field's first and second derivatives —
 * so a trough bends it and a ridge does not need a centre to.
 */
function windAt(centres: readonly PressureCentre[], at: Position): { knots: number; bearing: number } | null {
  const h = 25; // km
  const p = (east: number, north: number): number => pressureAt(centres, offset(at, east, north));
  const p0 = p(0, 0);
  const pe = p(h, 0);
  const pw = p(-h, 0);
  const pn = p(0, h);
  const ps = p(0, -h);
  // hPa per km, then Pa per metre.
  const gx = ((pe - pw) / (2 * h)) * 0.1;
  const gy = ((pn - ps) / (2 * h)) * 0.1;
  const gradient = Math.hypot(gx, gy);
  if (gradient === 0) return null;
  // hPa per km², then Pa per m².
  const gxx = ((pe - 2 * p0 + pw) / (h * h)) * 1e-4;
  const gyy = ((pn - 2 * p0 + ps) / (h * h)) * 1e-4;
  const gxy = ((p(h, h) - p(h, -h) - p(-h, h) + p(-h, -h)) / (4 * h * h)) * 1e-4;
  // Positive where the isobar bends round lower pressure, as round a low.
  const curvature = (gxx * gy * gy - 2 * gxy * gx * gy + gyy * gx * gx) / gradient ** 3;

  // The Coriolis parameter, held at its value for 15° nearer the equator. The
  // balance the arrows are drawn from weakens toward the equator and fails on
  // it, and taking it at face value there is not caution but noise: a floor at
  // 5° gave the Indochina chart 82 knots at 4°N off a 5 hPa gradient, where
  // the real day had a monsoon breeze.
  const lat = Math.sign(at[1] || 1) * Math.max(15, Math.abs(at[1]));
  const f = 2 * OMEGA * Math.abs(Math.sin(lat * RADIANS));
  const push = gradient / AIR;
  let speed: number;
  if (Math.abs(curvature) < 1e-9) speed = push / f;
  else if (curvature > 0) speed = (-f + Math.sqrt(f * f + 4 * curvature * push)) / (2 * curvature);
  else {
    // Round a high the balance has a ceiling, and a field steeper than it
    // allows is drawn at the ceiling rather than at no answer at all.
    const k = -curvature;
    const room = f * f - 4 * k * push;
    speed = room >= 0 ? (f - Math.sqrt(room)) / (2 * k) : f / (2 * k);
  }
  const knots = speed * SURFACE * KNOTS;
  if (!(knots >= WIND_CALM)) return null;

  // Along the isobars with low pressure on the left north of the equator and
  // on the right south of it — the gradient turned a quarter — and then the
  // friction's turn further toward the low.
  const turn = (at[1] >= 0 ? 1 : -1) * (90 + INFLOW);
  const toHigh = Math.atan2(gx, gy) / RADIANS; // bearing of the gradient
  const bearing = toHigh - turn;
  return { knots: Math.min(knots, 150), bearing: ((bearing % 360) + 360) % 360 };
}

/**
 * The arrows, on a grid over the canvas.
 *
 * Each is worked out on the ground and then projected, so a wind that blows
 * north is drawn along the local meridian however the projection leans it.
 */
function windArrows(
  centres: readonly PressureCentre[],
  project: (position: Position) => Point | null,
  invert: (point: Point) => Position | null,
  [width, height]: Size,
): SvgNode[] {
  const letters: Point[] = [];
  for (const centre of centres) {
    if (centre.mark === false) continue;
    const point = project(centre.at);
    if (point !== null) letters.push([point[0], point[1] + 10]);
  }
  const arrows: SvgNode[] = [];
  for (let y = WIND_SPACING / 2; y < height; y += WIND_SPACING) {
    for (let x = WIND_SPACING / 2; x < width; x += WIND_SPACING) {
      if (letters.some((l) => Math.hypot(l[0] - x, l[1] - y) < WIND_CLEAR)) continue;
      const ground = invert([x, y]);
      if (ground === null) continue;
      const wind = windAt(centres, ground);
      if (wind === null) continue;
      const b = wind.bearing * RADIANS;
      const ahead = project(offset(ground, 10 * Math.sin(b), 10 * Math.cos(b)));
      const here = project(ground);
      if (ahead === null || here === null) continue;
      const dx = ahead[0] - here[0];
      const dy = ahead[1] - here[1];
      const norm = Math.hypot(dx, dy);
      if (norm === 0) continue;
      const [ux, uy] = [dx / norm, dy / norm];
      const length = Math.min(WIND_SPACING * 0.75, Math.max(10, 8 + wind.knots * 0.9));
      const tail: Point = [x - (ux * length) / 2, y - (uy * length) / 2];
      const tip: Point = [x + (ux * length) / 2, y + (uy * length) / 2];
      const head = Math.min(6, length * 0.35);
      const side = (sign: number): Point => {
        const a = Math.atan2(uy, ux) + Math.PI + sign * 0.5;
        return [tip[0] + head * Math.cos(a), tip[1] + head * Math.sin(a)];
      };
      const [l, r] = [side(1), side(-1)];
      arrows.push(
        el("path", {
          class: "mp-wind",
          "data-speed": Math.round(wind.knots),
          fill: "none",
          d:
            `M${round(tail[0])},${round(tail[1])}L${round(tip[0])},${round(tip[1])}` +
            `M${round(l[0])},${round(l[1])}L${round(tip[0])},${round(tip[1])}L${round(r[0])},${round(r[1])}`,
        }),
      );
    }
  }
  return arrows;
}

/**
 * What the pressure option draws, split by the layer it belongs in.
 *
 * The shading, the isobars and their values are context and go in
 * `.mp-weather`, under the names, so a line never strikes through a city. The H and L marks are the
 * point of the chart and a coordinate the caller placed, which is what the
 * annotation layer is for — drawn there, under the names they would otherwise
 * disappear beneath on the first render, which put "Belarus" across an H.
 */
export interface WeatherLayer {
  readonly chart: readonly SvgNode[];
  readonly marks: readonly SvgNode[];
}

/**
 * Build the weather layer.
 *
 * Shading first, then the isobars on it, then the wind, then the values
 * written on them, so a value's halo breaks every line and arrow it sits across.
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
  if (centres.length === 0) return { chart: [], marks: [] };

  const grid = sample(centres, invert, size);
  let low = Infinity;
  let high = -Infinity;
  for (const value of grid.values) {
    if (Number.isNaN(value)) continue;
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  if (low === Infinity) return { chart: [], marks: [] };

  // Levels are multiples of the interval, so 4 hPa draws 1008, 1012, 1016 and
  // never 1013 — the baseline itself is flat and has no line to draw.
  const levels: number[] = [];
  for (let level = Math.ceil(low / interval) * interval; level <= high; level += interval) {
    levels.push(level);
  }
  // The marks are obstacles too: a value written under an L reads as its own.
  const taken: { x: number; y: number; r: number }[] = [];
  for (const centre of centres) {
    if (centre.mark === false) continue;
    const point = project(centre.at);
    if (point !== null) taken.push({ x: point[0], y: point[1] + 10, r: 26 });
  }
  const room = (x: number, y: number, r: number): boolean =>
    x >= r && y >= r && x <= size[0] - r && y <= size[1] - r &&
    taken.every((other) => Math.hypot(other.x - x, other.y - y) >= other.r + r);

  const lines: SvgNode[] = [];
  const values: SvgNode[] = [];
  for (const level of levels) {
    for (const line of contour(grid, level)) {
      if (line.points.length < 2) continue;
      const points = drawn(line.points, line.closed);
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
        const r = String(level).length * LABEL_RADIUS_PER_DIGIT + LABEL_GAP;
        const spot = LABEL_STOPS.map((stop) => along(points, stop)).find(({ at }) =>
          room(at[0], at[1], r),
        );
        if (spot === undefined) continue;
        const { at, angle } = spot;
        const [x, y] = at;
        taken.push({ x, y, r });
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
    if (centre.mark === false) return;
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
          // The pressure the chart has there, not the number the centre was
          // given: a centre's own pull is only part of the field under it, and a
          // low of 1008 placed inside a trough sits at 1006. Printing 1008 put
          // the number inside the 1008 ring that contradicted it.
          [text(String(Math.round(pressureAt(centres, centre.at))))],
        ),
      ]),
    );
  });

  const bands = pressure.shading === true ? shading(grid, levels, low, high) : [];
  const wind = pressure.wind === true ? windArrows(centres, project, invert, size) : [];
  return { chart: [...bands, ...lines, ...wind, ...values], marks };
}
