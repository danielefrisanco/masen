/**
 * The class taxonomy — the real public API.
 *
 * A theme is a stylesheet, so every selector anyone ever writes is a promise
 * this project makes. These names are versioned like a function signature and
 * change only on a major. The order of `LAYERS` is the paint order, and it is
 * part of that promise: a layer inserted between two existing ones would
 * silently restack every theme in the wild, so all twelve slots are emitted from
 * v1 onward, empty where the feature does not exist yet.
 *
 * The graticule and land cover were both reserved before anyone asked for
 * them, and that is the whole point. A graticule sits at the very bottom — the
 * grid the world is drawn on, which land covers. Land cover sits directly above
 * the land it tints and below the water, because a river runs over a desert.
 * Both are placements that can only be made once: adding either after 1.0 would
 * restack everything above it. The graticule filled its slot in Phase 8d and
 * land cover filled its own in 8e, neither of them moving a single line of
 * anyone's stylesheet — which is exactly what reserving them bought. Eleven of
 * the twelve slots now carry something; `roads` is the last one still waiting,
 * and it is waiting on data rather than on a decision.
 *
 * Layers are plural (`.mp-land`), features are singular (`.mp-country`).
 *
 * Every layer but the last is geographic: its contents move when the projection
 * or the region changes. `furniture` is the exception — a credit line or a
 * watermark is placed on the *canvas*, in fixed user units, and must not shift
 * when the camera does. That difference is why it is a layer of its own rather
 * than a kind of annotation.
 */

export type LayerName =
  | "ocean"
  | "graticule"
  | "neighbours"
  | "land"
  | "terrain"
  | "hydro"
  | "borders"
  | "roads"
  | "places"
  | "labels"
  | "annotations"
  | "furniture";

export interface LayerSpec {
  readonly name: LayerName;
  /** Class on the group element. Always accompanied by `mp-layer`. */
  readonly className: string;
  /** Class on the elements inside it. */
  readonly feature: string;
  /** `live` layers can carry content in v1; `reserved` ones are always empty. */
  readonly status: "live" | "reserved";
  readonly carries: string;
}

/**
 * Paint order, bottom to top.
 *
 * `neighbours` sits directly above the background and below the land, because
 * context has to be drawn *under* its subject — the region must overlap it, not
 * the reverse. The plan originally placed it above the water; that was wrong,
 * since lakes and rivers are drawn on top of the land they sit in.
 */
export const LAYERS: readonly LayerSpec[] = Object.freeze([
  {
    name: "ocean",
    className: "mp-ocean",
    feature: "mp-sea",
    status: "live",
    carries: "The sea as a shape, rather than as whatever the land does not cover",
  },
  {
    name: "graticule",
    className: "mp-graticule",
    feature: "mp-grid",
    status: "live",
    carries: "Parallels, meridians, the equator and the tropics",
  },
  {
    name: "neighbours",
    className: "mp-neighbours",
    feature: "mp-neighbour",
    status: "live",
    carries: "Surrounding countries drawn as context behind the region",
  },
  {
    name: "land",
    className: "mp-land",
    feature: "mp-country",
    status: "live",
    carries: "Filled land polygons, one node per country",
  },
  {
    name: "terrain",
    className: "mp-terrain",
    feature: "mp-cover",
    status: "live",
    carries: "Land cover — desert, mountain and glacier — tinted over the land",
  },
  {
    name: "hydro",
    className: "mp-hydro",
    feature: "mp-water",
    status: "live",
    carries: "Lakes and rivers, drawn over the land they sit in",
  },
  {
    name: "borders",
    className: "mp-borders",
    feature: "mp-border",
    status: "live",
    carries: "Shared boundaries, drawn once each as unfilled lines",
  },
  {
    name: "roads",
    className: "mp-roads",
    feature: "mp-road",
    status: "reserved",
    carries: "Motorway, trunk and primary routes",
  },
  {
    name: "places",
    className: "mp-places",
    feature: "mp-place",
    status: "live",
    carries: "Settlement dots, ranked 1-3 so a theme can thin them",
  },
  {
    name: "labels",
    className: "mp-labels",
    feature: "mp-label",
    status: "live",
    carries: "Country and settlement names, ranked so a theme can thin them",
  },
  {
    name: "annotations",
    className: "mp-annotations",
    feature: "mp-anno",
    status: "live",
    carries: "Pins, arrows and callouts — the top of the geographic stack",
  },
  {
    name: "furniture",
    className: "mp-furniture",
    feature: "mp-credit",
    status: "live",
    carries: "Credits, watermarks, scale bars, north arrows — on the canvas, not on the map",
  },
]);

/** Class on the root `<svg>`. */
export const ROOT_CLASS = "mp";
/** Class on every layer group, alongside its own name. */
export const LAYER_CLASS = "mp-layer";
/** Class on the canvas ground rectangle. */
export const BACKGROUND_CLASS = "mp-bg";
/**
 * Class on the reserved `<defs>` block.
 *
 * Emitted empty. A stylesheet can express a great deal on its own — the raised
 * relief look is `filter: drop-shadow(...)`, plain CSS, no markup needed — but
 * gradients, patterns and the arrow markers a flow map needs are SVG elements,
 * not declarations, and they have to be defined somewhere before they can be
 * referenced. Claiming the slot now keeps that from becoming a structural
 * change later.
 */
export const DEFS_CLASS = "mp-defs";
/** Modifier added to any feature named in `highlight`. */
export const HIGHLIGHT_CLASS = "is-highlighted";

/**
 * Every feature class that is not a layer's own.
 *
 * The list was first written as "claimed but not built", and it stopped being
 * that the moment a prism was drawn: `mp-prism-top` and `mp-hatch-line` are
 * emitted on every extruded and hatched map and are still listed here. The
 * rule it actually follows — and the more useful one — is that `LAYERS` names
 * one feature class per layer, and everything else a document can contain is
 * named here, built or not. The pin and callout classes join on those terms:
 * pins and callouts are live, and none of them is the annotation layer's feature
 * class, which is `mp-anno`.
 *
 * Naming them keeps a future layer from colliding with a name a theme already
 * relies on, which is the reason the list exists either way.
 */
export const RESERVED_CLASSES: readonly string[] = Object.freeze([
  "mp-anno",
  // A pin is a group: the mark sits at the coordinate, and the label sits
  // beside it carrying `mp-label`, because a name on a map wants the type,
  // the tracking and above all the halo that rule already provides.
  "mp-pin",
  "mp-pin-mark",
  // The glyph inside a mark. `data-icon` names which one, so a theme can style
  // a single kind without knowing the path data.
  "mp-icon",
  // An arrow is a group holding one curve; the head is a marker in the defs
  // block, and its fill comes from a class because a marker resolves colour
  // where it sits rather than where it is used.
  "mp-arrow",
  "mp-arrow-line",
  "mp-arrow-head",
  // A route is a group too: one polyline through every stop, and a ringed mark
  // at each. Its stops carry `mp-label` for the pin's reason — a name on a map
  // wants the type stack and the halo the label rule already provides.
  "mp-route",
  "mp-route-line",
  "mp-route-stop",
  // A callout is a group too: a leader line from the coordinate to the corner
  // of a box, and the caption set inside it on `mp-label`.
  "mp-callout",
  "mp-callout-leader",
  "mp-callout-box",
  // Data-driven renderings of the land layer. A prism map extrudes each
  // country by its value, so a country stops being one path and becomes a top
  // face plus side walls — a different rendering of the same layer, not a new
  // one, which is why these are class names rather than a layer slot.
  "mp-prism",
  "mp-prism-top",
  "mp-prism-side",
  // Hatching laid over a country to say the thing that is not a quantity —
  // disputed, claimed, excluded, no data. `mp-hatch` is the overlay on the
  // map; `mp-hatch-line` is the stroke inside the pattern that draws it.
  "mp-hatch",
  "mp-hatch-line",
  "mp-flow",
  "mp-symbol",
  "mp-watermark",
  "mp-legend",
  // The two pieces of furniture that make a claim about the ground rather than
  // about the map's provenance, which is why each is a group: a measurement
  // needs its number beside it, and a theme has to be able to restyle the mark
  // and the number apart.
  "mp-scale",
  "mp-scale-bar",
  "mp-scale-label",
  "mp-compass",
  "mp-compass-needle",
  "mp-compass-label",
]);

export function layer(name: LayerName): LayerSpec {
  const found = LAYERS.find((spec) => spec.name === name);
  if (!found) throw new Error(`masen: no layer named "${name}"`);
  return found;
}
