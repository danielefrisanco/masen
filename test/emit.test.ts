import { describe, expect, it } from "vitest";
import { masen, PROJECTION_NAMES } from "../src/index.js";
import type { Position } from "../src/index.js";

describe("geometry", () => {
  it("draws the region", async () => {
    const map = await masen({ region: "west-europe", detail: "110m" });
    expect(map.svg).toContain("<path");
    expect(map.svg).toContain('data-iso="FR"');
    expect(map.svg).toContain('data-name="France"');
  });

  it("draws only what the region asked for", async () => {
    const map = await masen({ region: ["FR", "DE"], detail: "110m" });
    expect(map.svg.match(/class="mp-country"/g)).toHaveLength(2);
    expect(map.svg).not.toContain('data-iso="ES"');
  });

  it("accepts numeric codes as readily as alpha-2", async () => {
    const map = await masen({ region: ["250", "276"], detail: "110m" });
    expect(map.svg).toContain('data-iso="FR"');
    expect(map.svg).toContain('data-iso="DE"');
  });

  it("marks highlighted countries and leaves the rest alone", async () => {
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      highlight: ["FR", "BE"],
    });
    expect(map.svg).toContain('class="mp-country is-highlighted" data-iso="FR"');
    expect(map.svg).toContain('class="mp-country" data-iso="ES"');
  });

  it("selects by bounding box", async () => {
    const map = await masen({
      region: { bbox: [-10, 36, 5, 52] },
      detail: "110m",
    });
    expect(map.svg).toContain('data-iso="ES"');
    expect(map.svg).not.toContain('data-iso="FI"');
  });
});

describe("framing", () => {
  // France governs French Guiana, so its geometry reaches South America.
  // Fitting to raw bounds frames the Atlantic and squashes Europe into a
  // corner. Guyane is still France and is still drawn — it just falls outside
  // the viewport, the way a paper atlas of Western Europe handles it.
  it("frames Europe, not the Atlantic", async () => {
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      projection: "conic-conformal",
      size: [1000, 1000],
      padding: 40,
    });

    const paris = map.project([2.35, 48.86])!;
    expect(paris[0]).toBeGreaterThan(300);
    expect(paris[0]).toBeLessThan(700);
    expect(paris[1]).toBeGreaterThan(200);
    expect(paris[1]).toBeLessThan(800);

    // Cayenne projects far off-canvas rather than dragging the camera to it.
    const cayenne = map.project([-52.3, 4.9])!;
    expect(cayenne[0]).toBeLessThan(0);
  });

  // Framing and drawing are separate questions. The camera is fitted to each
  // country's core, so a map of France frames the mainland — but Guyane is
  // still France and is still in the document. It simply falls outside the
  // viewport, which is what a paper atlas does, and means nothing can go
  // missing from a map that is showing it.
  it("frames continental France while still carrying Guyane", async () => {
    const map = await masen({ region: ["FR"], detail: "110m", size: [1000, 1000] });
    expect(map.svg.match(/class="mp-country"/g)).toHaveLength(1);

    // Paris is comfortably inside the canvas: the camera ignored Guyane.
    const paris = map.project([2.35, 48.86])!;
    expect(paris[0]).toBeGreaterThan(100);
    expect(paris[0]).toBeLessThan(900);

    // Cayenne is off-canvas rather than absent.
    const cayenne = map.project([-52.3, 4.9])!;
    expect(cayenne[0]).toBeLessThan(0);

    const numbers = /d="([^"]+)"/
      .exec(map.svg)![1]!.match(/-?\d+(?:\.\d+)?/g)!
      .map(Number);
    expect(Math.min(...numbers)).toBeLessThan(0);
  });

  it("does not clip a genuinely dispersed region", async () => {
    const map = await masen({ region: "world", detail: "110m" });
    expect(map.svg).toContain('data-iso="NZ"');
    expect(map.svg).toContain('data-iso="CL"');
    expect(map.svg).not.toContain("NaN");
  });
});

describe("canvas", () => {
  it("honours an explicit size", async () => {
    const map = await masen({ region: "west-europe", detail: "110m", size: [640, 480] });
    expect(map.svg).toContain('viewBox="0 0 640 480"');
  });

  it("defaults to a 1000-unit square", async () => {
    const map = await masen({ region: "west-europe", detail: "110m" });
    expect(map.svg).toContain('viewBox="0 0 1000 1000"');
  });
});

describe("project", () => {
  it("places a coordinate inside the padded canvas", async () => {
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      projection: "conic-conformal",
      size: [1000, 1000],
      padding: 40,
    });
    const paris = map.project([2.35, 48.86]);
    expect(paris).not.toBeNull();
    const [x, y] = paris!;
    expect(x).toBeGreaterThan(40);
    expect(x).toBeLessThan(960);
    expect(y).toBeGreaterThan(40);
    expect(y).toBeLessThan(960);
  });

  it("is deterministic", async () => {
    const twice = await Promise.all([
      masen({ region: "west-europe", detail: "110m" }),
      masen({ region: "west-europe", detail: "110m" }),
    ]);
    expect(twice[0]!.project([2.35, 48.86])).toEqual(twice[1]!.project([2.35, 48.86]));
  });
});

/**
 * The inverse, which the annotation layer and the tool both rest on. These are
 * geometric properties rather than assertions about the document: `invert` adds
 * no markup, so there is nothing to look at, and a round trip that closes is
 * the whole of what it promises.
 */
describe("invert", () => {
  // A coordinate that goes out through project() and comes back through
  // invert() has to be the same coordinate, in every projection. Anything less
  // and a dragged pin drifts a little further from where it was dropped every
  // time the map is rebuilt.
  it("round-trips a coordinate through every projection", async () => {
    const paris: Position = [2.35, 48.86];
    for (const projection of PROJECTION_NAMES) {
      const map = await masen({
        region: "west-europe",
        detail: "110m",
        projection,
        size: [1000, 1000],
      });
      const back = map.invert(map.project(paris)!);
      expect(back, projection).not.toBeNull();
      expect(back![0]).toBeCloseTo(paris[0], 6);
      expect(back![1]).toBeCloseTo(paris[1], 6);
    }
  });

  // The reason it exists. A drop happens in pixels; storing those pixels would
  // detach the pin from the ground the moment anything about the framing
  // changes. Stored as lon/lat it stays on the same piece of Europe at another
  // size, in another projection.
  it("keeps a dropped pin on the same ground when the map is reframed", async () => {
    const dropped = await masen({ region: "west-europe", detail: "110m", size: [1000, 1000] });
    const ground = dropped.invert([500, 500]);
    expect(ground).not.toBeNull();

    const reframed = await masen({
      region: "west-europe",
      detail: "110m",
      projection: "conic-conformal",
      size: [640, 480],
    });
    const again = reframed.project(ground!)!;
    expect(again[0]).toBeGreaterThan(0);
    expect(again[0]).toBeLessThan(640);
    expect(again[1]).toBeGreaterThan(0);
    expect(again[1]).toBeLessThan(480);
    // Same ground, different pixels: the round trip closes in the second map
    // too, which is what makes the stored coordinate portable at all.
    expect(reframed.invert(again)![0]).toBeCloseTo(ground![0], 6);
    expect(reframed.invert(again)![1]).toBeCloseTo(ground![1], 6);
  });

  // A pixel in the corner of an orthographic canvas is not a place, and d3
  // will not say so on its own: it clamps its inverse trigonometry, so the
  // corner answers with a coordinate on the limb rather than with nothing.
  // Storing that would put a pin in the Atlantic because someone dropped it
  // outside the globe.
  it("returns null for a pixel that is not on the globe", async () => {
    const globe = await masen({
      region: "world",
      detail: "110m",
      projection: "orthographic",
      size: [1000, 1000],
    });
    expect(globe.invert([500, 500])).not.toBeNull();
    expect(globe.invert([2, 2])).toBeNull();
    expect(globe.invert([998, 998])).toBeNull();
  });

  // The general form of the same promise, which does not depend on knowing
  // where the limb falls: whatever invert() does answer, the map has to put
  // back where it was found. A grid over a globe crosses the limb in every
  // direction, so it covers both sides of the only hard case there is.
  it("never answers with a place the map would not put back", async () => {
    const globe = await masen({
      region: "world",
      detail: "110m",
      projection: "orthographic",
      size: [1000, 1000],
    });

    let onGlobe = 0;
    let offGlobe = 0;
    for (let x = 0; x <= 1000; x += 50) {
      for (let y = 0; y <= 1000; y += 50) {
        const position = globe.invert([x, y]);
        if (position === null) {
          offGlobe += 1;
          continue;
        }
        onGlobe += 1;
        const back = globe.project(position)!;
        expect(back[0]).toBeCloseTo(x, 2);
        expect(back[1]).toBeCloseTo(y, 2);
      }
    }

    // Neither half is allowed to be empty, or the loop above proves nothing:
    // a disc inscribed in a square leaves real corners outside it.
    expect(onGlobe).toBeGreaterThan(100);
    expect(offGlobe).toBeGreaterThan(20);
  });
});

describe("projections", () => {
  it.each(["mercator", "conic-conformal", "albers", "equal-earth", "orthographic"] as const)(
    "renders under %s",
    async (projection) => {
      const map = await masen({ region: "west-europe", detail: "110m", projection });
      expect(map.svg).toContain("<path");
      expect(map.svg).not.toContain("NaN");
    },
  );
});

describe("errors", () => {
  it("rejects an unknown preset", async () => {
    await expect(masen({ region: "narnia" as never })).rejects.toThrow(/unknown region preset/);
  });

  it("rejects an unrecognised country code rather than drawing nothing", async () => {
    await expect(masen({ region: ["FR", "ZZ"] })).rejects.toThrow(/unrecognised country code/);
  });

  it("rejects an unrecognised highlight code", async () => {
    await expect(
      masen({ region: "west-europe", highlight: ["ZZ"] }),
    ).rejects.toThrow(/unrecognised highlight code/);
  });
});

describe("output", () => {
  it("matches the committed West Europe render", async () => {
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      projection: "conic-conformal",
    });
    await expect(map.svg).toMatchFileSnapshot("./__snapshots__/west-europe.svg");
  });
});
