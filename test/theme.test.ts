import { describe, expect, it } from "vitest";
import { masen, THEME_NAMES, PALETTE_NAMES, TOKENS, LAYERS } from "../src/index.js";
import { parseCss, scopeSelector, serializeCss } from "../src/css.js";
import { resolveTheme } from "../src/theme.js";

describe("resolution", () => {
  it("applies a bundled theme", async () => {
    const map = await masen({ region: ["FR"], detail: "110m", theme: "minimal" });
    expect(map.css).toContain("--land");
    expect(map.css).toContain(".mp-country");
  });

  it("leaves css empty when nothing was themed", async () => {
    const map = await masen({ region: ["FR"], detail: "110m" });
    expect(map.css).toBe("");
    expect(map.svg).not.toContain("<style");
  });

  it("accepts a stylesheet inline", async () => {
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      theme: ".mp .mp-country { fill: #123456; }",
    });
    expect(map.css).toContain("#123456");
  });

  it("names what it knows when given a name it does not", async () => {
    await expect(
      masen({ region: ["FR"], detail: "110m", theme: "nonexistent" }),
    ).rejects.toThrow(/unknown theme "nonexistent".*minimal/s);
  });

  it("ships every advertised theme and palette", async () => {
    for (const theme of THEME_NAMES) {
      const map = await masen({ region: ["FR"], detail: "110m", theme });
      expect(map.css).not.toBe("");
    }
    for (const palette of PALETTE_NAMES) {
      const map = await masen({ region: ["FR"], detail: "110m", theme: "minimal", palette });
      expect(map.css).not.toBe("");
    }
  });
});

describe("cascade", () => {
  // The whole implementation is ordering. A palette beats a theme and an
  // override beats a palette because each is a later declaration — there is no
  // merge step to get wrong.
  it("orders theme, then palette, then tokens", async () => {
    const resolved = await resolveTheme({
      theme: "minimal",
      palette: "dusk",
      tokens: { accent: "#ff0000" },
    });

    // Read the expected values from the sources rather than hard-coding them,
    // so retuning a theme's colours cannot fail a test about ordering.
    const { minimal } = await import("../src/themes/minimal.js");
    const { dusk } = await import("../src/palettes/dusk.js");
    const landIn = (css: string) => /--land:\s*([^;]+);/.exec(css)?.[1]?.trim();

    const positions = [
      resolved.css.indexOf(`--land: ${landIn(minimal)}`),
      resolved.css.indexOf(`--land: ${landIn(dusk)}`),
      resolved.css.indexOf("--accent: #ff0000"),
    ];
    expect(positions.every((p) => p > -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("accepts token names with or without the leading dashes", async () => {
    const withDashes = await resolveTheme({ tokens: { "--accent": "#abc" } });
    const without = await resolveTheme({ tokens: { accent: "#abc" } });
    expect(withDashes.css).toContain("--accent: #abc");
    expect(without.css).toContain("--accent: #abc");
  });

  it("keeps a palette free of structure", async () => {
    const { dusk } = await import("../src/palettes/dusk.js");
    const rules = parseCss(dusk);
    for (const node of rules) {
      if (node.kind !== "rule") continue;
      for (const declaration of node.declarations) {
        expect(declaration.property.startsWith("--")).toBe(true);
      }
    }
  });
});

describe("scoping", () => {
  // A <style> block inside inline SVG applies to the whole host page. Without
  // a scope, two themed maps on one page would overwrite each other, and a map
  // would restyle anything sharing a class name.
  it("scopes every rule to one map", async () => {
    const map = await masen({ region: ["FR"], detail: "110m", theme: "minimal" });
    const scope = /class="mp (mp-t-[a-z0-9]+)"/.exec(map.svg)?.[1];
    expect(scope).toBeDefined();
    for (const node of parseCss(map.css)) {
      if (node.kind !== "rule") continue;
      expect(node.selector).toContain(scope as string);
    }
  });

  it("gives different themes different scopes", async () => {
    const [a, b] = await Promise.all([
      masen({ region: ["FR"], detail: "110m", theme: "minimal" }),
      masen({ region: ["FR"], detail: "110m", theme: "atlas" }),
    ]);
    const scopeOf = (svg: string) => /class="mp (mp-t-[a-z0-9]+)"/.exec(svg)?.[1];
    expect(scopeOf(a.svg)).not.toBe(scopeOf(b.svg));
  });

  it("gives the same theme the same scope, so output stays deterministic", async () => {
    const [a, b] = await Promise.all([
      masen({ region: ["FR"], detail: "110m", theme: "minimal" }),
      masen({ region: ["DE"], detail: "110m", theme: "minimal" }),
    ]);
    const scopeOf = (svg: string) => /class="mp (mp-t-[a-z0-9]+)"/.exec(svg)?.[1];
    expect(scopeOf(a.svg)).toBe(scopeOf(b.svg));
  });

  it("fuses the scope onto the root compound, not as a descendant", () => {
    expect(scopeSelector(".mp", "s")).toBe(".mp.s");
    expect(scopeSelector(".mp .mp-country", "s")).toBe(".mp.s .mp-country");
    expect(scopeSelector(".mp-country", "s")).toBe(".mp.s .mp-country");
    expect(scopeSelector(".a, .b", "s")).toBe(".mp.s .a, .mp.s .b");
  });
});

describe("document", () => {
  it("keeps svg geometry-only and toString complete", async () => {
    const map = await masen({ region: ["FR"], detail: "110m", theme: "minimal" });
    expect(map.svg).not.toContain("<style");
    expect(map.toString()).toContain("<style>");
    expect(map.toString()).toContain("--land");
  });

  it("puts the scope class on the root even when css is served separately", async () => {
    const map = await masen({ region: ["FR"], detail: "110m", theme: "minimal" });
    expect(map.svg).toMatch(/class="mp mp-t-[a-z0-9]+"/);
  });

  it("refuses css that would break out of the style element", async () => {
    await expect(
      masen({ region: ["FR"], detail: "110m", theme: ".mp { fill: red } </style><script>" }),
    ).rejects.toThrow(/cannot be embedded/);
  });
});

describe("layers option", () => {
  it("empties a slot without removing it", async () => {
    const map = await masen({ region: "west-europe", detail: "110m", layers: { borders: false } });
    expect(map.svg).toContain('<g class="mp-layer mp-borders" fill="none"/>');
    expect(map.svg).not.toContain('class="mp-border"');
    expect(map.svg).toContain('class="mp-country"');
  });

  it("keeps the full stack whatever is switched off", async () => {
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      layers: { land: false, borders: false },
    });
    // Counted against the taxonomy rather than against a number, because the
    // claim is "every slot survives", not "there are nine of them".
    expect(map.svg.match(/class="mp-layer /g)).toHaveLength(LAYERS.length);
  });

  it("still describes highlights that were switched off", async () => {
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      highlight: ["FR"],
      layers: { land: false },
    });
    expect(map.svg).toContain("highlighting France");
  });
});

describe("token vocabulary", () => {
  it("is set in full by every bundled theme, reserved names included", async () => {
    for (const theme of THEME_NAMES) {
      const resolved = await resolveTheme({ theme });
      for (const token of TOKENS) {
        expect(resolved.css, `${theme} is missing ${token.name}`).toContain(`${token.name}:`);
      }
    }
  });

  it("names tokens by role, never by appearance", () => {
    for (const token of TOKENS) {
      expect(token.name).not.toMatch(/gray|grey|blue|red|green|dark|light/i);
    }
  });
});

describe("css reader", () => {
  it("round-trips a rule", () => {
    const css = ".a { fill: red; stroke: blue; }";
    expect(serializeCss(parseCss(css))).toContain("fill: red;");
  });

  it("keeps colons inside a custom property value", () => {
    const nodes = parseCss(".a { --url: url(http://x); }");
    const rule = nodes[0];
    expect(rule?.kind === "rule" && rule.declarations[0]?.value).toBe("url(http://x)");
  });

  it("passes through an at-rule it cannot scope", () => {
    const nodes = parseCss('@font-face { font-family: "X"; }');
    expect(nodes[0]?.kind).toBe("verbatim");
  });

  it("nests rules inside a media query", () => {
    const nodes = parseCss("@media (min-width: 10px) { .a { fill: red; } }");
    const rule = nodes[0];
    expect(rule?.kind === "rule" && rule.at).toContain("@media");
  });
});
