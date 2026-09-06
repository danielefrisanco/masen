import { describe, expect, it } from "vitest";
import { masen } from "../src/index.js";
import { inlineStyles } from "../src/inline.js";
import { parseCss } from "../src/css.js";
import { el, text } from "../src/svg.js";

/**
 * Figma and Illustrator ignore `<style>`, and some renderers invert the cascade
 * and let a presentation attribute beat a stylesheet. Both cases need the
 * computed paint written onto the element itself.
 */
describe("flattening", () => {
  const tree = el("svg", { class: "mp mp-t-x" }, [
    el("g", { class: "mp-layer mp-land" }, [
      el("path", { class: "mp-country", d: "M0,0" }),
      el("path", { class: "mp-country is-highlighted", d: "M1,1" }),
    ]),
  ]);

  const css = parseCss(`
    .mp.mp-t-x { --land: #eee; --accent: #c00; }
    .mp.mp-t-x .mp-country { fill: var(--land); stroke-width: 0.5; }
    .mp.mp-t-x .mp-country.is-highlighted { fill: var(--accent); }
  `);

  it("resolves a token to a literal value", () => {
    const { root } = inlineStyles(tree, css, "test");
    const land = root.children[0];
    const plain = land?.kind === "element" ? land.children[0] : undefined;
    expect(plain?.kind === "element" && plain.attributes["fill"]).toBe("#eee");
  });

  it("lets the more specific selector win", () => {
    const { root } = inlineStyles(tree, css, "test");
    const land = root.children[0];
    const highlighted = land?.kind === "element" ? land.children[1] : undefined;
    expect(highlighted?.kind === "element" && highlighted.attributes["fill"]).toBe("#c00");
  });

  it("inherits tokens from an ancestor", () => {
    const { root } = inlineStyles(
      tree,
      parseCss(".mp.mp-t-x { --land: #abc; } .mp-country { fill: var(--land); }"),
      "test",
    );
    const land = root.children[0];
    const plain = land?.kind === "element" ? land.children[0] : undefined;
    expect(plain?.kind === "element" && plain.attributes["fill"]).toBe("#abc");
  });

  it("transfers only real presentation attributes", () => {
    const { root } = inlineStyles(
      el("svg", { class: "mp" }, [el("path", { class: "a" })]),
      parseCss(".a { fill: red; border-radius: 4px; }"),
      "test",
    );
    const path = root.children[0];
    expect(path?.kind === "element" && path.attributes["fill"]).toBe("red");
    expect(path?.kind === "element" && path.attributes["border-radius"]).toBeUndefined();
  });

  it("reports selectors it cannot honour instead of half-applying them", () => {
    const { skipped } = inlineStyles(
      tree,
      parseCss(".mp > path:first-child { fill: red; }"),
      "test",
    );
    expect(skipped.length).toBeGreaterThan(0);
  });

  // A conditional rule may or may not apply when the file is viewed. Baking one
  // in would be a guess; the stylesheet still ships, so browsers still honour it.
  it("leaves media-query rules to the browser", () => {
    const { root } = inlineStyles(
      el("svg", { class: "mp" }, [el("path", { class: "a" })]),
      parseCss("@media (prefers-color-scheme: dark) { .a { fill: white; } }"),
      "test",
    );
    const path = root.children[0];
    expect(path?.kind === "element" && path.attributes["fill"]).toBeUndefined();
  });

  it("uses a var() fallback when the token is unset", () => {
    const { root } = inlineStyles(
      el("svg", { class: "mp" }, [el("path", { class: "a" })]),
      parseCss(".a { fill: var(--missing, #0f0); }"),
      "test",
    );
    const path = root.children[0];
    expect(path?.kind === "element" && path.attributes["fill"]).toBe("#0f0");
  });

  it("leaves text nodes alone", () => {
    const { root } = inlineStyles(
      el("svg", { class: "mp" }, [el("title", {}, [text("Map")])]),
      parseCss(".mp { fill: red; }"),
      "test",
    );
    const title = root.children[0];
    expect(title?.kind === "element" && title.children[0]?.kind).toBe("text");
  });
});

describe("end to end", () => {
  it("writes computed paint onto the countries", async () => {
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      theme: "minimal",
      tokens: { land: "#123456" },
    });
    const target = `${import.meta.dirname}/../node_modules/.tmp-inline.svg`;
    await map.toFile(target, { inlineStyles: true });
    const { readFile } = await import("node:fs/promises");
    const written = await readFile(target, "utf8");
    expect(written).toContain('fill="#123456"');
    // The stylesheet ships too: a browser honours the CSS, a tool that ignores
    // it honours the attributes, and both resolve to the same paint.
    expect(written).toContain("<style>");
  });

  it("leaves the geometry untouched without the flag", async () => {
    const map = await masen({ region: ["FR"], detail: "110m", theme: "minimal" });
    expect(map.toString()).not.toContain('fill="#E4E4E1"');
  });
});
