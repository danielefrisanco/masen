import { describe, expect, it } from "vitest";
import { masen } from "../src/index.js";
import { loadCover } from "../src/topology.js";

/**
 * Land cover, and whether it is on the land it claims to be on.
 *
 * The failure this layer can have is not "no path was emitted" — it is a path
 * emitted over the wrong ground, which every string assertion in the world
 * passes. So the tests here take the emitted path apart and put its points back
 * through `invert()`, which answers in degrees, and then ask whether those
 * degrees are where that kind of cover lives.
 *
 * The one thing worth knowing before reading them: the classification is
 * Natural Earth's, joined from the 10m tier by `NE_ID` because the 50m and
 * 110m files ship the `FEATURECLA` column blank on every feature. That join is
 * checked where it happens, in `scripts/fetch-natural-earth.mjs`, which throws
 * rather than quietly producing an unclassed blob.
 */

const SIZE = [520, 400] as const;
const base = {
  detail: "110m",
  size: [...SIZE],
  theme: "atlas",
  // Off for speed: nothing here is about names.
  layers: { labels: false, places: false },
} as const;

/** The Sahara and the countries it crosses. */
const SAHARA = ["DZ", "LY", "EG", "NE", "TD", "ML", "MR", "MA", "TN", "SD"];

/** The `.mp-terrain` group's contents, or "" when the slot is empty. */
function terrain(svg: string): string {
  const start = svg.indexOf("mp-layer mp-terrain");
  expect(start, "the terrain slot is always emitted").toBeGreaterThan(-1);
  const tagEnd = svg.indexOf(">", start);
  if (svg[tagEnd - 1] === "/") return "";
  return svg.slice(tagEnd + 1, svg.indexOf("</g>", tagEnd));
}

function coverPaths(svg: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of terrain(svg).matchAll(
    /<path class="mp-cover" data-kind="([^"]+)" d="([^"]*)"/g,
  )) {
    found.set(m[1] as string, m[2] as string);
  }
  return found;
}

/** Every coordinate pair in a path's `d`, as canvas points. */
function points(d: string): Array<[number, number]> {
  return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as [number, number],
  );
}

describe("land cover", () => {
  it("is not drawn unless asked for", async () => {
    const off = await masen({ ...base, region: SAHARA });
    expect(terrain(off.svg)).toBe("");
    // The slot exists either way: the stack is a contract, not a suggestion.
    expect(off.svg).toContain("mp-layer mp-terrain");
  });

  it("sits over the land it tints and under the water", async () => {
    const map = await masen({ ...base, region: ["CH", "IT", "FR", "AT"], terrain: true });
    const land = map.svg.indexOf('class="mp-layer mp-land"');
    const cover = map.svg.indexOf("mp-layer mp-terrain");
    const hydro = map.svg.indexOf("mp-layer mp-hydro");
    expect(land).toBeLessThan(cover);
    expect(cover).toBeLessThan(hydro);
  });

  it("puts desert where the desert is", async () => {
    const map = await masen({ ...base, region: SAHARA, terrain: true });
    const desert = coverPaths(map.svg).get("desert");
    expect(desert, "a map of the Sahara draws no desert").toBeDefined();

    // Every point of the drawn shape, back in degrees. The Sahara and the
    // Arabian desert are the only two the 110m tier carries, and the frame
    // holds one of them: north of the Sahel, south of the Mediterranean.
    const back = points(desert as string)
      .map((p) => map.invert(p))
      .filter((p): p is [number, number] => p !== null);
    expect(back.length).toBeGreaterThan(20);
    for (const [lon, lat] of back) {
      expect(lat, `desert drawn at ${lat}°N, which is not the Sahara`).toBeGreaterThan(8);
      expect(lat, `desert drawn at ${lat}°N, which is not the Sahara`).toBeLessThan(40);
      expect(lon).toBeGreaterThan(-20);
      expect(lon).toBeLessThan(60);
    }
  });

  it("puts mountains on the Alps and not on the plain", async () => {
    const map = await masen({
      ...base,
      region: ["CH", "IT", "FR", "AT", "DE", "SI"],
      terrain: true,
    });
    const mountain = coverPaths(map.svg).get("mountain");
    expect(mountain, "a map of the Alps draws no mountains").toBeDefined();

    const back = points(mountain as string)
      .map((p) => map.invert(p))
      .filter((p): p is [number, number] => p !== null);
    expect(back.length).toBeGreaterThan(20);
    // The centre of the drawn shape, which for this frame is the Alpine arc.
    const lon = back.reduce((sum, p) => sum + p[0], 0) / back.length;
    const lat = back.reduce((sum, p) => sum + p[1], 0) / back.length;
    expect(lon).toBeGreaterThan(2);
    expect(lon).toBeLessThan(18);
    expect(lat).toBeGreaterThan(41);
    expect(lat).toBeLessThan(49);
  });

  it("draws only the kinds it is given", async () => {
    // Central Asia is the frame that carries two kinds at 110m: the Gobi and
    // the Tian Shan. Asking for one has to leave the other undrawn, or the
    // option is decoration.
    const region = ["CN", "MN", "KZ", "KG", "UZ", "TJ", "TM"];
    const all = await masen({ ...base, region, terrain: true });
    const one = await masen({ ...base, region, terrain: ["mountain"] });
    expect([...coverPaths(all.svg).keys()].sort()).toEqual(["desert", "mountain"]);
    expect([...coverPaths(one.svg).keys()]).toEqual(["mountain"]);
  });

  it("draws nothing where there is no cover to draw", async () => {
    // Denmark and the Netherlands: no desert, no range, no ice at 110m.
    const map = await masen({ ...base, region: ["DK", "NL"], terrain: true });
    expect(terrain(map.svg)).toBe("");
  });

  /**
   * The clip is a shipping requirement, not a tidy-up.
   *
   * The Sahara and the Andes are continent-sized polygons. Drawn unclipped, a
   * frame that shows a corner of one still carries the whole of it, the way the
   * ocean did before `clipExtent` — 806 KB to draw a few gulfs.
   */
  it("is cut to the canvas rather than carried past it", async () => {
    const map = await masen({ ...base, region: ["MA"], terrain: true });
    const [width, height] = SIZE;
    for (const [kind, d] of coverPaths(map.svg)) {
      for (const [x, y] of points(d)) {
        expect(x, `${kind} runs to x=${x} on a ${width}-wide canvas`).toBeGreaterThanOrEqual(-1);
        expect(x, `${kind} runs to x=${x} on a ${width}-wide canvas`).toBeLessThanOrEqual(width + 1);
        expect(y, `${kind} runs to y=${y} on a ${height}-tall canvas`).toBeGreaterThanOrEqual(-1);
        expect(y).toBeLessThanOrEqual(height + 1);
      }
    }
  });

  it("changes nothing about the land underneath it", async () => {
    const off = await masen({ ...base, region: SAHARA });
    const on = await masen({ ...base, region: SAHARA, terrain: true });
    const countries = (svg: string): string[] =>
      [...svg.matchAll(/<path class="mp-country"[^>]*\sd="([^"]*)"/g)].map((m) => m[1] as string);
    expect(countries(on.svg)).toEqual(countries(off.svg));
  });

  it("ships three kinds and no forest, because Natural Earth has none", async () => {
    const cover = await loadCover("110m");
    const kinds = new Set(
      cover.features.map((f) => (f as { properties?: { k?: string } }).properties?.k),
    );
    expect([...kinds].sort()).toEqual(["desert", "glacier", "mountain"]);
  });

  it("draws ice where there is ice", async () => {
    const map = await masen({
      ...base,
      region: "antarctica",
      projection: "orthographic",
      terrain: true,
    });
    expect(coverPaths(map.svg).has("glacier")).toBe(true);
  });

  it("obeys the layer switch", async () => {
    const map = await masen({
      ...base,
      region: SAHARA,
      terrain: true,
      layers: { terrain: false, labels: false, places: false },
    });
    expect(terrain(map.svg)).toBe("");
  });
});

/**
 * Water kinds, which take the same shape as the cover kinds above and the
 * opposite default.
 *
 * `terrain` is opt-in because a desert tint is a decision; water is opt-out
 * because a map has lakes and rivers unless you say otherwise. The kind worth
 * dropping is the river: at small scale a river and a border are both thin
 * lines, and a reader who cannot tell them apart is worse off than one who
 * sees neither.
 */
describe("which kinds of water", () => {
  const FRAME = { region: ["FR", "DE", "CH"], detail: "50m" } as const;

  const kinds = (svg: string): Set<string> =>
    new Set([...svg.matchAll(/class="mp-water" data-kind="([^"]*)"/g)].map((m) => m[1] as string));

  it("draws both when nothing is said", async () => {
    const map = await masen({ ...FRAME });
    expect(kinds(map.svg)).toEqual(new Set(["lake", "river"]));
  });

  it("draws only the kinds named", async () => {
    const map = await masen({ ...FRAME, water: ["lake"] });
    expect(kinds(map.svg)).toEqual(new Set(["lake"]));
  });

  it("draws none when told none, without emptying the layer's neighbours", async () => {
    const map = await masen({ ...FRAME, water: false });
    expect(kinds(map.svg)).toEqual(new Set());
    // The rest of the map is untouched: this selects a kind, it is not a
    // second way to switch the layer off.
    expect(map.svg).toContain('class="mp-country"');
  });

  it("is separate from the layer switch", async () => {
    // `layers.hydro` says whether the group renders at all; `water` says what
    // goes in it. Both off is not a contradiction, it is the same answer twice.
    const map = await masen({ ...FRAME, water: ["lake", "river"], layers: { hydro: false } });
    expect(kinds(map.svg)).toEqual(new Set());
  });
});
