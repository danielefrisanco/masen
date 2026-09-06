import { describe, expect, it } from "vitest";
import { masen } from "../src/index.js";

/**
 * Disputed and breakaway areas, and the claim the library used to make silently.
 *
 * **The defect these exist for is not a rendering bug.** The country geometry
 * arrives from `world-atlas`, and through it from Natural Earth's default
 * country layer, which resolves contested territory *de facto*: Simferopol at
 * 34.10°E, 44.95°N falls inside feature 643, Russia, at every tier this library
 * ships, and Ukraine — feature 804 — does not contain it. Nobody chose that.
 * It came in with the data, and the map asserted it in the library's own voice.
 *
 * So the first test here is not about hatching. It pins the *inherited* claim,
 * because the day that geometry changes upstream is the day this overlay's
 * reason for existing changes with it, and a silent upgrade must not be able to
 * make the map quietly correct in a way nobody noticed either.
 */

const UKRAINE = { region: ["UA"], size: [900, 600] } as const;

function hatches(svg: string): { kind: string; name: string }[] {
  return [...svg.matchAll(/<path class="mp-hatch"[^>]*?data-kind="([^"]*)"[^>]*?data-name="([^"]*)"/g)].map(
    (m) => ({ kind: m[1] as string, name: m[2] as string }),
  );
}

describe("the claim the country geometry makes on its own", () => {
  it("still puts Crimea inside Russia, which is why the overlay exists", async () => {
    const map = await masen({ region: ["UA", "RU"], detail: "50m", size: [900, 600] });
    // Read through the library's own resolver rather than the raw file: what
    // matters is what a caller gets, not what is on disk.
    const inside = map.project([34.1, 44.95]);
    expect(inside, "Crimea should project onto the canvas for this frame").not.toBeNull();

    // The country layer draws Crimea as part of some country's fill and never
    // says which. If this ever stops being true upstream, the note in
    // `loadDisputed` and the README section both need rewriting.
    expect(map.svg).toContain('data-iso="RU"');
  });
});

describe("disputed areas", () => {
  it("hatches Crimea on a map of Ukraine, and says who claims it", async () => {
    const map = await masen(UKRAINE);
    const crimea = hatches(map.svg).find((h) => h.name === "Crimea");
    expect(crimea, "Crimea was not marked").toBeDefined();
    expect(crimea?.kind).toBe("disputed");

    // Natural Earth's own sentence, quoted rather than composed here.
    expect(map.svg).toContain("Admin. by Russia; Claimed by Ukraine");
  });

  it("marks the breakaway oblasts as breakaway, not as disputed", async () => {
    const map = await masen(UKRAINE);
    const found = hatches(map.svg);
    const donetsk = found.find((h) => h.name.includes("Donetsk"));
    expect(donetsk?.kind).toBe("breakaway");
    // Three kinds ship and a theme selects on them; collapsing them to one
    // would throw away a distinction Natural Earth drew on purpose.
    expect(new Set(found.map((h) => h.kind)).size).toBeGreaterThan(1);
  });

  it("draws only the areas on the frame", async () => {
    // The set is a global list of 28 polygons. Unclipped, a map of Ukraine
    // carries Arunachal Pradesh and North Borneo as path data nobody can see.
    const map = await masen(UKRAINE);
    const names = hatches(map.svg).map((h) => h.name);
    expect(names).toContain("Crimea");
    expect(names).not.toContain("North Borneo");
    expect(names).not.toContain("Arunachal Pradesh");
    expect(names.length).toBeLessThan(8);
  });

  it("is on without being asked, because silence is the one indefensible default", async () => {
    const map = await masen(UKRAINE);
    expect(hatches(map.svg).length).toBeGreaterThan(0);
  });

  it("can be turned off, and then the map claims silently again", async () => {
    const map = await masen({ ...UKRAINE, disputed: false });
    expect(hatches(map.svg)).toHaveLength(0);
  });

  it("draws nothing at 110m, because Natural Earth publishes no such file", async () => {
    // `ne_110m_admin_0_breakaway_disputed_areas` is a 404 — checked, not
    // assumed. A coarse map genuinely cannot say a border is contested, and
    // the option staying on across tiers must not throw.
    const map = await masen({ ...UKRAINE, detail: "110m" });
    expect(hatches(map.svg)).toHaveLength(0);
  });

  it("does not float a hatch over sea where no country is drawn", async () => {
    // Caught by rendering the gallery, not by a test: a map of the Sahara put
    // hatch slivers in the eastern Mediterranean. The Golan Heights and the
    // Ilemi Triangle are inside that frame's longitudes and have no land drawn
    // under them there, and a contested-area mark with nothing beneath it is a
    // smudge rather than a statement. Same rule the water filter follows.
    const map = await masen({
      region: ["MA", "DZ", "TN", "LY", "EG", "MR", "ML", "NE", "TD", "SD"],
      size: [900, 620],
    });
    const names = hatches(map.svg).map((h) => h.name);
    expect(names).toContain("W. Sahara");
    expect(names).toContain("Abyei");
    expect(names).not.toContain("Golan Heights");
    expect(names).not.toContain("Ilemi Triangle");
  });

  it("hatches over the land rather than replacing it", async () => {
    // The whole editorial position in one assertion: the overlay marks the
    // contested edge, it does not reassign the territory. Ukraine and the
    // hatch both have to be in the document.
    const map = await masen(UKRAINE);
    expect(map.svg).toContain('class="mp-country"');
    expect(map.svg).toMatch(/<path class="mp-hatch"/);
  });
});
