import { describe, expect, it } from "vitest";
import { masen, type MapOptions } from "../src/index.js";

/**
 * Two maps in one document.
 *
 * The stylesheets have been scoped to a hash of themselves since Phase 3, which
 * made it look as though two maps could already share a page. The *ids* were
 * constants — `mp-land-clip`, `mp-stripe`, `mp-relief` — and an `url(#…)`
 * resolves against the whole document, so every reference on the page found
 * whichever map the parser reached first. One map's rivers clipped to another
 * map's coastline, with nothing in either file to say so.
 *
 * The properties here are about the document rather than about the names: every
 * reference resolves, it resolves inside its own map, and no id is claimed
 * twice. That holds whatever the ids are called.
 */

/** Every `id="…"` in a document. */
function ids(svg: string): string[] {
  return [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] as string);
}

/** Every `url(#…)` reference, from markup and from the stylesheet alike. */
function references(svg: string): string[] {
  return [...svg.matchAll(/url\(\s*#([^)\s]+)\s*\)/g)].map((m) => m[1] as string);
}

const MAPS: ReadonlyArray<readonly [string, MapOptions]> = [
  // Rivers force a land clip path.
  ["rivers", { region: ["FR"], detail: "110m", theme: "atlas" }],
  ["west-europe", { region: "west-europe", detail: "110m", theme: "atlas" }],
  // Hatching forces the stripe pattern.
  [
    "hatched",
    { region: "europe", detail: "110m", theme: "minimal", stripe: ["FR", "DE"] },
  ],
  // A theme that asks for the relief filter by name.
  [
    "relief",
    {
      region: "africa",
      detail: "110m",
      theme: ".mp .mp-land { filter: url(#mp-relief); }",
    },
  ],
  // A drop-shadow, which the flattening pass turns into a generated filter.
  [
    "shadow",
    {
      region: "asia",
      detail: "110m",
      theme: ".mp .mp-country { filter: drop-shadow(2px 3px 2px rgba(0,0,0,0.4)); }",
    },
  ],
];

describe("svg ids", () => {
  it.each(MAPS)("resolves every reference inside %s itself", async (_name, options) => {
    const map = await masen(options);
    const document = await map.render();
    const defined = new Set(ids(document));
    const used = references(document);
    expect(used.length, "this map defines nothing, so it proves nothing").toBeGreaterThan(0);
    for (const reference of used) {
      expect(defined.has(reference), `url(#${reference}) has no definition`).toBe(true);
    }
  });

  it("gives no two different maps a shared id", async () => {
    const built = await Promise.all(MAPS.map(([, options]) => masen(options)));
    const documents = await Promise.all(built.map((map) => map.render()));

    const seen = new Map<string, number>();
    documents.forEach((document, index) => {
      for (const id of new Set(ids(document))) {
        const owner = seen.get(id);
        expect(
          owner,
          `id "${id}" is claimed by both ${MAPS[owner ?? 0]?.[0]} and ${MAPS[index]?.[0]}`,
        ).toBeUndefined();
        seen.set(id, index);
      }
    });
    expect(seen.size).toBeGreaterThan(MAPS.length);
  });

  it("keeps each map's references pointing into its own definitions", async () => {
    // The real failure, stated as the thing that went wrong: put two maps in one
    // page and check that nothing in the second one names anything in the first.
    const [a, b] = await Promise.all([
      masen({ region: ["FR"], detail: "110m", theme: "atlas" }),
      masen({ region: ["IT"], detail: "110m", theme: "atlas" }),
    ]);
    const first = await a.render();
    const second = await b.render();

    const mine = new Set(ids(second));
    const theirs = new Set(ids(first));
    for (const reference of references(second)) {
      expect(mine.has(reference), `the second map reaches for ${reference}`).toBe(true);
      expect(theirs.has(reference), `${reference} belongs to the first map`).toBe(false);
    }
  });

  it("still lets a theme ask for a definition by the name the docs promise", async () => {
    // The authored name never changes. A stylesheet in the wild says
    // `url(#mp-relief)`, and it has to keep working — only the emitted pair moves.
    const map = await masen({
      region: "africa",
      detail: "110m",
      theme: ".mp .mp-land { filter: url(#mp-relief); }",
    });
    expect(map.svg).toContain("mp-relief-");
    expect(map.css).toContain("url(#mp-relief-");
    // And the definition it names is present.
    const document = await map.render();
    for (const reference of references(document)) {
      expect(ids(document)).toContain(reference);
    }
  });

  it("gives the same map the same ids every time", async () => {
    // Derived, never counted: a counter would make a map's bytes depend on how
    // many maps were built before it.
    const once = await masen({ region: ["FR"], detail: "110m", theme: "atlas" });
    const twice = await masen({ region: ["FR"], detail: "110m", theme: "atlas" });
    expect(ids(await once.render())).toEqual(ids(await twice.render()));
  });

  it("leaves an id the caller invented alone", async () => {
    // Only the built-in names are namespaced. Someone else's gradient is theirs.
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      theme: ".mp .mp-country { fill: url(#my-own-gradient); }",
    });
    expect(map.css).toContain("url(#my-own-gradient)");
    expect(map.css).not.toContain("my-own-gradient-");
  });
});
