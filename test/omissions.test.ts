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
