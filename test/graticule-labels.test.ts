import { describe, expect, it } from "vitest";
import { masen } from "../src/index.js";

/**
 * The numbers on the grid, and the bug they uncovered on the way in.
 *
 * A graticule that draws its lines and does not say what any of them is, is
 * decoration rather than a reference — that was the gap. What made this worth
 * more than the feature is what writing a number at the end of every line
 * revealed: **the lines were not reaching the frame**. They were sampled across
 * the region's bounds plus a quarter, which is not what the canvas shows, so on
 * every conic they stopped a few units short of the edge. A faint line ending
 * just inside the frame looks like a faint line; a number that refuses to be
 * placed does not.
 */

const label = /<text class="mp-label" data-kind="grid"[^>]*>/g;

function labels(svg: string): { text: string; x: number; y: number; line: string }[] {
  const found: { text: string; x: number; y: number; line: string }[] = [];
  for (const match of svg.matchAll(/<text class="mp-label" data-kind="grid"([^>]*)>([^<]*)</g)) {
    const attributes = match[1] ?? "";
    if (attributes.includes('data-fit="0"')) continue;
    found.push({
      text: match[2] ?? "",
      x: Number(/ x="([-\d.]+)"/.exec(attributes)?.[1] ?? NaN),
      y: Number(/ y="([-\d.]+)"/.exec(attributes)?.[1] ?? NaN),
      line: /data-line="(\w+)"/.exec(attributes)?.[1] ?? "",
    });
  }
  return found;
}

const europe = async (options: Record<string, unknown> = {}) =>
  masen({
    region: "west-europe",
    projection: "conic-conformal",
    detail: "110m",
    size: [960, 620],
    // Themed, because an unthemed map has no stylesheet and so nothing for the
    // flattening pass to carry — which would make the last test here pass by
    // testing nothing.
    theme: "minimal",
    graticule: { labels: true },
    ...options,
  });

describe("degree labels", () => {
  it("are off unless asked for", async () => {
    const bare = await europe({ graticule: true });
    expect(bare.svg).toContain("mp-grid");
    expect(bare.svg.match(label)).toBeNull();
  });

  it("name every line the frame can carry", async () => {
    const map = await europe();
    const found = labels(map.svg);
    expect(found.filter((one) => one.line === "meridian").length).toBeGreaterThanOrEqual(4);
    expect(found.filter((one) => one.line === "parallel").length).toBeGreaterThanOrEqual(3);
  });

  it("writes a hemisphere rather than a sign, and no hemisphere at zero", async () => {
    const found = labels((await europe()).svg).map((one) => one.text);
    expect(found).toContain("0°");
    expect(found.some((text) => text.endsWith("°W"))).toBe(true);
    expect(found.some((text) => text.endsWith("°E"))).toBe(true);
    expect(found.some((text) => text.endsWith("°N"))).toBe(true);
    // A signed degree is a number; a hemisphere is a place.
    expect(found.some((text) => text.startsWith("-"))).toBe(false);
  });

  /**
   * The rule that turns a set of numbers into something a reader can use. Judged
   * line by line, a conic's western meridians leave through the left edge while
   * its central ones leave through the bottom, and the numbers scatter around
   * two and a half sides of the frame.
   */
  it("puts one axis on one edge", async () => {
    const found = labels((await europe()).svg);
    const meridians = found.filter((one) => one.line === "meridian");
    const parallels = found.filter((one) => one.line === "parallel");
    // Longitudes share a baseline; latitudes share a column.
    expect(new Set(meridians.map((one) => one.y)).size).toBe(1);
    expect(new Set(parallels.map((one) => one.x)).size).toBe(1);
    // And the conventional edges: longitudes along the bottom, latitudes left.
    expect(meridians[0]?.y).toBeGreaterThan(500);
    expect(parallels[0]?.x).toBeLessThan(120);
  });

  it("keeps every number on the paper", async () => {
    for (const map of [
      await europe(),
      await europe({ region: "world", projection: "equal-earth" }),
      await europe({ region: "europe", projection: "mercator" }),
      await europe({ size: [420, 700] }),
    ]) {
      for (const one of labels(map.svg)) {
        expect(one.x).toBeGreaterThanOrEqual(0);
        expect(one.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  /**
   * Every meridian on a globe ends at the same pole, so every one of them wants
   * the same point on the frame. One number naming a spot that is on all 360 of
   * them is worse than none, and a single label is not a scale anybody can
   * count from either.
   */
  it("says nothing where the grid ends inside the picture", async () => {
    const globe = await europe({ region: "world", projection: "orthographic" });
    expect(globe.svg).toContain("mp-grid");
    expect(labels(globe.svg)).toHaveLength(0);
  });

  /**
   * The bug the labels found. Reaching x = 0 at 50°N on this map takes a
   * longitude of 26°W, and the bounds plus a quarter stopped at 19°W — so the
   * parallels ended in mid-air, a few units short of the left edge, on every
   * conic ever drawn with a graticule.
   */
  it("draws the grid all the way to the frame", async () => {
    const map = await europe({ graticule: true });
    const parallels = [...map.svg.matchAll(/class="mp-grid" data-kind="parallel" d="M([-\d.]+)/g)];
    expect(parallels.length).toBeGreaterThan(2);
    const starts = parallels.map((match) => Number(match[1]));
    // Every parallel begins at or before the left edge, so none of them stops
    // short of it.
    expect(Math.max(...starts)).toBeLessThanOrEqual(0);
  });

  /**
   * The recurring defect of this codebase, checked deliberately: a rule keyed on
   * a data attribute has been dropped by the flattening pass three times, and
   * each time the map was right in a browser and wrong everywhere else.
   */
  it("survives being flattened for export", async () => {
    const written = await (await europe()).render();
    const [first] = labels(written);
    expect(first).toBeDefined();
    const one = /<text class="mp-label" data-kind="grid"[^>]*>/.exec(written)?.[0] ?? "";
    expect(one).toContain("font-size=");
    expect(one).toContain("fill=");
  });
});
