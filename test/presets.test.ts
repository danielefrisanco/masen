import { describe, expect, it } from "vitest";
import { parseCss, type Rule } from "../src/css.js";
import { loadWorld } from "../src/topology.js";
import { politicalFill } from "../src/political.js";
import { masen } from "../src/index.js";
import { PALETTES, THEMES, TYPEFACES } from "../src/theme.js";
import { TOKENS } from "../src/tokens.js";

/**
 * What a preset has to be, as tests rather than as prose.
 *
 * A theme is data, and data with five near-identical copies drifts: one gets a
 * token the others miss, a hex loses a digit, a dark block quietly stops
 * covering half its vocabulary. None of that shows up as a thrown error — it
 * shows up as one map, months later, with a black hole where a country was.
 */

const themes = Object.entries(THEMES);
const palettes = Object.entries(PALETTES);
const typefaces = Object.entries(TYPEFACES);

/**
 * Tokens that hold a measurement or a type stack rather than a colour.
 *
 * A rule rather than a list: anything named `-width` is a number, and the
 * three that are not follow that convention are named here. A list would have
 * to be edited every time the vocabulary grows, which is the moment it would
 * be forgotten.
 */
// A width or a size is a length, and `--border-dash` and `--font` are the two
// remaining tokens whose value is a keyword list rather than a paint. Naming
// the rule rather than the tokens is what keeps this from having to be edited
// every time the vocabulary grows.
const NAMED_NOT_COLOURS = new Set([
  "--border-dash",
  "--font",
  "--label-track",
  "--label-weight",
  "--label-advance",
]);
const isColour = (name: string): boolean =>
  !name.endsWith("-width") && !name.endsWith("-size") && !NAMED_NOT_COLOURS.has(name);

const LIVE = TOKENS.filter((t) => t.status === "live").map((t) => t.name);
const LIVE_COLOURS = LIVE.filter(isColour);

const COLOUR = /^(#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8}|transparent|none|currentColor|rgba?\(|hsla?\()/;

function rules(css: string): Rule[] {
  return parseCss(css).filter((node): node is Rule => node.kind === "rule");
}

/** Declarations on `.mp` outside any at-rule — the theme's light values. */
function light(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const rule of rules(css)) {
    if (rule.at !== null || rule.selector.trim() !== ".mp") continue;
    for (const d of rule.declarations) found.set(d.property, d.value);
  }
  return found;
}

function dark(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const rule of rules(css)) {
    if (rule.at === null || !rule.at.includes("prefers-color-scheme: dark")) continue;
    for (const d of rule.declarations) found.set(d.property, d.value);
  }
  return found;
}

describe.each(themes)("theme %s", (name, css) => {
  it("defines every live token", () => {
    const defined = light(css);
    expect([...LIVE].filter((token) => !defined.has(token))).toEqual([]);
  });

  it("ships a dark block", () => {
    expect(dark(css).size).toBeGreaterThan(0);
  });

  /**
   * The classic unreadable-artifact bug: a rule whose only definition sits
   * inside the media query never applies to a reader whose system is light, so
   * the page renders one theme's paint on the other theme's ground.
   */
  it("puts only token values in the dark block, all of them already defined", () => {
    const defined = light(css);
    for (const [property, value] of dark(css)) {
      expect(property, `${name} dark sets a non-token`).toMatch(/^--/);
      expect(defined.has(property), `${name} dark introduces ${property}`).toBe(true);
      expect(value).not.toEqual(defined.get(property));
    }
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("writes %s colours that a renderer can parse", (_which, read) => {
    for (const [property, value] of read(css)) {
      if (!property.startsWith("--") || !isColour(property)) continue;
      expect(value, `${name} ${property}`).toMatch(COLOUR);
    }
  });

  /**
   * `.mp-country.is-highlighted` and `.mp-country[data-bin="3"]` have identical
   * specificity, so the later one wins outright. Highlight is the caller naming
   * a country; a band is a number it fell into — so highlight has to be last.
   */
  /**
   * An annotation has to stay visible on a highlighted country.
   *
   * Every preset shipped `--anno` as a byte-for-byte copy of `--accent`, which
   * was harmless for as long as nothing consumed it and wrong the moment
   * something did: a pin dropped on a highlighted country was drawn in that
   * country's own colour, and a callout's balloon and leader line merged into
   * the land beneath them. A region, a highlight and a mark is the map this
   * layer exists to make, so it is the one combination that must not collide.
   *
   * `--label-halo` is checked one step down for the same reason: the pin's mark
   * is cased in it, and a mark whose fill matches its casing is not there.
   */
  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps an annotation distinct from a highlight in %s", (which, read) => {
    // A dark block only overrides, so the value in force is light under it.
    const values = new Map([...light(css), ...(which === "dark" ? read(css) : [])]);
    const anno = values.get("--anno");
    expect(anno, `${name} sets no --anno`).toBeDefined();
    expect(
      anno,
      `${name} ${which}: --anno is the accent, so a mark on a highlight vanishes`,
    ).not.toBe(values.get("--accent"));
    expect(
      anno,
      `${name} ${which}: --anno is the label halo, so a pin's casing vanishes`,
    ).not.toBe(values.get("--label-halo"));
  });

  /**
   * A reserved token is still a value that has to work.
   *
   * Four of Phase 8's defects were one mistake wearing three names: a preset
   * copying a neighbouring value into a token nothing consumed yet, where it
   * sat unverified because nothing rendered it. `--anno` was `--accent`,
   * `--anno-ink` was `--label-halo`, and `--label-track` was read by nobody at
   * all. The tokens below are in exactly that position today — every preset
   * sets all nine, and not one has ever been drawn.
   *
   * What cannot be checked is whether they look good. What can be checked is
   * that each one differs from the thing it will be drawn against, because a
   * tint the colour of its ground is not a tint. That is the whole of the
   * mistake, and it is catchable years before the layer arrives.
   */
  const AGAINST: ReadonlyArray<readonly [string, string, string]> = [
    // Land cover is tinted over the land, so it has to be visible on it.
    ["--desert", "--land", "arid cover over the land it tints"],
    ["--forest", "--land", "wooded cover over the land it tints"],
    ["--mountain", "--land", "upland cover over the land it tints"],
    ["--glacier", "--land", "ice over the land it sits on"],
    // The grid is drawn at the very bottom, on the canvas ground.
    ["--graticule", "--bg", "the grid over the ground it is drawn on"],
    // A separate token from the grid is only worth having if it differs.
    ["--equator", "--graticule", "the equator against the rest of the grid"],
    // Sea names sit on the sea, which is the canvas.
    ["--sea-ink", "--bg", "sea names over the sea"],
    // Routes run over land.
    ["--road", "--land", "routes over the land they cross"],
    // Furniture is placed on the canvas, not on the map.
    ["--furniture-ink", "--bg", "credits over the ground behind them"],
  ];

  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps a reserved token apart from what it is drawn against in %s", (which, read) => {
    const values = new Map([...light(css), ...(which === "dark" ? read(css) : [])]);
    for (const [token, ground, what] of AGAINST) {
      const value = values.get(token);
      const under = values.get(ground);
      if (value === undefined || under === undefined) continue;
      // `transparent` is the page showing through, never a colour to clash with.
      if (under === "transparent") continue;
      expect(value, `${name} ${which}: ${token} is ${ground} — ${what} would be invisible`)
        .not.toBe(under);
    }
  });

  it("lets a highlight beat a band", () => {
    const selectors = rules(css).map((r) => r.selector.trim());
    const highlighted = selectors.indexOf(".mp .mp-country.is-highlighted");
    const banded = selectors.indexOf('.mp .mp-country[data-bin="5"]');
    expect(highlighted).toBeGreaterThan(-1);
    expect(banded).toBeGreaterThan(-1);
    expect(highlighted).toBeGreaterThan(banded);
  });
});

describe.each(palettes)("palette %s", (name, css) => {
  /**
   * A palette that covers half the colour vocabulary leaves a map wearing the
   * theme's colours on the palette's ground. `dusk` used to do exactly that: it
   * set `--land` but no `--bin-n`, so a choropleth came out in pale daylight
   * bands over a night sea.
   */
  it("covers the whole colour vocabulary", () => {
    const defined = light(css);
    expect([...LIVE_COLOURS].filter((token) => !defined.has(token))).toEqual([]);
  });

  it("keeps an annotation distinct from a highlight", () => {
    // A palette recolours the whole vocabulary, so it can reintroduce the
    // collision the themes were just cleared of.
    const defined = light(css);
    expect(defined.get("--anno"), `${name}: --anno is the accent`).not.toBe(
      defined.get("--accent"),
    );
    expect(defined.get("--anno"), `${name}: --anno is the label halo`).not.toBe(
      defined.get("--label-halo"),
    );
  });

  it("carries no structure", () => {
    for (const rule of rules(css)) {
      expect(rule.selector.trim(), `${name} styles something`).toBe(".mp");
      for (const d of rule.declarations) {
        expect(d.property, `${name} sets a property, not a token`).toMatch(/^--/);
      }
    }
  });
});

describe("political fill", () => {
  it.each(["europe", "africa", "world"] as const)(
    "gives no country in %s a neighbour's colour",
    async (region) => {
      const map = await masen({ region, detail: "110m", fill: "political" });
      const coloured = new Map(
        [...map.svg.matchAll(/data-iso="([A-Z]{2})"[^>]*data-fill="(\d)"/g)].map((m) => [
          m[1] as string,
          Number(m[2]),
        ]),
      );
      expect(coloured.size).toBeGreaterThan(30);

      const world = await loadWorld("110m");
      const clashes: string[] = [];
      for (const [id, neighbours] of world.adjacency([...coloured.keys()])) {
        for (const neighbour of neighbours) {
          if (coloured.get(id) === coloured.get(neighbour)) clashes.push(`${id}/${neighbour}`);
        }
      }
      expect(clashes).toEqual([]);
    },
  );

  it("is deterministic", () => {
    const graph = new Map([
      ["AA", new Set(["BB", "CC"])],
      ["BB", new Set(["AA", "CC"])],
      ["CC", new Set(["AA", "BB"])],
    ]);
    const ids = ["AA", "BB", "CC"];
    expect([...politicalFill(ids, graph)]).toEqual([...politicalFill([...ids].reverse(), graph)]);
  });

  it("defers to a band, so one country never carries two encodings", async () => {
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      fill: "political",
      values: { FR: 10, DE: 20 },
    });
    const france = /data-iso="FR"[^>]*/.exec(map.svg)?.[0] ?? "";
    const spain = /data-iso="ES"[^>]*/.exec(map.svg)?.[0] ?? "";
    expect(france).toContain("data-bin=");
    expect(france).not.toContain("data-fill=");
    expect(spain).toContain("data-fill=");
  });
});

/**
 * A typeface is only type — the same contract a palette has for colour, which
 * is what lets the two be chosen independently of each other and of the theme.
 */
const TYPE_TOKENS = new Set([
  "--font",
  "--label-size",
  "--place-label-size",
  "--label-track",
  "--label-weight",
  "--label-advance",
]);

describe.each(typefaces)("typeface %s", (name, css) => {
  it("sets the whole type vocabulary", () => {
    const defined = light(css);
    for (const token of TYPE_TOKENS) expect(defined.has(token), `${name} lacks ${token}`).toBe(true);
  });

  it("sets nothing else — no colour, no structure", () => {
    for (const rule of rules(css)) {
      expect(rule.selector.trim()).toBe(".mp");
      for (const declaration of rule.declarations) {
        expect(TYPE_TOKENS.has(declaration.property), `${name} sets ${declaration.property}`).toBe(
          true,
        );
      }
    }
  });

  it("names only stacks already on the machine", () => {
    // A map is a standalone file and cannot fetch a webfont; a stack that ends
    // in a generic family is one every reader can actually resolve.
    const stack = light(css).get("--font") as string;
    expect(stack).toMatch(/(sans-serif|serif|monospace)\s*$/);
  });
});

describe("choosing a typeface", () => {
  it("changes the type without touching the colour", async () => {
    const base = await masen({ region: ["FR"], detail: "110m", theme: "atlas" });
    const set = await masen({
      region: ["FR"],
      detail: "110m",
      theme: "atlas",
      typeface: "grotesk",
    });
    expect(set.css).toContain("Helvetica");
    expect(base.css).not.toContain("Helvetica");
    // The theme's ground survives it.
    expect(set.css).toContain("#A8C0CC");
  });

  it("loses to a token override, which is applied last", async () => {
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      theme: "atlas",
      typeface: "grotesk",
      tokens: { "--font": "Papyrus, fantasy" },
    });
    const flattened = await map.render();
    expect(flattened).toContain("Papyrus");
    expect(flattened).not.toContain('font-family="Helvetica');
  });

  it("fits more names when the face is narrower", async () => {
    const region = { region: "europe", detail: "110m", size: [900, 800], theme: "minimal" } as const;
    const wide = await masen(region);
    const narrow = await masen({ ...region, typeface: "condensed" });
    const shown = (svg: string): number =>
      (svg.match(/<text class="mp-label"(?![^>]*data-fit="0")/g) ?? []).length;
    expect(shown(narrow.svg)).toBeGreaterThanOrEqual(shown(wide.svg));
  });
});
