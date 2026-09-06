import { ICON_GRID, ICONS } from "./icons.js";
import { textWidth } from "./labels.js";
import { el, text, type SvgNode } from "./svg.js";
import type { Arrow, Callout, Pin, Point, Position, Route, Size } from "./types.js";

/**
 * The annotation layer — where the map stops describing the ground and starts
 * saying something about it.
 *
 * A pin is the first of four marks, and the only one whose shape is a
 * decision: arrows, callouts and icons all have to answer the same question a
 * pin does — *where* — and copying one answer is what keeps them from
 * arriving as three different vocabularies. So `at` is a coordinate, in
 * lon/lat, and everything else is composition on top of it.
 *
 * Deliberately *not* a coordinate in pixels. A pixel is only meaningful for
 * the exact region, projection and canvas size that produced it; the same map
 * at another size puts that pixel on different ground. `invert()` exists to
 * turn a pointer's pixel into a coordinate precisely so that what gets stored
 * here is the coordinate.
 *
 * Annotations are excluded from the camera, for the same reason `neighbours`
 * is: placing a mark must never move the map out from under the marks already
 * placed. A pin outside the frame stays outside the frame.
 */

/**
 * Mark radius in user units. A theme overrides `r` in CSS; this is the fallback.
 *
 * Larger than it first needed to be, because the casing eats into it: the
 * stroke is centred on the circle, so a 2.4-unit casing spends 1.2 of it
 * inside, and at radius 5 the coloured core came out barely wider than a
 * rank-1 city dot. Seven leaves the mark reading as a mark.
 */
const PIN_RADIUS = 7;

/**
 * Mark radius when the pin carries an icon, in user units.
 *
 * Bigger than a plain mark because it has to hold something. A 15-unit Maki
 * glyph set at 12 needs about 17 units of clear diameter once the casing has
 * taken 1.2 off each side, and ten gives that with a little air around it.
 */
const PIN_ICON_RADIUS = 10;

/** How wide an icon is drawn, in user units. Maki's grid is 15. */
const ICON_SIZE = 12;

/**
 * How far a coordinate may move through a round trip before the pixel it was
 * given is somebody else's, in degrees.
 *
 * The mirror of `INVERT_TOLERANCE`, and it exists for the mirror of the same
 * reason. `project()` does not refuse a coordinate on the far side of a globe:
 * the far hemisphere projects onto the same disc, so it hands back a pixel that
 * is already occupied by a place on the near side. A pin at 160°W, 10°S — the
 * middle of the Pacific — projects onto an Africa-centred globe at [369, 491],
 * which is Angola, and nothing about that pixel says it is wrong.
 *
 * So the coordinate is put back through `invert()`, which answers with the near
 * side by construction, and compared with where it started. Measured over five
 * projections, nine regions and a 9° grid, a coordinate that really is visible
 * returns within 3.6e-11 degrees and one that is not misses by at least 0.09.
 * Anything in that gap does; 1e-6 degrees is a tenth of a millimetre on the
 * ground, and nine orders of magnitude clear of both ends.
 */
const ROUND_TRIP_TOLERANCE = 1e-6;

const RADIANS = Math.PI / 180;

/**
 * Angular distance between two coordinates, in degrees.
 *
 * Straight subtraction of lon and lat will not do: it calls 179°E and 179°W
 * 358 degrees apart when they are two, and it calls every meridian at the pole
 * a different place when they are one point. The chord on the unit sphere has
 * neither problem.
 */
function apart(a: Position, b: Position): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const x = Math.cos(lat1 * RADIANS) * Math.cos(lon1 * RADIANS)
    - Math.cos(lat2 * RADIANS) * Math.cos(lon2 * RADIANS);
  const y = Math.cos(lat1 * RADIANS) * Math.sin(lon1 * RADIANS)
    - Math.cos(lat2 * RADIANS) * Math.sin(lon2 * RADIANS);
  const z = Math.sin(lat1 * RADIANS) - Math.sin(lat2 * RADIANS);
  const chord = Math.hypot(x, y, z);
  return (2 * Math.asin(Math.min(1, chord / 2))) / RADIANS;
}

/**
 * Gap between the mark and a label sitting beside it, in user units.
 *
 * Measured from the radius, so it has to clear two casings rather than none:
 * the mark's own, which is half a halo-width proud of `PIN_RADIUS`, and the
 * label's, which starts half a halo-width before the glyphs. At four they met,
 * and a bold name read as though it were touching its mark.
 */
const PIN_GAP = 6;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Reject a coordinate that cannot be one.
 *
 * `highlight` throws on a code it does not recognise rather than quietly
 * dropping it, and a pin deserves the same: a mark silently missing from a map
 * is worse than a map that refuses to build. The check catches the mistake
 * that actually happens — `[lat, lon]` instead of `[lon, lat]` — whenever the
 * longitude it was handed is past 90, which is most of the northern hemisphere
 * writing about anywhere east of Corsica. A swap that stays in range is a real
 * place and no validation can find it.
 */
function assertPosition(at: Position, index: number, what: string, field: string): void {
  const where = `masen: ${what}[${index}].${field}`;
  if (!Array.isArray(at) || at.length !== 2) {
    throw new Error(`${where} must be a [lon, lat] pair`);
  }
  const [lon, lat] = at;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error(`${where} must be two finite numbers, got [${lon}, ${lat}]`);
  }
  if (lon < -180 || lon > 180) {
    throw new Error(`${where} has a longitude of ${lon}, which is outside [-180, 180]`);
  }
  if (lat < -90 || lat > 90) {
    throw new Error(
      `${where} has a latitude of ${lat}, which is outside [-90, 90] — ` +
        `coordinates are [lon, lat], not [lat, lon]`,
    );
  }
}

/**
 * Where a pin's label sits, and which end of it is anchored.
 *
 * With no offset the label sits to the right of the mark, the same convention
 * the settlement labels use. An offset moves the *label*, never the mark — the
 * mark is at the coordinate, and that is the whole point of it — so a label
 * pushed left has to be anchored at its end, or it runs back over the mark it
 * was moved away from.
 */
function labelAt(
  x: number,
  y: number,
  offset: Point | undefined,
  radius: number,
): { readonly x: number; readonly y: number; readonly anchor: string } {
  if (offset === undefined) {
    return { x: x + radius + PIN_GAP, y, anchor: "start" };
  }
  const [dx, dy] = offset;
  const anchor = dx < 0 ? "end" : dx > 0 ? "start" : "middle";
  return { x: x + dx, y: y + dy, anchor };
}

/**
 * A coordinate as a point on the canvas, or nothing.
 *
 * The single place any annotation turns a `where` into a pixel, which is the
 * point of it: a pin and a callout that validated differently, or guarded the
 * globe differently, would be two vocabularies wearing one name.
 */
function resolve(
  at: Position,
  index: number,
  what: string,
  project: (position: Position) => Point | null,
  invert: (point: Point) => Position | null,
  field = "at",
): Point | null {
  assertPosition(at, index, what, field);
  const point = project(at);
  if (point === null) return null;
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  const back = invert(point);
  if (back === null) return null;
  if (apart(at, back) > ROUND_TRIP_TOLERANCE) return null;
  return point;
}

/**
 * Build the annotation layer.
 *
 * Two different things go wrong with a pin, and they get two different answers
 * because they are two different facts.
 *
 * A pin on the far side of a globe has no pixel of its own. It gets one anyway
 * — the far hemisphere projects onto the same disc as the near one, so
 * `project()` answers a Pacific coordinate with a pixel in the middle of
 * Africa. Those are dropped, because drawing them means putting a mark on
 * ground it does not belong to, and a mark that is silently in the wrong place
 * is worse than one that is missing. They are found by round trip: `invert()`
 * returns the near side by construction, so a coordinate that comes back as
 * itself was visible and one that comes back as somewhere else was not.
 *
 * A pin that survives the round trip but lands outside the canvas *does* have
 * a place; the camera simply is not looking at it. That is stated as
 * `data-fit="0"`, the same way a name too big for its country is, and the
 * stylesheet decides what to do about it. The engine states the fact; it does
 * not act on it.
 */
export interface PinLayer {
  readonly nodes: readonly SvgNode[];
  /**
   * The labels of the marks a reader can actually see.
   *
   * What the accessible description is built from, which is why it is returned
   * rather than read back off the options: a description naming a pin that was
   * dropped for being on the far side of the globe, or hidden for being off the
   * canvas, describes a map nobody is looking at.
   */
  readonly labels: readonly string[];
}

export function pinLayer(
  pins: readonly Pin[],
  project: (position: Position) => Point | null,
  invert: (point: Point) => Position | null,
  [width, height]: Size,
  size: number = PIN_RADIUS,
): PinLayer {
  // One number sets all three, so a bigger pin is a bigger pin rather than a
  // bigger circle with the same glyph rattling around inside it. The ratios are
  // the ones the defaults were tuned to: a mark carrying an icon needs the room
  // the icon takes plus the casing, and the casing is centred on the edge.
  const scaleUp = size / PIN_RADIUS;
  const plainRadius = size;
  const iconRadius = PIN_ICON_RADIUS * scaleUp;
  const iconSize = ICON_SIZE * scaleUp;
  const nodes: SvgNode[] = [];
  const labels: string[] = [];

  for (const [index, pin] of pins.entries()) {
    const point = resolve(pin.at, index, "pins", project, invert);
    if (point === null) continue;
    const [x, y] = point;

    const onCanvas = x >= 0 && x <= width && y >= 0 && y <= height;
    const children: SvgNode[] = [];
    if (onCanvas && pin.label !== undefined && pin.label !== "") labels.push(pin.label);

    // `kind` doubles as the icon name, which is what the plan always intended:
    // the vocabulary's names become the conventional values. A kind that names
    // no icon is not an error — it stays a plain mark and keeps its `data-kind`
    // for a theme to style, so a category of the caller's own invention still
    // works.
    const glyph = pin.kind === undefined ? undefined : ICONS[pin.kind];
    const radius = glyph === undefined ? plainRadius : iconRadius;

    // A per-feature title is a hover tooltip, not an accessibility tree — the
    // root carries `role="img"`, so it is read once. Same bargain the country
    // paths take.
    if (pin.label !== undefined && pin.label !== "") {
      children.push(el("title", {}, [text(pin.label)]));
    }

    children.push(
      el("circle", {
        class: "mp-pin-mark",
        cx: round(x),
        cy: round(y),
        r: radius,
      }),
    );

    if (glyph !== undefined) {
      // Centred on the coordinate and scaled off Maki's own grid, so the icon
      // set can change size in one constant. Filled from `--anno-ink`, which is
      // exactly what that token was authored to mean: ink drawn *on* an
      // annotation, legible against `--anno`.
      const scale = iconSize / ICON_GRID;
      children.push(
        el(
          "g",
          {
            class: "mp-icon",
            "data-icon": pin.kind,
            transform:
              `translate(${round(x - iconSize / 2)},${round(y - iconSize / 2)}) ` +
              `scale(${Math.round(scale * 1000) / 1000})`,
          },
          [el("path", { d: glyph })],
        ),
      );
    }

    if (pin.label !== undefined && pin.label !== "") {
      const at = labelAt(x, y, pin.offset, radius);
      children.push(
        el(
          "text",
          {
            // The labels layer's own class, carried into this one on purpose.
            // A pin's name is text on a map and wants everything the label
            // rule already provides — the type stack, the tracking, and above
            // all the halo that is the difference between a name that reads
            // over a coastline and one that does not. A class of its own
            // would have to restate all of it, and would arrive unstyled in
            // every theme not revised to know about it.
            class: "mp-label",
            "data-kind": "pin",
            x: round(at.x),
            y: round(at.y),
            "text-anchor": at.anchor,
            "dominant-baseline": "central",
          },
          [text(pin.label)],
        ),
      );
    }

    nodes.push(
      el(
        "g",
        {
          class: "mp-anno mp-pin",
          "data-id": pin.id,
          "data-kind": pin.kind,
          // Stated, not acted on. `1` is written out as well as `0` so the
          // attribute is a fact about every pin rather than a flag that only
          // appears when something went wrong.
          "data-fit": onCanvas ? 1 : 0,
        },
        children,
      ),
    );
  }

  return { nodes, labels };
}

/** Padding between a callout's caption and the edge of its box, in user units. */
const CALLOUT_PAD = 7;

/** Line height inside a callout, as a fraction of the font size. */
const CALLOUT_LEADING = 1.35;

/** Where the box sits when the caller does not say. Up and to the right. */
const CALLOUT_OFFSET: Point = [40, -40];

/** Widest a caption sets before it wraps, in user units. */
const CALLOUT_WIDTH = 180;

/**
 * How much wider a real string can run than `--label-advance` predicts.
 *
 * The estimator is an average glyph width, and the label engine deliberately
 * tunes it to err *low*: a country name is hidden when it does not fit, so
 * over-estimating would hide names that would have been fine. A box has the
 * opposite requirement — under-estimating does not hide anything, it prints the
 * caption straight out through the right-hand edge.
 *
 * Measured in a browser with `getComputedTextLength()` across the three bundled
 * stacks at weights 400, 500 and 700: a realistic caption runs at most 1.28× the
 * estimate and averages 0.8, the worst cases being short strings where
 * per-character variance has nothing to average against. 1.3 covers all of them.
 * A box slightly too wide costs a few units of whitespace; a box too narrow is
 * broken, so this rounds up on purpose.
 */
const CALLOUT_SLACK = 1.3;

/**
 * Break a caption into lines that fit.
 *
 * Greedy, not the even-split search the country labels use: that one is
 * choosing between two lines of a name and wants them balanced, while this is
 * setting a sentence in a column and wants it full. A word longer than the
 * column is left long rather than broken — hyphenation is a typographic
 * problem this library has no business having an opinion about, and a URL cut
 * in half is worse than a box that runs wide.
 */
/**
 * How wide a row will actually set, rounded up.
 *
 * Tracking is added rather than folded into the advance because it is a flat
 * per-character length, not a fraction of the size — `--label-track` is in user
 * units, so it does not scale when the type does. The label engine leaves it
 * out and can afford to: it errs low on purpose. A box cannot.
 */
function measure(row: string, size: number, advance: number, track: number): number {
  return (textWidth(row, size, advance) + row.length * track) * CALLOUT_SLACK;
}

function wrap(
  caption: string,
  width: number,
  size: number,
  advance: number,
  track: number,
): string[] {
  const words = caption.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [];
  const rows: string[] = [];
  let row = words[0] as string;
  for (const word of words.slice(1)) {
    const candidate = `${row} ${word}`;
    if (measure(candidate, size, advance, track) <= width) row = candidate;
    else {
      rows.push(row);
      row = word;
    }
  }
  rows.push(row);
  return rows;
}

/**
 * Build the callouts.
 *
 * The box is the whole reason this is a second primitive rather than an option
 * on the first. A pin's label is one word and rides on the halo every label
 * gets; a caption is a sentence, and a sentence needs a ground of its own or it
 * dissolves into whatever the map put under it. Having a ground is also what
 * finally gives `--anno-ink` something to mean: ink drawn *on* an annotation,
 * legible against `--anno`, which is the value every preset has been carrying
 * since Phase 3 without anything consuming it.
 *
 * There is no mark at the anchor. The leader line already ends there, and a
 * caller who wants a dot as well adds a pin at the same coordinate — which is
 * composition rather than a second way to draw the same circle.
 */
export function calloutLayer(
  callouts: readonly Callout[],
  project: (position: Position) => Point | null,
  invert: (point: Point) => Position | null,
  [width, height]: Size,
  size: number,
  advance: number,
  track: number,
): PinLayer {
  const nodes: SvgNode[] = [];
  const labels: string[] = [];

  for (const [index, callout] of callouts.entries()) {
    const point = resolve(callout.at, index, "callouts", project, invert);
    if (point === null) continue;
    const [x, y] = point;

    const column = callout.width ?? CALLOUT_WIDTH;
    const rows = wrap(callout.text, column, size, advance, track);
    if (rows.length === 0) continue;

    const [dx, dy] = callout.offset ?? CALLOUT_OFFSET;
    const widest = Math.max(...rows.map((row) => measure(row, size, advance, track)));
    const boxWidth = widest + CALLOUT_PAD * 2;
    const boxHeight = rows.length * size * CALLOUT_LEADING + CALLOUT_PAD * 2;

    // The offset lands the corner nearest the point, and the box grows away
    // from it — so the sign of the offset is the direction the box goes, which
    // is the only reading of it a caller has to hold in their head.
    const boxX = dx < 0 ? x + dx - boxWidth : x + dx;
    const boxY = dy < 0 ? y + dy - boxHeight : y + dy;

    const anchored = x >= 0 && x <= width && y >= 0 && y <= height;
    const boxSeen =
      boxX + boxWidth >= 0 && boxX <= width && boxY + boxHeight >= 0 && boxY <= height;
    const onCanvas = anchored && boxSeen;
    if (onCanvas) labels.push(callout.text);

    const children: SvgNode[] = [
      el("title", {}, [text(callout.text)]),
      // Straight, and from the point to the corner the offset named — which is
      // why the corner is what the offset positions. A leader that arrived at
      // some other edge would need the caller to solve for where it came out.
      el("path", {
        class: "mp-callout-leader",
        d: `M${round(x)},${round(y)}L${round(x + dx)},${round(y + dy)}`,
      }),
      el("rect", {
        class: "mp-callout-box",
        x: round(boxX),
        y: round(boxY),
        width: round(boxWidth),
        height: round(boxHeight),
      }),
    ];

    // First baseline sits a full line below the box top, so the cap height
    // clears the padding rather than the ascender resting on it.
    const first = boxY + CALLOUT_PAD + size * 0.82;
    children.push(
      el(
        "text",
        {
          class: "mp-label",
          "data-kind": "callout",
          x: round(boxX + CALLOUT_PAD),
          y: round(first),
        },
        rows.map((row, line) =>
          el(
            "tspan",
            {
              x: round(boxX + CALLOUT_PAD),
              // In user units, not `em`: the flattened export is read by tools
              // that resolve lengths but not font-relative ones.
              dy: line === 0 ? undefined : round(size * CALLOUT_LEADING),
            },
            [text(row)],
          ),
        ),
      ),
    );

    nodes.push(
      el(
        "g",
        {
          class: "mp-anno mp-callout",
          "data-id": callout.id,
          "data-kind": callout.kind,
          "data-fit": onCanvas ? 1 : 0,
        },
        children,
      ),
    );
  }

  return { nodes, labels };
}

/** How far a curve bows from the straight line, as a fraction of its length. */
const ARROW_BOW = 0.18;

/** How wide a route's stop mark is drawn, in user units. */
const STOP_RADIUS = 4.5;

/** A minor stop, drawn smaller so a branch reads as a branch. */
const MINOR_STOP_RADIUS = 3;

/**
 * Build the routes.
 *
 * The one thing in the second-ingest phase that needs nothing downloaded, and
 * it is here rather than in the roads layer for exactly that reason: a road is
 * a fact about the world that has to arrive from Natural Earth, and a route is
 * a claim the caller is making. Drawing them in the same layer would say the
 * two are the same kind of thing.
 *
 * It is an ordered list of the primitives that already exist. A pin is a mark
 * with a name beside it; an arrow is a line between two coordinates; a route is
 * *n* of the first threaded onto *n-1* of the second. Nothing new is invented
 * except the ordering, which is the part that carries the meaning: a reader
 * follows a route, and following needs a sequence.
 *
 * **A stop the camera cannot see breaks the line rather than being skipped
 * over.** Threading past a dropped stop would draw a segment between two places
 * that are not adjacent — on a globe, a chord straight through the planet — and
 * a route that claims a leg nobody travels is worse than a route with a gap.
 * So the line is emitted as one path of several subpaths, one per visible run.
 */
export function routeLayer(
  routes: readonly Route[],
  project: (position: Position) => Point | null,
  invert: (point: Point) => Position | null,
  [width, height]: Size,
): PinLayer {
  const nodes: SvgNode[] = [];
  const labels: string[] = [];

  for (const [index, route] of routes.entries()) {
    const stops = route.stops ?? [];
    if (stops.length === 0) continue;

    // `null` marks a stop the camera cannot see, and is what breaks the line.
    const placed = stops.map((stop, at) => {
      const point = resolve(stop.at, index, "routes", project, invert, `stops[${at}].at`);
      return point === null ? null : { stop, point };
    });
    const seen = placed.filter((p): p is NonNullable<typeof p> => p !== null);
    if (seen.length === 0) continue;

    const runs: string[] = [];
    let run: string[] = [];
    for (const item of placed) {
      if (item === null) {
        if (run.length > 1) runs.push(run.join("L"));
        run = [];
        continue;
      }
      run.push(`${round(item.point[0])},${round(item.point[1])}`);
    }
    if (run.length > 1) runs.push(run.join("L"));

    const children: SvgNode[] = [];
    if (route.label !== undefined && route.label !== "") {
      children.push(el("title", {}, [text(route.label)]));
    }
    // A route of one visible stop has no line, only a mark. That is not a
    // failure — it is a route the camera has caught the end of.
    if (runs.length > 0) {
      children.push(
        el("path", { class: "mp-route-line", d: runs.map((r) => `M${r}`).join("") }),
      );
    }

    const onCanvas = seen.some(
      ({ point: [x, y] }) => x >= 0 && x <= width && y >= 0 && y <= height,
    );
    if (onCanvas && route.label !== undefined && route.label !== "") labels.push(route.label);

    if (route.marks !== false) {
      for (const { stop, point } of seen) {
        const [x, y] = point;
        const minor = stop.kind === "minor";
        const radius = minor ? MINOR_STOP_RADIUS : STOP_RADIUS;
        children.push(
          el("circle", {
            class: "mp-route-stop",
            "data-kind": stop.kind,
            cx: round(x),
            cy: round(y),
            r: radius,
          }),
        );
        if (stop.label === undefined || stop.label === "") continue;
        if (x >= 0 && x <= width && y >= 0 && y <= height) labels.push(stop.label);
        const at = labelAt(x, y, stop.offset, radius);
        children.push(
          el(
            "text",
            {
              // `mp-label` for the pin's reason: a stop's name is text on a map
              // and wants the type, the tracking and the halo that rule gives.
              class: "mp-label",
              "data-kind": "route",
              x: round(at.x),
              y: round(at.y),
              "text-anchor": at.anchor,
              "dominant-baseline": "central",
            },
            [text(stop.label)],
          ),
        );
      }
    }

    nodes.push(
      el(
        "g",
        {
          class: "mp-anno mp-route",
          "data-id": route.id,
          "data-kind": route.kind,
          // One visible stop is enough: a route running off the edge is still
          // on the map, which is not what an arrow's two ends can say.
          "data-fit": onCanvas ? 1 : 0,
        },
        children,
      ),
    );
  }

  return { nodes, labels };
}

/**
 * Build the arrows.
 *
 * The first primitive with two coordinates instead of one, and it is drawn only
 * when both survive. Half an arrow is not a partial answer — it is a line
 * pointing at somewhere the reader was never told about, which is worse than
 * nothing at all. So `from` and `to` go through the same resolver a pin's `at`
 * does, and either one failing drops the pair.
 *
 * A curve rather than a straight line because two places on a map usually have
 * something between them: a straight chord runs through whatever is in the way
 * and reads as a border or a route. A bow says "from here to there" without
 * claiming a path, and its sign is the side it bows to, so a caller can flip one
 * off a coastline or out from under an arrow running the other way.
 */
export function arrowLayer(
  arrows: readonly Arrow[],
  project: (position: Position) => Point | null,
  invert: (point: Point) => Position | null,
  [width, height]: Size,
): PinLayer {
  const nodes: SvgNode[] = [];

  for (const [index, arrow] of arrows.entries()) {
    const start = resolve(arrow.from, index, "arrows", project, invert, "from");
    if (start === null) continue;
    const end = resolve(arrow.to, index, "arrows", project, invert, "to");
    if (end === null) continue;

    const [ax, ay] = start;
    const [bx, by] = end;
    const span = Math.hypot(bx - ax, by - ay);
    // Two coordinates that project to the same pixel have no direction, so
    // there is no curve to draw and no way to orient a head on it.
    if (span < 1) continue;

    const bow = arrow.bow ?? ARROW_BOW;
    // A quadratic reaches only halfway to its control point, so the control
    // offset is twice the bow the caller asked to see.
    const lift = bow * span * 2;
    const cx = (ax + bx) / 2 + ((by - ay) / span) * lift;
    const cy = (ay + by) / 2 - ((bx - ax) / span) * lift;

    const onCanvas = [start, end].every(
      ([x, y]) => x >= 0 && x <= width && y >= 0 && y <= height,
    );

    nodes.push(
      el(
        "g",
        {
          class: "mp-anno mp-arrow",
          "data-id": arrow.id,
          "data-kind": arrow.kind,
          // Both ends, because an arrow whose destination is off the canvas has
          // not said where it goes.
          "data-fit": onCanvas ? 1 : 0,
        },
        [
          el("path", {
            class: "mp-arrow-line",
            d:
              bow === 0
                ? `M${round(ax)},${round(ay)}L${round(bx)},${round(by)}`
                : `M${round(ax)},${round(ay)}Q${round(cx)},${round(cy)} ${round(bx)},${round(by)}`,
          }),
        ],
      ),
    );
  }

  return { nodes, labels: [] };
}
