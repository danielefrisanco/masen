import { describe, expect, it } from "vitest";
import { ICONS, ICON_GRID, ICON_NAMES, isIconName, masen } from "../src/index.js";

/**
 * The icon vocabulary, and the marks that carry it.
 *
 * The set is generated from Maki by `scripts/build-icons.mjs` and committed, so
 * these are checks on vendored data as much as on rendering code. The first
 * attempt at that script emitted every path with its XML character references
 * intact — `&#xA;` where Maki's files carry a line break inside the `d`
 * attribute — which escapes on the way into the document and arrives as seven
 * literal characters that no path command recognises. Every icon would have
 * drawn as nothing, and nothing about the markup would have said so.
 */

/** Everything a path command can legally contain, and nothing else. */
const PATH_ONLY = /^[MmZzLlHhVvCcSsQqTtAa0-9eE,.\s+-]+$/;

function attribute(source: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(source);
  return match === null ? null : (match[1] as string);
}

describe("the icon set", () => {
  it("carries a drawable path for every name", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(20);
    for (const name of ICON_NAMES) {
      const d = ICONS[name] as string;
      expect(d, `${name} has no path`).toBeTruthy();
      expect(d.length, `${name} is suspiciously short`).toBeGreaterThan(20);
      // The bug that nearly shipped: an entity survives as literal text.
      expect(d, `${name} still carries an XML entity`).not.toMatch(/&#|&amp;/);
      expect(d, `${name} has a character no path command uses`).toMatch(PATH_ONLY);
      // A path that never moves anywhere draws nothing.
      expect(d, `${name} has no move command`).toMatch(/[Mm]/);
    }
  });

  it("names each icon once, in a stable order", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(ICON_NAMES.every((n) => isIconName(n))).toBe(true);
    expect(isIconName("no-such-icon")).toBe(false);
    // Inherited keys are not icons.
    expect(isIconName("constructor")).toBe(false);
    expect(isIconName("toString")).toBe(false);
  });
});

describe("a pin carrying an icon", () => {
  const AT: readonly [number, number] = [2.35, 48.86];

  it("draws the glyph centred on the coordinate", async () => {
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      pins: [{ at: AT, kind: "airport" }],
    });
    const [x, y] = map.project(AT) as [number, number];

    const group = /<g class="mp-icon"([^>]*)>([\s\S]*?)<\/g>/.exec(map.svg);
    expect(group, "no icon was drawn").not.toBeNull();
    expect(attribute(group?.[1] as string, "data-icon")).toBe("airport");

    const transform = attribute(group?.[1] as string, "transform") as string;
    const [, tx, ty] = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(transform) ?? [];
    const [, scale] = /scale\(([\d.]+)\)/.exec(transform) ?? [];

    // The glyph's own box, placed so its middle lands on the coordinate.
    const drawn = ICON_GRID * Number(scale);
    expect(Number(tx) + drawn / 2).toBeCloseTo(x, 0);
    expect(Number(ty) + drawn / 2).toBeCloseTo(y, 0);
    expect(drawn).toBeGreaterThan(6);

    // And it is the path the vocabulary holds, not a redrawing of it.
    expect(group?.[2]).toContain(ICONS["airport"] as string);
  });

  it("makes room for the glyph rather than drawing it over the edge", async () => {
    const plain = await masen({
      region: "west-europe",
      detail: "110m",
      pins: [{ at: AT, label: "here" }],
    });
    const iconed = await masen({
      region: "west-europe",
      detail: "110m",
      pins: [{ at: AT, kind: "harbor", label: "here" }],
    });
    const radius = (svg: string): number =>
      Number(attribute(/<circle class="mp-pin-mark"([^>]*)\/?>/.exec(svg)?.[1] ?? "", "r"));

    const small = radius(plain.svg);
    const large = radius(iconed.svg);
    expect(large).toBeGreaterThan(small);

    // A 15-unit glyph scaled to fit has to sit inside the mark that holds it.
    const group = /<g class="mp-icon"[^>]*transform="[^"]*scale\(([\d.]+)\)"/.exec(iconed.svg);
    expect(ICON_GRID * Number(group?.[1]) ).toBeLessThan(large * 2);

    // And the label steps out past the wider mark instead of sitting on it.
    const labelX = (svg: string): number =>
      Number(attribute(/<text class="mp-label" data-kind="pin"([^>]*)>/.exec(svg)?.[1] ?? "", "x"));
    expect(labelX(iconed.svg)).toBeGreaterThan(labelX(plain.svg));
  });

  it("leaves a kind that names no icon as a plain mark", async () => {
    // `kind` is free text for a theme to style. The icon names are the
    // conventional values, not the only permitted ones — a caller's own
    // category has to keep working rather than throw or draw a blank.
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      pins: [{ at: AT, kind: "flooding" }],
    });
    expect(map.svg).toContain('data-kind="flooding"');
    expect(map.svg).toContain("mp-pin-mark");
    expect(map.svg).not.toContain("mp-icon");
  });

  it("inks the glyph on the mark rather than beside it", async () => {
    // --anno-ink is the token authored for exactly this: ink drawn *on* an
    // annotation, legible against --anno. A pin's label is the other case and
    // takes --ink, because it sits beside the mark rather than inside it.
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      theme: "minimal",
      pins: [{ at: AT, kind: "rail" }],
    });
    expect(map.css).toMatch(/\.mp-icon[^}]*fill:\s*var\(--anno-ink\)/);
  });

  it("survives the flattening pass with a fill of its own", async () => {
    // Inlined per mark rather than referenced from a <symbol>, because a <use>
    // puts its content in a shadow tree the flattener cannot reach — and the
    // flattened form exists for the reader that ignores stylesheets.
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      theme: "noir",
      pins: [{ at: AT, kind: "hospital" }],
    });
    const document = await map.render();
    const group = /<g class="mp-icon"[^>]*>([\s\S]*?)<\/g>/.exec(document);
    expect(group, "the icon vanished when styles were flattened").not.toBeNull();
    expect(document).toMatch(/<g class="mp-icon"[^>]*fill="#[0-9A-Fa-f]{6}"/);
    expect(document).not.toContain("<use");
  });

  it("draws every icon in the set without exception", async () => {
    const map = await masen({
      region: "world",
      detail: "110m",
      size: [1200, 700],
      // Spread across the tropics so nothing is culled for being off-canvas.
      pins: ICON_NAMES.map((kind, i) => ({
        at: [-170 + (i % 12) * 28, 20 - Math.floor(i / 12) * 18] as const,
        kind,
      })),
    });
    const drawn = [...map.svg.matchAll(/data-icon="([^"]+)"/g)].map((m) => m[1]);
    expect(drawn).toEqual([...ICON_NAMES]);
  });
});
