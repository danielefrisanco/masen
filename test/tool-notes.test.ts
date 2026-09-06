import { describe, expect, it } from "vitest";
import { masen } from "../src/index.js";
import { DEFAULTS, toOptions, type Config } from "../tool/src/config.js";
import { notesFor } from "../tool/src/notes.js";

/**
 * What you asked for and did not get.
 *
 * Every one of these is answered by looking at the map that was actually drawn,
 * never by a second copy of the library's rules living in the tool — so the
 * tests draw real maps rather than hand-writing SVG. A note that can disagree
 * with the map is worse than no note, and a fixture is exactly how it would
 * come to disagree.
 */

const map = async (config: Partial<Config>): Promise<string> =>
  (
    await masen({
      ...toOptions({ ...DEFAULTS, ...config }),
      detail: "110m",
      size: [800, 520],
      theme: "minimal",
    })
  ).svg;

describe("notes beside a control", () => {
  it("says nothing about a map that got what it asked for", async () => {
    const config: Partial<Config> = { region: "west-europe", neighbours: true, seaNames: true };
    expect(notesFor(await map(config), { ...DEFAULTS, ...config })).toEqual({});
  });

  it("says so when a cover kind is not in the frame", async () => {
    const config: Partial<Config> = { region: "west-europe", terrain: ["glacier", "desert"] };
    const found = notesFor(await map(config), { ...DEFAULTS, ...config });
    expect(found["glacier"]).toBe("No glaciers in this frame.");
    expect(found["desert"]).toBe("No desert in this frame.");
  });

  it("keeps quiet about a cover kind that is there", async () => {
    const config: Partial<Config> = { region: "africa", terrain: ["desert"] };
    expect(notesFor(await map(config), { ...DEFAULTS, ...config })["desert"]).toBeUndefined();
  });

  /**
   * A globe's meridians end on the limb, in the middle of the picture, so there
   * is no frame for a number to sit against and the library draws none. The
   * checkbox looks exactly as it does when it worked.
   */
  it("explains a numbered graticule with no numbers on it", async () => {
    const config: Partial<Config> = {
      region: "world",
      projection: "orthographic",
      graticule: true,
      gridLabels: true,
    };
    expect(notesFor(await map(config), { ...DEFAULTS, ...config })["gridLabels"]).toBe(
      "No grid line reaches the frame to be numbered.",
    );
  });

  it("keeps quiet where the numbers were drawn", async () => {
    const config: Partial<Config> = { region: "west-europe", graticule: true, gridLabels: true };
    expect(notesFor(await map(config), { ...DEFAULTS, ...config })["gridLabels"]).toBeUndefined();
  });

  it("says so when no city of the chosen rank is in the frame", async () => {
    const config: Partial<Config> = { region: "IS", placeRank: 1 };
    const found = notesFor(await map(config), { ...DEFAULTS, ...config });
    // Iceland at 110m carries Reykjavík, so this one is quiet — the assertion
    // that matters is the opposite direction, below.
    expect(found["placeRank"]).toBeUndefined();
    expect(notesFor("<svg></svg>", { ...DEFAULTS, placeRank: 2 })["placeRank"]).toBe(
      "No city of this rank is in the frame.",
    );
  });

  /**
   * The quietest failure on the form: the country is not on the map, so nothing
   * happens at all and the chip sits there looking as though it did.
   */
  it("names a highlighted country that is not in the region", async () => {
    const config: Partial<Config> = { region: "west-europe", highlight: ["FR", "JP"] };
    expect(notesFor(await map(config), { ...DEFAULTS, ...config })["highlight"]).toBe(
      "JP is not in the region, so nothing is highlighted.",
    );
  });

  it("lists them when more than one is missing", async () => {
    const config: Partial<Config> = { region: "west-europe", highlight: ["JP", "AU"] };
    expect(notesFor(await map(config), { ...DEFAULTS, ...config })["highlight"]).toBe(
      "JP, AU are not in the region, so they are not highlighted.",
    );
  });

  /**
   * `data-fit="0"` means the solver kept the name in the document and declined
   * to show it — which from the reader's side is precisely "I turned this on and
   * cannot see it".
   */
  it("counts a hidden label as absent", () => {
    const hidden =
      '<text class="mp-label" data-kind="sea" data-fit="0" x="1" y="1">Baltic Sea</text>';
    expect(notesFor(hidden, { ...DEFAULTS, seaNames: true })["seaNames"]).toBe(
      "No sea name fits this frame.",
    );
    const shown = '<text class="mp-label" data-kind="sea" x="1" y="1">Baltic Sea</text>';
    expect(notesFor(shown, { ...DEFAULTS, seaNames: true })["seaNames"]).toBeUndefined();
  });

  it("says nothing about a control that was not turned on", () => {
    const bare = notesFor("<svg></svg>", DEFAULTS);
    expect(bare["seaNames"]).toBeUndefined();
    expect(bare["neighbours"]).toBeUndefined();
    expect(bare["gridLabels"]).toBeUndefined();
  });
});
