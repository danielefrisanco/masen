import { beforeAll, describe, expect, it } from "vitest";
import { ANCHORS, isAnchor, masen, type Anchor } from "../src/index.js";

/**
 * Furniture is the one layer that is not geographic.
 *
 * Every other layer holds things that are somewhere on the ground, and they all
 * move when the projection or the region changes. A credit line is on the
 * *paper*. The test that matters here is therefore not that it renders — it is
 * that reframing the map underneath it does not move it, because the moment it
 * moves it has stopped being furniture and become a caption on the ground.
 */

const SIZE = [800, 600] as const;
const PADDING = 24;

interface Line {
  readonly anchor: string | null;
  readonly x: number;
  readonly y: number;
  readonly textAnchor: string | null;
  readonly text: string;
}

function attribute(source: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(source);
  return match === null ? null : (match[1] as string);
}

/**
 * The `.mp-furniture` group's contents, and nothing outside it.
 *
 * An empty layer serialises self-closing — `<g class="…"/>` — which is what
 * lets a reserved slot exist at no cost and still accept children once parsed.
 * So "no content" is a tag that never opens, not a pair with nothing between.
 */
function furniture(svg: string): string {
  const start = svg.indexOf('class="mp-layer mp-furniture"');
  expect(start, "the furniture layer is always emitted").toBeGreaterThan(-1);
  const tagEnd = svg.indexOf(">", start);
  if (svg[tagEnd - 1] === "/") return "";
  // The layer holds groups of its own now — a scale bar is a mark with its
  // number beside it — so the close tag to stop at is the one that balances,
  // not the first one seen.
  const tags = /<(\/?)g\b[^>]*?(\/?)>/g;
  tags.lastIndex = tagEnd + 1;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(svg)) !== null) {
    if (match[2] === "/") continue;
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) return svg.slice(tagEnd + 1, match.index);
  }
  expect.fail("the furniture group never closes");
}

function credit(svg: string): Line | null {
  const match = /<text class="mp-credit"([^>]*)>([\s\S]*?)<\/text>/.exec(furniture(svg));
  if (match === null) return null;
  const attributes = match[1] as string;
  return {
    anchor: attribute(attributes, "data-anchor"),
    x: Number(attribute(attributes, "x")),
    y: Number(attribute(attributes, "y")),
    textAnchor: attribute(attributes, "text-anchor"),
    text: (match[2] as string).trim(),
  };
}

async function withAnchor(anchor: Anchor) {
  return await masen({
    region: "west-europe",
    detail: "110m",
    size: SIZE,
    padding: PADDING,
    credit: { text: "Source: Natural Earth", anchor },
  });
}

describe("a credit line", () => {
  it.each(ANCHORS)("sits at the %s of the canvas", async (anchor) => {
    const map = await withAnchor(anchor as Anchor);
    const line = credit(map.svg);
    expect(line, `no credit for ${anchor}`).not.toBeNull();
    expect(line?.anchor).toBe(anchor);

    const wantsLeft = anchor.endsWith("left");
    const wantsRight = anchor.endsWith("right");
    const wantsTop = anchor.startsWith("top");
    const wantsBottom = anchor.startsWith("bottom");

    expect(line?.x).toBe(
      wantsLeft ? PADDING : wantsRight ? SIZE[0] - PADDING : SIZE[0] / 2,
    );
    expect(line?.y).toBe(
      wantsTop ? PADDING : wantsBottom ? SIZE[1] - PADDING : SIZE[1] / 2,
    );

    // The alignment is half of what an anchor means, and the half that is easy
    // to forget: a credit anchored right is text whose *end* sits at the edge.
    // Placed by coordinate alone, a long one runs off the canvas.
    expect(line?.textAnchor).toBe(wantsLeft ? "start" : wantsRight ? "end" : "middle");
  });

  it("does not move when the map underneath it is reframed", async () => {
    // The defining property of the layer. If this ever fails, the credit has
    // stopped being furniture and become a caption on the ground.
    const base = { detail: "110m", size: SIZE, padding: PADDING, credit: "Reuters" } as const;
    const maps = await Promise.all([
      masen({ ...base, region: "west-europe", projection: "conic-conformal" }),
      masen({ ...base, region: "africa", projection: "orthographic" }),
      masen({ ...base, region: "world", projection: "equal-earth" }),
      masen({ ...base, region: ["JP"], projection: "mercator" }),
    ]);
    const placed = maps.map((m) => credit(m.svg));
    for (const line of placed) {
      expect(line?.x).toBe(placed[0]?.x);
      expect(line?.y).toBe(placed[0]?.y);
    }
    // And it really is four different maps underneath.
    const paris = maps.map((m) => JSON.stringify(m.project([2.35, 48.86])));
    expect(new Set(paris).size).toBeGreaterThan(1);
  });

  it("follows the padding the map was drawn inside", async () => {
    // Furniture lines up with the margin the map already has rather than
    // inventing a second one.
    const tight = await masen({
      region: "west-europe",
      detail: "110m",
      size: SIZE,
      padding: 8,
      credit: "x",
    });
    const loose = await masen({
      region: "west-europe",
      detail: "110m",
      size: SIZE,
      padding: 60,
      credit: "x",
    });
    expect(credit(tight.svg)?.x).toBe(SIZE[0] - 8);
    expect(credit(loose.svg)?.x).toBe(SIZE[0] - 60);
  });

  it("takes a bare string at the default anchor", async () => {
    const map = await masen({ region: "west-europe", detail: "110m", credit: "Reuters" });
    const line = credit(map.svg);
    expect(line?.text).toBe("Reuters");
    expect(line?.anchor).toBe("bottom-right");
  });

  it("puts nothing in the layer when there is nothing to say", async () => {
    const none = await masen({ region: "west-europe", detail: "110m" });
    expect(furniture(none.svg).trim()).toBe("");
    const empty = await masen({ region: "west-europe", detail: "110m", credit: "" });
    expect(furniture(empty.svg).trim()).toBe("");
  });

  it("leaves the layer emitted and empty when furniture is switched off", async () => {
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      credit: "Reuters",
      layers: { furniture: false },
    });
    expect(map.svg).toContain('class="mp-layer mp-furniture"');
    expect(furniture(map.svg).trim()).toBe("");
  });

  it("refuses an anchor that is not one of the nine", async () => {
    await expect(
      masen({
        region: "west-europe",
        detail: "110m",
        credit: { text: "x", anchor: "middle-left" as Anchor },
      }),
    ).rejects.toThrow(/is not one of/);
  });

  it("stays out of the accessible description", async () => {
    // A credit says who made the map, which is not what the map is *of*.
    // Announcing it would put the byline ahead of the subject.
    const map = await masen({
      region: "west-europe",
      detail: "110m",
      credit: "Reuters graphics",
    });
    expect(/aria-label="([^"]*)"/.exec(map.svg)?.[1]).not.toContain("Reuters");
  });

  it("agrees with itself about what an anchor is", () => {
    expect(ANCHORS).toHaveLength(9);
    expect(new Set(ANCHORS).size).toBe(9);
    expect(ANCHORS.every((a) => isAnchor(a))).toBe(true);
    expect(isAnchor("middle-left")).toBe(false);
    expect(isAnchor("center")).toBe(false);
  });
});

/**
 * A scale bar and a north arrow are the two pieces of furniture that make a
 * claim about the *ground* rather than about the map's provenance. A credit
 * cannot be wrong; a bar reading "500 km" on a frame where 500 km is sometimes
 * 80 units and sometimes 160 is simply false, and nothing in the markup says
 * so. So these tests measure the claim rather than assert the markup: the drawn
 * length is laid down in three places on the canvas and the ground distance it
 * spans is compared with the number printed under it.
 */

const R = 6371.0088;
const RAD = Math.PI / 180;

/** Great-circle kilometres, computed independently of anything the library does. */
function km(a: readonly [number, number], b: readonly [number, number]): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const chord =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(chord)));
}

interface Bar {
  readonly distance: number;
  readonly units: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

function bar(svg: string): Bar | null {
  const group = /<g class="mp-scale"([^>]*)>([\s\S]*?)<\/g>/.exec(furniture(svg));
  if (group === null) return null;
  const attributes = group[1] as string;
  const [, x, y] = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(
    attribute(attributes, "transform") as string,
  ) as string[];
  const path = /class="mp-scale-bar" d="M0,([\d.]+) V([\d.]+) H([\d.]+)/.exec(
    group[2] as string,
  ) as string[];
  return {
    distance: Number(attribute(attributes, "data-distance")),
    units: attribute(attributes, "data-units") as string,
    x: Number(x),
    y: Number(y),
    width: Number(path[3]),
    height: Number(path[2]),
    label: (/<text[^>]*>([^<]*)<\/text>/.exec(group[2] as string)?.[1] ?? "").trim(),
  };
}

function compass(svg: string): { x: number; y: number; d: string; anchor: string } | null {
  const group = /<g class="mp-compass"([^>]*)>([\s\S]*?)<\/g>/.exec(furniture(svg));
  if (group === null) return null;
  const attributes = group[1] as string;
  const [, x, y] = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(
    attribute(attributes, "transform") as string,
  ) as string[];
  return {
    x: Number(x),
    y: Number(y),
    d: attribute(group[2] as string, "d") as string,
    anchor: attribute(attributes, "data-anchor") as string,
  };
}

describe("what the projection does to the ground", () => {
  it("reports a small frame as uniform and a world map as not", async () => {
    const swiss = await masen({
      region: ["CH"],
      detail: "110m",
      size: SIZE,
      projection: "mercator",
    });
    const world = await masen({
      region: "world",
      detail: "110m",
      size: SIZE,
      projection: "equal-earth",
    });
    expect(swiss.distortion().scale).toBeLessThan(1.06);
    expect(world.distortion().scale).toBeGreaterThan(2);
    expect(swiss.distortion().kmPerUnit).toBeGreaterThan(0);
    expect(swiss.distortion().samples).toBeGreaterThan(100);
  });

  it("finds north exactly up on every mercator, however wide", async () => {
    // The property that makes an arrow honest there, and the one that cannot be
    // read off the projection's family: mercator is conformal and *fails* the
    // scale test at this extent while passing the north test perfectly.
    for (const region of ["world", "europe", ["CH"]] as const) {
      const map = await masen({
        region: region as never,
        detail: "110m",
        size: SIZE,
        projection: "mercator",
      });
      expect(map.distortion().north).toBeLessThan(1e-6);
    }
  });

  it("measures once and keeps the answer", async () => {
    const map = await masen({ region: ["FR"], detail: "110m", size: SIZE });
    expect(map.distortion()).toBe(map.distortion());
  });
});

describe("a scale bar", () => {
  it("spans the distance it claims, wherever it is laid down", async () => {
    // The test that matters. Take the length actually drawn, put it down in
    // three places on the canvas, and ask the sphere how far that is. Worst
    // error measured across these eight maps: 3.8%. The gate permits 10%.
    const cases = [
      { region: ["CH"], projection: "mercator" },
      { region: ["FR"], projection: "conic-conformal" },
      { region: ["FR"], projection: "albers", units: "mi" as const },
      { region: ["IN"], projection: "conic-conformal" },
      { region: "west-europe", projection: "albers" },
      { region: ["ID"], projection: "conic-conformal" },
      { region: ["BR"], projection: "conic-conformal" },
      { region: ["US"], projection: "orthographic" },
    ];
    for (const one of cases) {
      const map = await masen({
        region: one.region as never,
        detail: "110m",
        size: SIZE,
        padding: PADDING,
        projection: one.projection as never,
        scaleBar: one.units === undefined ? true : { units: one.units },
      });
      const drawn = bar(map.svg);
      expect(drawn, `no bar for ${String(one.region)}/${one.projection}`).not.toBeNull();
      const width = drawn?.width as number;
      const perUnit = drawn?.units === "mi" ? 1.609344 : 1;

      for (const [x, y] of [
        [PADDING, SIZE[1] / 2],
        [SIZE[0] - PADDING - width, SIZE[1] / 2],
        [PADDING, PADDING + 20],
      ] as const) {
        const from = map.invert([x, y]) as [number, number];
        const to = map.invert([x + width, y]) as [number, number];
        const truth = km(from, to) / perUnit;
        const error = Math.abs(truth - (drawn?.distance as number)) / (drawn?.distance as number);
        expect(
          error,
          `${String(one.region)}/${one.projection}: bar says ${drawn?.distance}, ` +
            `measures ${truth.toFixed(1)} at ${x},${y}`,
        ).toBeLessThan(0.1);
      }
    }
  });

  it("refuses the frame it would lie about, conformal or not", async () => {
    // The case the old rule got backwards. Mercator is conformal, so "a scale
    // bar suits the conformal projections" would allow this one — and over
    // Europe the same ruler reads nearly three times longer at one end of the
    // frame than the other.
    const base = { region: "europe", detail: "110m", size: SIZE, scaleBar: true } as const;
    const lying = await masen({ ...base, projection: "mercator" });
    const honest = await masen({ ...base, projection: "conic-conformal" });

    expect(lying.distortion().scale).toBeGreaterThan(2);
    expect(bar(lying.svg), "a bar was drawn on a frame that varies 2:1").toBeNull();
    expect(honest.distortion().scale).toBeLessThan(1.1);
    expect(bar(honest.svg)).not.toBeNull();
  });

  it("takes the caller's tolerance when they know their map", async () => {
    const base = { region: "africa", detail: "110m", size: SIZE, projection: "albers" } as const;
    const strict = await masen({ ...base, scaleBar: true });
    const relaxed = await masen({ ...base, scaleBar: { tolerance: 1.5 } });
    expect(base && strict.distortion().scale).toBeGreaterThan(1.1);
    expect(bar(strict.svg)).toBeNull();
    expect(bar(relaxed.svg)).not.toBeNull();
  });

  it("prints a number a reader can double in their head", async () => {
    // A bar reading 237 km is a bar nobody can step across a map. The width is
    // derived from the number, never the number from the width.
    for (const region of [["CH"], ["FR"], ["IN"], ["ID"]] as const) {
      const map = await masen({
        region: region as never,
        detail: "110m",
        size: SIZE,
        projection: "conic-conformal",
        scaleBar: true,
      });
      const drawn = bar(map.svg) as Bar;
      const decade = 10 ** Math.floor(Math.log10(drawn.distance));
      expect([1, 2, 5], `${drawn.distance} is not a round number`).toContain(
        Math.round(drawn.distance / decade),
      );
      expect(drawn.label).toBe(`${drawn.distance} km`);
    }
  });

  it("says miles when asked, and means them", async () => {
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      size: SIZE,
      padding: PADDING,
      projection: "albers",
      scaleBar: { units: "mi" },
    });
    const drawn = bar(map.svg) as Bar;
    expect(drawn.units).toBe("mi");
    expect(drawn.label).toMatch(/ mi$/);
    const from = map.invert([PADDING, SIZE[1] / 2]) as [number, number];
    const to = map.invert([PADDING + drawn.width, SIZE[1] / 2]) as [number, number];
    // Miles, not kilometres wearing a different label.
    expect(km(from, to) / 1.609344).toBeCloseTo(drawn.distance, -1);
  });

  it("keeps its whole width inside the padding at every anchor", async () => {
    // `place` positions a point; a bar is a box, and anchoring a box to the
    // right means its far corner sits at the inset, not its origin.
    for (const anchor of ANCHORS) {
      const map = await masen({
        region: ["FR"],
        detail: "110m",
        size: SIZE,
        padding: PADDING,
        projection: "conic-conformal",
        scaleBar: { anchor: anchor as Anchor },
      });
      const drawn = bar(map.svg) as Bar;
      expect(drawn, `no bar at ${anchor}`).not.toBeNull();
      expect(drawn.x, `${anchor} left`).toBeGreaterThanOrEqual(PADDING - 0.1);
      expect(drawn.x + drawn.width, `${anchor} right`).toBeLessThanOrEqual(SIZE[0] - PADDING + 0.1);
      expect(drawn.y, `${anchor} top`).toBeGreaterThanOrEqual(PADDING - 0.1);
      expect(drawn.y + drawn.height, `${anchor} bottom`).toBeLessThanOrEqual(
        SIZE[1] - PADDING + 0.1,
      );
    }
  });

  it("draws nothing unless it is asked for", async () => {
    const none = await masen({ region: ["FR"], detail: "110m", size: SIZE });
    expect(bar(none.svg)).toBeNull();
    const off = await masen({ region: ["FR"], detail: "110m", size: SIZE, scaleBar: false });
    expect(bar(off.svg)).toBeNull();
  });

  it("refuses an anchor that is not one of the nine", async () => {
    await expect(
      masen({
        region: ["FR"],
        detail: "110m",
        scaleBar: { anchor: "middle-left" as Anchor },
      }),
    ).rejects.toThrow(/is not one of/);
  });
});

describe("a north arrow", () => {
  it("appears wherever up is north and nowhere else", async () => {
    const wide = await masen({
      region: "europe",
      detail: "110m",
      size: SIZE,
      projection: "mercator",
      compass: true,
      scaleBar: true,
    });
    const fanned = await masen({
      region: "west-europe",
      detail: "110m",
      size: SIZE,
      projection: "conic-conformal",
      compass: true,
      scaleBar: true,
    });
    // Mercator holds north up at any extent — and fails the scale test at this
    // one, which is the pair of facts no projection-family rule can express.
    expect(wide.distortion().north).toBeLessThan(1e-6);
    expect(compass(wide.svg)).not.toBeNull();
    expect(bar(wide.svg)).toBeNull();

    // A conic fitted to the same continent keeps its scale to three per cent
    // and fans its meridians twenty degrees apart at the corners.
    expect(fanned.distortion().north).toBeGreaterThan(5);
    expect(compass(fanned.svg), "an arrow was drawn on a frame that fans 20°").toBeNull();
    expect(bar(fanned.svg)).not.toBeNull();
  });

  it("points up", async () => {
    const map = await masen({
      region: ["CH"],
      detail: "110m",
      size: SIZE,
      projection: "mercator",
      compass: true,
    });
    const arrow = compass(map.svg) as { d: string };
    const ys = [...arrow.d.matchAll(/[ML]\d+(?:\.\d+)?,(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    // The apex is the first point and every other point is below it.
    expect(Math.min(...ys)).toBe(ys[0]);
    expect(Math.max(...ys)).toBeGreaterThan(ys[0] as number);
    expect(map.svg).toContain(">N<");
  });

  it("keeps its whole box inside the padding at every anchor", async () => {
    for (const anchor of ANCHORS) {
      const map = await masen({
        region: ["CH"],
        detail: "110m",
        size: SIZE,
        padding: PADDING,
        projection: "mercator",
        compass: { anchor: anchor as Anchor },
      });
      const arrow = compass(map.svg) as { x: number; y: number; d: string };
      expect(arrow, `no arrow at ${anchor}`).not.toBeNull();
      const height = Math.max(
        ...[...arrow.d.matchAll(/[ML]\d+(?:\.\d+)?,(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])),
      );
      expect(arrow.x, `${anchor} left`).toBeGreaterThanOrEqual(PADDING - 0.1);
      expect(arrow.x + 18, `${anchor} right`).toBeLessThanOrEqual(SIZE[0] - PADDING + 0.1);
      expect(arrow.y, `${anchor} top`).toBeGreaterThanOrEqual(PADDING - 0.1);
      expect(arrow.y + height, `${anchor} bottom`).toBeLessThanOrEqual(SIZE[1] - PADDING + 0.1);
    }
  });

  it("shares the canvas with the other furniture without collision", async () => {
    // The three defaults are three different corners on purpose.
    const map = await masen({
      region: ["CH"],
      detail: "110m",
      size: SIZE,
      projection: "mercator",
      credit: "Source: Natural Earth",
      scaleBar: true,
      compass: true,
    });
    expect(credit(map.svg)?.anchor).toBe("bottom-right");
    expect(bar(map.svg)?.x).toBe(PADDING);
    expect(compass(map.svg)?.anchor).toBe("top-right");
  });

  it("stays out of the accessible description", async () => {
    const map = await masen({
      region: ["CH"],
      detail: "110m",
      projection: "mercator",
      scaleBar: true,
      compass: true,
    });
    const label = /aria-label="([^"]*)"/.exec(map.svg)?.[1] as string;
    expect(label).not.toMatch(/km|north|scale/i);
  });
});

/**
 * A watermark is attribution, not protection.
 *
 * It is a node in a file the reader can open, select and delete — it marks
 * provenance and enforces nothing. What these tests hold is the part that *can*
 * be true: that the mark is embedded rather than linked, so the document still
 * carries it after being moved; that a logo is never stretched; and that it
 * survives the flattening pass, which is where four of this phase's defects
 * lived.
 */

const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
  '<circle cx="5" cy="5" r="4" fill="#B4522C"/></svg>';

function watermark(svg: string): string | null {
  const inside = furniture(svg);
  return /<(?:text|image) class="mp-watermark"[\s\S]*?(?:<\/text>|\/>)/.exec(inside)?.[0] ?? null;
}

describe("a watermark", () => {
  let logoPath = "";

  beforeAll(async () => {
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "masen-wm-"));
    logoPath = join(dir, "logo.svg");
    await writeFile(logoPath, LOGO, "utf8");
  });

  it("takes a bare string as words at the centre", async () => {
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      size: SIZE,
      watermark: "DRAFT",
    });
    const mark = watermark(map.svg) as string;
    expect(mark).toContain(">DRAFT<");
    expect(attribute(mark, "data-anchor")).toBe("centre");
    expect(Number(attribute(mark, "x"))).toBe(SIZE[0] / 2);
    expect(Number(attribute(mark, "y"))).toBe(SIZE[1] / 2);
    expect(attribute(mark, "text-anchor")).toBe("middle");
    // Big by default: a tenth of the shorter side, which is a stamp rather than
    // a second credit line.
    expect(Number(attribute(mark, "font-size"))).toBe(Math.round(SIZE[1] * 0.1));
  });

  it("anchors words the way the credit does, alignment and all", async () => {
    for (const anchor of ANCHORS) {
      const map = await masen({
        region: ["FR"],
        detail: "110m",
        size: SIZE,
        padding: PADDING,
        watermark: { text: "PROVISIONAL", anchor: anchor as Anchor, size: 20 },
      });
      const mark = watermark(map.svg) as string;
      const wantsLeft = anchor.endsWith("left");
      const wantsRight = anchor.endsWith("right");
      expect(Number(attribute(mark, "x")), anchor).toBe(
        wantsLeft ? PADDING : wantsRight ? SIZE[0] - PADDING : SIZE[0] / 2,
      );
      // Anchored right, the text's *end* sits at the inset — which is the only
      // thing keeping a long wordmark on the canvas.
      expect(attribute(mark, "text-anchor"), anchor).toBe(
        wantsLeft ? "start" : wantsRight ? "end" : "middle",
      );
      expect(Number(attribute(mark, "font-size"))).toBe(20);
    }
  });

  it("embeds a logo rather than linking to it", async () => {
    // The whole point of this library's output is that one file is the whole
    // map. A watermark that referenced a logo on disk would stop working the
    // moment the SVG was emailed to anyone.
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      size: SIZE,
      watermark: { image: logoPath, anchor: "top-right", width: 90 },
    });
    const mark = watermark(map.svg) as string;
    const href = attribute(mark, "href") as string;
    expect(href).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(map.svg, "the path leaked into the document").not.toContain(logoPath);

    const decoded = Buffer.from(href.split(",")[1] as string, "base64").toString("utf8");
    expect(decoded).toBe(LOGO);
  });

  it("bounds a logo without stretching it", async () => {
    // The library cannot measure an image's aspect ratio outside a browser —
    // the same wall --label-advance exists to get around. So the caller gives a
    // box and the logo is fitted inside it.
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      size: SIZE,
      padding: PADDING,
      watermark: { image: logoPath, anchor: "bottom-left", width: 90, height: 40 },
    });
    const mark = watermark(map.svg) as string;
    expect(attribute(mark, "preserveAspectRatio")).toBe("xMidYMid meet");
    expect(Number(attribute(mark, "width"))).toBe(90);
    expect(Number(attribute(mark, "height"))).toBe(40);
    expect(Number(attribute(mark, "x"))).toBe(PADDING);
    expect(Number(attribute(mark, "y"))).toBe(SIZE[1] - PADDING - 40);
  });

  it("passes a data URI through untouched", async () => {
    const uri = "data:image/png;base64,iVBORw0KGgo=";
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      watermark: { image: uri },
    });
    expect(attribute(watermark(map.svg) as string, "href")).toBe(uri);
  });

  it("keeps its paint through the flattening pass", async () => {
    // Four of this phase's defects were a value nothing consumed yet. A
    // watermark flattened without its opacity is a logo printed at full
    // strength across the middle of the map.
    const map = await masen({
      region: ["FR"],
      detail: "110m",
      theme: "noir",
      watermark: { image: logoPath },
    });
    const document = await map.render();
    const mark = /<image class="mp-watermark"[^>]*>/.exec(document)?.[0] as string;
    expect(mark, "the watermark vanished when styles were flattened").toBeTruthy();
    expect(Number(attribute(mark, "opacity"))).toBeGreaterThan(0);
    expect(Number(attribute(mark, "opacity"))).toBeLessThan(1);
    expect(attribute(mark, "href")).toMatch(/^data:/);
  });

  it("refuses what it cannot draw, by name", async () => {
    const base = { region: ["FR"] as const, detail: "110m" as const };
    await expect(
      masen({ ...base, watermark: { text: "x", image: "data:image/png;base64,a" } }),
    ).rejects.toThrow(/not both/);
    await expect(masen({ ...base, watermark: {} })).rejects.toThrow(/needs text or image/);
    await expect(masen({ ...base, watermark: { image: "./logo.tiff" } })).rejects.toThrow(
      /neither a data: URI nor a path/,
    );
    await expect(masen({ ...base, watermark: { image: "./absent.png" } })).rejects.toThrow(
      /could not read/,
    );
    await expect(
      masen({ ...base, watermark: { text: "x", anchor: "middle-left" as Anchor } }),
    ).rejects.toThrow(/is not one of/);
  });

  it("says nothing when there is nothing to say", async () => {
    const empty = await masen({ region: ["FR"], detail: "110m", watermark: "" });
    expect(watermark(empty.svg)).toBeNull();
    const off = await masen({
      region: ["FR"],
      detail: "110m",
      watermark: "DRAFT",
      layers: { furniture: false },
    });
    expect(watermark(off.svg)).toBeNull();
  });

  it("stays out of the accessible description", async () => {
    // Same reason the credit does: a mark of provenance is not what the map is
    // *of*, and announcing it would put the stamp ahead of the subject.
    const map = await masen({ region: ["FR"], detail: "110m", watermark: "DRAFT" });
    expect(/aria-label="([^"]*)"/.exec(map.svg)?.[1]).not.toContain("DRAFT");
  });
});
