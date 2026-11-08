import type { GeoProjection } from "d3-geo";
import { centroid, contains, projectRings, ringBox, signedArea, type Ring } from "./rings.js";
import type { GridMark } from "./graticule.js";
import { el, text, type SvgElement, type SvgNode } from "./svg.js";
import { HIGHLIGHT_CLASS } from "./taxonomy.js";

/**
 * Text on a map, placed honestly.
 *
 * This is the weakest part of drawing a map as an SVG and the part to scope
 * plainly rather than oversell. There is no label-placement solver here — no
 * search over candidate positions, no relaxation, nothing that moves a label
 * twice. What there is instead is a fit test, one sideways step, and a greedy
 * first-come pass that hides whatever still lands on something already placed.
 * Every one of those is a single deterministic decision per label, and none of
 * them can produce a different map on a second run.
 *
 * The decisions, in the order they are made.
 *
 * The anchor is the balance point of the country's *largest ring that is on
 * the canvas*, not the centroid of its whole geometry. A country is often
 * several pieces, and France's geometry reaches French Guiana — the same fact
 * that once made France the frontmost country in Europe for prism sorting.
 * Averaging all of it puts "France" in the Atlantic.
 *
 * When that balance point falls outside the country — which is what happens to
 * every crescent, every archipelago spine, every Croatia — it is replaced by
 * the deepest interior point, found by refining a grid. This is what the plan
 * called a curated table of thirty hand-tuned anchors; the geometry knows the
 * answer, and unlike a table it cannot go stale when the source data does.
 *
 * The fit test compares the width the name needs against the width the country
 * actually has at that point, breaking the name over two lines if that is what
 * makes it fit.
 *
 * Then names are laid down in order of importance, and any that lands on one
 * already down is marked `data-fit="0"`. Nothing is moved to make room and
 * nothing is retried, which is what keeps this from being a solver: the world
 * has some two hundred capitals and a world map has room for perhaps thirty,
 * so the question is only which thirty.
 *
 * Nothing is ever dropped from the document. Every name is written out, and
 * `data-fit="0"` is hidden by a stylesheet rule the theme can turn off — the
 * library's job is to state facts, and a poster map may well want all of them.
 */

/**
 * Average glyph advance as a fraction of the font size.
 *
 * SVG has no measuring API outside a browser and this library has no font
 * metrics, so the fit test estimates. 0.58 is close for the sans and serif
 * stacks the bundled themes use, and erring high would hide names that fit.
 * A stylesheet that knows better says so in `--label-advance` — which is how a
 * condensed face earns the extra names it can actually carry.
 */
const ADVANCE = 0.58;

/** Gap between a settlement dot and its name, in user units. */
const PLACE_GAP = 3;

/** What the fit test assumes when a stylesheet does not say. */
const DEFAULT_LABEL_SIZE = 13;

/** The pin radius a theme gets if it does not ask for one. See {@link LabelSizes}. */
const DEFAULT_PIN_RADIUS = 7;

export interface LabelSizes {
  readonly country: number;
  readonly place: number;
  /** How wide the chosen face runs, as a fraction of the size. */
  readonly advance: number;
  /**
   * Letter-spacing, in user units per character.
   *
   * Read for the annotation layer, which has to size a box around a caption and
   * therefore cannot ignore the tracking the way the fit test does. `noir` sets
   * it to 0.3, which over a twenty-character line is six units the box would
   * otherwise not have accounted for — and a caption printed through the side
   * of its own box is exactly what that looked like.
   */
  readonly track: number;
  /**
   * The radius of a pin's mark, in user units.
   *
   * Read from the stylesheet for the same reason `--label-size` is: the
   * geometry has to know it. A pin carrying an icon is a circle *and* a glyph
   * scaled to fit inside it, and CSS can only reach the circle — set the radius
   * in a rule and the mark grows while the icon stays where it was. So the size
   * arrives through a token the geometry reads, and both follow it.
   */
  readonly pin: number;
}

function declared(css: string, token: string, fallback: number, allowZero = false): number {
  const pattern = new RegExp(`${token}\\s*:\\s*([\\d.]+)`, "g");
  let size = fallback;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const value = Number(match[1]);
    // A size of zero is a broken stylesheet and the fallback is kinder. Tracking
    // of zero is the commonest value there is, so it has to be allowed through.
    if (Number.isFinite(value) && (value > 0 || (allowZero && value === 0))) size = value;
  }
  return size;
}

/**
 * The label sizes the resolved theme actually asks for.
 *
 * Read from the stylesheet rather than assumed, so `tokens: { "--label-size":
 * "20" }` narrows what fits instead of silently overflowing. The last
 * declaration wins, which is how the cascade resolves it too. A write-time
 * override passed to `render()` arrives after the geometry is settled and
 * cannot be tracked; that is documented rather than worked around.
 */
export function labelSizes(css: string): LabelSizes {
  const country = declared(css, "--label-size", DEFAULT_LABEL_SIZE);
  return {
    country,
    place: declared(css, "--place-label-size", country),
    advance: declared(css, "--label-advance", ADVANCE),
    track: declared(css, "--label-track", 0, true),
    pin: declared(css, "--pin-size", DEFAULT_PIN_RADIUS),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Estimated width of a string, in user units.
 *
 * Exported because the annotation layer has to size a callout's box around its
 * caption, and two estimators would drift: this one is the whole meaning of
 * `--label-advance`, the channel by which a stylesheet tells the geometry how
 * wide its own face runs.
 */
export function textWidth(name: string, size: number, advance: number): number {
  return name.length * size * advance;
}

/** Distance from a point to a segment — the metric the interior search maximises. */
function segmentDistance(
  [x, y]: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length));
  const px = a[0] + t * dx - x;
  const py = a[1] + t * dy - y;
  return Math.sqrt(px * px + py * py);
}

/** Cost is quadratic in ring length, and an outline this dense is already smooth. */
function thinned(ring: Ring, limit = 160): Ring {
  if (ring.length <= limit) return ring;
  const step = ring.length / limit;
  return Array.from({ length: limit }, (_, i) => ring[Math.floor(i * step)] as [number, number]);
}

function edgeDistance(edges: Ring, point: readonly [number, number]): number {
  let nearest = Infinity;
  for (let i = 0; i < edges.length; i += 1) {
    const a = edges[i] as [number, number];
    const b = edges[(i + 1) % edges.length] as [number, number];
    nearest = Math.min(nearest, segmentDistance(point, a, b));
  }
  return nearest;
}

const GRID = 8;
const PASSES = 3;

/**
 * The point furthest from any edge — an approximate pole of inaccessibility.
 *
 * A coarse grid, then two refinements around the best cell. Exact would mean a
 * priority queue and a convergence bound; this is within a pixel or two of it
 * on a shape the size of a country, and it only runs for the countries whose
 * centroid missed.
 */
function interior(ring: Ring): [number, number] {
  const [minX, minY, maxX, maxY] = ringBox(ring);
  const edges = thinned(ring);
  let best: [number, number] = centroid(ring);
  let bestDistance = -Infinity;
  let [x0, y0, x1, y1] = [minX, minY, maxX, maxY];

  for (let pass = 0; pass < PASSES; pass += 1) {
    const stepX = (x1 - x0) / GRID;
    const stepY = (y1 - y0) / GRID;
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        const point: [number, number] = [x0 + i * stepX, y0 + j * stepY];
        if (!contains(ring, point)) continue;
        const distance = edgeDistance(edges, point);
        if (distance > bestDistance) {
          bestDistance = distance;
          best = point;
        }
      }
    }
    if (bestDistance === -Infinity) break;
    [x0, x1] = [best[0] - stepX, best[0] + stepX];
    [y0, y1] = [best[1] - stepY, best[1] + stepY];
  }
  return best;
}

/**
 * How much room the name has, centred on the anchor.
 *
 * The width of the country along the line the text sits on, measured to the
 * nearer side — a name centred in a shape that is wider to the left than the
 * right still runs off the narrow side first.
 */
function spanAt(ring: Ring, [x, y]: readonly [number, number]): number {
  const crossings: number[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i] as [number, number];
    const b = ring[(i + 1) % ring.length] as [number, number];
    if (a[1] > y === b[1] > y) continue;
    crossings.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
  }
  crossings.sort((p, q) => p - q);
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const left = crossings[i] as number;
    const right = crossings[i + 1] as number;
    if (x >= left && x <= right) return 2 * Math.min(x - left, right - x);
  }
  return 0;
}

/**
 * How much room the name has if the whole country counts, not just the shape
 * under the anchor — islands and the water between them included.
 *
 * Measured to the nearer side, exactly as `spanAt` does, so the two numbers
 * mean the same thing and can be compared.
 */
function reachAt(
  rings: readonly Ring[],
  [x]: readonly [number, number],
  canvasWidth: number,
): number {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const ring of rings) {
    const [left, , right] = ringBox(ring);
    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
  }
  minX = Math.max(minX, 0);
  maxX = Math.min(maxX, canvasWidth);
  if (!(maxX > minX) || x < minX || x > maxX) return 0;
  return 2 * Math.min(x - minX, maxX - x);
}

interface Anchor {
  readonly point: [number, number];
  readonly span: number;
  /** The outline the name belongs to, so a sideways step can stay on it. */
  readonly ring: Ring;
}

/**
 * Where to put the name, given how much room it needs.
 *
 * The balance point is tried first and kept only when the name actually fits
 * there — being *inside* the country is not enough on its own. Croatia proved
 * that: its centroid lands by luck in the thin northern arm, a legitimate
 * interior point with seven tenths of a pixel of room either side, and the
 * name was placed there and then hidden as unfittable. The deeper search finds
 * Slavonia, where the name goes.
 *
 * Running that search only when the centroid falls short keeps its cost off
 * every country that never needed it.
 */
function anchorOf(
  rings: readonly Ring[],
  canvas: readonly [number, number],
  needed: number,
): Anchor | null {
  const [width, height] = canvas;
  const visible = rings.filter((ring) => {
    const [minX, minY, maxX, maxY] = ringBox(ring);
    return maxX >= 0 && minX <= width && maxY >= 0 && minY <= height;
  });
  const considered = visible.length > 0 ? visible : rings;

  let largest: Ring | null = null;
  let largestArea = 0;
  for (const ring of considered) {
    const area = Math.abs(signedArea(ring));
    if (area > largestArea) {
      largestArea = area;
      largest = ring;
    }
  }
  if (largest === null || largestArea === 0) return null;

  const balance = centroid(largest);
  const settled: Anchor = contains(largest, balance)
    ? { point: balance, span: spanAt(largest, balance), ring: largest }
    : { point: balance, span: 0, ring: largest };
  if (settled.span >= needed) return settled;

  const deepest = interior(largest);
  const span = spanAt(largest, deepest);
  const best = span > settled.span ? { point: deepest, span, ring: largest } : settled;
  if (best.span >= needed || considered.length < 2) return best;

  // A scattered country is not a small one, and the fit test cannot tell them
  // apart: it measures a name against the shape beneath it, so "Philippines"
  // is hidden because no single island is as wide as the word — while every
  // printed atlas sets it across the whole group, over the water between the
  // islands, because the group is the thing being named.
  //
  // So when a country is more than one piece and no piece can hold its name,
  // the room it has is the reach of the group. The anchor does not move: it
  // stays on the largest island, and the name overhangs from there the way
  // "Portugal" overhangs into the Atlantic. Only the measurement changes, so
  // this can reveal a name and can never relocate one.
  const reach = reachAt(considered, best.point, width);
  return reach > best.span ? { ...best, span: reach } : best;
}

interface Lines {
  readonly lines: readonly string[];
  /** The width of the longest line — what the fit test measures against. */
  readonly width: number;
}

/**
 * Break a name across two lines, the way an atlas does.
 *
 * Only when the single line does not fit, and only when breaking it actually
 * helps: "Costa Rica" set over two lines on a map with room for one is worse,
 * not better. Two lines and no more — a third would be taller than most of the
 * countries that need one.
 */
function wrapped(name: string, size: number, advance: number): Lines {
  const words = name.split(" ");
  const single: Lines = { lines: [name], width: textWidth(name, size, advance) };
  if (words.length < 2) return single;

  let best = single;
  for (let cut = 1; cut < words.length; cut += 1) {
    const head = words.slice(0, cut).join(" ");
    const tail = words.slice(cut).join(" ");
    const width = Math.max(textWidth(head, size, advance), textWidth(tail, size, advance));
    if (width < best.width) best = { lines: [head, tail], width };
  }
  return best;
}

/**
 * A name wider than its country is normal on a real map — "Portugal" overhangs
 * into the Atlantic in every atlas ever printed. What is not normal is a name
 * many times wider than the country it names, which is why the cut is here and
 * not at 1: the test is meant to remove the microstates, not to police the
 * ordinary overhang. Everything below it is still emitted, hidden by a rule a
 * poster map can turn off.
 */
const LEGIBLE = 0.35;
/** Above this a name sits inside its country with room to spare. */
const COMFORTABLE = 1.5;

/** Vertical offsets for a two-line name, as fractions of the font size. */
const FIRST_LINE = -0.55;
const LINE_HEIGHT = 1.1;

function lines(set: Lines, x: number, size: number): SvgNode[] {
  if (set.lines.length === 1) return [text(set.lines[0] as string)];
  // `dy` in user units rather than `em`: the flattened export is read by tools
  // that resolve lengths but not font-relative ones.
  return set.lines.map((line, index) =>
    el(
      "tspan",
      { x: round(x), dy: round(index === 0 ? FIRST_LINE * size : LINE_HEIGHT * size) },
      [text(line)],
    ),
  );
}

/** A label's footprint, `[minX, minY, maxX, maxY]`, for stepping around it. */
export type LabelBox = readonly [number, number, number, number];

function hits(a: LabelBox, b: LabelBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function boxAt(x: number, y: number, width: number, height: number): LabelBox {
  return [x - width / 2, y - height / 2, x + width / 2, y + height / 2];
}

/** How far a country name steps to clear a settlement name, in line heights. */
const STEP = 1.4;

/**
 * Country names step aside from settlement names; settlement names never move.
 *
 * This is not the collision engine v1 does not have. It resolves exactly one
 * conflict, between two things this function can see at once, with a few
 * steps up and down and no wider search — but that one conflict is the common case
 * rather than an edge case, because a capital usually sits near the middle of
 * its country and that is precisely where the country's own name goes. Left
 * alone it put "Madrid" through "Spain", "Bern" through "Switzerland" and
 * "Amsterdam" through "Netherlands" on the same map.
 *
 * Country names can still meet each other. That limitation stands and is
 * documented; ranks exist so a theme can thin its way out of it.
 */
function stepAside(
  x: number,
  y: number,
  width: number,
  size: number,
  avoid: readonly LabelBox[],
  onCountry: (at: readonly [number, number]) => boolean,
): number {
  const clear = (at: number): boolean =>
    !avoid.some((box) => hits(boxAt(x, at, width, size), box));
  if (clear(y)) return y;
  // A step that leaves the country is not a step aside, it is a mislabelling:
  // moving "Belgium" clear of "Brussels" by putting it in France helps nobody.
  // Up to three steps each way, nearest first: one clears a city name, but an
  // H or an L with its value under it is four lines tall, and one step left
  // "Thailand" across the L of a low on Bangkok.
  for (const steps of [1, 2, 3]) {
    for (const offset of [-steps * STEP * size, steps * STEP * size]) {
      if (clear(y + offset) && onCountry([x, y + offset])) return y + offset;
    }
  }
  return y;
}

/**
 * A label that has been positioned but not yet judged against its neighbours.
 *
 * The element is built without `data-fit`, which is stamped on at the end —
 * a label cannot know whether it clears the others until the others exist.
 */
export interface Placed {
  readonly node: SvgElement;
  readonly box: LabelBox;
  /** Whether the name fits the shape it names. */
  readonly fits: boolean;
  /** Higher is laid down first when two labels want the same space. */
  readonly priority: number;
}

/**
 * A little grazing is not a collision.
 *
 * Text boxes are estimated from an average glyph advance and a nominal line
 * height, so they are already generous — testing them edge to edge threw away
 * "Brussels" for touching the tail of "Belgium" by a hair.
 */
const SLACK = 1.5;

function inset(box: LabelBox): LabelBox {
  return [box[0] + SLACK, box[1] + SLACK, box[2] - SLACK, box[3] - SLACK];
}

/**
 * Decide what survives, and stamp the rest.
 *
 * Country names go down first and in order of how much room they have, so the
 * countries with space to be named keep their names and a crowded one gives
 * way. Settlement names follow in the order the data ranks them, which is
 * capitals and the largest cities first. A name that does not fit its own
 * country is hidden and reserves nothing — it was never really placed.
 */
export function labelLayer(
  countries: readonly Placed[],
  places: readonly Placed[],
  seas: readonly Placed[] = [],
  grid: readonly Placed[] = [],
  // Marks drawn above the names that no name may sit under — the H and L of a
  // pressure chart. A name that could not step clear of one is hidden rather
  // than shown half covered: "Croati H" is neither the name nor the mark.
  blocked: readonly LabelBox[] = [],
): SvgNode[] {
  const taken: LabelBox[] = [...blocked];
  const hidden = new Set<SvgElement>();

  // Grid numbers are judged first because they are the only labels that cannot
  // move. A country name has a shape to sit somewhere else in and a settlement
  // name can be dropped; 45°N is at 45°N or it is a lie. Everything else gives
  // way to them.
  //
  // Seas are judged last and so give way to everything: the land is the
  // subject, and a name on the water is the one that can be spared. Among
  // themselves they go in rank order, largest water first.
  const ordered = [...grid]
    .concat([...countries].sort((a, b) => b.priority - a.priority))
    .concat(places)
    .concat([...seas].sort((a, b) => b.priority - a.priority));
  for (const label of ordered) {
    if (!label.fits || taken.some((box) => hits(inset(label.box), box))) {
      hidden.add(label.node);
      continue;
    }
    taken.push(inset(label.box));
  }

  // Emitted in paint order, not in the order they were judged: a settlement
  // name reads over the country it sits in, and a sea name sits under both.
  return [...grid, ...seas, ...countries, ...places].map(({ node }) =>
    hidden.has(node)
      ? el(node.tag, { ...node.attributes, "data-fit": "0" }, node.children)
      : node,
  );
}

/**
 * The grid's numbers, as text on the frame.
 *
 * The placement was already decided — `graticuleLayer` measured where each line
 * meets the canvas — so this is only the part that turns a decision into a
 * label: a node, and a box for the solver to reserve.
 *
 * They are `.mp-label[data-kind="grid"]` rather than a class of their own. A
 * degree number is a name for a line in exactly the way a settlement name is a
 * name for a dot, and giving it the same class means it already inherits the
 * typeface, the halo and the flattening every other label gets — a new class
 * would have needed all three added again, and the export would have been the
 * place it was noticed missing.
 *
 * The box is built from the anchor rather than centred on it: a number written
 * from the left edge of the frame extends to the right of the point it is
 * anchored at, and a box centred there would reserve empty paper on one side
 * while leaving the text unprotected on the other.
 */
export function gridLabels(
  marks: readonly GridMark[],
  size: number,
  advance: number,
): Placed[] {
  return marks.map((mark) => {
    const [x, y] = mark.at;
    const wide = textWidth(mark.text, size, advance);
    const left = mark.anchor === "start" ? x : mark.anchor === "end" ? x - wide : x - wide / 2;
    return {
      node: el(
        "text",
        {
          class: "mp-label",
          "data-kind": "grid",
          "data-line": mark.kind,
          x: round(x),
          y: round(y),
          "text-anchor": mark.anchor,
          "dominant-baseline": "central",
        },
        [text(mark.text)],
      ),
      box: [left, y - size / 2, left + wide, y + size / 2] as LabelBox,
      fits: true,
      priority: 0,
    };
  });
}

export interface CountryLabel {
  readonly id: string;
  readonly name: string;
  readonly geometry: unknown;
  /** How far its prism stands off the map, so the name rides the top face. */
  readonly lift: number;
  readonly highlighted: boolean;
}

export function countryLabels(
  countries: readonly CountryLabel[],
  projection: GeoProjection,
  canvas: readonly [number, number],
  size: number,
  advance: number,
  avoid: readonly LabelBox[] = [],
): Placed[] {
  const [width, height] = canvas;
  const placed: Placed[] = [];

  for (const country of countries) {
    if (country.name === "") continue;
    const needed = textWidth(country.name, size, advance);
    const anchor = anchorOf(projectRings(country.geometry, projection), canvas, needed);
    if (anchor === null) continue;

    const [x, ground] = anchor.point;
    const settled = ground - country.lift;
    if (x < 0 || x > width || settled < 0 || settled > height) continue;

    const set = anchor.span >= needed ? { lines: [country.name], width: needed } : wrapped(country.name, size, advance);
    // A two-line name is twice as tall, and has twice as much to clear.
    const y = stepAside(x, settled, set.width, size * set.lines.length, avoid, (at) =>
      contains(anchor.ring, at),
    );
    // A ratio rather than a boolean, so a theme can thin by how cramped a name
    // is instead of by how big its country happens to be. Rank 3 is the one
    // that overhangs, and the first worth dropping from a crowded map.
    const ratio = anchor.span / set.width;

    const tall = size * set.lines.length;
    placed.push({
      node: el(
        "text",
        {
          class: country.highlighted ? `mp-label ${HIGHLIGHT_CLASS}` : "mp-label",
          "data-kind": "country",
          "data-iso": country.id === "" ? undefined : country.id,
          "data-rank": ratio >= COMFORTABLE ? 1 : ratio >= 1 ? 2 : 3,
          x: round(x),
          y: round(y),
          "text-anchor": "middle",
          "dominant-baseline": "central",
        },
        lines(set, x, size),
      ),
      box: boxAt(x, y, set.width, tall),
      fits: ratio >= LEGIBLE,
      // Room to spare is what earns a name its place: on a crowded map the
      // country that can carry its name keeps it.
      priority: ratio,
    });
  }
  return placed;
}

/**
 * How far a coordinate may drift through a round trip before its pixel belongs
 * to somebody else, in degrees.
 *
 * The same guard the annotation layer uses and for the same reason: an
 * orthographic projection answers a coordinate on the far side of the globe
 * with a pixel on the near side, so "South Pacific Ocean" would be set neatly
 * across the Atlantic on a Europe-centred globe. `invert()` returns the near
 * side by construction, so a coordinate that survives the trip is one the
 * camera can really see.
 */
const ROUND_TRIP_TOLERANCE = 1e-6;

/** What a sea label needs to know about itself. */
export interface SeaLabel {
  readonly name: string;
  readonly kind: string;
  readonly position: readonly [number, number];
  readonly rank: 1 | 2 | 3;
}

/**
 * The name of a sea, set at the point the build decided its name belongs.
 *
 * There is no fit test here, and that is the difference between naming a
 * country and naming a sea. A country name has to fit inside a shape the map
 * has drawn, and can be measured against it. A sea's shape was reduced to one
 * anchor at build time and is not on hand — so the rule the caller is given is
 * the simpler one this can honestly keep: **a sea is named when its middle is
 * on the map**. What remains is the collision pass, which sea names go into
 * last, because a country's name and a city's both outrank the water.
 */
export function seaLabels(
  seas: readonly SeaLabel[],
  projection: GeoProjection,
  canvas: readonly [number, number],
  size: number,
  advance: number,
): Placed[] {
  const [width, height] = canvas;
  const placed: Placed[] = [];
  const invert = projection.invert?.bind(projection);

  for (const sea of seas) {
    const point = projection([sea.position[0], sea.position[1]]);
    if (point === null) continue;
    const [x, y] = point;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    // The whole name, not the anchor. A country's name is anchored inside a
    // shape that is itself on the canvas, so testing the point is enough
    // there; a sea name is centred on a coordinate with nothing holding it in,
    // and testing the point alone put "Aegea" and "Baltic Se" against the
    // frame edge on the first two maps drawn with this on.
    const wide = textWidth(sea.name, size, advance);
    if (x - wide / 2 < 0 || x + wide / 2 > width) continue;
    if (y - size / 2 < 0 || y + size / 2 > height) continue;
    if (invert !== undefined) {
      const back = invert([x, y]);
      if (back === null) continue;
      if (
        Math.abs(back[0] - sea.position[0]) > ROUND_TRIP_TOLERANCE ||
        Math.abs(back[1] - sea.position[1]) > ROUND_TRIP_TOLERANCE
      ) {
        continue;
      }
    }

    placed.push({
      node: el(
        "text",
        {
          class: "mp-label",
          "data-kind": "sea",
          "data-sea": sea.kind,
          "data-rank": sea.rank,
          x: round(x),
          y: round(y),
          "text-anchor": "middle",
          "dominant-baseline": "central",
        },
        [text(sea.name)],
      ),
      box: boxAt(x, y, wide, size),
      fits: true,
      // Ranked among themselves so the Mediterranean beats the Ionian for a
      // space they both want; against the land they are judged last regardless.
      priority: 4 - sea.rank,
    });
  }
  return placed;
}

/**
 * A settlement name, set beside its dot.
 *
 * Always to the right, always on the same baseline: alternating sides to dodge
 * a neighbour would be collision detection by another name, and doing it badly
 * is worse than not doing it.
 */
export function placeLabel(
  place: { readonly name: string; readonly iso: string | null; readonly rank: 1 | 2 | 3; readonly capital: boolean },
  x: number,
  y: number,
  radius: number,
  size: number,
  advance: number,
): Placed {
  const left = x + radius + PLACE_GAP;
  const width = textWidth(place.name, size, advance);
  return {
    fits: true,
    // Settlements are handed over already ranked by the data, so their order
    // is their priority and this never has to break a tie.
    priority: 0,
    node: el(
      "text",
      {
        class: "mp-label",
        "data-kind": "place",
        "data-iso": place.iso ?? undefined,
        "data-rank": place.rank,
        "data-capital": place.capital ? "" : undefined,
        x: round(left),
        y: round(y),
        "text-anchor": "start",
        "dominant-baseline": "central",
      },
      [text(place.name)],
    ),
    // The dot counts too: a name that clears the text but sits on the mark is
    // no clearer for it.
    box: [x - radius, y - size / 2, left + width, y + size / 2],
  };
}
