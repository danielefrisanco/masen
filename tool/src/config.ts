import type { Cover, Water, MapOptions } from "../../src/index.js";
import { decodeMarks, encodeMarks, MARK_KEYS, NO_MARKS, type Marks } from "./marks.js";

/**
 * Everything the tool can be told, and the URL it turns into.
 *
 * **The URL is written in this sub-phase rather than a later one on purpose.**
 * State threaded through afterwards has to be retrofitted into every control at
 * once; doing it while there is one control is nearly free. It is also the
 * feature that makes the tool worth having — a map somebody made is a link they
 * can send, and a link that rebuilds it exactly is the difference between a
 * toy and a tool.
 *
 * Two rules keep the links short and readable:
 *
 * - **Only what differs from the default is written.** A fresh page has a bare
 *   URL, and a shared one carries exactly the decisions its author made. It
 *   also means a default can change later without stranding old links on values
 *   nobody chose.
 * - **Keys are short but not cryptic.** These end up in a browser's address bar
 *   where someone will read them, and `proj=albers` explains itself in a way
 *   `p=4` does not.
 *
 * **What a URL cannot carry, said plainly:** a caller-supplied GeoJSON region
 * has no short form, and the tool does not pretend otherwise — the region here
 * is a preset name or a list of ISO codes, both of which fit in a query string.
 * The library still takes GeoJSON; the *tool* is what declines to encode it.
 *
 * Marks — the highlights, pins, arrows and routes a pointer places — extend
 * this through {@link Marks}, and carry their own encoder. They are the first
 * state here that is a *list* rather than one value against one default, which
 * is the whole reason they are encoded somewhere else.
 */
export interface Config extends Marks {
  /** A preset name, or a comma-separated list of ISO codes. */
  region: string;
  projection: string;
  theme: string;
  /** "" means no palette — the theme's own colours. */
  palette: string;
  typeface: string;
  detail: "110m" | "50m";
  width: number;
  height: number;
  sea: boolean;
  seaNames: boolean;
  graticule: boolean;
  /** Write each grid line's latitude or longitude on the frame. */
  gridLabels: boolean;
  neighbours: boolean;
  terrain: readonly Cover[];
  /** Which kinds of water. Both by default — this one is opt-*out*. */
  water: readonly Water[];
  /**
   * Mark contested borders. On by default, and the off switch is offered rather
   * than hidden: the library has always had it, and a flag you cannot see is
   * obscurity rather than a position. Because the whole config lives in the
   * URL, `disputed=0` travels in a shared link — so the choice is visible to
   * whoever opens the map, which a silent default never was.
   */
  disputed: boolean;
  /** How far down the settlement ranking to draw. 0 draws none. */
  placeRank: 0 | 1 | 2 | 3;
  /** How far down the same ranking to name what was drawn. 0 names none. */
  labelRank: 0 | 1 | 2 | 3;
  /** `--border-width`, in user units. */
  borderWidth: number;
  /**
   * `--land-edge-width`, the outline every country carries, in user units.
   *
   * Separate from `borderWidth` because they are separate lines, and the
   * difference is invisible until you try to turn one off: `--border-width` is
   * the boundary *between* two countries, drawn once, and this is the edge of
   * each country's own shape, drawn on every side including its coast. Setting
   * the border to zero leaves the countries still outlined, which reads as the
   * slider not working.
   *
   * `-1` means "whatever the theme says" — the themes disagree (0.5 to 2) and
   * a number here would silently overwrite that choice on every map.
   */
  landEdgeWidth: number;
  /** `--label-size`, in user units. */
  labelSize: number;
  /**
   * The Maki icon the *next* pin will carry, or "" for a plain mark.
   *
   * Not a property of the map: each pin stores its own `kind`, so a map can
   * carry an airport, a hospital and three plain marks. This is the setting on
   * the tool that decides what the next click drops — which is why it lives
   * beside the gesture and disappears with it.
   */
  pinIcon: string;
  /** `--pin-size`, the radius of a pin's mark in user units. */
  pinSize: number;
  /**
   * A length on the paper labelled with the distance it means.
   *
   * Offered rather than assumed, because the library refuses to draw one when
   * the frame has not earned it: distortion is measured across the canvas, and
   * a bar on a frame whose scale varies too much is a lie with a ruler on it.
   * So this switch asks for a bar; whether one appears is the map's answer.
   */
  scaleBar: boolean;
  credit: string;
}

export const DEFAULTS: Config = {
  ...NO_MARKS,
  region: "west-europe",
  projection: "conic-conformal",
  theme: "minimal",
  palette: "",
  typeface: "",
  detail: "110m",
  width: 960,
  height: 620,
  sea: true,
  seaNames: false,
  graticule: false,
  gridLabels: false,
  neighbours: false,
  terrain: [],
  water: ["lake", "river"],
  disputed: true,
  placeRank: 2,
  labelRank: 1,
  borderWidth: 0.8,
  landEdgeWidth: -1,
  labelSize: 13,
  pinIcon: "",
  pinSize: 7,
  scaleBar: false,
  credit: "Natural Earth",
};

const COVERS: readonly Cover[] = ["desert", "mountain", "glacier"];
const WATERS: readonly Water[] = ["lake", "river"];

/** Which keys are numbers, so decoding does not have to guess. */
const NUMBERS = [
  "width",
  "height",
  "placeRank",
  "labelRank",
  "borderWidth",
  "landEdgeWidth",
  "labelSize",
  "pinSize",
] as const;
const FLAGS = ["sea", "seaNames", "graticule", "gridLabels", "neighbours", "scaleBar", "disputed"] as const;

/**
 * The config as a query string, carrying only what was actually chosen.
 *
 * Returned without a leading `?` so the caller decides whether an empty config
 * means `?` or a bare path — and a bare path is the right answer, because a
 * trailing `?` on a shared link looks like something went wrong.
 */
export function encode(config: Config): string {
  const params = new URLSearchParams();
  encodeMarks(config, params);
  for (const key of Object.keys(DEFAULTS) as Array<keyof Config>) {
    const value = config[key];
    const fallback = DEFAULTS[key];
    // Lists never compare equal to their default, so each one is written by
    // something that knows its own shape rather than by `String(value)`.
    if ((MARK_KEYS as readonly string[]).includes(key)) continue;
    if (key === "terrain") {
      const cover = value as readonly Cover[];
      if (cover.length > 0) params.set("terrain", [...cover].sort().join(","));
      continue;
    }
    if (key === "water") {
      const kinds = value as readonly Water[];
      // Written whenever it is not the full set, empty string included — the
      // opposite of terrain, because this one starts on.
      if (kinds.length !== WATERS.length) params.set("water", [...kinds].sort().join(","));
      continue;
    }
    if (value === fallback) continue;
    if (typeof value === "boolean") params.set(key, value ? "1" : "0");
    else params.set(key, String(value));
  }
  return params.toString();
}

function clamp(value: number, low: number, high: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(high, Math.max(low, value));
}

/**
 * A query string back into a config, with anything unrecognised ignored.
 *
 * Nothing here throws. A URL is user input arriving from a link that may have
 * been edited, truncated by a chat client, or written against an older version
 * of the tool — and the useful answer to a bad parameter is the default, drawn
 * immediately, not an error page. The one thing that must not happen is a value
 * reaching the library that it will reject, because that fails the whole render
 * rather than one control.
 */
export function decode(search: string, vocabulary: Vocabulary): Config {
  const params = new URLSearchParams(search);
  const config: Config = { ...DEFAULTS };

  // Typed narrowly rather than through a `Record<string, unknown>` cast: every
  // key this is called with holds a string, and saying so lets the compiler
  // catch a call that names a number or a flag by mistake.
  // `string extends Config[K]` rather than the other way round, so this matches
  // only the keys typed as a plain string. `detail` is a union of two literals
  // and is read on its own below — a plain string does not belong in it.
  type TextKey = {
    [K in keyof Config]: string extends Config[K] ? K : never;
  }[keyof Config];

  const pick = (key: TextKey, allowed: readonly string[]): void => {
    const value = params.get(key);
    if (value !== null && allowed.includes(value)) config[key] = value;
  };

  const region = params.get("region");
  // A preset, or codes. Anything else is dropped rather than handed on: an
  // unknown preset name throws inside the library and takes the map with it.
  if (region !== null && (vocabulary.regions.includes(region) || isCodeList(region))) {
    config.region = region;
  }
  pick("projection", vocabulary.projections);
  pick("theme", vocabulary.themes);
  pick("palette", ["", ...vocabulary.palettes]);
  pick("typeface", ["", ...vocabulary.typefaces]);
  pick("pinIcon", ["", ...vocabulary.icons]);

  const detail = params.get("detail");
  if (detail === "110m" || detail === "50m") config.detail = detail;

  for (const key of FLAGS) {
    const value = params.get(key);
    if (value === "1" || value === "0") config[key] = value === "1";
  }

  for (const key of NUMBERS) {
    const raw = params.get(key);
    if (raw === null) continue;
    const value = Number(raw);
    if (key === "placeRank" || key === "labelRank") {
      const rank = clamp(Math.round(value), 0, 3, DEFAULTS[key]);
      config[key] = rank as 0 | 1 | 2 | 3;
    } else if (key === "width" || key === "height") {
      config[key] = clamp(Math.round(value), 200, 4000, DEFAULTS[key]);
    } else if (key === "borderWidth") {
      config[key] = clamp(value, 0, 6, DEFAULTS[key]);
    } else if (key === "landEdgeWidth") {
      config[key] = clamp(value, -1, 6, DEFAULTS[key]);
    } else if (key === "pinSize") {
      config[key] = clamp(value, 2, 24, DEFAULTS[key]);
    } else {
      config[key] = clamp(value, 6, 40, DEFAULTS[key]);
    }
  }

  const water = params.get("water");
  if (water !== null) {
    config.water = water
      .split(",")
      .filter((kind): kind is Water => (WATERS as readonly string[]).includes(kind));
  }

  const terrain = params.get("terrain");
  if (terrain !== null) {
    config.terrain = terrain
      .split(",")
      .filter((kind): kind is Cover => (COVERS as readonly string[]).includes(kind));
  }

  Object.assign(config, decodeMarks(params));

  const credit = params.get("credit");
  // Capped rather than rejected: a very long credit is somebody's own doing,
  // but an unbounded one from a crafted link is a way to break the layout.
  if (credit !== null) config.credit = credit.slice(0, 120);

  return config;
}

/** A comma-separated list of two-letter codes, which is the other legal region. */
function isCodeList(value: string): boolean {
  const parts = value.split(",");
  return parts.length > 0 && parts.every((part) => /^[A-Za-z]{2,3}$/.test(part.trim()));
}

/** The name lists the library exports, passed in rather than imported here. */
export interface Vocabulary {
  readonly regions: readonly string[];
  readonly projections: readonly string[];
  readonly themes: readonly string[];
  readonly palettes: readonly string[];
  readonly typefaces: readonly string[];
  /** Maki icon names, which double as a pin's `kind`. */
  readonly icons: readonly string[];
}

/**
 * The config as the library's own options.
 *
 * The whole tool is this function plus a form, which is only possible because
 * no option in `MapOptions` is a callback — a UI can build the entire thing as
 * data and hand it over.
 */
export function toOptions(config: Config): MapOptions {
  const codes = isCodeList(config.region)
    ? config.region.split(",").map((code) => code.trim().toUpperCase())
    : null;

  const tokens: Record<string, string> = {};
  if (config.borderWidth !== DEFAULTS.borderWidth) {
    tokens["--border-width"] = String(config.borderWidth);
  }
  if (config.labelSize !== DEFAULTS.labelSize) {
    tokens["--label-size"] = String(config.labelSize);
  }
  // The geometry reads this one out of the stylesheet, so a pin's mark and the
  // icon inside it grow together rather than the circle growing alone.
  if (config.pinSize !== DEFAULTS.pinSize) {
    tokens["--pin-size"] = String(config.pinSize);
  }
  // Negative is the sentinel for "leave the theme alone", so it is the one
  // value that must not reach the stylesheet.
  if (config.landEdgeWidth >= 0) {
    tokens["--land-edge-width"] = String(config.landEdgeWidth);
  }

  return {
    region: (codes ?? config.region) as MapOptions["region"],
    projection: config.projection as MapOptions["projection"],
    detail: config.detail,
    size: [config.width, config.height],
    theme: config.theme as MapOptions["theme"],
    ...(config.palette === "" ? {} : { palette: config.palette as MapOptions["palette"] }),
    ...(config.typeface === "" ? {} : { typeface: config.typeface as MapOptions["typeface"] }),
    sea: config.sea,
    seaNames: config.seaNames,
    graticule: config.graticule ? (config.gridLabels ? { labels: true } : true) : false,
    neighbours: config.neighbours,
    ...(config.terrain.length > 0 ? { terrain: config.terrain } : {}),
    water: config.water,
    disputed: config.disputed,
    ...(config.highlight.length > 0 ? { highlight: config.highlight } : {}),
    ...(config.pins.length > 0 ? { pins: config.pins } : {}),
    ...(config.arrows.length > 0 ? { arrows: config.arrows } : {}),
    ...(config.routes.length > 0 ? { routes: config.routes } : {}),
    placeRank: config.placeRank,
    labelRank: config.labelRank,
    ...(config.scaleBar ? { scaleBar: true as const } : {}),
    ...(Object.keys(tokens).length > 0 ? { tokens } : {}),
    ...(config.credit === "" ? {} : { credit: config.credit }),
  };
}
