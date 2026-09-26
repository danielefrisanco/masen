import { describe, expect, it } from "vitest";
import {
  BACKGROUND_CLASS,
  DEFS_CLASS,
  HIGHLIGHT_CLASS,
  LAYERS,
  LAYER_CLASS,
  PALETTE_NAMES,
  PROJECTION_NAMES,
  REGION_PRESET_NAMES,
  RESERVED_CLASSES,
  ROOT_CLASS,
  THEME_NAMES,
  TOKENS,
  TYPEFACE_NAMES,
} from "../src/index.js";

/**
 * The public contract, written down so that changing it has to be deliberate.
 *
 * The policy in CHANGELOG.md says a class, a data attribute or a token is
 * public API and renaming one is breaking. A policy stated only in prose gets
 * broken by accident — someone tidies a name, the suite stays green, and every
 * theme in the wild stops matching. This is that policy as a test.
 *
 * When this snapshot fails, the question is not "how do I make it pass". It is
 * "is this change breaking, and has it been written into the changelog". Then
 * update the snapshot on purpose.
 */
describe("public contract", () => {
  it("has not changed without someone saying so", async () => {
    const contract = {
      root: ROOT_CLASS,
      background: BACKGROUND_CLASS,
      defs: DEFS_CLASS,
      highlight: HIGHLIGHT_CLASS,
      layerClass: LAYER_CLASS,
      layers: LAYERS.map((layer) => ({
        name: layer.name,
        className: layer.className,
        feature: layer.feature,
        status: layer.status,
      })),
      reserved: [...RESERVED_CLASSES].sort(),
      tokens: TOKENS.map((token) => `${token.name} (${token.status})`),
      presets: {
        themes: [...THEME_NAMES],
        palettes: [...PALETTE_NAMES],
        typefaces: [...TYPEFACE_NAMES],
        projections: [...PROJECTION_NAMES],
        regions: [...REGION_PRESET_NAMES],
      },
    };
    await expect(`${JSON.stringify(contract, null, 2)}\n`).toMatchFileSnapshot(
      "./__snapshots__/contract.json",
    );
  });

  /**
   * Paint order is the half of the contract a snapshot of names cannot catch:
   * two layers could swap places and every name would still be present.
   */
  it("keeps the layer stack in the order the document draws it", () => {
    expect(LAYERS.map((l) => l.name)).toEqual([
      // The ocean joined in 8d, and it is the one layer that could join late
      // without breaking a theme: it went *underneath* all eleven, and nothing
      // restacks when a layer is added below the bottom. Under the graticule
      // rather than over it, because an atlas draws meridians across water.
      "ocean",
      "graticule",
      "neighbours",
      "land",
      "terrain",
      "hydro",
      "borders",
      "roads",
      // Weather joined in 0.20, before the freeze and on purpose: the one
      // layer inserted mid-stack, which is only ever affordable under 1.0.
      // Over the ground so an isobar crosses land and sea alike, under the
      // names so it never strikes one through.
      "weather",
      "places",
      "labels",
      "annotations",
      "furniture",
    ]);
  });
});
