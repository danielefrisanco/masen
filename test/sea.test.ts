import { describe, expect, it } from "vitest";
import { geoContains } from "d3-geo";
import { masen } from "../src/index.js";
import { loadOcean } from "../src/topology.js";

/**
 * The sea, as a shape rather than as whatever the land does not cover.
 *
 * `--bg` paints the whole canvas and the land is drawn over it, so on a map
 * framed to a coastline the leftover reads as water and is right. It is wrong
 * the moment the frame holds land the map is not drawing: a map of Greece
 * painted the Turkish coast as Aegean, and a map of Switzerland put France,
 * Germany and Italy under the sea.
 *
 * So the tests here are about *where the water is*, not that a path was
 * emitted — the old behaviour emitted no path at all and looked fine.
 */

const SIZE = [520, 400] as const;
const base = { detail: "110m", size: [...SIZE], theme: "atlas" } as const;

/** The `.mp-ocean` group's contents, or "" when the slot is empty. */
function ocean(svg: string): string {
  const start = svg.indexOf('class="mp-layer mp-ocean"');
  expect(start, "the ocean slot is always emitted").toBeGreaterThan(-1);
  const tagEnd = svg.indexOf(">", start);
  if (svg[tagEnd - 1] === "/") return "";
  return svg.slice(tagEnd + 1, svg.indexOf("</g>", tagEnd));
}

const seaPaths = (svg: string): string[] =>
  [...ocean(svg).matchAll(/<path class="mp-sea" d="([^"]*)"/g)].map((m) => m[1] as string);

describe("the sea", () => {
  it("is not drawn unless asked for", async () => {
    const off = await masen({ ...base, region: ["GR"] });
    expect(ocean(off.svg)).toBe("");
    // The slot exists either way: the stack is a contract, not a suggestion.
    expect(off.svg).toContain('class="mp-layer mp-ocean"');
  });

  it("sits under the graticule, because an atlas draws meridians over water", async () => {
    const map = await masen({ ...base, region: ["GR"], sea: true, graticule: true });
    const sea = map.svg.indexOf('class="mp-layer mp-ocean"');
    const grid = map.svg.indexOf('class="mp-layer mp-graticule"');
    const land = map.svg.indexOf('class="mp-layer mp-land"');
    expect(sea).toBeGreaterThan(-1);
    expect(sea).toBeLessThan(grid);
    expect(grid).toBeLessThan(land);
  });

  it("covers water and leaves land alone", async () => {
    // Asked of the geometry rather than of the drawing. These four are the
    // whole point of the layer: two of them are places the old behaviour
    // painted as sea.
    const water = await loadOcean("110m");
    const inWater: [number, number][] = [
      [-30, 40], // mid-Atlantic
      [25.2, 37.5], // the Aegean, between the Cyclades
      [3.5, 41.5], // the Balearic Sea
    ];
    const onLand: [number, number][] = [
      [7.45, 46.95], // Bern — Switzerland, which is not a coastline
      [32.8, 39.9], // Ankara — the coast the Aegean map used to flood
      [2.35, 48.86], // Paris
    ];
    for (const point of inWater) {
      expect(
        water.features.some((f) => geoContains(f as never, point)),
        `${point.join()} should be in the ocean`,
      ).toBe(true);
    }
    for (const point of onLand) {
      expect(
        water.features.some((f) => geoContains(f as never, point)),
        `${point.join()} should not be in the ocean`,
      ).toBe(false);
    }
  });

  it("draws nothing at all for an inland frame", async () => {
    // Not an omission — the honest answer. No ocean reaches Switzerland, so
    // there is no sea to draw, and the canvas ground is what shows.
    const map = await masen({ ...base, region: ["CH"], sea: true });
    expect(seaPaths(map.svg)).toHaveLength(0);
    expect(ocean(map.svg)).toBe("");
  });

  it("draws the sea for a coastal frame", async () => {
    const map = await masen({ ...base, region: ["GR"], sea: true });
    expect(seaPaths(map.svg).length).toBeGreaterThan(0);
  });

  it("is clipped to the canvas rather than carrying every coast on earth", async () => {
    // The ocean is one polygon holding every coastline there is. Unclipped, a
    // 520x400 map of Greece came out 806 KB of path data to show a few gulfs,
    // and a map of Switzerland came out 858 KB to show nothing. This is the
    // difference between shipping the layer and not.
    const map = await masen({ ...base, region: ["GR"], sea: true });
    const numbers = (seaPaths(map.svg)[0] as string).match(/-?[\d.]+/g) ?? [];
    expect(numbers.length).toBeGreaterThan(20);
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      const x = Number(numbers[i]);
      const y = Number(numbers[i + 1]);
      // A hair of slack for the rounding `geoPath.digits(1)` applies.
      expect(x).toBeGreaterThanOrEqual(-0.2);
      expect(x).toBeLessThanOrEqual(SIZE[0] + 0.2);
      expect(y).toBeGreaterThanOrEqual(-0.2);
      expect(y).toBeLessThanOrEqual(SIZE[1] + 0.2);
    }
  });

  it("leaves every other layer drawing past the edge", async () => {
    // The clip is set on the shared projection and put back straight away. If
    // it leaked, coastlines would be cut off square at the canvas edge and
    // their strokes would end in mid-air.
    const clipped = await masen({ ...base, region: ["GR"], sea: true });
    const plain = await masen({ ...base, region: ["GR"] });
    const countries = (svg: string) =>
      [...svg.matchAll(/<path class="mp-country"[^>]*\sd="([^"]*)"/g)].map((m) => m[1]);
    expect(countries(clipped.svg)).toEqual(countries(plain.svg));
  });

  it("is a colour every preset carries, distinct from the ground where the ground is paper", async () => {
    const map = await masen({ ...base, region: ["GR"], palette: "sand", sea: true });
    // The *last* value, not the first: a theme is written before its palette
    // and the cascade settles it that way round. Reading the first match here
    // measured atlas's sea against atlas's ground and ignored the palette.
    const read = (name: string) => {
      const all = [...map.css.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))];
      return all.at(-1)?.[1]?.trim();
    };
    // `sand` is the case the layer exists for: its ground is paper, so the
    // sea has to be something else or turning this on says nothing.
    expect(read("--sea")).toBeDefined();
    expect(read("--sea")).not.toBe(read("--bg"));
  });

  it("keeps its paint through the flattening pass", async () => {
    const map = await masen({ ...base, region: ["GR"], sea: true });
    const flat = await map.render();
    expect(flat).toMatch(/<path class="mp-sea"[^>]*fill="#[0-9A-Fa-f]{3,6}"/);
  });
});
