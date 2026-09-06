import { describe, expect, it } from "vitest";
import { exportSizes, fileName } from "../tool/src/export.js";

/**
 * The two halves of an export that are decided before a browser is involved.
 *
 * Rasterising needs a canvas and cannot be tested here; choosing what to
 * rasterise and what to call the result can, and both have a failure that only
 * shows up on somebody's disk. A size past the browser's canvas limit does not
 * produce a small PNG, it produces a blank one — so the sizes that cannot work
 * are kept out of the menu rather than offered and then failed. And a region is
 * a legal list of ISO codes and an illegal file name.
 */

describe("the sizes a map can be exported at", () => {
  it("offers the canvas and its multiples", () => {
    expect(exportSizes(960, 620).map((size) => size.label)).toEqual([
      "1× — 960 × 620",
      "2× — 1920 × 1240",
      "3× — 2880 × 1860",
      "4× — 3840 × 2480",
    ]);
  });

  it("leaves out a size the browser could not hold", () => {
    // 4000 × 4 is 16000 pixels, which is past what a canvas will give back.
    expect(exportSizes(4000, 2000).map((size) => size.scale)).toEqual([1, 2]);
  });

  it("always offers the canvas itself, however large it is", () => {
    // The 1× export is the map as configured; refusing that would be refusing
    // to save a map the tool just drew.
    expect(exportSizes(4000, 4000)).toHaveLength(1);
    expect(exportSizes(4000, 4000)[0]?.scale).toBe(1);
  });
});

describe("what the file is called", () => {
  it("names the region and the pixels", () => {
    const [size] = exportSizes(960, 620);
    expect(size).toBeDefined();
    if (size === undefined) return;
    expect(fileName("west-europe", size, "svg")).toBe("masen-west-europe-960x620.svg");
  });

  it("turns a list of codes into something a file system will take", () => {
    const size = { scale: 2, width: 1920, height: 1240, label: "2×" };
    expect(fileName("GR,TR,BG", size, "png")).toBe("masen-gr-tr-bg-1920x1240.png");
  });

  it("still produces a name when the region is nothing it can spell", () => {
    const size = { scale: 1, width: 300, height: 200, label: "1×" };
    expect(fileName("...", size, "png")).toBe("masen-map-300x200.png");
  });
});
