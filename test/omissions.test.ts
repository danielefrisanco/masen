import { describe, expect, it } from "vitest";
import { masen, REGION_PRESETS } from "../src/index.js";
import type { RegionPreset } from "../src/types.js";

/**
 * The map has to say what it left out.
 *
 * Four defects were found in one sitting by a person using the tool and none
 * of them by a test, and they are one defect: the map quietly declines to draw
 * part of what was asked for. This file is the half of that problem which can
 * be a test at all — a set difference over ISO codes, exact, with no threshold
 * in it and nothing to tune.
 *
 * **These numbers are the data's, not this library's.** Natural Earth's 110m
 * tier does not carry the microstates; that is not a bug and this test is not
 * asking for it to change. What it holds is that the *silence* is gone.
 */
describe("omissions", () => {
  it("names the six European countries the coarse tier does not carry", async () => {
    const map = await masen({ region: "europe", detail: "110m", size: [960, 620] });
    // Alphabetical here only because the preset happens to list them so; the
    // report preserves the caller's own order, which is what makes it scannable
    // against their source list.
    expect([...map.omissions().absent].sort()).toEqual([
      "AD",
      "LI",
      "MC",
      "MT",
      "SM",
      "VA",
    ]);
  });

  it("is silent when the same region is drawn at a tier that has them", async () => {
    const map = await masen({ region: "europe", detail: "50m", size: [960, 620] });
    expect(map.omissions().absent).toEqual([]);
  });

  it("catches the preset that names eight countries and draws seven", async () => {
    const map = await masen({ region: "south-asia", detail: "110m", size: [960, 620] });
    expect(map.omissions().absent).toEqual(["MV"]);
  });

  it("reports a hand-written list the same way it reports a preset", async () => {
    const map = await masen({
      region: ["FR", "DE", "MC", "LI"],
      detail: "110m",
      size: [960, 620],
    });
    expect(map.omissions().absent).toEqual(["MC", "LI"]);
  });

  it("says nothing for a world map, which names no list to fall short of", async () => {
    const map = await masen({ region: "world", detail: "110m", size: [960, 620] });
    expect(map.omissions().absent).toEqual([]);
  });

  it("says nothing for a bounding box, for the same reason", async () => {
    const map = await masen({
      region: { bbox: [-10, 35, 20, 60] },
      detail: "110m",
      size: [960, 620],
    });
    expect(map.omissions().absent).toEqual([]);
  });

  /**
   * The guard that makes this a phase rather than a bug list.
   *
   * Every preset, at both tiers, reported rather than trusted. A future preset
   * that names a code its tier does not carry shows up here as a number, and
   * the numbers below are the ones measured on 2026-09-07 — a change to either
   * is a change to what the library draws, and has to be looked at.
   */
  it("holds the coarse tier's shortfall across every preset", async () => {
    const shortfalls: Record<string, string[]> = {};
    for (const name of Object.keys(REGION_PRESETS) as RegionPreset[]) {
      const map = await masen({ region: name, detail: "110m", size: [400, 300] });
      const absent = map.omissions().absent;
      if (absent.length > 0) shortfalls[name] = [...absent].sort();
    }
    expect(shortfalls).toMatchSnapshot();
    // Two sweeps of every preset, and the 50m tier loads a far larger file.
    // Slow because it is thorough, not because anything is wrong.
  }, 30_000);

  it("draws every code every preset names at 50m", async () => {
    const shortfalls: Record<string, readonly string[]> = {};
    for (const name of Object.keys(REGION_PRESETS) as RegionPreset[]) {
      const map = await masen({ region: name, detail: "50m", size: [400, 300] });
      const absent = map.omissions().absent;
      if (absent.length > 0) shortfalls[name] = absent;
    }
    expect(shortfalls).toEqual({});
  }, 30_000);
});

/**
 * The two preset exports do not agree, and the disagreement is by design.
 *
 * `REGION_PRESET_NAMES` carries 28 entries and `REGION_PRESETS` 27, because
 * `"world"` is a preset with no code list — it means *every feature*, which is
 * not a list and cannot be written as one. TypeScript refuses the bad index
 * already; JavaScript does not, and a throwaway script iterating the names is
 * how this was found. These hold the shape so a future preset cannot land in
 * one export and miss the other.
 */
describe("the preset exports", () => {
  it("has exactly one name with no code list, and it is world", async () => {
    const { REGION_PRESET_NAMES } = await import("../src/index.js");
    const listless = REGION_PRESET_NAMES.filter((name) => !(name in REGION_PRESETS));
    expect(listless).toEqual(["world"]);
  });

  it("expands every name it publishes", async () => {
    const { REGION_PRESET_NAMES, isRegionPreset } = await import("../src/index.js");
    for (const name of REGION_PRESET_NAMES) {
      expect(isRegionPreset(name)).toBe(true);
      // `expandPreset` is not exported; the library's own answer to "what does
      // this name mean" is a map, so ask for one. A name that expands to
      // nothing throws, which is the failure this guards.
      const map = await masen({ region: name, detail: "110m", size: [200, 150] });
      expect(map.svg).toContain("mp-layer mp-land");
    }
  }, 60_000);
});

/**
 * The other half: drawn, and too small to be read.
 *
 * The threshold is measured rather than rounded — a rank-1 place dot is 6.4
 * user units across, and a country smaller than the dot standing on it cannot
 * be seen underneath it. Rendering `europe` at 50m on a 960x620 canvas and
 * looking at every microstate at 1:1 is what produced that number; these hold
 * the consequence.
 */
describe("countries too small to read", () => {
  it("names the six that come out smaller than a place dot", async () => {
    const map = await masen({ region: "europe", detail: "50m", size: [960, 620] });
    expect([...map.omissions().unseen].sort()).toEqual(["AD", "LI", "MC", "MT", "SM", "VA"]);
  });

  it("marks each of them in the markup for a theme to act on", async () => {
    const map = await masen({ region: "europe", detail: "50m", size: [960, 620] });
    for (const code of ["VA", "MC", "SM"]) {
      expect(map.svg).toMatch(new RegExp(`data-iso="${code}"[^>]*data-unseen`));
    }
    // France is not small, and must not be marked.
    expect(map.svg).not.toMatch(/data-iso="FR"[^>]*data-unseen/);
  });

  /**
   * A bigger canvas buys shapes, and the report has to follow it rather than
   * hold a fixed list: Malta reaches 18 x 16 units at 4000x2000 and is legible
   * there, which is the whole reason the threshold is an extent and not a set
   * of country codes.
   */
  it("shortens as the canvas grows", async () => {
    const small = await masen({ region: "europe", detail: "50m", size: [960, 620] });
    const large = await masen({ region: "europe", detail: "50m", size: [4000, 2000] });
    expect(large.omissions().unseen.length).toBeLessThan(small.omissions().unseen.length);
    // Vatican is the one that never arrives: 0.5 x 0.5 units even at 4000x2000.
    expect(large.omissions().unseen).toContain("VA");
    expect(large.omissions().unseen).not.toContain("MT");
  });

  /**
   * The defect underneath the defect.
   *
   * Giving the Vatican a heavy outline did nothing at first, because the
   * outline was underneath: features arrive in the data's order, which put the
   * Vatican at path 0 and Italy at path 25, so Italy's fill went straight over
   * it. The land layer now paints largest first, which is what a cartographer
   * does by hand and the only order in which an enclave can be seen at all.
   */
  it("paints an enclave after the country that encloses it", async () => {
    const map = await masen({ region: "europe", detail: "50m", size: [960, 620] });
    const order = [...map.svg.matchAll(/<path class="mp-country[^"]*" data-iso="([A-Z]{2})"/g)].map(
      (m) => m[1],
    );
    for (const [inner, outer] of [
      ["VA", "IT"],
      ["SM", "IT"],
      ["MC", "FR"],
      ["LI", "AT"],
      ["AD", "ES"],
    ]) {
      expect(order.indexOf(inner)).toBeGreaterThan(order.indexOf(outer));
    }
  });
});
