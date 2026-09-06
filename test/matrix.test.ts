import { describe, expect, it } from "vitest";
import { expandPreset } from "../src/regions.js";
import {
  countryTable,
  masen,
  PALETTE_NAMES,
  PROJECTION_NAMES,
  REGION_PRESET_NAMES,
  THEME_NAMES,
  TYPEFACE_NAMES,
} from "../src/index.js";

/**
 * The cross product, as invariants rather than as pictures.
 *
 * Nine regions by five projections by five themes is 225 maps. Committing 225
 * SVG snapshots would mean nobody ever opens one, and a gallery nobody opens is
 * the exact failure this project has already had three times. So the gallery
 * stays curated and human-sized, and the combinations that no one will ever
 * look at are checked here for the things that can be stated as facts:
 *
 *   - it renders at all
 *   - it draws something
 *   - every number it emits is a number
 *   - what it draws is on the canvas
 *   - the same input gives the same output
 *   - every token the stylesheet asks for resolves to a value
 *
 * None of that proves a map is *good*. It proves a combination is not broken,
 * which is the only claim a matrix this size can honestly make.
 */

const SIZE = [640, 480] as const;
const base = { detail: "110m", size: SIZE } as const;

/** Every coordinate in every `d` attribute, as numbers. */
function pathNumbers(svg: string): number[] {
  const found: number[] = [];
  for (const match of svg.matchAll(/\sd="([^"]*)"/g)) {
    for (const token of (match[1] as string).matchAll(/-?\d*\.?\d+(?:e-?\d+)?/gi)) {
      found.push(Number(token[0]));
    }
  }
  return found;
}

function countryPaths(svg: string): string[] {
  return [...svg.matchAll(/<path class="mp-country"[^>]*\sd="([^"]*)"/g)].map(
    (m) => m[1] as string,
  );
}

const combinations = REGION_PRESET_NAMES.flatMap((region) =>
  PROJECTION_NAMES.map((projection) => [region, projection] as const),
);

describe("every region in every projection", () => {
  it.each(combinations)("draws %s in %s", async (region, projection) => {
    const map = await masen({ ...base, region, projection });

    const countries = countryPaths(map.svg);
    expect(countries.length, `${region}/${projection} drew no land`).toBeGreaterThan(0);

    // A single NaN in a `d` makes the renderer discard the whole subpath
    // silently — the country simply is not there, and no assertion on the
    // string would notice.
    const numbers = pathNumbers(map.svg);
    expect(numbers.length).toBeGreaterThan(0);
    const broken = numbers.filter((n) => !Number.isFinite(n));
    expect(broken, `${region}/${projection} emitted ${broken.length} non-finite coordinates`).toEqual(
      [],
    );
  });

  /**
   * Framing exists to put the region on the canvas. A projection that cannot
   * represent the region — Mercator at the poles is the classic — fails by
   * sending the geometry somewhere off in the millions, not by throwing.
   */
  it.each(combinations)("keeps %s in %s on the canvas", async (region, projection) => {
    const map = await masen({ ...base, region, projection });
    const xs: number[] = [];
    const ys: number[] = [];
    for (const d of countryPaths(map.svg)) {
      const numbers = [...d.matchAll(/-?\d*\.?\d+(?:e-?\d+)?/gi)].map((m) => Number(m[0]));
      for (let i = 0; i + 1 < numbers.length; i += 2) {
        xs.push(numbers[i] as number);
        ys.push(numbers[i + 1] as number);
      }
    }
    const onCanvas = xs.filter(
      (x, i) => x >= 0 && x <= SIZE[0] && (ys[i] as number) >= 0 && (ys[i] as number) <= SIZE[1],
    );
    expect(
      onCanvas.length / xs.length,
      `${region}/${projection} put most of the land off-canvas`,
    ).toBeGreaterThan(0.5);
  });
});

describe("every region in every preset", () => {
  const themed = REGION_PRESET_NAMES.flatMap((region) =>
    THEME_NAMES.map((theme) => [region, theme] as const),
  );

  /**
   * `render()` flattens the stylesheet onto the nodes. A token the theme never
   * defined survives that pass as the literal text `var(--thing)` sitting in a
   * presentation attribute, which every renderer ignores — so the shape is
   * drawn in the default paint and the theme silently did nothing.
   */
  it.each(themed)("resolves every token for %s in %s", async (region, theme) => {
    const map = await masen({ ...base, region, theme });
    const flattened = await map.render();
    const withoutStylesheet = flattened.replace(/<style>[\s\S]*?<\/style>/g, "");
    const unresolved = [...withoutStylesheet.matchAll(/var\(--[a-z-]+\)/g)].map((m) => m[0]);
    expect([...new Set(unresolved)], `${region}/${theme}`).toEqual([]);
  });
});

describe("determinism", () => {
  it.each(REGION_PRESET_NAMES)("renders %s identically twice", async (region) => {
    const once = await masen({ ...base, region, theme: "atlas" });
    const twice = await masen({ ...base, region, theme: "atlas" });
    expect(once.svg).toEqual(twice.svg);
    expect(await once.render()).toEqual(await twice.render());
  });
});

describe("every palette and typeface, on one region", () => {
  it.each(PALETTE_NAMES)("dresses west-europe in %s", async (palette) => {
    const map = await masen({ ...base, region: "west-europe", theme: "minimal", palette });
    expect(countryPaths(map.svg).length).toBeGreaterThan(0);
    const flattened = (await map.render()).replace(/<style>[\s\S]*?<\/style>/g, "");
    expect(flattened).not.toMatch(/var\(--/);
  });

  it.each(TYPEFACE_NAMES)("sets west-europe in %s", async (typeface) => {
    const map = await masen({ ...base, region: "west-europe", theme: "minimal", typeface });
    const flattened = (await map.render()).replace(/<style>[\s\S]*?<\/style>/g, "");
    expect(flattened).toMatch(/font-family="/);
    expect(flattened).not.toMatch(/var\(--/);
  });
});

/**
 * A bounding box frames the box, not the planet.
 *
 * The rectangle a bbox region is framed by is a GeoJSON polygon, and d3-geo
 * reads a ring by the right-hand rule on the sphere: wound the other way, it
 * describes the *complement*. It was wound the other way. `geoBounds` on it
 * came back as the whole world and `geoArea` as 11.999 steradians of a
 * 12.566-steradian globe, so every bbox map was fitted to the entire planet.
 *
 * The conics failed loudly — a world extent fits at a scale of zero and every
 * coordinate projects to NaN — and the cylindricals failed silently, drawing a
 * world map with the region as a small patch in the middle. The silent half is
 * why this is a test about *where things land* rather than about whether the
 * call threw.
 */
/**
 * The projection's axis, which is not the middle of the canvas.
 *
 * `fitExtent` frames the region wherever the rotation puts it, so the thing to
 * test is not "did the map move" — it did not, and should not. It is which
 * meridian the projection is now symmetric about, and that is a question only
 * `project()` can answer.
 */
describe("an explicit centre", () => {
  const SIZE = [800, 600] as const;
  const world = { region: "world", detail: "110m", size: SIZE } as const;

  it("puts the meridian it was given down the middle of a world map", async () => {
    const greenwich = await masen({ ...world, projection: "equal-earth" });
    const pacific = await masen({ ...world, projection: "equal-earth", center: 180 });

    const middle = SIZE[0] / 2;
    expect((greenwich.project([0, 0]) as [number, number])[0]).toBeCloseTo(middle, 0);
    expect((pacific.project([180, 0]) as [number, number])[0]).toBeCloseTo(middle, 0);
    // And the one it displaced is now at an edge, which is the whole point:
    // a Pacific-centred map is the one that stops cutting the Pacific in half.
    const displaced = (pacific.project([0, 0]) as [number, number])[0];
    expect(Math.min(displaced, SIZE[0] - displaced)).toBeLessThan(SIZE[0] * 0.1);
  });

  it("turns a globe to face the coordinate it was given", async () => {
    const turned = await masen({ ...world, projection: "orthographic", center: [100, 20] });
    const facing = await masen({ ...world, projection: "orthographic" });
    const fromMiddle = (map: Awaited<ReturnType<typeof masen>>) => {
      const [x, y] = map.project([100, 20]) as [number, number];
      return Math.hypot(x - SIZE[0] / 2, y - SIZE[1] / 2);
    };
    // Near the middle rather than at it: `fitExtent` frames the land, and the
    // land is not symmetric about any axis, so the disc sits a few units off
    // centre. That is framing doing its job, not the rotation missing.
    expect(fromMiddle(turned)).toBeLessThan(SIZE[1] * 0.05);
    expect(fromMiddle(turned)).toBeLessThan(fromMiddle(facing) / 3);
    // The far side is behind the globe, and the round-trip guard says so.
    expect(turned.invert(turned.project([-80, -20]) as [number, number])).not.toEqual([-80, -20]);
  });

  it("moves the axis without reframing the subject", async () => {
    // The region still fills the canvas. If this drifted, `center` would have
    // become a camera control, which is the one thing it is documented not
    // to be.
    const off = await masen({ region: "asia", detail: "110m", size: SIZE, projection: "albers" });
    const on = await masen({
      region: "asia", detail: "110m", size: SIZE, projection: "albers", center: 80,
    });
    for (const map of [off, on]) {
      const xs = pathNumbers(map.svg).filter((_, i) => i % 2 === 0);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(SIZE[0] * 0.7);
    }
  });

  it("takes a bare longitude on every projection", async () => {
    for (const projection of PROJECTION_NAMES) {
      const map = await masen({ ...world, projection: projection as never, center: -60 });
      expect(countryPaths(map.svg).length, `${projection} drew no land`).toBeGreaterThan(0);
    }
  });

  it("refuses to tilt a projection that would go oblique", async () => {
    for (const projection of ["mercator", "equal-earth", "albers", "conic-conformal"] as const) {
      await expect(
        masen({ ...world, projection, center: [10, 47] }),
      ).rejects.toThrow(/oblique/);
    }
    // The one that turns in both axes takes it.
    await expect(
      masen({ ...world, projection: "orthographic", center: [10, 47] }),
    ).resolves.toBeDefined();
  });

  it("refuses a coordinate that is not one", async () => {
    await expect(masen({ ...world, center: 400 })).rejects.toThrow(/center longitude/);
    await expect(masen({ ...world, center: Number.NaN })).rejects.toThrow(/center longitude/);
    await expect(
      masen({ ...world, projection: "orthographic", center: [10, 100] }),
    ).rejects.toThrow(/center latitude/);
  });
});

describe("a bbox region", () => {
  const BOX = [-30, 20, 30, 64] as const;
  const SIZE = [800, 600] as const;

  it.each(PROJECTION_NAMES)("fills the canvas with the box under %s", async (projection) => {
    const map = await masen({
      region: { bbox: BOX },
      projection: projection as never,
      size: SIZE,
      detail: "110m",
    });
    const [west, south, east, north] = BOX;
    const corners = [
      map.project([west, south]),
      map.project([east, south]),
      map.project([east, north]),
      map.project([west, north]),
    ];
    for (const corner of corners) {
      expect(corner, `${projection}: a corner of the box is nowhere`).not.toBeNull();
      expect(Number.isFinite((corner as [number, number])[0])).toBe(true);
      expect(Number.isFinite((corner as [number, number])[1])).toBe(true);
    }

    const xs = corners.map((c) => (c as [number, number])[0]);
    const ys = corners.map((c) => (c as [number, number])[1]);
    const spread = Math.max(...xs) - Math.min(...xs);
    const rise = Math.max(...ys) - Math.min(...ys);

    // Fitted to the box, its corners span most of the canvas. Fitted to the
    // world, they huddle in the middle — which is exactly what they did.
    expect(spread, `${projection}: the box spans only ${spread.toFixed(0)} of ${SIZE[0]}`)
      .toBeGreaterThan(SIZE[0] * 0.5);
    expect(rise, `${projection}: the box rises only ${rise.toFixed(0)} of ${SIZE[1]}`)
      .toBeGreaterThan(SIZE[1] * 0.5);
  });

  it("puts the middle of the box near the middle of the canvas", async () => {
    const map = await masen({
      region: { bbox: BOX },
      projection: "conic-conformal",
      size: SIZE,
      detail: "110m",
    });
    const middle = map.project([(BOX[0] + BOX[2]) / 2, (BOX[1] + BOX[3]) / 2]);
    expect(middle).not.toBeNull();
    const [x, y] = middle as [number, number];
    expect(Math.abs(x - SIZE[0] / 2)).toBeLessThan(SIZE[0] * 0.1);
    expect(Math.abs(y - SIZE[1] / 2)).toBeLessThan(SIZE[1] * 0.15);
  });
});


/**
 * A preset must not name a code the data cannot draw.
 *
 * The failure is quiet and specific: an unresolvable code is not an error, it
 * is a *hole* — the country is simply absent, and the map looks like the sea
 * reaches somewhere it does not. `XS` missing unnamed Somaliland once, and
 * `GF` did it again for French Guiana, which Natural Earth draws as part of
 * France at every tier.
 *
 * Judged across both tiers together rather than one at a time, because the
 * coarse tier legitimately drops small countries: `PF` is real at 50m and
 * absent at 110m, and that is a fact about generalisation, not a mistake in
 * the list.
 */
describe("region presets", () => {
  it("never name a country the data does not have", async () => {
    const known = new Set<string>();
    for (const detail of ["110m", "50m"] as const) {
      for (const country of await countryTable(detail)) known.add(country.code);
    }
    const missing: string[] = [];
    for (const preset of REGION_PRESET_NAMES) {
      for (const code of expandPreset(preset) ?? []) {
        if (!known.has(code)) missing.push(`${preset}: ${code}`);
      }
    }
    expect(missing, "these leave a hole rather than a country").toEqual([]);
  });
});
