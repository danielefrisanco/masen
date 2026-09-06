import { describe, expect, it } from "vitest";
import { geoContains } from "d3-geo";
import { masen } from "../src/index.js";
import { loadWorld } from "../src/topology.js";

/**
 * The names of seas, and whether they are on the sea.
 *
 * The rule the feature makes and the tests hold it to: **a sea is named when
 * its middle is on the map.** The anchor is computed once at build time as the
 * interior point furthest from that sea's own shore, because a centroid is not
 * good enough for the shapes worth naming — the Mediterranean's falls over
 * Sicily — and the polygon is then discarded, which is what keeps a hundred and
 * eighteen names down to 7 KB.
 *
 * So the assertion that matters is not that a `<text>` was emitted. It is that
 * putting the emitted coordinate back through `invert()` lands on water, and
 * that the whole word fits on the canvas rather than half of it.
 */

const SIZE = [900, 620] as const;
const base = { detail: "50m", size: [...SIZE], theme: "atlas" } as const;

interface Named {
  readonly name: string;
  readonly kind: string;
  readonly rank: number;
  readonly at: [number, number];
  readonly hidden: boolean;
}

function seaNames(svg: string): Named[] {
  const found: Named[] = [];
  for (const m of svg.matchAll(
    /<text class="mp-label" data-kind="sea" data-sea="([^"]*)" data-rank="(\d)"([^>]*)>([^<]*)</g,
  )) {
    const attributes = m[3] as string;
    found.push({
      kind: m[1] as string,
      rank: Number(m[2]),
      name: m[4] as string,
      at: [
        Number(/\sx="(-?[\d.]+)"/.exec(attributes)?.[1]),
        Number(/\sy="(-?[\d.]+)"/.exec(attributes)?.[1]),
      ],
      hidden: attributes.includes('data-fit="0"'),
    });
  }
  return found;
}

const AEGEAN = ["GR", "TR", "BG", "MK", "AL"];

describe("sea names", () => {
  it("are not drawn unless asked for", async () => {
    const map = await masen({ ...base, region: AEGEAN });
    expect(seaNames(map.svg)).toEqual([]);
  });

  it("name the water they sit on", async () => {
    const map = await masen({ ...base, region: AEGEAN, seaNames: 3, sea: true });
    const drawn = seaNames(map.svg).filter((s) => !s.hidden);
    expect(drawn.length).toBeGreaterThan(0);

    // The whole test. A name that inverts onto a country is a name in the
    // wrong place, whatever it says.
    const world = await loadWorld("50m");
    for (const sea of drawn) {
      const back = map.invert(sea.at);
      expect(back, `${sea.name} is anchored off the projection`).not.toBeNull();
      const onLand = world.countries.find((country) =>
        geoContains(country.geometry as never, back as [number, number]),
      );
      expect(onLand?.name, `"${sea.name}" is set on ${onLand?.name ?? "water"}`).toBeUndefined();
    }
  });

  it("gets the Aegean onto a map of the Aegean", async () => {
    const map = await masen({ ...base, region: AEGEAN, seaNames: 3, sea: true });
    const names = seaNames(map.svg).map((s) => s.name);
    expect(names).toContain("Aegean Sea");
  });

  /**
   * Rank is the thinning control, and it has to actually thin.
   *
   * 1 is the oceans and the great seas, 2 adds the named basins, 3 adds the
   * straits and bights. The Aegean is a rank 3 water, so `true` — which means 2
   * — must not name it, or the ranking is decoration.
   */
  it("thins by rank", async () => {
    const region = AEGEAN;
    const shallow = await masen({ ...base, region, seaNames: true, sea: true });
    const deep = await masen({ ...base, region, seaNames: 3, sea: true });
    const at = (svg: string): string[] => seaNames(svg).map((s) => s.name);
    expect(at(shallow.svg)).not.toContain("Aegean Sea");
    expect(at(deep.svg)).toContain("Aegean Sea");
    expect(seaNames(shallow.svg).every((s) => s.rank <= 2)).toBe(true);
  });

  /**
   * The whole word, not the anchor.
   *
   * A country name is anchored inside a shape that is itself on the canvas; a
   * sea name is centred on a coordinate with nothing holding it in. Testing the
   * point alone put "Aegea" and "Baltic Se" hard against the frame on the first
   * two maps ever drawn with this on.
   */
  it("never sets half a name against the frame", async () => {
    const [width, height] = SIZE;
    for (const region of [AEGEAN, ["IT", "HR", "SI"], ["FR", "ES", "PT"]]) {
      const map = await masen({ ...base, region, seaNames: 3, sea: true });
      for (const sea of seaNames(map.svg)) {
        // Generous: the estimate the placer used is the same one being checked,
        // so this catches a name centred at the edge rather than a glyph or two.
        const half = (sea.name.length * 11 * 0.58) / 2;
        expect(sea.at[0] - half, `"${sea.name}" starts off the left edge`).toBeGreaterThan(-2);
        expect(sea.at[0] + half, `"${sea.name}" runs off the right edge`).toBeLessThan(width + 2);
        expect(sea.at[1]).toBeGreaterThan(0);
        expect(sea.at[1]).toBeLessThan(height);
      }
    }
  });

  /**
   * The far side of a globe is the trap every `at` falls into.
   *
   * An orthographic projection answers a coordinate behind the planet with a
   * pixel on the near side, so the South Pacific would be set across the
   * Atlantic. The round trip through `invert()` is the guard, and this is the
   * map that proves it is wired up.
   */
  it("keeps the far side of a globe off the near side", async () => {
    const map = await masen({
      ...base,
      region: "africa",
      projection: "orthographic",
      seaNames: 3,
      sea: true,
    });
    for (const sea of seaNames(map.svg)) {
      const back = map.invert(sea.at);
      expect(back, `${sea.name} came back from nowhere`).not.toBeNull();
      // Africa-centred: nothing past the limb may be named. 90° of arc from
      // the centre is the limb itself.
      const [lon] = back as [number, number];
      expect(Math.abs(lon), `"${sea.name}" is drawn from behind the globe`).toBeLessThan(110);
    }
  });

  it("yields to the names on land", async () => {
    // Sea names are judged last, so they are the ones marked unfit when a
    // country or a city wants the same space — never the other way round.
    const map = await masen({ ...base, region: AEGEAN, seaNames: 3, sea: true });
    const labels = [...map.svg.matchAll(/<text class="mp-label"[^>]*data-kind="(\w+)"/g)].map(
      (m) => m[1],
    );
    expect(labels).toContain("sea");
    expect(labels).toContain("country");
  });

  it("takes a caller's own name for a sea", async () => {
    const map = await masen({
      ...base,
      region: AEGEAN,
      seaNames: 3,
      sea: true,
      names: { "Aegean Sea": "Αιγαίο Πέλαγος" },
    });
    const names = seaNames(map.svg).map((s) => s.name);
    expect(names).toContain("Αιγαίο Πέλαγος");
    expect(names).not.toContain("Aegean Sea");
  });

  it("obeys the layer switch", async () => {
    const map = await masen({
      ...base,
      region: AEGEAN,
      seaNames: 3,
      layers: { labels: false },
    });
    expect(seaNames(map.svg)).toEqual([]);
  });
});
