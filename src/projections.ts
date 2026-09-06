import {
  geoAlbers,
  geoConicConformal,
  geoEqualEarth,
  geoMercator,
  geoOrthographic,
} from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { FrameGeometry } from "./framing.js";
import type { Position, ProjectionName } from "./types.js";

/**
 * The meridian, and sometimes the parallel, a projection is built around.
 *
 * Not the middle of the canvas. `fitExtent` frames the region wherever this
 * puts it, so moving the axis changes which part of the projection is faithful
 * — the shear, the fan of the meridians, which way is up — and not where the
 * subject sits on the paper.
 */
interface Centre {
  readonly lon: number;
  readonly lat: number;
}

/** A projection that has not yet been fitted to a region. */
type ProjectionFactory = (
  bounds: [[number, number], [number, number]],
  centre: Centre | null,
) => GeoProjection;

type Bounds = [[number, number], [number, number]];

/**
 * How wide the region is in longitude, in degrees.
 *
 * `geoBounds` reports a region that crosses the antimeridian with its west
 * edge greater than its east — Oceania comes back as 113°E to -180°E, which is
 * a 67° span and not a 293° one. Subtracting naively would call it nearly
 * global and give up on centring exactly where centring matters most.
 */
function longitudeSpan([[west], [east]]: Bounds): number {
  return east >= west ? east - west : east - west + 360;
}

/** The meridian to put down the middle of the map, wrapped into [-180, 180]. */
function centralMeridian(bounds: Bounds): number {
  const [[west]] = bounds;
  const centre = west + longitudeSpan(bounds) / 2;
  return ((((centre + 180) % 360) + 360) % 360) - 180;
}

/**
 * Past this span a region is effectively the whole world, and rotating stops
 * being a service: it buys almost no accuracy and moves the Atlantic off the
 * middle of a world map, where every reader expects to find it.
 */
const GLOBAL_SPAN = 180;

/**
 * Turn a cylindrical or pseudocylindrical projection to face its region.
 *
 * `fitExtent` scales and translates, but it never rotates — so a map of Asia
 * was still drawn from a Greenwich-centred projection and arrived sheared,
 * 90° out from the part of the projection that is faithful. Only the central
 * meridian moves: tilting one of these off the equator produces an oblique
 * aspect, which is a deliberate choice and not something to do by default.
 */
function facing(projection: GeoProjection, bounds: Bounds, centre: Centre | null): GeoProjection {
  // An explicit centre beats the global-span rule as well as the automatic
  // one. That rule exists so a world map arrives Atlantic-centred like every
  // world map a reader has seen — and a Pacific-centred world map is exactly
  // what someone reaches for this option to get.
  if (centre !== null) return projection.rotate([-centre.lon, 0]);
  if (longitudeSpan(bounds) >= GLOBAL_SPAN) return projection;
  return projection.rotate([-centralMeridian(bounds), 0]);
}

/**
 * Conic projections need standard parallels chosen for the region — the same
 * projection tuned for Europe looks wrong over Chile. Placing them at the
 * inner sixths of the latitude span is the usual heuristic, and it means a
 * conic works anywhere without the caller knowing what a parallel is.
 */
function conicFor(
  factory: () => GeoProjection & { parallels(p: [number, number]): GeoProjection },
  bounds: [[number, number], [number, number]],
  centre: Centre | null,
): GeoProjection {
  const [[, south], [, north]] = bounds;
  const span = north - south;
  const projection = factory().parallels([south + span / 6, north - span / 6]);
  // Centre the developable surface on the region, or it shears badly. The
  // standard parallels stay derived from the region either way: they are what
  // the cone touches, not where it points.
  return projection.rotate([-(centre?.lon ?? centralMeridian(bounds)), 0]);
}

/**
 * A lookup table rather than a switch, so composite projections and insets
 * can be registered later without touching callers.
 */
const PROJECTIONS: Readonly<Record<ProjectionName, ProjectionFactory>> = {
  mercator: (bounds, centre) => facing(geoMercator(), bounds, centre),
  "equal-earth": (bounds, centre) => facing(geoEqualEarth(), bounds, centre),
  orthographic: (bounds, centre) => {
    const [[, south], [, north]] = bounds;
    // A globe has to be turned in both axes — there is no other way to look
    // at the region, and no familiar view to preserve by not turning it.
    return geoOrthographic().rotate([
      -(centre?.lon ?? centralMeridian(bounds)),
      -(centre?.lat ?? (south + north) / 2),
    ]);
  },
  "conic-conformal": (bounds, centre) => conicFor(geoConicConformal, bounds, centre),
  albers: (bounds, centre) => conicFor(geoAlbers, bounds, centre),
};

/**
 * Projections that can be turned in both axes and still be the projection
 * anyone asked for.
 *
 * A globe turned to face a region is still a globe. A cylinder tilted off the
 * equator is an *oblique* Mercator — a different map, with a different set of
 * things it gets right, and not something to hand someone who typed a pair of
 * coordinates meaning "look here".
 */
const TWO_AXIS: ReadonlySet<ProjectionName> = new Set<ProjectionName>(["orthographic"]);

export const PROJECTION_NAMES = Object.keys(PROJECTIONS) as readonly ProjectionName[];

export function isProjectionName(value: string): value is ProjectionName {
  return value in PROJECTIONS;
}

/** Check and normalise the caller's centre, or `null` if they did not name one. */
export function resolveCentre(
  name: ProjectionName,
  center: number | Position | undefined,
): Centre | null {
  if (center === undefined) return null;
  const [lon, lat] = typeof center === "number" ? [center, 0] : [center[0], center[1]];
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error(`masen: center longitude must be between -180 and 180, got ${lon}`);
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(`masen: center latitude must be between -90 and 90, got ${lat}`);
  }
  if (lat !== 0 && !TWO_AXIS.has(name)) {
    throw new Error(
      `masen: ${name} can only be centred on a meridian. Tilting it off the ` +
        `equator makes an oblique aspect — a different map, not a recentred one. ` +
        `Pass a longitude on its own, or use ${[...TWO_AXIS].join(", ")}.`,
    );
  }
  return { lon, lat };
}

/**
 * Build a projection fitted to `region` inside a `width` × `height` canvas.
 *
 * `fitExtent` solves centring, scale and padding in one call — there is no
 * separate camera to compute.
 */
export function createProjection(
  name: ProjectionName,
  frame: FrameGeometry,
  width: number,
  height: number,
  padding: number,
  /** Extra room at the top, for anything drawn above the map — an extrusion. */
  headroom = 0,
  /** The meridian to build the projection around, overriding the automatic one. */
  centre: Centre | null = null,
): GeoProjection {
  const projection = PROJECTIONS[name](frame.bounds, centre);

  return projection.fitExtent(
    [
      [padding, padding + headroom],
      [width - padding, height - padding],
    ],
    frame.geometry as never,
  );
}
