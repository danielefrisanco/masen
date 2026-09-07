import { geoBounds, geoContains, geoPath } from "d3-geo";
import { assignBins, DEFAULT_BINS } from "./bins.js";
import { arrowLayer, calloutLayer, pinLayer, routeLayer } from "./annotations.js";
import { compassLayer, creditLayer, scaleLayer } from "./furniture.js";
import { measureDistortion, type Distortion } from "./distortion.js";
import { omissionsOf, type Omissions } from "./omissions.js";
import { watermarkLayer } from "./watermark.js";
import { graticuleLayer, type GridMark } from "./graticule.js";
import { framingGeometry, type FrameGeometry } from "./framing.js";
import { resolveId } from "./iso.js";
import {
  countryLabels,
  gridLabels,
  labelLayer,
  labelSizes,
  placeLabel,
  seaLabels,
  type LabelBox,
  type Placed,
} from "./labels.js";
import { heightsFor, prisms, type PrismInput } from "./prism.js";
import { politicalFill } from "./political.js";
import { createProjection, resolveCentre } from "./projections.js";
import { expandPreset, isRegionPreset, presetLabel } from "./regions.js";
import { referencedFilters } from "./filters.js";
import { referencedMarkers } from "./markers.js";
import { referencedPatterns } from "./patterns.js";
import { inlineStyles } from "./inline.js";
import { hashCss, scopeIds, scopeIdsInNodes } from "./css.js";
import { el, serialize, styleElement, text, type SvgElement, type SvgNode } from "./svg.js";
import { resolveTheme, type ResolvedTheme } from "./theme.js";
import {
  BACKGROUND_CLASS,
  DEFS_CLASS,
  HIGHLIGHT_CLASS,
  LAYER_CLASS,
  LAYERS,
  ROOT_CLASS,
  type LayerName,
} from "./taxonomy.js";
import {
  loadCover,
  loadDisputed,
  loadOcean,
  loadWorld,
  type CountryFeature,
} from "./topology.js";
import type {
  BBox,
  Cover,
  Detail,
  GeoJsonFeatureCollection,
  MapOptions,
  MapResult,
  Point,
  Position,
  Region,
  RenderOptions,
  Size,
  Water,
} from "./types.js";

export { isoTable, resolveId, type IsoEntry } from "./iso.js";

/** A country that can be named in `region`, with the name it draws under. */
export interface CountryName {
  /** The ISO code `region` and `highlight` take. */
  readonly code: string;
  /** Natural Earth's own name for it, which is what a label would say. */
  readonly name: string;
}

/**
 * Every country the bundled data can draw, with its code and its name.
 *
 * `isoTable()` has been here since Phase 1 and answers a different question: it
 * is the code-to-numeric-id map, and it carries no names, because a name is a
 * fact about the *data* rather than about the standard. So a caller building a
 * country picker had codes and nothing to show beside them.
 *
 * The two tiers do not hold the same countries — 177 at 110m against 241 at
 * 50m, because the coarse tier drops the small ones — so the tier is part of
 * the question rather than a detail. Sorted by name, which is the order a list
 * of them wants to be read in.
 */
export async function countryTable(detail: Detail = "110m"): Promise<readonly CountryName[]> {
  const world = await loadWorld(detail);
  return world.countries
    .filter((country) => country.id !== "" && country.name !== "")
    .map((country) => ({ code: country.id, name: country.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export { FILL_COUNT, politicalFill } from "./political.js";
export type { Omissions } from "./omissions.js";
export { PROJECTION_NAMES, isProjectionName } from "./projections.js";
export { REGION_PRESETS, REGION_PRESET_NAMES, isRegionPreset } from "./regions.js";
export { FILTER_NAMES } from "./filters.js";
export { PATTERN_NAMES } from "./patterns.js";
export { ANCHORS, isAnchor } from "./furniture.js";
export type { Distortion } from "./distortion.js";
export { ICONS, ICON_NAMES, ICON_GRID, isIconName } from "./icons.js";
export { MARKER_NAMES } from "./markers.js";
export {
  PALETTE_NAMES,
  THEME_NAMES,
  TYPEFACE_NAMES,
  THEMES,
  PALETTES,
  TYPEFACES,
} from "./theme.js";
export { TOKENS, TOKEN_NAMES, isTokenName, type TokenSpec } from "./tokens.js";
export {
  BACKGROUND_CLASS,
  DEFS_CLASS,
  HIGHLIGHT_CLASS,
  LAYERS,
  LAYER_CLASS,
  RESERVED_CLASSES,
  ROOT_CLASS,
  type LayerName,
  type LayerSpec,
} from "./taxonomy.js";

export type {
  Anchor,
  Arrow,
  BBox,
  Callout,
  Compass,
  Cover,
  Credit,
  Detail,
  GeoJsonFeatureCollection,
  Graticule,
  MapOptions,
  MapResult,
  Pin,
  Point,
  Position,
  ProjectionName,
  Region,
  RegionPreset,
  RenderOptions,
  Route,
  RouteStop,
  ScaleBar,
  Size,
  Water,
  Watermark,
} from "./types.js";

/**
 * How far a round trip may drift before a pixel counts as off the map, in user
 * units. Measured across every region and projection, a point that is really
 * on the map returns within 0.001; a pixel past an orthographic limb returns
 * more than 20 away. Anything in that gap does as a threshold, and a tenth of
 * a unit is invisible on any canvas this library draws.
 */
const INVERT_TOLERANCE = 0.1;

const DEFS_TAG = "defs";

const DEFAULT_SIZE: Size = [1000, 1000];
const DEFAULT_PADDING = 24;

/** Dot size by rank. A theme can override `r` in CSS; this is the fallback. */
const PLACE_RADIUS: Readonly<Record<1 | 2 | 3, number>> = { 1: 3.2, 2: 2.2, 3: 1.5 };

/**
 * Points along a geometry, for testing whether it touches a country.
 *
 * A bounding box is not enough: France's box spans Guadeloupe to Réunion
 * because those are France, so box overlap alone put Lake Constance — which is
 * German, Swiss and Austrian — on a map of France.
 */
function samples(geometry: unknown, limit = 32): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      points.push([node[0], node[1]]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk((geometry as { geometry?: { coordinates?: unknown } }).geometry?.coordinates);
  if (points.length <= limit) return points;
  const step = points.length / limit;
  return Array.from({ length: limit }, (_, i) => points[Math.floor(i * step)] as [number, number]);
}

type Box = readonly [number, number, number, number];

function boxOf(geometry: unknown): Box {
  const [[west, south], [east, north]] = geoBounds(geometry as never);
  return [west, south, east, north];
}

function overlaps(a: Box, b: Box): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Does a feature's bounding box overlap the requested one? */
function intersectsBBox(country: CountryFeature, bbox: BBox): boolean {
  const [[west, south], [east, north]] = geoBounds(country.geometry as never);
  const [wantWest, wantSouth, wantEast, wantNorth] = bbox;
  return west <= wantEast && east >= wantWest && south <= wantNorth && north >= wantSouth;
}

interface ResolvedRegion {
  readonly features: readonly CountryFeature[];
  /**
   * The ISO codes the caller named, resolved, before any of them were looked
   * up in the data. This is the list the drawn map is measured against.
   *
   * Empty for a world map, a bounding box or caller-supplied GeoJSON: none of
   * those names a country, so there is no list to fall short of.
   */
  readonly requested: readonly string[];
  /** What the camera frames — the bbox itself, when one was given. */
  readonly frame: FrameGeometry;
  /**
   * Which countries may contribute shared boundaries. Empty for caller-supplied
   * GeoJSON: its outlines are the caller's own, and meshing them against the
   * bundled arcs would draw borders that do not match the drawn land.
   */
  readonly borderIds: readonly string[];
  readonly description: string;
}

function degrees(value: number, negative: string, positive: string): string {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return `${rounded}°${value < 0 ? negative : positive}`;
}

/** "France", "France and Germany", "France, Germany and Italy", then a count. */
function listNames(names: readonly string[], noun = "countries"): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] as string;
  if (names.length > 3) return `${names.length} ${noun}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] as string}`;
}

function readCustomFeature(raw: unknown): CountryFeature {
  const record = raw as {
    id?: string | number;
    properties?: Record<string, unknown>;
  };
  const properties = record.properties ?? {};
  const candidate =
    record.id ?? properties["iso"] ?? properties["iso_a2"] ?? properties["id"];
  const id = candidate === undefined ? null : resolveId(String(candidate));
  const name = typeof properties["name"] === "string" ? properties["name"] : "";
  // An unresolvable id is not an error here: caller-supplied geometry has no
  // obligation to be a country. It simply cannot be targeted by `highlight`.
  return { id: id ?? "", name, geometry: raw };
}

function resolveRegion(region: Region, all: readonly CountryFeature[]): ResolvedRegion {
  if (typeof region === "string") {
    if (!isRegionPreset(region)) {
      throw new Error(`masen: unknown region preset "${region}"`);
    }
    const codes = expandPreset(region);
    const features = codes === null ? all : pick(codes, all);
    return {
      features,
      requested: codes === null ? [] : resolveAll(codes),
      frame: framingGeometry(features),
      borderIds: features.map((f) => f.id),
      description: `Map of ${presetLabel(region)}`,
    };
  }

  if (Array.isArray(region)) {
    const features = pick(region as readonly string[], all);
    return {
      features,
      requested: resolveAll(region as readonly string[]),
      frame: framingGeometry(features),
      borderIds: features.map((f) => f.id),
      description: `Map of ${listNames(features.map((f) => f.name).filter(Boolean))}`,
    };
  }

  if (typeof region === "object" && region !== null && "bbox" in region) {
    const { bbox } = region as { bbox: BBox };
    const [west, south, east, north] = bbox;
    const features = all.filter((c) => intersectsBBox(c, bbox));
    // Frame the rectangle that was asked for, not the countries that spill
    // outside it — otherwise a bbox over the Alps zooms out to all of France.
    const rectangle = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            // Wound so the *box* is the interior, not the rest of the planet.
            // d3-geo reads a ring by the right-hand rule on the sphere, and the
            // other winding describes the complement: `geoBounds` on it came
            // back as the whole world and `geoArea` as 11.999 steradians of a
            // 12.566-steradian globe. Every bbox map was framed to the entire
            // planet — loudly on the conics, which fit a world extent to a
            // scale of zero and projected every coordinate to NaN, and silently
            // on the rest, which simply drew a world map when a region was
            // asked for.
            coordinates: [
              [
                [west, south],
                [west, north],
                [east, north],
                [east, south],
                [west, south],
              ],
            ],
          },
        },
      ],
    };
    return {
      features,
      // A box names an area, not a list of countries: whatever falls inside it
      // is the answer, so there is nothing it can fall short of.
      requested: [],
      frame: {
        geometry: rectangle,
        bounds: [
          [west, south],
          [east, north],
        ],
        countries: features.map((f) => ({ id: f.id, name: f.name, geometry: f.geometry })),
        clipped: 0,
      },
      borderIds: features.map((f) => f.id),
      description:
        `Map of the area from ${degrees(west, "W", "E")} ${degrees(south, "S", "N")}` +
        ` to ${degrees(east, "W", "E")} ${degrees(north, "S", "N")}`,
    };
  }

  if (
    typeof region === "object" &&
    region !== null &&
    (region as GeoJsonFeatureCollection).type === "FeatureCollection"
  ) {
    const features = (region as GeoJsonFeatureCollection).features.map(readCustomFeature);
    if (features.length === 0) {
      throw new Error("masen: region FeatureCollection is empty");
    }
    return {
      features,
      // The caller supplied the geometry. Every feature they gave is drawn, so
      // the only list to compare against is the one they already hold.
      requested: [],
      frame: framingGeometry(features),
      borderIds: [],
      description: `Map of ${features.length} custom ${features.length === 1 ? "feature" : "features"}`,
    };
  }

  throw new Error("masen: region must be a preset name, code list, bbox, or GeoJSON");
}

/**
 * The same resolution `pick` does, without the lookup.
 *
 * Kept separate rather than returned from `pick`, because the two answer
 * different questions: `pick` says what the data has, and this says what was
 * asked for. Comparing them is the whole point — a function that returned only
 * the intersection could not tell anyone what fell out of it.
 */
function resolveAll(codes: readonly string[]): string[] {
  const resolved: string[] = [];
  for (const code of codes) {
    const id = resolveId(code);
    // An unresolvable code has already thrown in `pick`. Skipping rather than
    // throwing twice keeps the error message in one place.
    if (id !== null) resolved.push(id);
  }
  return resolved;
}

function pick(codes: readonly string[], all: readonly CountryFeature[]): CountryFeature[] {
  const wanted = new Set<string>();
  for (const code of codes) {
    const resolved = resolveId(code);
    if (resolved === null) {
      throw new Error(
        `masen: unrecognised country code "${code}". ` +
          `Expected ISO 3166-1 alpha-2 ("FR"), numeric ("250"), or a user-assigned code ("XK").`,
      );
    }
    wanted.add(resolved);
  }
  return all.filter((country) => wanted.has(country.id));
}

/**
 * Build a map.
 *
 * Async because geometry is loaded per region rather than bundled wholesale —
 * the full dataset is 8 MB, so shipping it to every consumer is not an option.
 */
export async function masen(options: MapOptions): Promise<MapResult> {
  const detail = options.detail ?? "50m";
  const projectionName = options.projection ?? "equal-earth";
  const [width, height] = options.size ?? DEFAULT_SIZE;
  const padding = options.padding ?? DEFAULT_PADDING;

  const world = await loadWorld(detail);
  const resolved = resolveRegion(options.region, world.countries);
  const { frame } = resolved;

  if (resolved.features.length === 0) {
    throw new Error("masen: region resolved to no countries");
  }

  /**
   * The caller's name for a feature, where they gave one.
   *
   * Keyed by ISO code where the key resolves to one and by the bundled name
   * otherwise, which is what lets one option cover both countries and cities
   * without asking which is which.
   */
  const renamed = new Map<string, string>();
  for (const [key, value] of Object.entries(options.names ?? {})) {
    renamed.set(resolveId(key) ?? key, value);
  }
  const nameOf = (id: string, bundled: string): string =>
    renamed.get(id) ?? renamed.get(bundled) ?? bundled;

  const highlighted = new Set<string>();
  for (const code of options.highlight ?? []) {
    const code2 = resolveId(code);
    if (code2 === null) {
      throw new Error(`masen: unrecognised highlight code "${code}"`);
    }
    highlighted.add(code2);
  }

  const striped = new Set<string>();
  for (const code of options.stripe ?? []) {
    const code2 = resolveId(code);
    if (code2 === null) {
      throw new Error(`masen: unrecognised stripe code "${code}"`);
    }
    striped.add(code2);
  }

  // Extruded countries rise off their footprint, so the camera needs room
  // above the map or the tallest prism is cut off by the top edge.
  const extrusion =
    options.extrude === undefined ? null : heightsFor(options.extrude, resolveId);

  // Height and colour usually carry the same number, so extruding by values
  // bins those same values unless the caller says otherwise. One option, both
  // encodings — and either can be used alone.
  const source =
    options.values ??
    (typeof options.extrude === "object" ? options.extrude.values : undefined);
  const bins =
    source === undefined
      ? null
      : assignBins(source, options.bins ?? DEFAULT_BINS, resolveId);
  // Political fill defers to a band: a country carrying a number is already
  // saying something with its colour, and two encodings on one fill is one of
  // them lying. So this only ever fills what `values` left alone.
  const fills =
    options.fill === "political"
      ? politicalFill(resolved.borderIds, world.adjacency(resolved.borderIds))
      : null;
  const fillOf = (id: string): number | undefined =>
    fills === null || bins?.has(id) === true ? undefined : fills.get(id);

  const headroom =
    extrusion === null
      ? 0
      : (extrusion.uniform ?? Math.max(0, ...extrusion.byId.values(), 0));

  const projection = createProjection(
    projectionName,
    frame,
    width,
    height,
    padding,
    headroom,
    resolveCentre(projectionName, options.center),
  );
  const path = geoPath(projection).digits(1);

  /**
   * What this frame does to distance and direction, measured once.
   *
   * Sampling the canvas costs a few hundred projections, so it is taken only if
   * something asks — a map with no scale bar, no north arrow and no caller
   * reading `distortion()` never pays for it.
   */
  let measured: Distortion | null = null;
  function distortion(): Distortion {
    measured ??= measureDistortion(projectPoint, invertPoint, [width, height]);
    return measured;
  }

  /**
   * What was asked for and is not on the map.
   *
   * Cheap enough to take eagerly — it is a set difference over at most a few
   * hundred codes — but computed here beside `distortion()` because it answers
   * the same kind of question, and because the answer should be reachable from
   * the built map rather than recomputed by the caller against a list they
   * would have to keep in step with the data.
   */
  const drawnIds = resolved.features.map((feature) => feature.id);
  const missing = omissionsOf(resolved.requested, drawnIds);
  function omissions(): Omissions {
    return missing;
  }

  function projectPoint(position: Position): Point | null {
    const projected = projection([position[0], position[1]]);
    if (projected === null) return null;
    if (!Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return null;
    return [projected[0], projected[1]];
  }

  function invertPoint(point: Point): Position | null {
    // Optional on d3's projection type. Every projection in the table has
    // an inverse, but the table is a lookup precisely so composites can be
    // registered later, and a composite need not have one.
    const inverse = projection.invert;
    if (inverse === undefined) return null;
    const position = inverse.call(projection, [point[0], point[1]]);
    if (position === null) return null;
    if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) return null;

    // Then make the projection confirm its own answer. d3 clamps its inverse
    // trigonometry instead of failing, so a pixel off the edge of an
    // orthographic globe does not come back as nothing — it comes back as a
    // coordinate on the limb, and the corner of the canvas invents a place
    // in the Atlantic. The only reliable test of whether a pixel is on the
    // map is whether the map puts it back where it was found: a real point
    // returns within a thousandth of a unit, and a clamped one misses by
    // twenty units or more.
    const back = projection([position[0], position[1]]);
    if (back === null) return null;
    if (Math.abs(back[0] - point[0]) > INVERT_TOLERANCE) return null;
    if (Math.abs(back[1] - point[1]) > INVERT_TOLERANCE) return null;

    return [position[0], position[1]];
  }

  // Resolved before the layers rather than after, because the label fit test
  // has to know what size the text will actually be set at.
  const themed = await resolveTheme(options);
  const sizes = labelSizes(themed.css);


  const content = new Map<LayerName, SvgNode[]>();
  const wants = (name: LayerName): boolean => options.layers?.[name] ?? true;

  // Under everything, the graticule included, for the plainest of reasons: an
  // atlas draws its meridians across the water. Read on demand rather than out
  // of the bundle — see `loadOcean`.
  if (options.sea === true && wants("ocean")) {
    const ocean = await loadOcean(detail);
    const shapes: SvgNode[] = [];
    // Clipped to the canvas before it is drawn, which is not an optimisation
    // so much as the difference between shipping this and not. The ocean is
    // one polygon carrying every coastline on earth: drawn unclipped, a
    // 520×400 map of Greece came out 806 KB of path data for the few gulfs
    // anyone can see, and a map of Switzerland came out 858 KB to draw
    // nothing at all. `clipExtent` cuts the polygon against the viewport in
    // the projected plane, so what is emitted is what is visible — and an
    // inland frame clips to nothing, which is the honest answer there.
    //
    // Set on the shared projection and put back immediately: d3 has no way to
    // copy one, the ocean is drawn in a single pass here, and every other
    // layer must keep drawing past the edges so its strokes are not cut.
    projection.clipExtent([
      [0, 0],
      [width, height],
    ]);
    try {
      for (const item of ocean.features) {
        const d = path(item as never);
        if (d) shapes.push(el("path", { class: "mp-sea", d }));
      }
    } finally {
      projection.clipExtent(null);
    }
    if (shapes.length > 0) content.set("ocean", shapes);
  }

  /**
   * Land cover, over the land and under the water.
   *
   * Clipped twice, and both clips earn their place. `clipExtent` cuts the
   * shapes to the viewport for the ocean's reason — the Sahara and the Andes
   * are continent-sized polygons, and a map of Switzerland should not carry
   * either one in full to draw none of it. The land clip does the other half:
   * a cover polygon is a climate band drawn to a coarse outline, so it runs
   * out over the sea wherever the coast is finer than the band, and glaciated
   * areas genuinely extend onto floating ice. Trimming both to the land the
   * map actually drew says the true thing — cover is on the ground — and is
   * the same clip a river already gets.
   */
  const coverKinds =
    options.terrain === true
      ? new Set<Cover>(["desert", "mountain", "glacier"])
      : Array.isArray(options.terrain)
        ? new Set<Cover>(options.terrain)
        : null;
  if (coverKinds !== null && coverKinds.size > 0 && wants("terrain")) {
    const cover = await loadCover(detail);
    const shapes: SvgNode[] = [];
    projection.clipExtent([
      [0, 0],
      [width, height],
    ]);
    try {
      // One path per kind rather than per polygon: a theme colours the kind,
      // and 377 separate glaciers would be 377 nodes saying the same thing.
      for (const kind of ["desert", "mountain", "glacier"] as const) {
        if (!coverKinds.has(kind)) continue;
        const features = cover.features.filter(
          (f) => (f as { properties?: { k?: string } }).properties?.k === kind,
        );
        if (features.length === 0) continue;
        const d = path({ type: "FeatureCollection", features } as never);
        if (d) shapes.push(el("path", { class: "mp-cover", "data-kind": kind, d }));
      }
    } finally {
      projection.clipExtent(null);
    }
    if (shapes.length > 0) content.set("terrain", shapes);
  }

  /** Where the grid's numbers go, filled in below and read by the label layer. */
  let gridMarks: readonly GridMark[] = [];

  // The bottom of the stack, and the only layer generated rather than read:
  // the grid comes from the framed bounds, not from any file in `data/`.
  if (options.graticule !== undefined && options.graticule !== false && wants("graticule")) {
    const grid = options.graticule === true ? {} : options.graticule;
    const drawnGrid = graticuleLayer(grid, frame.bounds, path, [width, height], projection);
    if (drawnGrid.lines.length > 0) content.set("graticule", drawnGrid.lines);
    // The numbers do not live in this layer. A degree written under the land is
    // a degree nobody reads, and the grid is at the bottom of the stack — so
    // they go up with the other text and are judged against it.
    gridMarks = drawnGrid.marks;
  }

  const land: SvgNode[] = [];
  // Collected separately and appended, so hatching sits over every country in
  // the layer rather than only over the ones drawn after it.
  const hatched: SvgNode[] = [];
  const highlightedNames: string[] = [];
  for (const country of frame.countries) {
    const d = path(country.geometry as never);
    if (!d) continue;
    const isHighlighted = country.id !== "" && highlighted.has(country.id);
    const name = nameOf(country.id, country.name);
    if (isHighlighted && name) highlightedNames.push(name);
    const banded = bins?.get(country.id);
    land.push(
      el(
        "path",
        {
          class: isHighlighted ? `mp-country ${HIGHLIGHT_CLASS}` : "mp-country",
          "data-iso": country.id === "" ? undefined : country.id,
          "data-name": name === "" ? undefined : name,
          "data-bin": banded?.bin,
          "data-value": banded?.value,
          "data-fill": fillOf(country.id),
          "data-stripe": striped.has(country.id) ? "" : undefined,
          d,
        },
        // A per-feature title is a hover tooltip, not an accessibility tree:
        // the root carries `role="img"`, so assistive technology reads the
        // label once instead of announcing two hundred paths.
        name === "" ? [] : [el("title", {}, [text(name)])],
      ),
    );
    if (striped.has(country.id)) {
      hatched.push(el("path", { class: "mp-hatch", "data-iso": country.id, d }));
    }
  }

  /**
   * Disputed and breakaway areas, hatched over the countries rather than
   * reassigned between them.
   *
   * **The library was making a claim nobody asked it to make.** The country
   * geometry resolves contested territory de facto — Simferopol falls inside
   * feature 643, Russia — and that came in with `world-atlas` rather than
   * being chosen. A journalist who draws Ukraine and does not zoom in was
   * publishing a position they had not taken and had not been told about.
   *
   * **Hatched rather than reassigned, deliberately.** Reassigning needs
   * Natural Earth's point-of-view country layer, which is 10m-only and 13.2 MB,
   * and it would swap one silent claim for another. An overlay says the border
   * is contested, which is the part that is not in dispute.
   *
   * Drawn last in the layer, after the country hatching, so two readings stack
   * — which is what `stripe` was built for in Phase 5.
   *
   * **This is deliberately not disputed-specific machinery.** A hatched
   * overlay is geometry plus a kind plus a name, which is equally the shape of
   * "excluded", "evacuated" or "under review". Widening `stripe` to take a
   * polygon as well as a country code would break no caller, so it costs
   * nothing to wait for a real map that asks — the same bargain `neighbours`
   * and `pins` already took with their own widenings.
   */
  if (options.disputed !== false) {
    const areas = await loadDisputed(detail);
    // Clipped to the canvas, for the reason the ocean is: this is a global
    // list of 28 polygons and most maps show none of them. Unclipped, a map of
    // Ukraine emits Arunachal Pradesh and North Borneo as path data nobody can
    // see. `path()` returns "" for a shape clipped away entirely, which is
    // what skips it below.
    projection.clipExtent([
      [0, 0],
      [width, height],
    ]);
    try {
      renderDisputed(areas.features);
    } finally {
      // Put back immediately: the projection is shared, and every other layer
      // has to keep drawing past the edges so its strokes are not cut.
      projection.clipExtent(null);
    }
  }

  function renderDisputed(features: readonly unknown[]): void {
    /**
     * Matched against the countries actually drawn, not the framed rectangle —
     * the rule the water filter above already follows, for the same reason it
     * follows it.
     *
     * A disputed area carries no country of its own, so a viewport test alone
     * floats the Golan Heights and the Ilemi Triangle over open sea on a map of
     * the Sahara: both are inside the frame's longitudes, neither has any land
     * drawn beneath it, and a contested-area mark with no country under it is
     * a smudge rather than a statement. With `neighbours` on the map draws
     * whatever land is in view, so anything may legitimately carry a hatch;
     * with it off, only the region's own countries can.
     */
    const under =
      options.neighbours === true && wants("neighbours") ? world.countries : frame.countries;

    for (const raw of features) {
      // `features` is `readonly unknown[]` on the collection type, the same
      // shape land cover reads through — this file is the seam where vendored
      // data becomes typed, and it narrows rather than trusting.
      const area = raw as {
        readonly geometry?: unknown;
        readonly properties?: {
          readonly n?: string;
          readonly k?: string;
          readonly note?: string | null;
        };
      };
      const d = path(area.geometry as never);
      if (!d) continue;
      const points = samples(area);
      if (!points.some((point) => under.some((c) => geoContains(c.geometry as never, point)))) {
        continue;
      }
      const props = area.properties ?? {};
      const areaName = props.n ?? "";
      hatched.push(
        el(
          "path",
          {
            class: "mp-hatch",
            "data-kind": props.k ?? "disputed",
            "data-name": areaName === "" ? undefined : areaName,
            d,
          },
          // Natural Earth's own sentence, not one composed here: Crimea's reads
          // "Admin. by Russia; Claimed by Ukraine". Saying who claims what is
          // exactly the thing this project should be quoting rather than
          // writing.
          typeof props.note === "string" && props.note !== ""
            ? [el("title", {}, [text(`${areaName} — ${props.note}`)])]
            : [],
        ),
      );
    }
  }
  // Highlight names are collected even when the layer is off, so the accessible
  // description stays true to what was asked for.
  if (wants("land")) {
    if (extrusion === null) {
      content.set("land", land);
    } else {
      const raised: PrismInput[] = frame.countries.map((country) => ({
        id: country.id,
        name: nameOf(country.id, country.name),
        geometry: country.geometry,
        height: extrusion.uniform ?? extrusion.byId.get(country.id) ?? 0,
        highlighted: country.id !== "" && highlighted.has(country.id),
        bin: bins?.get(country.id)?.bin,
        value: bins?.get(country.id)?.value,
        fill: fillOf(country.id),
        striped: striped.has(country.id),
        edges: wants("borders")
          ? world.borders(resolved.borderIds, country.id) ?? undefined
          : undefined,
      }));
      content.set("land", prisms(raised, projection, [width, height]));
    }
  }

  /**
   * Context, drawn beneath the region and excluded from the camera, so turning
   * it on can never change the framing — the subject stays exactly where it was.
   *
   * **What counts as "in view" is the canvas, not the region's bounding box**,
   * and the difference is not small. The box is the extent of the *subject*;
   * the canvas is almost always bigger, because it has an aspect ratio of its
   * own, padding, and headroom for the furniture. Everything in that margin is
   * land the reader can see the place of and which was not being drawn — so a
   * map of the Caribbean showed open water where Central America is, and a map
   * of South America left a hole at French Guiana, which Natural Earth draws as
   * part of France.
   *
   * So the test is the *projected* bounds against the canvas rectangle. That
   * also makes it right for every projection rather than for the cylindrical
   * ones: on an orthographic globe a country's lon/lat box says nothing about
   * whether the camera is pointed at it, and d3 clips the far hemisphere away
   * entirely, which shows up here as non-finite bounds.
   */
  if (options.neighbours === true && wants("neighbours")) {
    const inRegion = new Set(frame.countries.map((c) => c.id));
    const context: SvgNode[] = [];
    for (const country of world.countries) {
      if (inRegion.has(country.id)) continue;
      const [[left, top], [right, bottom]] = path.bounds(country.geometry as never);
      // Clipped away entirely — the far side of a globe, or outside a
      // projection's domain.
      if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
      if (right < 0 || left > width || bottom < 0 || top > height) continue;
      const d = path(country.geometry as never);
      if (!d) continue;
      context.push(
        el(
          "path",
          {
            class: "mp-neighbour",
            "data-iso": country.id,
            "data-name": nameOf(country.id, country.name),
            d,
          },
          // Named for hover, but never labelled or highlighted: context must
          // not compete with the subject.
          country.name === ""
            ? []
            : [el("title", {}, [text(nameOf(country.id, country.name))])],
        ),
      );
    }
    if (context.length > 0) content.set("neighbours", context);
  }

  // Water is matched against the countries actually drawn, not the framed
  // rectangle. A lake carries no country of its own, and filtering on the
  // viewport alone floats Scandinavian lakes over open sea on a map whose
  // northern edge stops at Denmark.
  /**
   * Which kinds of water, defaulting to both — `layers.hydro` still decides
   * whether the group renders at all. Same shape as `terrain`: the layer switch
   * and the kind selection are different questions and a caller asks them
   * separately.
   */
  const waterKinds =
    options.water === false
      ? new Set<Water>()
      : options.water === undefined || options.water === true
        ? new Set<Water>(["lake", "river"])
        : new Set<Water>(options.water);

  if (wants("hydro") && waterKinds.size > 0) {
    const drawn = frame.countries.map((c) => ({ box: boxOf(c.geometry), geometry: c.geometry }));
    const water: SvgNode[] = [];
    for (const kind of ["lake", "river"] as const) {
      if (!waterKinds.has(kind)) continue;
      const collection = world.water(kind) as { features: readonly unknown[] };
      const kept = collection.features.filter((f) => {
        const box = boxOf(f);
        // Box overlap first because it is cheap, then containment because it
        // is the question actually being asked.
        const near = drawn.filter((country) => overlaps(box, country.box));
        if (near.length === 0) return false;
        const points = samples(f);
        return points.some((point) =>
          near.some((country) => geoContains(country.geometry as never, point)),
        );
      });
      if (kept.length === 0) continue;
      const d = path({ type: "FeatureCollection", features: kept } as never);
      if (!d) continue;
      water.push(
        el("path", {
          class: "mp-water",
          "data-kind": kind,
          // A river is a line: with the default fill it renders as a blob.
          fill: kind === "river" ? "none" : undefined,
          d,
        }),
      );
    }
    if (water.length > 0) content.set("hydro", water);
  }

  /**
   * Water is clipped to the land actually drawn.
   *
   * A river is one feature from its source to its mouth, so keeping the Danube
   * because it passes through Austria keeps the whole of it — and it carried on
   * across the sea to the Black Sea on every map of Western Europe. Trimming the
   * coordinates would mean writing a clipper; the land silhouette is already to
   * hand and says the true thing anyway, which is that a river is on land.
   */
  const landClip =
    (content.has("hydro") || content.has("terrain")) && frame.countries.length > 0
      ? path({
          type: "FeatureCollection",
          features: frame.countries.map((c) => c.geometry),
        } as never)
      : null;
  /**
   * What every id this document emits is namespaced by.
   *
   * The stylesheets have been scoped to a hash of themselves since Phase 3, so
   * two maps could always share a page — but the *ids* were constants, and
   * `url(#mp-land-clip)` resolves to whichever map the parser met first. Two
   * maps in one document meant one of them wearing the other's clip path.
   *
   * Derived rather than counted, because the same input has to give the same
   * output: a counter would make a map's bytes depend on how many maps were
   * built before it.
   *
   * The subject has to be in the hash and not only the clip path. A map of
   * France and a map of Italy on the same theme and canvas, neither of them
   * drawing water, have no clip path between them — so hashing the stylesheet
   * and the outline alone handed both the same scope, and both then defined
   * `mp-stripe` under one name. Harmless in what it paints, since the two
   * definitions are identical, and still two elements sharing an id in one
   * document. Two maps that agree on every line below really are the same map,
   * and a page holding it twice is holding one document twice.
   */
  const idScope = hashCss(
    [
      themed.css,
      landClip ?? "",
      `${width}x${height}`,
      projectionName,
      detail,
      resolved.description,
      frame.countries.map((country) => country.id).join(","),
    ].join("\u0000"),
  );
  const LAND_CLIP_ID = `mp-land-clip-${idScope}`;

  // Names ride with their dots, so both are produced by the same walk — and a
  // name is never written for a settlement whose dot was filtered out.
  const placeNames: Placed[] = [];
  // Their footprints, so a country name can step around one rather than
  // through it.
  const placeBoxes: LabelBox[] = [];
  if (wants("places") || wants("labels")) {
    const maxRank = options.placeRank ?? 2;
    const namedRank = options.labelRank ?? 1;
    const drawn = new Set(frame.countries.map((c) => c.id));
    const dots: SvgNode[] = [];
    for (const place of world.places) {
      if (place.rank > maxRank) continue;
      // Tie a settlement to a country that is actually drawn, so a map of
      // Western Europe does not sprout dots across North Africa. Natural Earth
      // leaves some countries without an ISO code — Serbia among them — and
      // those were slipping through unattributed, which is how Belgrade turned
      // up on a map of Western Europe.
      if (place.iso !== null) {
        if (!drawn.has(place.iso)) continue;
      } else if (
        !frame.countries.some((c) => geoContains(c.geometry as never, [...place.position]))
      ) {
        continue;
      }
      const point = projection([place.position[0], place.position[1]]);
      if (point === null) continue;
      const [x, rawY] = point;
      // A dot belongs on the surface it marks, so it rides up with its prism.
      const y =
        extrusion === null
          ? rawY
          : rawY - (extrusion.uniform ?? (place.iso === null ? 0 : extrusion.byId.get(place.iso) ?? 0));
      if (x < 0 || x > width || y < 0 || y > height) continue;
      const radius = PLACE_RADIUS[place.rank];
      // Keyed by its own name only: a settlement's ISO is its country's, so
      // looking one up by it would rename Paris to whatever the caller called
      // France.
      const named = { ...place, name: renamed.get(place.name) ?? place.name };
      if (wants("places")) {
        dots.push(
          el(
            "circle",
            {
              class: "mp-place",
              "data-name": named.name,
              "data-iso": place.iso ?? undefined,
              "data-rank": place.rank,
              "data-pop": place.population,
              cx: x,
              cy: y,
              r: radius,
            },
            [el("title", {}, [text(named.name)])],
          ),
        );
      }
      if (wants("labels") && place.rank <= namedRank) {
        const label = placeLabel(named, x, y, radius, sizes.place, sizes.advance);
        placeNames.push(label);
        placeBoxes.push(label.box);
      }
    }
    if (dots.length > 0) content.set("places", dots);
  }

  /**
   * Names, last of the geographic layers to be built and top of the stack.
   *
   * There is no collision detection here and v1 does not pretend otherwise: a
   * country name and a city name can land on each other. What is guaranteed is
   * narrower and more useful — a name is only shown where it fits inside the
   * shape it belongs to, and everything carries a rank so a theme can thin the
   * rest away in one rule.
   */
  if (wants("labels")) {
    const names = countryLabels(
      frame.countries.map((country) => ({
        id: country.id,
        name: nameOf(country.id, country.name),
        geometry: country.geometry,
        lift:
          extrusion === null
            ? 0
            : extrusion.uniform ?? extrusion.byId.get(country.id) ?? 0,
        highlighted: country.id !== "" && highlighted.has(country.id),
      })),
      projection,
      [width, height],
      sizes.country,
      sizes.advance,
      placeBoxes,
    );
    /**
     * Sea names, judged after everything on land.
     *
     * `true` means rank 2 — the oceans, the great seas, and the named basins a
     * country-sized map frames. Rank 3 is straits and bights, which is a lot of
     * words for a small map and is asked for rather than assumed.
     */
    const seaRank =
      options.seaNames === undefined || options.seaNames === false
        ? 0
        : options.seaNames === true
          ? 2
          : options.seaNames;
    const seas =
      seaRank === 0
        ? []
        : seaLabels(
            world.seas
              .filter((sea) => sea.rank <= seaRank)
              .map((sea) => ({
                name: renamed.get(sea.name) ?? sea.name,
                kind: sea.kind,
                position: sea.position,
                rank: sea.rank,
              })),
            projection,
            [width, height],
            sizes.place,
            sizes.advance,
          );

    const all = labelLayer(names, placeNames, seas, gridLabels(gridMarks, sizes.place, sizes.advance));
    if (all.length > 0) content.set("labels", all);
  }

  // On an extruded map the borders move into the prisms themselves: a mesh
  // line is shared by two countries, and once they stand at different heights
  // there is no single height it could sit at. Each country carries its own
  // share instead, lifted to its own surface.
  if (wants("borders") && extrusion === null) {
    const borderGeometry =
      resolved.borderIds.length > 0 ? world.borders(resolved.borderIds) : null;
    const lines: SvgNode[] = [];
    if (borderGeometry !== null) {
      const d = path(borderGeometry as never);
      if (d) lines.push(el("path", { class: "mp-border", "data-kind": "intl", d }));
    }
    /**
     * The hatched overlays paint here, and not with the land they describe.
     *
     * **They were in `mp-land`, and land cover buried them.** The paint order
     * is land, then terrain, then hydro, then borders — so on any map with
     * `terrain` on, the desert wash went straight over the contested-area
     * hatching and the caller's own `stripe`. Measured on the Sahara gallery
     * map: the `W. Sahara` hatch is in the document, carries its pattern fill,
     * and cannot be seen at any zoom. A map that makes a claim it then hides
     * is the exact failure this phase exists for, and it was shipping by
     * default since the overlay went in.
     *
     * `borders` is where they belong on the merits, not merely where they are
     * visible: a contested-area hatch is a statement about a boundary, and the
     * boundary lines drawing on top of it is the right stack — the line stays
     * legible over its own hatching.
     *
     * Gated on the land layer because that is what they annotate: a hatch with
     * no country under it is a smudge, which is the same reason the disputed
     * pass tests for land beneath before drawing anything at all.
     */
    if (wants("land")) lines.unshift(...hatched);
    if (lines.length > 0) content.set("borders", lines);
  }

  /**
   * Annotations, above every geographic layer and below the furniture.
   *
   * Built last of the geographic layers and deliberately after the camera is
   * settled: a pin is placed on the map, never the other way round. Adding one
   * outside the frame must not pull the view towards it, or every mark already
   * placed shifts under the reader — the same rule `neighbours` follows for the
   * same reason.
   */
  const pins = options.pins ?? [];
  const callouts = options.callouts ?? [];
  const arrows = options.arrows ?? [];
  const routes = options.routes ?? [];
  // Built even when the layer is switched off, so a coordinate that cannot be
  // one is still rejected rather than quietly ignored: turning a layer off
  // controls what is drawn, never whether the options were valid.
  const marks =
    pins.length === 0
      ? { nodes: [], labels: [] }
      : pinLayer(pins, projectPoint, invertPoint, [width, height], sizes.pin);
  // Captions last, so a box is never drawn under a mark it sits beside.
  const captions =
    callouts.length === 0
      ? { nodes: [], labels: [] }
      : calloutLayer(
          callouts,
          projectPoint,
          invertPoint,
          [width, height],
          sizes.place,
          sizes.advance,
          sizes.track,
        );
  // Beneath the marks: a connection is context for them, not the reverse.
  const flows =
    arrows.length === 0
      ? { nodes: [], labels: [] }
      : arrowLayer(arrows, projectPoint, invertPoint, [width, height]);
  // With the arrows, under the marks, for the arrows' reason: a route is the
  // context a pin sits on, not a thing that sits on a pin.
  const lines =
    routes.length === 0
      ? { nodes: [], labels: [] }
      : routeLayer(routes, projectPoint, invertPoint, [width, height]);
  const annotated = wants("annotations");
  const drawn = [...flows.nodes, ...lines.nodes, ...marks.nodes, ...captions.nodes];
  if (annotated && drawn.length > 0) content.set("annotations", drawn);

  /**
   * Furniture, above everything, and the only layer that is not geographic.
   *
   * Placed from the canvas and the padding alone — it never touches the
   * projection, which is the whole point of it being a layer of its own. A
   * credit that moved when the camera did would be a caption on the ground.
   */
  if (wants("furniture")) {
    const furniture: SvgNode[] = [];
    if (options.credit !== undefined) {
      const credit = typeof options.credit === "string" ? { text: options.credit } : options.credit;
      furniture.push(...creditLayer(credit, [width, height], padding));
    }
    // A scale bar and a north arrow are the two pieces that make a claim about
    // the ground, so both are gated on the same measurement of what this frame
    // does to distance and direction. Taken once and shared.
    if (options.scaleBar !== undefined && options.scaleBar !== false) {
      const bar = options.scaleBar === true ? {} : options.scaleBar;
      furniture.push(...scaleLayer(bar, [width, height], padding, sizes.place, distortion()));
    }
    if (options.compass !== undefined && options.compass !== false) {
      const compass = options.compass === true ? {} : options.compass;
      furniture.push(...compassLayer(compass, [width, height], padding, sizes.place, distortion()));
    }
    if (options.watermark !== undefined) {
      const mark =
        typeof options.watermark === "string" ? { text: options.watermark } : options.watermark;
      furniture.push(...(await watermarkLayer(mark, [width, height], padding)));
    }
    if (furniture.length > 0) content.set("furniture", furniture);
  }

  const description = options.title
    ?? describe(
      resolved.description,
      highlightedNames,
      annotated ? [...marks.labels, ...captions.labels] : [],
    );

  const body: SvgNode[] = [
    // `fill="none"` is structural, not stylistic. SVG's default fill is
    // black, so a full-canvas rectangle with no theme applied would paint
    // the entire map over — the document would render as a black square.
    // Presentation attributes lose to any CSS rule, so a theme's
    // `.mp-bg { fill: … }` still wins.
    el("rect", { class: BACKGROUND_CLASS, x: 0, y: 0, width, height, fill: "none" }),
    // Every slot is emitted, in order, empty or not. Inserting one later
    // would restack the layers underneath it and break themes in the wild.
    ...LAYERS.map((spec) =>
      el(
        "g",
        {
          class: `${LAYER_CLASS} ${spec.className}`,
          // Structural, not stylistic: a line drawn with the default fill
          // renders as a filled blob.
          fill: spec.name === "borders" ? "none" : undefined,
          "clip-path":
            // Clipped only where there is something to clip: an empty layer
            // wearing a clip path is noise in every document that has neither
            // water nor cover.
            (spec.name === "hydro" || spec.name === "terrain") &&
            landClip !== null &&
            content.has(spec.name)
              ? `url(#${LAND_CLIP_ID})`
              : undefined,
        },
        content.get(spec.name) ?? [],
      ),
    ),
  ];

  function build(theme: ResolvedTheme, withStyle: boolean): SvgElement {
    // A stylesheet cannot create SVG elements, so a theme names the effect it
    // wants and the definition is emitted here. Referenced only — an unused
    // filter is never written.
    const definitions: SvgNode[] = [];
    if (landClip !== null) {
      definitions.push(el("clipPath", { id: LAND_CLIP_ID }, [el("path", { d: landClip })]));
    }
    definitions.push(
      ...referencedPatterns(theme.css, idScope),
      ...referencedMarkers(theme.css, idScope),
      ...referencedFilters(theme.css, idScope),
    );
    const defs = el(DEFS_TAG, { class: DEFS_CLASS }, definitions);
    // The scope class rides on the root even when the stylesheet is served
    // separately, or `map.css` would have nothing to match against.
    const rootClass = theme.scope === null ? ROOT_CLASS : `${ROOT_CLASS} ${theme.scope}`;
    const children: SvgNode[] = [el("title", {}, [text(description)])];
    // The reference and the definition move together, or neither moves.
    if (withStyle && theme.css !== "") children.push(styleElement(scopeIds(theme.css, idScope)));
    children.push(defs, ...body);

    return el(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: `0 0 ${width} ${height}`,
        width,
        height,
        preserveAspectRatio: "xMidYMid meet",
        class: rootClass,
        role: "img",
        "aria-label": description,
      },
      children,
    );
  }

  function render(theme: ResolvedTheme, style: boolean, inline: boolean): string {
    const tree = build(theme, style);
    // The stylesheet is kept alongside the flattened attributes rather than
    // dropped: a browser honours the CSS, a tool that ignores it honours the
    // attributes, and both resolve to the same paint.
    // The flattened attributes carry `url(#…)` too — a `filter` baked onto an
    // element is the same reference the stylesheet made, and it has to point at
    // this document's definition rather than at the name as authored.
    const final =
      inline && theme.nodes.length > 0
        ? inlineStyles(tree, scopeIdsInNodes(theme.nodes, idScope), idScope).root
        : tree;
    return serialize(final);
  }

  /**
   * The document as a portable artifact.
   *
   * Separate from `toString()` because the two have different readers. An
   * embedded map is styled by its stylesheet and should stay small; a file
   * is opened by whatever the reader happens to have — a design tool, a
   * thumbnailer, an editor preview — and many of those ignore `<style>`
   * entirely, which renders a themed map as black shapes.
   */
  async function renderArtifact(renderOptions?: RenderOptions): Promise<string> {
    const overridden =
      renderOptions !== undefined &&
      (renderOptions.theme !== undefined ||
        renderOptions.palette !== undefined ||
        renderOptions.typeface !== undefined ||
        renderOptions.tokens !== undefined);

    const theme = overridden
      ? await resolveTheme({
          theme: renderOptions?.theme ?? options.theme,
          palette: renderOptions?.palette ?? options.palette,
          typeface: renderOptions?.typeface ?? options.typeface,
          tokens: renderOptions?.tokens ?? options.tokens,
        })
      : themed;

    return render(theme, true, renderOptions?.inlineStyles ?? true);
  }

  const svg = render(themed, false, false);
  const complete = render(themed, true, false);

  return {
    svg,
    // Scoped to match the document it belongs to. A stylesheet served beside a
    // map has to name that map's definitions, not the authored ones.
    css: scopeIds(themed.css, idScope),

    project: projectPoint,

    invert: invertPoint,

    distortion,

    omissions,

    toString() {
      return complete;
    },

    render: renderArtifact,

    async toFile(target: string, renderOptions?: RenderOptions) {
      const output = await renderArtifact(renderOptions);
      // Imported lazily so browser bundles never pull in node:fs.
      const { writeFile } = await import("node:fs/promises");
      await writeFile(target, output, "utf8");
    },
  };
}



/**
 * The accessible name, when the caller did not write one.
 *
 * It can only ever describe what the options say, which is why `title` exists —
 * a map *about* something needs the caller to name the something. But a map
 * carrying marks is no longer only a map of a region, and a description that
 * stopped at the geography would leave a screen reader with no idea the marks
 * were there.
 *
 * `marked` is what the annotation layer actually drew and not what was asked
 * for. A pin on the far side of a globe is dropped and one off the canvas is
 * hidden, and naming either would describe a map that is not on the screen.
 * Unlabelled marks are not named either: they have no words to offer, and a
 * count of them is a number nobody can act on.
 */
function describe(
  base: string,
  highlightedNames: readonly string[],
  marked: readonly string[],
): string {
  const clauses = [
    highlightedNames.length === 0 ? null : `highlighting ${listNames(highlightedNames)}`,
    marked.length === 0 ? null : `marking ${listNames(marked, "places")}`,
  ].filter((clause): clause is string => clause !== null);
  return clauses.length === 0 ? base : `${base}, ${clauses.join(", ")}`;
}
