import { feature, mesh } from "topojson-client";
import { featureId } from "./iso.js";
import type { Detail, GeoJsonFeatureCollection, Position } from "./types.js";

/** A country ready to draw: geometry plus the ids the emitter needs. */
export interface CountryFeature {
  readonly id: string;
  readonly name: string;
  readonly geometry: unknown;
}

/** A settlement. Ranked 1–3 so a theme can thin density with one CSS rule. */
export interface Place {
  readonly name: string;
  /** The country it sits in, or `null` where Natural Earth records none. */
  readonly iso: string | null;
  readonly position: Position;
  readonly population: number;
  readonly capital: boolean;
  readonly rank: 1 | 2 | 3;
}

/**
 * A named body of water, reduced to the one point its name is set at.
 *
 * Natural Earth ships these as polygons and this is not one, deliberately. The
 * shape is only ever used to decide where the name goes, so the build works
 * that out once — the interior point furthest from the shore, so the name lands
 * on water rather than on the Sicily the Mediterranean's centroid falls on —
 * and ships the answer. 1.5 MB of coastline becomes 9 KB of anchors.
 *
 * The rule that follows from it is stated in the README because a reader can
 * check it: a sea is named when its middle is on the map.
 */
export interface Sea {
  readonly name: string;
  /** `ocean`, `sea`, `bay`, `gulf`, `strait`, `channel`, `sound`, `reef`, `river`. */
  readonly kind: string;
  readonly position: Position;
  readonly rank: 1 | 2 | 3;
}

export type WaterKind = "lake" | "river";

/**
 * The geometry the emitter draws from.
 *
 * `borders` is a capability rather than raw topology, because shared boundaries
 * can only be derived where arcs are shared — a fact of the storage format, not
 * of the map. Water needs no equivalent: no two lakes share an edge, so it is
 * stored as plain geometry.
 */
export interface World {
  readonly countries: readonly CountryFeature[];
  readonly places: readonly Place[];
  readonly seas: readonly Sea[];
  /**
   * The boundaries shared between the named countries, each drawn once.
   * Coastlines are excluded — the land layer already draws that silhouette.
   *
   * With `focus`, only that country's own share of them, which is what an
   * extruded map needs: a border has to be drawn once per country, at each
   * country's own height, or it floats between the two.
   */
  borders(ids: readonly string[], focus?: string): unknown | null;
  /**
   * Which of the named countries share a boundary with which.
   *
   * The same fact `borders` is built on, kept rather than discarded. A political
   * fill needs the graph, not the lines — and the mesh already visits every
   * shared arc to find them, so this costs one more pass over arcs and no new
   * geometry.
   */
  adjacency(ids: readonly string[]): Map<string, Set<string>>;
  water(kind: WaterKind): unknown;
}

const cache = new Map<Detail, World>();

/**
 * Read one of the files the build writes into `data/`.
 *
 * The one thing in the runtime path that could not work in a browser, and it
 * was three copies of itself: `loadWorld`, `loadOcean` and `loadCover` each
 * built a URL and read it through `node:fs/promises`. Collapsing them into one
 * helper is what makes the browser branch smaller than the code it replaces
 * rather than larger.
 *
 * **The branch is on the protocol, and the order matters.** Node has had a
 * global `fetch` since 18, so "try fetch, fall back to the filesystem" would
 * make every Node caller pay a failed request for a `file:` URL on the way to
 * the answer. Asking the URL what it is costs nothing and is never wrong: a
 * package installed on disk resolves `import.meta.url` to `file:`, and a bundle
 * served over HTTP resolves it to the address it was served from.
 *
 * The `node:` import stays inside the branch and stays dynamic, so a bundler
 * targeting the browser never reaches it. `test/browser.test.ts` bundles the
 * library and checks exactly that, because the claim had never been verified.
 */
export async function readData(url: URL): Promise<unknown> {
  if (url.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(url, "utf8")) as unknown;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as unknown;
}

/** Where a data file lives, relative to wherever this module was loaded from. */
export function dataUrl(name: string): URL {
  return new URL(`../data/${name}.json`, import.meta.url);
}

/**
 * What to say when a data file will not load, which is not the same sentence
 * in both places it can fail.
 *
 * On disk the fix is `npm run build:data`, and that is what the message has
 * always said. Over HTTP it is not: telling someone who opened a web page to
 * run a build script sends them somewhere they cannot go. What they need is the
 * URL that was actually asked for, because the answer is nearly always that
 * `data/` was not deployed beside the bundle.
 */
function unreadable(what: string, detail: Detail, url: URL, cause: unknown): Error {
  const advice =
    url.protocol === "file:"
      ? "Run `npm run build:data` to regenerate it."
      : `Nothing answered at ${url.href} — serve the package's data/ directory beside the bundle.`;
  return new Error(`masen: could not read ${what} for detail "${detail}". ${advice}`, {
    cause,
  });
}

/**
 * The ocean, cached apart from everything else because it is loaded apart.
 *
 * One polygon with a hole for every continent, and half again the size of the
 * whole rest of the bundle — so it lives in `data/ocean-<tier>.json` and is
 * read only when a map asks for the sea. An opt-in layer every caller
 * downloads is not opt-in.
 */
const oceanCache = new Map<Detail, GeoJsonFeatureCollection>();

export async function loadOcean(detail: Detail): Promise<GeoJsonFeatureCollection> {
  const cached = oceanCache.get(detail);
  if (cached) return cached;

  const url = dataUrl(`ocean-${detail}`);
  let collection: GeoJsonFeatureCollection;
  try {
    collection = (await readData(url)) as GeoJsonFeatureCollection;
  } catch (cause) {
    throw unreadable("ocean geometry", detail, url, cause);
  }

  oceanCache.set(detail, collection);
  return collection;
}

/**
 * Land cover, cached and loaded apart for the ocean's reason, at a tenth of the
 * weight: 52 KB at 110m and 589 KB at 50m, against a 152 KB bundle.
 *
 * Three kinds ship — `desert`, `mountain`, `glacier` — and each feature carries
 * only which one it is. The classification is Natural Earth's own, joined from
 * the 10m tier by `NE_ID` because the coarser files ship the column blank; see
 * `scripts/fetch-natural-earth.mjs`, where that join is done and checked.
 */
const coverCache = new Map<Detail, GeoJsonFeatureCollection>();

export async function loadCover(detail: Detail): Promise<GeoJsonFeatureCollection> {
  const cached = coverCache.get(detail);
  if (cached) return cached;

  const url = dataUrl(`cover-${detail}`);
  let collection: GeoJsonFeatureCollection;
  try {
    collection = (await readData(url)) as GeoJsonFeatureCollection;
  } catch (cause) {
    throw unreadable("land cover", detail, url, cause);
  }

  coverCache.set(detail, collection);
  return collection;
}

/**
 * Disputed and breakaway areas, loaded apart for the ocean's reason and at a
 * fraction of its weight: 35 KB, 28 features.
 *
 * **This is the layer that stops the map making a claim nobody asked it to
 * make.** The country geometry resolves contested territory *de facto* —
 * Simferopol falls inside feature 643, Russia, at every tier this library
 * ships — and that is inherited from `world-atlas`, not chosen. Drawn as a
 * hatched overlay rather than a reassignment, this says the border is
 * contested, which is true, instead of swapping one silent claim for another.
 *
 * **50m only, and empty elsewhere rather than an error.** Natural Earth
 * publishes no 110m breakaway file — it 404s — so a coarse map genuinely
 * cannot say a border is contested, and a caller must be able to leave the
 * option on across tiers without branching. What must not happen is the limit
 * going unsaid, which is what the README is for.
 */
const disputedCache = new Map<Detail, GeoJsonFeatureCollection>();

/** The tiers Natural Earth publishes a breakaway file for. */
export const DISPUTED_TIERS: readonly Detail[] = Object.freeze(["50m"]);

const NO_AREAS: GeoJsonFeatureCollection = Object.freeze({
  type: "FeatureCollection",
  features: Object.freeze([]),
}) as GeoJsonFeatureCollection;

export async function loadDisputed(detail: Detail): Promise<GeoJsonFeatureCollection> {
  if (!DISPUTED_TIERS.includes(detail)) return NO_AREAS;

  const cached = disputedCache.get(detail);
  if (cached) return cached;

  const url = dataUrl(`disputed-${detail}`);
  let collection: GeoJsonFeatureCollection;
  try {
    collection = (await readData(url)) as GeoJsonFeatureCollection;
  } catch (cause) {
    throw unreadable("disputed areas", detail, url, cause);
  }

  disputedCache.set(detail, collection);
  return collection;
}

interface Bundle {
  readonly countries: { objects: { countries: { geometries: readonly unknown[] } } };
  readonly lakes: unknown;
  readonly rivers: unknown;
  readonly places: ReadonlyArray<{
    n: string;
    i: string | null;
    x: number;
    y: number;
    p: number;
    c: number;
    r: number;
  }>;
  readonly seas?: ReadonlyArray<{ n: string; k: string; x: number; y: number; r: number }>;
}

/**
 * Load the bundled map data.
 *
 * Reads `data/`, which the build produces — not a package off disk. That
 * distinction is the whole point of this seam: Phase 1 resolved `world-atlas`
 * through `createRequire`, which tied the library to Node and to a
 * devDependency being present at call time. Sources now stay on the build
 * machine and only the extract ships.
 */
export async function loadWorld(detail: Detail): Promise<World> {
  const cached = cache.get(detail);
  if (cached) return cached;

  const url = dataUrl(detail);

  let bundle: Bundle;
  try {
    bundle = (await readData(url)) as Bundle;
  } catch (cause) {
    throw unreadable("bundled data", detail, url, cause);
  }

  const topology = bundle.countries;
  const object = topology.objects.countries;

  const collection = feature(topology as never, object as never) as unknown as {
    features: ReadonlyArray<Record<string, never>>;
  };

  const countries: CountryFeature[] = [];
  // Kept so `borders` can rebuild a subset object: the mesh needs the raw
  // arc-indexed geometry, which the GeoJSON conversion above has thrown away.
  const rawById = new Map<string, unknown>();

  for (const [index, raw] of collection.features.entries()) {
    const record = raw as unknown as { id?: string | number; properties?: { name?: string } };
    const name = record.properties?.name ?? "";
    const id = featureId(record.id, name);
    // A feature with no resolvable id cannot be targeted or highlighted;
    // dropping it silently would be worse than leaving it unaddressable.
    if (id === null) continue;
    countries.push({ id, name, geometry: raw });
    const source = object.geometries[index];
    if (source !== undefined) rawById.set(id, source);
  }

  const places: Place[] = bundle.places.map((p) => ({
    name: p.n,
    iso: p.i,
    position: [p.x, p.y] as Position,
    population: p.p,
    capital: p.c === 1,
    rank: (p.r === 1 || p.r === 2 ? p.r : 3) as 1 | 2 | 3,
  }));

  // Optional in the bundle shape rather than required, so a `data/` built
  // before sea names existed still loads and simply has none.
  const seas: Sea[] = (bundle.seas ?? []).map((s) => ({
    name: s.n,
    kind: s.k,
    position: [s.x, s.y] as Position,
    rank: (s.r === 1 || s.r === 2 ? s.r : 3) as 1 | 2 | 3,
  }));

  const world: World = {
    countries: Object.freeze(countries),
    places: Object.freeze(places),
    seas: Object.freeze(seas),

    borders(ids: readonly string[], focus?: string): unknown | null {
      const geometries: unknown[] = [];
      const focused = focus === undefined ? undefined : rawById.get(focus);
      for (const id of ids) {
        const source = rawById.get(id);
        if (source !== undefined) geometries.push(source);
      }
      if (geometries.length < 2) return null;

      const subset = { type: "GeometryCollection" as const, geometries };
      // `a !== b` selects arcs two different countries share. The same call
      // with `a === b` would give the outer edge, which the land layer draws.
      const lines = mesh(topology as never, subset as never, (a, b) =>
        a !== b && (focused === undefined || a === focused || b === focused),
      ) as { coordinates: readonly unknown[] };
      return lines.coordinates.length === 0 ? null : lines;
    },

    adjacency(ids: readonly string[]): Map<string, Set<string>> {
      const graph = new Map<string, Set<string>>();
      const geometries: unknown[] = [];
      const idOf = new Map<unknown, string>();

      for (const id of ids) {
        const source = rawById.get(id);
        if (source === undefined) continue;
        geometries.push(source);
        idOf.set(source, id);
        graph.set(id, new Set());
      }
      if (geometries.length < 2) return graph;

      const subset = { type: "GeometryCollection" as const, geometries };
      // The filter is called once per arc whatever it returns, so returning
      // false throughout records the graph and builds no line work at all.
      mesh(topology as never, subset as never, (a, b) => {
        if (a === b) return false;
        const left = idOf.get(a);
        const right = idOf.get(b);
        if (left === undefined || right === undefined) return false;
        graph.get(left)?.add(right);
        graph.get(right)?.add(left);
        return false;
      });

      return graph;
    },

    water(kind: WaterKind): unknown {
      return kind === "lake" ? bundle.lakes : bundle.rivers;
    },
  };

  cache.set(detail, world);
  return world;
}
