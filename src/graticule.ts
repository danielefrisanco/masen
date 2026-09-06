/**
 * The grid the world is drawn on.
 *
 * The lines are built here rather than taken from `d3.geoGraticule()` for one
 * reason: the equator and the tropics have to be told apart from every other
 * parallel, and a generator that returns an undifferentiated MultiLineString
 * cannot say which of its lines is the equator. Drawing them all the same
 * weight is the failure the plan named — a map that marks the tropics the way
 * it marks 20°N is not marking them at all — so the parallel set is built
 * knowing which latitudes are special, and skips them rather than drawing them
 * twice.
 *
 * Everything here is degrees until the last step. A line is a list of
 * positions sampled along a constant latitude or longitude; the projection
 * bends it, which is exactly the point of drawing a graticule on a map that is
 * not a rectangle.
 */
import type { GeoPath, GeoProjection } from "d3-geo";
import { el, type SvgNode } from "./svg.js";
import type { Graticule, Point, Position, Size } from "./types.js";

/**
 * Obliquity of the ecliptic — the latitude the sun stands over at a solstice,
 * and so where the tropics are. It drifts by about half an arcsecond a year,
 * which is four decimal places of no consequence to a line 0.4 units wide.
 */
const TROPIC = 23.4362;

/**
 * Degrees between sampled points along a line.
 *
 * A parallel is a straight line only on a cylindrical projection. At 2° the
 * curve of a conic reads as a curve; at 10° it reads as a polygon, which was
 * visible on `west-europe/conic-conformal` before this was lowered.
 */
const PRECISION = 2;

/**
 * Angular steps a reader can name. A grid at 7° is a grid nobody can count
 * from, so the spacing comes off this ladder or off the caller.
 */
const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 45] as const;
/** The coarsest rung, and what a whole-world span falls back to. */
const COARSEST = Math.max(...STEPS);

/** Lines wanted across a span. Six is a grid; twenty is a screen door. */
const TARGET = 6;

/**
 * How far past the framed bounds the grid runs, as a fraction of the span.
 *
 * `fitExtent` shows more than the bounds it was given: the region is fitted to
 * whichever axis binds, and the other one gets slack. A grid stopped at the
 * bounds leaves that slack empty, so it runs over and the viewport clips it.
 */
const OVERHANG = 0.25;

/** Coarsest sensible spacing. Beyond this a "grid" is two lines. */
const MAX_STEP = 90;

/**
 * How far inside the frame a degree number sits, in user units.
 *
 * On the frame rather than beyond it, because there is no beyond: the canvas
 * is the whole document, and a margin outside the map would have to be room
 * taken away from the map to make it.
 */
const LABEL_INSET = 6;

/**
 * Where a degree number goes, and what it says.
 *
 * The line already knows its own latitude; **what was missing is where to put
 * the number**, and the answer is the same one the scale bar found — a point on
 * the frame, chosen by measuring the drawn geometry rather than by trusting the
 * projection to behave. A meridian is not vertical on a conic and a parallel is
 * not horizontal on anything but a cylinder, so "put it at the top" is a guess
 * that is wrong for half the projections here.
 */
export interface GridMark {
  /** The number as a reader says it: `45°N`, `120°W`, `0°`. */
  readonly text: string;
  /** Where it sits on the canvas. */
  readonly at: Point;
  readonly anchor: "start" | "middle" | "end";
  /** `meridian`, `parallel`, `equator` or `tropic` — the line it names. */
  readonly kind: string;
}

/**
 * A degree, written the way an atlas writes it.
 *
 * Hemisphere letters rather than a sign, because a map is read by people and
 * `-58°` is a number where `58°W` is a place. Zero takes no letter: the equator
 * is not north of itself, and the prime meridian is not east of itself.
 */
function degrees(value: number, axis: "lon" | "lat"): string {
  const size = Math.abs(value);
  // Trailing zeros dropped, because the 0.5° rung produces 30.5 and 31 in the
  // same grid and "31.0°N" beside "30.5°N" reads as false precision.
  const written = Number(size.toFixed(2));
  if (value === 0) return "0°";
  const hemisphere = axis === "lon" ? (value > 0 ? "E" : "W") : value > 0 ? "N" : "S";
  return `${written}°${hemisphere}`;
}

/** Where a segment crosses a horizontal or vertical line, if it does. */
function cross(
  [ax, ay]: Point,
  [bx, by]: Point,
  at: number,
  axis: 0 | 1,
): number | null {
  const from = axis === 0 ? ax : ay;
  const to = axis === 0 ? bx : by;
  if (from === to) return null;
  const t = (at - from) / (to - from);
  if (t < 0 || t > 1) return null;
  return axis === 0 ? ay + (by - ay) * t : ax + (bx - ax) * t;
}

/**
 * The first place a drawn line meets the frame, and which side of it.
 *
 * Only the frame counts. A line that stops inside the canvas has been cut by
 * the projection rather than by the paper — the limb of an orthographic globe,
 * where the grid ends in the middle of the picture — and a number floating
 * there names nothing a reader can follow to an edge.
 *
 * Sides are tried in the order the caller gives, so a meridian looks for the
 * bottom of the frame before the left of it and a parallel does the reverse.
 * That is what keeps the longitudes in a row along one edge and the latitudes
 * in a column down another, instead of scattered wherever each line happens to
 * leave.
 */
/**
 * Which edge a whole set of lines is numbered on.
 *
 * Chosen once per axis rather than once per line, and that is the difference
 * between a map and a mess. Judged line by line, a conic's western meridians
 * leave through the left edge while its central ones leave through the bottom,
 * and the numbers end up scattered around two and a half sides of the frame —
 * with 55°N written on top of 25°W in the corner where the two rows meet.
 *
 * An atlas puts every longitude along one edge and every latitude along
 * another, so the reader learns where to look once. The edge that carries the
 * most of them wins; ties go to the first in the caller's order, which is the
 * conventional one — longitudes along the bottom, latitudes down the left.
 */
function sideFor(
  lines: readonly (readonly Point[])[],
  frame: Rect,
  order: readonly Side[],
): Side | null {
  const counts = order.map((side) => {
    let found = 0;
    for (const points of lines) if (touches(points, frame, side) !== null) found += 1;
    return { side, found };
  });
  const most = Math.max(...counts.map((count) => count.found));
  if (most === 0) return null;
  // The conventional edge wins unless it is much the worse one. A conic's fan
  // opens upward, so more meridians reach the top of the frame than the bottom
  // — but longitudes belong along the bottom, and losing three of fourteen is a
  // smaller cost than a map whose numbers are somewhere a reader has to hunt
  // for. Two-thirds is the line: below it the conventional edge is not merely
  // worse, it is missing too much of the grid to be read from.
  const enough = counts.find((count) => count.found >= most * (2 / 3));
  return (enough ?? counts[0])?.side ?? null;
}

/** `[left, top, right, bottom]` — the rectangle numbers are written on. */
export type Rect = readonly [number, number, number, number];

type Side = "bottom" | "top" | "left" | "right";

/**
 * How near a line has to come to an edge to count as reaching it, in units.
 *
 * A line that *crosses* an edge is found exactly, by interpolation. This
 * tolerance is for the other case: a meridian at ±180 on a world map does not
 * cross the left edge, it lies along it, and a crossing test on a vertical line
 * at x = 0 finds nothing at all. That was the whole reason a world map came out
 * with no numbers on it.
 */
const TOUCH = 1.5;

/**
 * How far from a corner a number has to be, in user units.
 *
 * Two things go wrong in a corner and this fixes both. A number centred on the
 * frame's own corner hangs half off the paper — the first conic drawn with this
 * had a longitude reading "°W" at the left edge — and the two axes meet there,
 * so the last longitude and the first latitude are written on the same square
 * inch. A line that only reaches the frame in its corner is better left
 * unnumbered: the reader can count in from the next one.
 */
const CORNER = 20;

function touches(
  points: readonly Point[],
  frame: Rect,
  side: Side,
): { at: Point; anchor: "start" | "middle" | "end" } | null {
  const [left, top, right, bottom] = frame;
  const vertical = side === "bottom" || side === "top";
  const edge = side === "bottom" ? bottom : side === "top" ? top : side === "right" ? right : left;
  const axis = vertical ? 1 : 0;

  // Inset *into* the map, so the number sits just inside the line it names
  // rather than half off the paper.
  const place = (along: number): { at: Point; anchor: "start" | "middle" | "end" } => {
    if (side === "bottom") return { at: [along, bottom - LABEL_INSET], anchor: "middle" };
    if (side === "top") return { at: [along, top + LABEL_INSET], anchor: "middle" };
    if (side === "left") return { at: [left + LABEL_INSET, along], anchor: "start" };
    return { at: [right - LABEL_INSET, along], anchor: "end" };
  };
  const inside = (along: number): boolean =>
    vertical
      ? along >= left + CORNER && along <= right - CORNER
      : along >= top + CORNER && along <= bottom - CORNER;

  // First, a real crossing. Sampling is every two degrees, which on a
  // continental map is tens of pixels — so the nearest sampled point to an edge
  // can be a long way from it, and only interpolation finds where the line
  // actually left the paper.
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    if (!Number.isFinite(a[0]) || !Number.isFinite(a[1])) continue;
    if (!Number.isFinite(b[0]) || !Number.isFinite(b[1])) continue;
    const along = cross(a, b, edge, axis);
    if (along === null || !inside(along)) continue;
    return place(along);
  }

  // Then the line that runs along the edge rather than through it.
  let best: Point | null = null;
  let nearest = Infinity;
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    if (point[0] < left || point[0] > right || point[1] < top || point[1] > bottom) continue;
    const gap = Math.abs((axis === 0 ? point[0] : point[1]) - edge);
    if (gap < nearest) {
      nearest = gap;
      best = point;
    }
  }
  if (best === null || nearest > TOUCH) return null;
  return place(axis === 0 ? best[1] : best[0]);
}

function stepFor(span: number): number {
  for (const step of STEPS) if (span / step <= TARGET) return step;
  return COARSEST;
}

function checkStep(value: number, what: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_STEP) {
    throw new Error(
      `masen: graticule ${what} must be a positive number of degrees up to ${MAX_STEP}, got ${value}`,
    );
  }
  return value;
}

/** Sample a constant-latitude line, always including both ends. */
function parallel(lat: number, west: number, east: number): Position[] {
  const points: Position[] = [];
  for (let lon = west; lon < east; lon += PRECISION) points.push([lon, lat]);
  points.push([east, lat]);
  return points;
}

/** Sample a constant-longitude line, always including both ends. */
function meridian(lon: number, south: number, north: number): Position[] {
  const points: Position[] = [];
  for (let lat = south; lat < north; lat += PRECISION) points.push([lon, lat]);
  points.push([lon, north]);
  return points;
}

/** Multiples of `step` inside `[low, high]`, counted from zero so 0 is on the grid. */
function ticks(low: number, high: number, step: number): number[] {
  const values: number[] = [];
  const first = Math.ceil(low / step);
  const last = Math.floor(high / step);
  // A step far finer than the span can ask for thousands of lines. The cap is
  // above anything a reader could count and below anything that hurts.
  for (let n = first; n <= last && values.length < 4000; n += 1) {
    values.push(Math.round(n * step * 1e6) / 1e6);
  }
  return values;
}

/** How many samples across the canvas when asking what ground it shows. */
const PROBE = 12;

/**
 * A pixel that comes back as the same pixel, in user units.
 *
 * The same guard the annotation layer takes, for the same reason: d3 clamps its
 * inverse trigonometry rather than failing, so the corner of a canvas outside an
 * orthographic disc inverts to a plausible coordinate on the limb instead of to
 * nothing. Put it back through the projection and it lands somewhere else.
 */
const ROUND_TRIP = 0.5;

/**
 * What ground the canvas actually shows.
 *
 * The grid was sampled across the region's bounds plus a quarter, and that is
 * not the same thing — `fitExtent` fits the region to whichever axis binds and
 * gives the other one slack, so the canvas shows ground the bounds never
 * mentioned. On a conic the effect is worst where it is most visible: reaching
 * the left edge of a west-europe map at 50°N takes a longitude of 26°W, and the
 * bounds plus a quarter stopped at 19°W. The parallels ended in mid-air a few
 * units short of the frame.
 *
 * Nobody had noticed, because a faint line stopping just inside the edge looks
 * like a faint line. Writing a number at the end of each one is what made it
 * obvious — the plan predicted that this phase would work that way.
 *
 * Measured rather than derived: the projection is asked what a grid of pixels
 * across the canvas corresponds to. Twelve steps is 169 inversions, which is
 * nothing beside drawing the map.
 */
function canvasExtent(
  projection: GeoProjection,
  [width, height]: Size,
): [number, number, number, number] | null {
  const invert = projection.invert;
  if (invert === undefined) return null;

  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;

  for (let i = 0; i <= PROBE; i += 1) {
    for (let j = 0; j <= PROBE; j += 1) {
      const pixel: [number, number] = [(width * i) / PROBE, (height * j) / PROBE];
      const position = invert.call(projection, pixel);
      if (position === null) continue;
      const [lon, lat] = position;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const back = projection([lon, lat]);
      if (back === null) continue;
      if (Math.abs(back[0] - pixel[0]) > ROUND_TRIP || Math.abs(back[1] - pixel[1]) > ROUND_TRIP) {
        continue;
      }
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }

  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;
  return [west, south, east, north];
}

export interface GraticuleLayer {
  readonly lines: SvgNode[];
  /** Where each line's number goes. Empty unless `labels` was asked for. */
  readonly marks: GridMark[];
}

export function graticuleLayer(
  graticule: Graticule,
  bounds: readonly [Position, Position],
  path: GeoPath,
  [width, height]: Size,
  projection: GeoProjection | null = null,
): GraticuleLayer {
  const [[west, south], [east, north]] = bounds;
  const lonSpan = Math.max(east - west, 1e-6);
  const latSpan = Math.max(north - south, 1e-6);

  const asked = graticule.step;
  const [stepX, stepY] =
    asked === undefined
      ? [stepFor(lonSpan), stepFor(latSpan)]
      : typeof asked === "number"
        ? [checkStep(asked, "step"), checkStep(asked, "step")]
        : [checkStep(asked[0], "step[0]"), checkStep(asked[1], "step[1]")];

  // The bounds plus a margin, widened to whatever the canvas turns out to show.
  // The margin alone is a guess and it was wrong on every conic; the measured
  // extent is the truth, and the guess stays as the floor for the case where a
  // projection cannot be inverted at all.
  const seen = projection === null ? null : canvasExtent(projection, [width, height]);
  // Clamped, because a line past the pole is not a line and a meridian drawn
  // twice at ±180 is a seam.
  const left = Math.max(-180, Math.min(west - lonSpan * OVERHANG, seen?.[0] ?? Infinity));
  const right = Math.min(180, Math.max(east + lonSpan * OVERHANG, seen?.[2] ?? -Infinity));
  const bottom = Math.max(-90, Math.min(south - latSpan * OVERHANG, seen?.[1] ?? Infinity));
  const top = Math.min(90, Math.max(north + latSpan * OVERHANG, seen?.[3] ?? -Infinity));

  const special = new Map<number, string>([
    [0, "equator"],
    [TROPIC, "tropic"],
    [-TROPIC, "tropic"],
  ]);

  const lines: { kind: string; degree: number; axis: "lon" | "lat"; points: Position[] }[] = [];
  for (const lon of ticks(left, right, stepX)) {
    lines.push({ kind: "meridian", degree: lon, axis: "lon", points: meridian(lon, bottom, top) });
  }
  for (const lat of ticks(bottom, top, stepY)) {
    // The equator is a multiple of every step on the ladder, so without this
    // it would be drawn once as a parallel and once as itself — two strokes
    // in two colours on the same pixels.
    if (special.has(lat)) continue;
    // A parallel at the pole is a point, not a line. Drawn anyway it is a
    // stroke of nothing on most projections and a full-width line across the
    // top of a cylindrical one, which is the pole claiming to be a place.
    if (Math.abs(lat) >= 90) continue;
    lines.push({ kind: "parallel", degree: lat, axis: "lat", points: parallel(lat, left, right) });
  }
  for (const [lat, kind] of special) {
    if (lat < bottom || lat > top) continue;
    lines.push({ kind, degree: lat, axis: "lat", points: parallel(lat, left, right) });
  }

  // The caller hands in the same projection the path was built from, asked for
  // points rather than for a string: a number's position cannot be read back
  // out of path data, and a second instance built here would be a second chance
  // to disagree with the lines it is labelling.
  const locate = graticule.labels === true ? projection : null;

  const nodes: SvgNode[] = [];
  /**
   * Where the map actually is, which is not always where the canvas is.
   *
   * `fitExtent` fits a region to whichever axis binds and leaves the other slack,
   * so a world map in equal-earth sits inset by fifteen units on one side and
   * eighty on the other. Numbers written on the *canvas* edge would then float
   * in empty paper, unattached to any line — and the first world map drawn with
   * this on had no numbers at all, because no line reached the frame to be
   * measured against it.
   *
   * So the numbers go on the edge of the drawn map. Where the map fills the
   * canvas the two are the same rectangle and nothing changes.
   */
  const drawnLines: { line: (typeof lines)[number]; points: Point[] }[] = [];
  let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  const marks: GridMark[] = [];
  for (const line of lines) {
    const geometry = { type: "LineString", coordinates: line.points } as never;
    const [[x0, y0], [x1, y1]] = path.bounds(geometry);
    // A projection can send a line nowhere — behind an orthographic globe, or
    // to infinity on a cylindrical one at the pole. Neither is drawable, and
    // a line entirely off the canvas is a kilobyte of path data nobody sees.
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
    if (!Number.isFinite(x1) || !Number.isFinite(y1)) continue;
    if (x1 < 0 || y1 < 0 || x0 > width || y0 > height) continue;
    const d = path(geometry);
    if (!d) continue;
    nodes.push(el("path", { class: "mp-grid", "data-kind": line.kind, d }));

    if (locate === null) continue;
    const drawn: Point[] = [];
    for (const position of line.points) {
      const point = locate([position[0], position[1]]);
      if (point === null) continue;
      const [px, py] = point;
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      drawn.push([px, py]);
      // Clamped to the canvas as it is collected: a cylindrical projection
      // sends the pole to a coordinate thousands of units off the paper, and
      // one of those would put the whole frame there.
      if (px < -width || px > 2 * width || py < -height || py > 2 * height) continue;
      box = [
        Math.min(box[0], px),
        Math.min(box[1], py),
        Math.max(box[2], px),
        Math.max(box[3], py),
      ];
    }
    drawnLines.push({ line, points: drawn });
  }

  if (locate !== null && Number.isFinite(box[0])) {
    const frame: Rect = [
      Math.max(0, box[0]),
      Math.max(0, box[1]),
      Math.min(width, box[2]),
      Math.min(height, box[3]),
    ];
    const ORDER: Readonly<Record<"lon" | "lat", readonly Side[]>> = {
      lon: ["bottom", "top", "left", "right"],
      lat: ["left", "right", "bottom", "top"],
    };
    for (const axis of ["lon", "lat"] as const) {
      const mine = drawnLines.filter(({ line }) => line.axis === axis);
      const side = sideFor(
        mine.map(({ points }) => points),
        frame,
        ORDER[axis],
      );
      if (side === null) continue;
      const found: GridMark[] = [];
      for (const { line, points } of mine) {
        const where = touches(points, frame, side);
        if (where === null) continue;
        found.push({
          text: degrees(line.degree, axis),
          at: where.at,
          anchor: where.anchor,
          kind: line.kind,
        });
      }
      // Numbers that land on each other are not two numbers.
      //
      // On an orthographic globe every meridian ends at the same pole, so every
      // one of them wants the same point on the frame. The label layer would
      // hide all but one — leaving a single "180°W" at the bottom of the disc,
      // naming a spot that is on all 360 of them. Thinned here instead, where
      // the reason is visible, rather than resolved by accident downstream.
      const kept: GridMark[] = [];
      for (const mark of found) {
        const crowded = kept.some(
          (other) =>
            Math.abs(other.at[0] - mark.at[0]) < CORNER &&
            Math.abs(other.at[1] - mark.at[1]) < CORNER,
        );
        if (!crowded) kept.push(mark);
      }
      // One number is not a scale. A reader counts *between* labels — 15°W,
      // 10°W, 5°W gives them the spacing and lets them read off any line in
      // between — where a single lonely number teaches nothing and implies the
      // rest could have been placed and were not.
      if (kept.length >= 2) marks.push(...kept);
    }
  }

  return { lines: nodes, marks };
}
