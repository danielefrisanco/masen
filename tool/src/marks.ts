import { isIconName, resolveId } from "../../src/index.js";
import type { Arrow, Pin, Position, PressureCentre, Route } from "../../src/index.js";

/**
 * The marks a pointer makes, and the query string they survive in.
 *
 * Four gestures, and **every one of them was already in the library** — this
 * module adds no drawing at all. A pin is one click, an arrow is two, a route
 * is a sequence, and highlighting is a click on a country rather than on the
 * ground. That the three annotation primitives are exactly a one-, two- and
 * n-point gesture is a coincidence, but it is the coincidence the interface is
 * built on.
 *
 * **Everything is stored as lon/lat, never as pixels.** `invert()` is what
 * turns a drop into a coordinate, and the discipline is the whole point: a
 * pixel means something only for the exact region, projection and canvas that
 * produced it, so a mark stored in pixels comes unstuck the moment the map is
 * reframed. Stored as ground, a mark stays where it was put through a change of
 * projection, a change of region and a change of size.
 *
 * The encoding is separate from the rest of the config's because marks are the
 * first state that is a *list*. Everything else in a URL is one value against
 * one default; these are arrays that have to survive a round trip in an order
 * that does not shuffle, at a length a crafted link cannot use to hang the
 * page.
 */

export type Mode = "none" | "highlight" | "pin" | "arrow" | "route" | "low" | "high";

/** The gestures the Marks group offers. */
export const MODES: readonly Mode[] = ["none", "highlight", "pin", "arrow", "route"];

/**
 * The gestures the Weather tab offers: a click drops a low or a high.
 *
 * Two modes rather than one with a setting beside it, because the choice is
 * made before the click and a reader should see which one is armed in the same
 * place they chose it.
 */
export const WEATHER_MODES: readonly Mode[] = ["none", "low", "high"];

/** What a freshly dropped centre reads, before anyone edits it. */
export const NEW_CENTRE: Readonly<Record<"low" | "high", number>> = { low: 992, high: 1028 };

export interface Marks {
  /** ISO codes drawn with `.is-highlighted`. */
  readonly highlight: readonly string[];
  readonly pins: readonly Pin[];
  readonly arrows: readonly Arrow[];
  readonly routes: readonly Route[];
  /** Pressure centres, placed from the Weather tab. */
  readonly centres: readonly PressureCentre[];
}

export const NO_MARKS: Marks = { highlight: [], pins: [], arrows: [], routes: [], centres: [] };

/** The keys `encodeMarks` writes, so the general encoder can leave them alone. */
export const MARK_KEYS = ["highlight", "pins", "arrows", "routes", "centres"] as const;

/**
 * How much of a link a crafted one may take up.
 *
 * Not defensive for its own sake: every mark is geometry the browser has to
 * compute and paint, and a URL is the one input to this tool that arrives from
 * somewhere other than its own form. Two hundred pins is far past any map worth
 * making and far short of anything that hangs a page.
 */
const LIMITS = {
  highlight: 100,
  pins: 200,
  arrows: 100,
  routes: 20,
  stops: 200,
  centres: 30,
  label: 40,
} as const;

/**
 * Decimal places kept in the URL — four is about eleven metres.
 *
 * Rounding here rather than at render time so that what the map draws is what
 * the link says. An unrounded `invert()` gives fifteen significant figures, and
 * a hundred pins of those is a kilobyte of noise nobody can read.
 */
const PLACES = 4;

/** A coordinate as it will be stored: rounded once, at the moment it is made. */
export function place(at: Position): Position {
  return [round(at[0]), round(at[1])];
}

function round(value: number): number {
  return Number(value.toFixed(PLACES));
}

function pair(at: Position): string {
  return `${round(at[0])},${round(at[1])}`;
}

/**
 * A label with the separators taken out.
 *
 * The alternative was a second parameter carrying labels in parallel, which is
 * worse: two lists that can fall out of step, and a link that loses its labels
 * if one of them is truncated. A comma or a semicolon in a place name is rare;
 * a de-synchronised pair of arrays is a bug.
 */
function clean(label: string): string {
  return label.replace(/[,;|]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.label);
}

export function encodeMarks(marks: Marks, params: URLSearchParams): void {
  if (marks.highlight.length > 0) params.set("hl", marks.highlight.join(","));
  if (marks.pins.length > 0) {
    params.set(
      "pin",
      marks.pins
        .map((pin) => {
          // Fixed fields rather than a tagged format: `lon,lat,label,icon`, and
          // an icon with no label needs the empty slot kept. The label has its
          // separators stripped on the way in, so it cannot invent a field.
          const label = clean(pin.label ?? "");
          const icon = pin.kind ?? "";
          if (icon !== "") return `${pair(pin.at)},${label},${icon}`;
          return label === "" ? pair(pin.at) : `${pair(pin.at)},${label}`;
        })
        .join(";"),
    );
  }
  if (marks.arrows.length > 0) {
    params.set("arrow", marks.arrows.map((a) => `${pair(a.from)},${pair(a.to)}`).join(";"));
  }
  if (marks.routes.length > 0) {
    // `|` between routes, `;` between stops: two separators because a route is
    // the one mark that is itself a list.
    params.set("route", marks.routes.map((r) => r.stops.map((s) => pair(s.at)).join(";")).join("|"));
  }
  if (marks.centres.length > 0) {
    // `lon,lat,value` then radius, stretch, angle and a 0 for a centre with no
    // letter — each written only when it or a field after it differs from the
    // default, so a plain low stays three numbers long. The value keeps a
    // decimal: a whole hectopascal is too coarse to set a trough by.
    params.set(
      "wx",
      marks.centres
        .map((centre) => {
          const tail = [centre.radius, centre.stretch, centre.angle, centre.mark === false ? 0 : undefined];
          while (tail.length > 0 && tail[tail.length - 1] === undefined) tail.pop();
          const value = Math.round(centre.value * 10) / 10;
          return [pair(centre.at), value, ...tail.map((v) => v ?? "")].join(",");
        })
        .join(";"),
    );
  }
}

/**
 * A query string back into marks, dropping anything that does not parse.
 *
 * Nothing here throws, for the same reason nothing in `decode` does — but one
 * of these is sharper than the rest. **`highlight` is the only mark the library
 * rejects**: an unrecognised code throws and takes the whole render with it, so
 * the codes are resolved here, against the library's own table, and a code it
 * does not know is dropped rather than handed on.
 */
export function decodeMarks(params: URLSearchParams): Marks {
  return {
    highlight: readHighlight(params.get("hl")),
    pins: readPins(params.get("pin")),
    arrows: readArrows(params.get("arrow")),
    routes: readRoutes(params.get("route")),
    centres: readCentres(params.get("wx")),
  };
}

function readHighlight(raw: string | null): readonly string[] {
  if (raw === null) return [];
  const codes: string[] = [];
  for (const part of raw.split(",")) {
    if (codes.length >= LIMITS.highlight) break;
    const code = resolveId(part);
    if (code !== null && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

function readPins(raw: string | null): readonly Pin[] {
  if (raw === null) return [];
  const pins: Pin[] = [];
  for (const token of raw.split(";")) {
    if (pins.length >= LIMITS.pins) break;
    const parts = token.split(",");
    const at = coordinate(parts[0], parts[1]);
    if (at === null) continue;
    const label = clean(parts[2] ?? "");
    // Checked against the library's own icon table rather than passed on: an
    // unrecognised `kind` draws a plain mark and keeps the word in the markup,
    // which would leave a URL claiming an icon the map does not have.
    const icon = (parts[3] ?? "").trim();
    const kind = isIconName(icon) ? icon : "";
    pins.push({
      at,
      ...(label === "" ? {} : { label }),
      ...(kind === "" ? {} : { kind }),
    });
  }
  return pins;
}

function readArrows(raw: string | null): readonly Arrow[] {
  if (raw === null) return [];
  const arrows: Arrow[] = [];
  for (const token of raw.split(";")) {
    if (arrows.length >= LIMITS.arrows) break;
    const parts = token.split(",");
    const from = coordinate(parts[0], parts[1]);
    const to = coordinate(parts[2], parts[3]);
    // Half an arrow points somewhere nobody asked about, so a token missing an
    // end is dropped whole rather than repaired.
    if (from === null || to === null) continue;
    arrows.push({ from, to });
  }
  return arrows;
}

function readRoutes(raw: string | null): readonly Route[] {
  if (raw === null) return [];
  const routes: Route[] = [];
  for (const line of raw.split("|")) {
    if (routes.length >= LIMITS.routes) break;
    const stops: { at: Position }[] = [];
    for (const token of line.split(";")) {
      if (stops.length >= LIMITS.stops) break;
      const parts = token.split(",");
      const at = coordinate(parts[0], parts[1]);
      if (at !== null) stops.push({ at });
    }
    // One stop is kept: it is the state a route is in after the first click,
    // and the URL is meant to hold the map as it stands, half-drawn included.
    if (stops.length > 0) routes.push({ stops });
  }
  return routes;
}

/**
 * Centres back from a link.
 *
 * Every number is clamped into what the library accepts rather than handed on,
 * because the library throws on a pressure it does not believe and a thrown
 * render takes the whole map with it.
 */
function readCentres(raw: string | null): readonly PressureCentre[] {
  if (raw === null) return [];
  const centres: PressureCentre[] = [];
  for (const token of raw.split(";")) {
    if (centres.length >= LIMITS.centres) break;
    const parts = token.split(",");
    const at = coordinate(parts[0], parts[1]);
    const value = Number(parts[2]);
    if (at === null || !Number.isFinite(value)) continue;
    const optional = (index: number, low: number, high: number): number | undefined => {
      const raw = parts[index];
      if (raw === undefined || raw === "") return undefined;
      const number = Number(raw);
      return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : undefined;
    };
    const radius = optional(3, 100, 5000);
    const stretch = optional(4, 1, 5);
    const angle = optional(5, -180, 180);
    centres.push({
      at,
      value: Math.min(1080, Math.max(900, Math.round(value * 10) / 10)),
      ...(radius === undefined ? {} : { radius }),
      ...(stretch === undefined ? {} : { stretch }),
      ...(angle === undefined ? {} : { angle }),
      ...(parts[6] === "0" ? { mark: false } : {}),
    });
  }
  return centres;
}

/** Two strings into a coordinate, or nothing. Out of range is not repaired. */
function coordinate(lon: string | undefined, lat: string | undefined): Position | null {
  if (lon === undefined || lat === undefined) return null;
  const x = Number(lon);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Clamped rather than dropped: a link truncated to `48.86` at the wrong place
  // is a broken pair, but a longitude of 180.0001 is a rounding artefact.
  if (Math.abs(x) > 181 || Math.abs(y) > 91) return null;
  return [round(Math.min(180, Math.max(-180, x))), round(Math.min(90, Math.max(-90, y)))];
}

/**
 * Rename a pin, and change a pin's icon.
 *
 * Here rather than inline in the mark list's event handlers, because that is
 * where the bug was: the rename rebuilt the pin as `{ at, label }` and dropped
 * everything else on it, so typing a name into a pin that had been dropped with
 * an airport on it turned it back into a plain mark. A handler that constructs
 * a new object instead of amending the old one loses whatever it did not think
 * to mention, and what it does not think to mention grows with every field
 * added later.
 *
 * Spread, therefore, and tested — which is the other half of the reason they
 * are functions. A transformation buried in a DOM listener cannot be tested
 * where this library's tests run.
 */
export function relabelPin(pins: readonly Pin[], index: number, label: string): Pin[] {
  const text = label.trim().slice(0, LIMITS.label);
  return pins.map((pin, i) =>
    i !== index ? pin : text === "" ? withoutLabel(pin) : { ...pin, label: text },
  );
}

export function repinIcon(pins: readonly Pin[], index: number, icon: string): Pin[] {
  return pins.map((pin, i) => {
    if (i !== index) return pin;
    if (icon === "" || !isIconName(icon)) {
      const { kind: _kind, ...rest } = pin;
      return rest;
    }
    return { ...pin, kind: icon };
  });
}

function withoutLabel(pin: Pin): Pin {
  const { label: _label, ...rest } = pin;
  return rest;
}

/** How many marks are on the map, for the "nothing here yet" case. */
export function markCount(marks: Marks): number {
  return marks.highlight.length + marks.pins.length + marks.arrows.length + marks.routes.length;
}

/** A coordinate as a person reads one, for the list beside the map. */
export function readCoordinate(at: Position): string {
  const [lon, lat] = at;
  return `${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? "W" : "E"}`;
}
