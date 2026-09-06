import { describe, expect, it } from "vitest";
import { masen, type MapOptions } from "../src/index.js";

/**
 * The graticule is the one layer generated rather than read.
 *
 * Every other geographic layer draws something that exists in `data/`, so its
 * test can ask whether the right countries came back. A grid has no source
 * file to check against — the only thing that can be wrong is the geometry
 * itself. So every assertion here inverts what was drawn and asks the map
 * where it put it, which is the same discipline the scale bar got: measure the
 * property, do not assert the string.
 */

const SIZE = [800, 600] as const;
const TROPIC = 23.4362;

async function map(options: Partial<MapOptions> = {}) {
  return masen({
    region: "world",
    size: [...SIZE],
    graticule: true,
    // The grid is the whole subject here, and none of it depends on how
    // finely the coastline is drawn — so the cheap tier, with the names and
    // dots off. A world map at 50m with labels costs a second and a half and
    // proves nothing this file asks about.
    detail: "110m",
    layers: { labels: false, places: false },
    ...options,
  } as MapOptions);
}

/** The `.mp-graticule` group's contents, or "" when the slot is empty. */
function grid(svg: string): string {
  const start = svg.indexOf('class="mp-layer mp-graticule"');
  expect(start, "the graticule slot is always emitted").toBeGreaterThan(-1);
  const tagEnd = svg.indexOf(">", start);
  if (svg[tagEnd - 1] === "/") return "";
  const close = svg.indexOf("</g>", tagEnd);
  return svg.slice(tagEnd + 1, close);
}

interface Line {
  readonly kind: string;
  readonly points: [number, number][];
}

/**
 * Every line in the layer, as points in user units.
 *
 * `geoPath` on a LineString emits only `M` and `L`, so the numbers in `d` are
 * the vertices in order and nothing else.
 */
function lines(svg: string): Line[] {
  const out: Line[] = [];
  const paths = /<path class="mp-grid" data-kind="([a-z]+)" d="([^"]*)"\/>/g;
  let match: RegExpExecArray | null;
  while ((match = paths.exec(grid(svg))) !== null) {
    const numbers = (match[2] as string).match(/-?[\d.]+/g) ?? [];
    const points: [number, number][] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      points.push([Number(numbers[i]), Number(numbers[i + 1])]);
    }
    out.push({ kind: match[1] as string, points });
  }
  return out;
}

const only = (all: Line[], kind: string): Line[] => all.filter((l) => l.kind === kind);

describe("the graticule", () => {
  it("is not drawn unless asked for", async () => {
    const off = await map({ graticule: undefined });
    expect(grid(off.svg)).toBe("");
    const on = await map();
    expect(lines(on.svg).length).toBeGreaterThan(4);
  });

  it("sits under the land, where a grid the world is drawn on belongs", async () => {
    const drawn = await map({ region: "africa" });
    const above = drawn.svg.indexOf('class="mp-layer mp-graticule"');
    const land = drawn.svg.indexOf('class="mp-layer mp-land"');
    expect(above).toBeGreaterThan(-1);
    expect(above).toBeLessThan(land);
  });

  it("draws parallels along one latitude and meridians along one longitude", async () => {
    // Asked of the projection, not of the numbers: a line is a parallel
    // because every point on it inverts to the same latitude, whatever shape
    // the projection bent it into.
    const drawn = await map({ region: "africa", projection: "albers" });
    for (const line of only(lines(drawn.svg), "parallel")) {
      const lats = line.points.map((p) => drawn.invert(p)?.[1]).filter((v) => v !== undefined);
      expect(lats.length).toBeGreaterThan(2);
      expect(Math.max(...lats) - Math.min(...lats)).toBeLessThan(0.05);
    }
    for (const line of only(lines(drawn.svg), "meridian")) {
      const lons = line.points.map((p) => drawn.invert(p)?.[0]).filter((v) => v !== undefined);
      expect(lons.length).toBeGreaterThan(2);
      expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(0.05);
    }
  });

  it("puts the equator on the equator and the tropics on the tropics", async () => {
    const drawn = await map({ region: "africa", projection: "albers" });
    const found = lines(drawn.svg);

    const equator = only(found, "equator");
    expect(equator).toHaveLength(1);
    for (const point of (equator[0] as Line).points) {
      const back = drawn.invert(point);
      if (back === null) continue;
      expect(Math.abs(back[1])).toBeLessThan(0.05);
    }

    const tropics = only(found, "tropic");
    expect(tropics).toHaveLength(2);
    const latitudes = tropics
      .map((line) => drawn.invert(line.points[Math.floor(line.points.length / 2)] as [number, number]))
      .filter((v) => v !== null)
      .map((v) => v[1])
      .sort((a, b) => a - b);
    // One decimal, because `geoPath` rounds path data to a tenth of a user
    // unit and that tenth is worth about six thousandths of a degree at this
    // scale. The tropic is where it should be; the file just cannot say so
    // more precisely than it stores a coordinate.
    expect(latitudes[0]).toBeCloseTo(-TROPIC, 1);
    expect(latitudes[1]).toBeCloseTo(TROPIC, 1);
  });

  it("never draws a parallel on top of the equator", async () => {
    // 0 is a multiple of every step on the ladder, so the parallel set has to
    // skip it or the equator is stroked twice in two colours on one pixel row.
    const drawn = await map({ region: "africa", graticule: { step: 10 } });
    const flat = only(lines(drawn.svg), "parallel").map((line) => {
      const mid = line.points[Math.floor(line.points.length / 2)] as [number, number];
      return Math.round((drawn.invert(mid)?.[1] ?? NaN) * 100) / 100;
    });
    expect(flat).not.toContain(0);
    expect(flat.length).toBeGreaterThan(2);
  });

  it("spaces the grid by the step it was given", async () => {
    const drawn = await map({ graticule: { step: 30 }, projection: "equal-earth" });
    // Sampled at the middle of each line: the ends run past the framed bounds
    // on purpose, and on a world map that puts them off the projection, where
    // `invert` correctly refuses them.
    const lats = only(lines(drawn.svg), "parallel")
      .map((line) => drawn.invert(line.points[Math.floor(line.points.length / 2)] as [number, number])?.[1])
      .filter((v) => v !== undefined)
      .sort((a, b) => a - b);
    expect(lats.length).toBeGreaterThan(2);
    for (let i = 1; i < lats.length; i += 1) {
      // 30 apart, except where the equator was lifted out into its own line.
      const gap = (lats[i] as number) - (lats[i - 1] as number);
      expect([30, 60]).toContain(Math.round(gap));
    }
  });

  it("takes a different step per axis", async () => {
    const drawn = await map({ graticule: { step: [45, 10] }, projection: "equal-earth" });
    const found = lines(drawn.svg);
    // Latitude spans half what longitude does, and gets a step four times
    // finer, so there have to be more parallels than meridians.
    expect(only(found, "parallel").length).toBeGreaterThan(only(found, "meridian").length);
  });

  it("chooses a spacing from the region when it is not told one", async () => {
    // A degree grid over Switzerland and a degree grid over the world are not
    // the same request. The count is what has to stay comparable, not the step.
    const near = await map({ region: ["CH"], projection: "mercator" });
    const far = await map({ projection: "equal-earth" });
    for (const drawn of [near, far]) {
      const found = lines(drawn.svg);
      expect(only(found, "parallel").length).toBeGreaterThan(1);
      expect(only(found, "parallel").length).toBeLessThan(14);
      expect(only(found, "meridian").length).toBeGreaterThan(1);
      expect(only(found, "meridian").length).toBeLessThan(14);
    }
  });

  it("bends with the projection instead of drawing a rectangle", async () => {
    // A conic fans its meridians. If the grid were drawn in screen space this
    // would be a ladder, and the map would be lying about its own geometry.
    const drawn = await map({ region: "west-europe", projection: "conic-conformal" });
    const meridians = only(lines(drawn.svg), "meridian");
    expect(meridians.length).toBeGreaterThan(2);
    const leans = meridians.map((line) => {
      const first = line.points[0] as [number, number];
      const last = line.points[line.points.length - 1] as [number, number];
      return Math.atan2(last[0] - first[0], last[1] - first[1]);
    });
    // The outermost meridians lean opposite ways, which is what fanning is.
    expect(Math.max(...leans) - Math.min(...leans)).toBeGreaterThan(0.1);
  });

  it("draws nothing behind the globe", async () => {
    const drawn = await map({ projection: "orthographic" });
    const points = lines(drawn.svg).flatMap((line) => line.points);
    expect(points.length).toBeGreaterThan(20);
    // Every vertex the layer emits is a place on the near side of the globe.
    // `invert` returning null is the round-trip guard refusing a pixel that
    // is not on the map, and one of those inside a grid line means the grid
    // wrapped around the back.
    const off = points.filter((p) => drawn.invert(p) === null);
    expect(off.length / points.length).toBeLessThan(0.02);
  });

  it("keeps its lines on the canvas", async () => {
    // A line entirely off the edge is a kilobyte of path data nobody sees.
    const drawn = await map({ region: ["CH"], projection: "mercator" });
    for (const line of lines(drawn.svg)) {
      const xs = line.points.map((p) => p[0]);
      const ys = line.points.map((p) => p[1]);
      const onX = Math.min(...xs) <= SIZE[0] && Math.max(...xs) >= 0;
      const onY = Math.min(...ys) <= SIZE[1] && Math.max(...ys) >= 0;
      expect(onX && onY, `a ${line.kind} was drawn entirely off the canvas`).toBe(true);
    }
  });

  it("can be switched off by the layer flag like any other layer", async () => {
    const drawn = await map({ layers: { graticule: false, labels: false, places: false } });
    expect(grid(drawn.svg)).toBe("");
    // The slot is still emitted — the stack is a contract, not a suggestion.
    expect(drawn.svg).toContain('class="mp-layer mp-graticule"');
  });

  it("refuses a step that is not a spacing", async () => {
    for (const step of [0, -5, 91, Number.NaN]) {
      await expect(map({ graticule: { step } })).rejects.toThrow(/graticule step/);
    }
    await expect(map({ graticule: { step: [10, 0] } })).rejects.toThrow(/graticule step\[1\]/);
  });

  it("is painted by the theme, and keeps its paint through the flattening pass", async () => {
    const drawn = await map({ region: "africa", theme: "atlas" });
    expect(drawn.css).toContain("--graticule:");
    expect(drawn.css).toContain("--equator:");
    const flat = await drawn.render();
    const equator = /<path class="mp-grid" data-kind="equator"[^>]*>/.exec(flat)?.[0] ?? "";
    const parallel = /<path class="mp-grid" data-kind="parallel"[^>]*>/.exec(flat)?.[0] ?? "";
    expect(equator).toContain("stroke=");
    expect(parallel).toContain("stroke=");
    // The whole reason the equator is its own kind: a reader that ignores
    // stylesheets still has to see that it is not just another parallel.
    const strokeOf = (tag: string) => /stroke="([^"]*)"/.exec(tag)?.[1];
    expect(strokeOf(equator)).not.toBe(strokeOf(parallel));
  });
});
