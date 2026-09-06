import { describe, expect, it } from "vitest";
import {
  ICON_NAMES,
  masen,
  PALETTE_NAMES,
  PROJECTION_NAMES,
  REGION_PRESET_NAMES,
  THEME_NAMES,
  TYPEFACE_NAMES,
} from "../src/index.js";
import { DEFAULTS, decode, encode, toOptions, type Config, type Vocabulary } from "../tool/src/config.js";

/**
 * The tool's URL, which is the only part of it that can rot silently.
 *
 * A dropdown that stops working is obvious the moment anyone opens the page. A
 * link that stops rebuilding the map it was made from is not — it produces a
 * *plausible* map, the default one, and the person who sent it has no way to
 * tell. So the round trip is held by a test, and so is the promise that keeps
 * the links short: a config nobody changed encodes to nothing at all.
 *
 * The last two tests are the ones that matter most. Every value in a URL is
 * user input arriving from a link that may have been edited by hand, truncated
 * by a chat client, or written against an older version of the tool — and a
 * value the library will reject does not fail one control, it fails the whole
 * render.
 */

const VOCABULARY: Vocabulary = {
  regions: REGION_PRESET_NAMES,
  projections: PROJECTION_NAMES,
  themes: THEME_NAMES,
  palettes: PALETTE_NAMES,
  typefaces: TYPEFACE_NAMES,
  icons: ICON_NAMES,
};

const CHOSEN: Config = {
  region: "GR,TR,BG",
  projection: "mercator",
  theme: "atlas",
  palette: "patina",
  typeface: "serif",
  detail: "50m",
  width: 1200,
  height: 700,
  sea: false,
  seaNames: true,
  graticule: true,
  gridLabels: true,
  neighbours: true,
  terrain: ["glacier", "mountain"],
  water: ["river"],
  disputed: false,
  placeRank: 3,
  labelRank: 2,
  borderWidth: 2.5,
  landEdgeWidth: 1.2,
  labelSize: 17,
  pinIcon: "airport",
  pinSize: 11,
  scaleBar: true,
  credit: "Made by someone",
  highlight: ["GR"],
  pins: [{ at: [23.73, 37.98], label: "Athens" }],
  arrows: [{ from: [23.73, 37.98], to: [28.98, 41.01] }],
  routes: [{ stops: [{ at: [23.73, 37.98] }, { at: [23.32, 42.7] }] }],
};

const round = (search: string): Config => decode(search, VOCABULARY);

describe("the tool's URL", () => {
  it("is empty when nothing was chosen", () => {
    // A fresh page has a bare address, and a shared one carries exactly the
    // decisions its author made. It also means a default can be changed later
    // without stranding old links on a value nobody picked.
    expect(encode(DEFAULTS)).toBe("");
  });

  it("rebuilds every choice it was given", () => {
    expect(decode(encode(CHOSEN), VOCABULARY)).toEqual(CHOSEN);
  });

  it("writes only what differs from the default", () => {
    const query = encode({ ...DEFAULTS, theme: "noir" });
    expect(query).toBe("theme=noir");
  });

  it("ignores a value it does not recognise rather than failing", () => {
    const config = decode("theme=chartreuse&projection=spiral&detail=1m", VOCABULARY);
    expect(config.theme).toBe(DEFAULTS.theme);
    expect(config.projection).toBe(DEFAULTS.projection);
    expect(config.detail).toBe(DEFAULTS.detail);
  });

  it("refuses a region the library would throw on", () => {
    // `region: "atlantis"` is not a preset and not a code list. Handing it on
    // would not produce a wrong map — it would produce no map, because an
    // unknown preset throws inside the library.
    expect(decode("region=atlantis", VOCABULARY).region).toBe(DEFAULTS.region);
    expect(decode("region=GR,TR", VOCABULARY).region).toBe("GR,TR");
    expect(decode("region=europe", VOCABULARY).region).toBe("europe");
  });

  it("pulls a number back into range instead of passing it on", () => {
    const config = decode("width=99999&labelSize=-4&placeRank=9&borderWidth=abc", VOCABULARY);
    expect(config.width).toBe(4000);
    expect(config.labelSize).toBe(6);
    expect(config.placeRank).toBe(3);
    expect(config.borderWidth).toBe(DEFAULTS.borderWidth);
  });

  it("carries a rank of none, and still refuses one that is not a rank", () => {
    expect(round("placeRank=0&labelRank=0")).toMatchObject({ placeRank: 0, labelRank: 0 });
    expect(round("placeRank=-2").placeRank).toBe(0);
    expect(round("placeRank=9").placeRank).toBe(3);
  });

  it("keeps only the cover kinds that exist", () => {
    expect(decode("terrain=mountain,forest,glacier", VOCABULARY).terrain).toEqual([
      "mountain",
      "glacier",
    ]);
  });

  it("caps a credit line rather than letting a crafted link set one", () => {
    expect(decode(`credit=${"x".repeat(500)}`, VOCABULARY).credit).toHaveLength(120);
  });
});

describe("the config as library options", () => {
  it("hands a preset over as a name and codes over as a list", () => {
    expect(toOptions({ ...DEFAULTS, region: "africa" }).region).toBe("africa");
    expect(toOptions({ ...DEFAULTS, region: "gr, tr" }).region).toEqual(["GR", "TR"]);
  });

  it("sets a token only when it was moved off the default", () => {
    expect(toOptions(DEFAULTS).tokens).toBeUndefined();
    expect(toOptions({ ...DEFAULTS, borderWidth: 2 }).tokens).toEqual({ "--border-width": "2" });
  });

  it("asks for degree labels only along with the grid they annotate", () => {
    expect(toOptions({ ...DEFAULTS, graticule: false, gridLabels: true }).graticule).toBe(false);
    expect(toOptions({ ...DEFAULTS, graticule: true, gridLabels: false }).graticule).toBe(true);
    expect(toOptions({ ...DEFAULTS, graticule: true, gridLabels: true }).graticule).toEqual({
      labels: true,
    });
  });

  /**
   * The icon belongs to the pin, not to the map. `pinIcon` is a setting on the
   * *tool* — what the next click drops — so it must not reach into pins that
   * were already placed with something else.
   */
  it("leaves every pin the icon it was dropped with", () => {
    const pins = [
      { at: [2, 48] as [number, number], kind: "airport" },
      { at: [10, 50] as [number, number] },
    ];
    expect(toOptions({ ...DEFAULTS, pins, pinIcon: "hospital" }).pins).toEqual(pins);
    expect(toOptions({ ...DEFAULTS, pins, pinIcon: "" }).pins).toEqual(pins);
  });

  /**
   * The size has to travel as a token rather than as CSS the caller writes,
   * because the geometry reads it: a pin is a circle *and* a glyph scaled to sit
   * inside it, and a rule that only reaches the circle grows the mark while
   * leaving the icon where it was.
   */
  it("sends the pin size through the token the geometry reads", async () => {
    expect(toOptions({ ...DEFAULTS, pinSize: 7 }).tokens).toBeUndefined();
    expect(toOptions({ ...DEFAULTS, pinSize: 14 }).tokens).toEqual({ "--pin-size": "14" });

    const big = await masen({
      ...toOptions({
        ...DEFAULTS,
        pinSize: 14,
        pins: [{ at: [2.35, 48.86], kind: "airport" }],
      }),
      detail: "110m",
      size: [400, 300],
      theme: "minimal",
    });
    const small = await masen({
      ...toOptions({ ...DEFAULTS, pins: [{ at: [2.35, 48.86], kind: "airport" }] }),
      detail: "110m",
      size: [400, 300],
      theme: "minimal",
    });
    const radius = (svg: string): number =>
      Number(/<circle class="mp-pin-mark"[^>]* r="([\d.]+)"/.exec(svg)?.[1] ?? NaN);
    expect(radius(big.svg)).toBeGreaterThan(radius(small.svg));
    // And the glyph with it, which is the whole reason this is not a CSS rule.
    const scale = (svg: string): number =>
      Number(/class="mp-icon"[^>]*scale\(([\d.]+)\)/.exec(svg)?.[1] ?? NaN);
    expect(scale(big.svg)).toBeGreaterThan(scale(small.svg));
  });

  it("leaves out a palette and a typeface rather than passing an empty one", () => {
    const bare = toOptions(DEFAULTS);
    expect("palette" in bare).toBe(false);
    expect("typeface" in bare).toBe(false);
  });

  /**
   * The whole point of the two modules together: anything a URL can say, the
   * library can draw. A tool that encodes a state its own renderer rejects is
   * worse than one with fewer options.
   */
  it("draws every configuration the URL can express", async () => {
    for (const config of [DEFAULTS, CHOSEN, decode("region=world&projection=orthographic&graticule=1", VOCABULARY)]) {
      const map = await masen({ ...toOptions(config), detail: "110m", size: [400, 300] });
      expect(map.svg.startsWith("<svg")).toBe(true);
      expect(map.svg).toContain("<path");
    }
  });
});
