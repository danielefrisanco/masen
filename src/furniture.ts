import type { Distortion } from "./distortion.js";
import { el, text, type SvgNode } from "./svg.js";
import type { Anchor, Compass, Credit, Point, ScaleBar, Size } from "./types.js";

/**
 * The furniture layer — everything placed on the canvas rather than on the map.
 *
 * This is the one layer that is not geographic, and the anchor is what makes it
 * so. Every other layer moves when the projection or the region changes,
 * because everything in it is somewhere on the ground. A credit line, a
 * watermark, a legend and a scale bar are on the *paper*: they belong to one of
 * nine positions on the canvas, in fixed user units, and must not shift when the
 * camera does.
 *
 * So the anchor is to this layer what `at` is to the annotations — the one
 * decision the rest of the layer copies. A watermark, a legend, a scale bar and
 * a north arrow all have to answer *where on the canvas*, and they will all
 * answer it this way.
 */

/** The nine positions, written the way a reader would say them. */
export const ANCHORS: readonly Anchor[] = Object.freeze([
  "top-left",
  "top",
  "top-right",
  "left",
  "centre",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
]);

export function isAnchor(value: string): value is Anchor {
  return (ANCHORS as readonly string[]).includes(value);
}

interface Placed {
  readonly x: number;
  readonly y: number;
  /** Which end of the text sits at `x`. */
  readonly textAnchor: "start" | "middle" | "end";
  /** Where `y` falls on the glyphs. */
  readonly baseline: "hanging" | "middle" | "auto";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Turn an anchor into a point and the alignment that belongs with it.
 *
 * The alignment is half of what an anchor means and the easy half to forget: a
 * credit anchored bottom-right is not text placed at the bottom-right corner,
 * it is text whose *end* sits there. Placed by coordinate alone it would run
 * off the canvas, which is a thing you only notice once the credit is long.
 *
 * The inset is the map's own padding, so furniture lines up with the margin the
 * map was already drawn inside rather than inventing a second one.
 */
export function place([width, height]: Size, anchor: Anchor, inset: number): Placed {
  const [row, column] = rowAndColumn(anchor);

  const x = column === "left" ? inset : column === "right" ? width - inset : width / 2;
  const y = row === "top" ? inset : row === "bottom" ? height - inset : height / 2;

  return {
    x: round(x),
    y: round(y),
    textAnchor: column === "left" ? "start" : column === "right" ? "end" : "middle",
    // `hanging` at the top and the default at the bottom, so the inset measures
    // to the edge of the glyphs at both ends rather than to a baseline that
    // leaves the ascenders hanging out of the canvas at the top.
    baseline: row === "top" ? "hanging" : row === "bottom" ? "auto" : "middle",
  };
}

function rowAndColumn(anchor: Anchor): [row: string, column: string] {
  if (anchor === "centre") return ["middle", "centre"];
  const parts = anchor.split("-");
  if (parts.length === 2) return [parts[0] as string, parts[1] as string];
  // A bare "top", "bottom", "left" or "right" names one axis and centres the
  // other, which is what a reader means by it.
  const only = parts[0] as string;
  return only === "top" || only === "bottom" ? [only, "centre"] : ["middle", only];
}

/**
 * Build the furniture layer.
 *
 * Deliberately not part of the accessible description. A credit says who made
 * the map, which is not something the map is *of* — announcing it before the
 * geography would put the byline ahead of the subject.
 */
export function creditLayer(credit: Credit, size: Size, inset: number): SvgNode[] {
  if (credit.text === "") return [];
  const anchor = credit.anchor ?? "bottom-right";
  if (!isAnchor(anchor)) {
    throw new Error(
      `masen: credit.anchor "${anchor}" is not one of ${ANCHORS.join(", ")}`,
    );
  }
  const at = place(size, anchor, inset);
  return [
    el(
      "text",
      {
        class: "mp-credit",
        "data-anchor": anchor,
        x: at.x,
        y: at.y,
        "text-anchor": at.textAnchor,
        "dominant-baseline": at.baseline,
      },
      [text(credit.text)],
    ),
  ];
}

/**
 * Place a fixed-size piece of furniture so its own extent stays inside the inset.
 *
 * `place` positions a single point and lets the text alignment do the rest,
 * which is all a line of type needs. A scale bar and a north arrow are boxes:
 * they have a width and a height of their own, and anchoring them bottom-right
 * means the box's corner sits at the inset, not the box's origin. Returns the
 * top-left corner, so the caller draws in its own coordinates from zero.
 */
export function placeBox(
  [width, height]: Size,
  anchor: Anchor,
  inset: number,
  [boxWidth, boxHeight]: Size,
): Point {
  const [row, column] = rowAndColumn(anchor);
  const x =
    column === "left"
      ? inset
      : column === "right"
        ? width - inset - boxWidth
        : (width - boxWidth) / 2;
  const y =
    row === "top"
      ? inset
      : row === "bottom"
        ? height - inset - boxHeight
        : (height - boxHeight) / 2;
  return [round(x), round(y)];
}

export function checkAnchor(anchor: string, what: string): Anchor {
  if (!isAnchor(anchor)) {
    throw new Error(`masen: ${what} "${anchor}" is not one of ${ANCHORS.join(", ")}`);
  }
  return anchor;
}

/**
 * The scale bar's honesty threshold, as a ratio of largest local scale to
 * smallest across the canvas.
 *
 * A tenth is where the bar's error stops being readable off the bar itself.
 * Sized to the median scale, a map varying by 1.1 is wrong by about five per
 * cent at its worst corner, which on a bar of the width these are drawn at is
 * roughly the height of its own end tick. Past that the bar is not a reading
 * aid with a margin, it is a wrong number.
 */
const SCALE_TOLERANCE = 1.1;

/**
 * The north arrow's threshold, in degrees away from straight up.
 *
 * Five degrees moves the tip of a 26-unit needle by 2.3 units — about the
 * needle's own width where it tapers. A lean smaller than the mark that draws
 * it is not a lean anyone can see.
 */
const NORTH_TOLERANCE = 5;

/** Height of the ticks at each end of the bar. */
const BAR_TICK = 6;
/** Between the bar and the number above it. */
const BAR_GAP = 3;
/** Most of the canvas width a bar may claim when the caller does not say. */
const BAR_FRACTION = 0.25;
/** Shorter than this and there is nothing to step across the map with. */
const BAR_MIN = 40;

const KM_PER_MILE = 1.609344;

/** The 1–2–5 series, the steps a reader expects a scale bar to be labelled in. */
const STEPS = [1, 2, 5] as const;

/**
 * The largest 1, 2 or 5 × 10ⁿ at or below `value`.
 *
 * A bar reading 237 km is a bar nobody can step across a map: the number exists
 * to be doubled and tripled in the reader's head, which only works if it is
 * round. So the *width* is derived from the number rather than the number from
 * the width.
 */
function niceBelow(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 0;
  const decade = Math.floor(Math.log10(value));
  for (const step of [...STEPS].reverse()) {
    const candidate = step * 10 ** decade;
    if (candidate <= value) return candidate;
  }
  return 5 * 10 ** (decade - 1);
}

/** Round to at most three decimals and drop the trailing zeros. */
function figure(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Build the scale bar, or nothing when the map cannot honestly carry one.
 *
 * Refusing is the feature. Every other layer draws what it is asked for and
 * lets the theme decide whether it shows; this one is a statement of fact about
 * the ground, and a map whose scale varies across the frame has no single fact
 * to state. `map.distortion()` reports the measurement, so a caller who gets no
 * bar can find out by how much they missed rather than guessing.
 */
export function scaleLayer(
  bar: ScaleBar,
  size: Size,
  inset: number,
  labelSize: number,
  distortion: Distortion,
): SvgNode[] {
  const anchor = checkAnchor(bar.anchor ?? "bottom-left", "scaleBar.anchor");
  const tolerance = bar.tolerance ?? SCALE_TOLERANCE;
  if (!(distortion.scale <= tolerance)) return [];

  const units = bar.units ?? "km";
  if (units !== "km" && units !== "mi") {
    throw new Error(`masen: scaleBar.units "${units}" is not "km" or "mi"`);
  }
  const perUnit = units === "mi" ? distortion.kmPerUnit / KM_PER_MILE : distortion.kmPerUnit;
  if (!(perUnit > 0)) return [];

  const [width] = size;
  const room = Math.min(bar.maxWidth ?? width * BAR_FRACTION, width - 2 * inset);
  const distance = niceBelow(room * perUnit);
  const barWidth = round(distance / perUnit);
  if (!(barWidth >= BAR_MIN)) return [];

  const top = labelSize + BAR_GAP;
  const boxHeight = top + BAR_TICK;
  const [x, y] = placeBox(size, anchor, inset, [barWidth, boxHeight]);

  return [
    el(
      "g",
      {
        class: "mp-scale",
        "data-anchor": anchor,
        "data-distance": figure(distance),
        "data-units": units,
        transform: `translate(${x},${y})`,
      },
      [
        el(
          "text",
          {
            class: "mp-scale-label",
            x: round(barWidth / 2),
            y: 0,
            "text-anchor": "middle",
            "dominant-baseline": "hanging",
          },
          [text(`${figure(distance)} ${units}`)],
        ),
        // A rule with a tick rising at each end: the ticks are what make it a
        // measurement rather than a line, because they say where it stops.
        el("path", {
          class: "mp-scale-bar",
          d: `M0,${top} V${boxHeight} H${barWidth} V${top}`,
        }),
      ],
    ),
  ];
}

/** The needle's box, in its own units. */
const NEEDLE_WIDTH = 18;
const NEEDLE_HEIGHT = 26;
const NEEDLE_GAP = 3;

/**
 * Build the north arrow, or nothing when up is not north.
 *
 * The same shape of claim as the scale bar's and refused the same way. It is
 * the narrower of the two: a conic fitted to a region keeps its scale within a
 * few per cent while its meridians fan out by twenty degrees at the corners, so
 * plenty of maps earn a bar and no arrow. Mercator is the opposite case and the
 * reason the arrow exists at all — north is exactly up on every mercator ever
 * drawn, whatever the extent.
 */
export function compassLayer(
  compass: Compass,
  size: Size,
  inset: number,
  labelSize: number,
  distortion: Distortion,
): SvgNode[] {
  const anchor = checkAnchor(compass.anchor ?? "top-right", "compass.anchor");
  const tolerance = compass.tolerance ?? NORTH_TOLERANCE;
  if (!(distortion.north <= tolerance)) return [];

  const top = labelSize + NEEDLE_GAP;
  const boxHeight = top + NEEDLE_HEIGHT;
  const [x, y] = placeBox(size, anchor, inset, [NEEDLE_WIDTH, boxHeight]);
  const middle = NEEDLE_WIDTH / 2;

  return [
    el(
      "g",
      {
        class: "mp-compass",
        "data-anchor": anchor,
        transform: `translate(${x},${y})`,
      },
      [
        el(
          "text",
          {
            class: "mp-compass-label",
            x: middle,
            y: 0,
            "text-anchor": "middle",
            "dominant-baseline": "hanging",
          },
          [text("N")],
        ),
        // A kite with a notch cut into its tail, which is the shape that reads
        // as an arrow at this size without needing a shaft.
        el("path", {
          class: "mp-compass-needle",
          d:
            `M${middle},${top}` +
            ` L${NEEDLE_WIDTH - 1},${boxHeight}` +
            ` L${middle},${boxHeight - 6}` +
            ` L1,${boxHeight} Z`,
        }),
      ],
    ),
  ];
}
