import { describe, expect, it } from "vitest";
import { masen, type Arrow, type Callout, type Pin } from "../src/index.js";

/**
 * Pins, tested by where they land rather than by what they print.
 *
 * The property that matters is not that a `<circle>` appears — it is that the
 * circle is at the coordinate it was given and nowhere else. This project has
 * three times shipped a map that every string assertion passed and nobody had
 * looked at, and the annotation layer has a failure mode of exactly that
 * shape: on a globe the far hemisphere projects onto the same disc as the near
 * one, so a pin in the Pacific comes back with a perfectly plausible pixel in
 * the middle of Africa. Nothing about the markup would say it was wrong.
 */

interface Mark {
  readonly id: string | null;
  readonly kind: string | null;
  readonly fit: string | null;
  readonly x: number;
  readonly y: number;
  readonly label: string | null;
  readonly labelX: number | null;
  readonly anchor: string | null;
}

function attribute(source: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(source);
  return match === null ? null : (match[1] as string);
}

/** The `.mp-annotations` group's contents, and nothing else in the document. */
function annotationLayer(svg: string): string {
  const start = svg.indexOf('class="mp-layer mp-annotations"');
  expect(start, "the annotations layer is always emitted").toBeGreaterThan(-1);
  const open = svg.indexOf(">", start) + 1;
  // The layer holds pin groups, each one nested exactly one level deep, so the
  // matching close is found by counting rather than by the next `</g>`.
  let depth = 1;
  let at = open;
  while (depth > 0) {
    const nextOpen = svg.indexOf("<g", at);
    const nextClose = svg.indexOf("</g>", at);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      at = nextOpen + 2;
    } else {
      depth -= 1;
      at = nextClose + 4;
    }
  }
  return svg.slice(open, at - 4);
}

function marks(svg: string): Mark[] {
  const layer = annotationLayer(svg);
  const found: Mark[] = [];
  for (const group of layer.matchAll(/<g class="mp-anno mp-pin"([^>]*)>([\s\S]*?)<\/g>/g)) {
    const attributes = group[1] as string;
    const body = group[2] as string;
    const circle = /<circle class="mp-pin-mark"([^>]*)\/?>/.exec(body);
    const text = /<text class="mp-label"([^>]*)>([\s\S]*?)<\/text>/.exec(body);
    found.push({
      id: attribute(attributes, "data-id"),
      kind: attribute(attributes, "data-kind"),
      fit: attribute(attributes, "data-fit"),
      x: Number(attribute(circle?.[1] ?? "", "cx")),
      y: Number(attribute(circle?.[1] ?? "", "cy")),
      label: text === null ? null : (text[2] as string).trim(),
      labelX: text === null ? null : Number(attribute(text[1] as string, "x")),
      anchor: text === null ? null : attribute(text[1] as string, "text-anchor"),
    });
  }
  return found;
}

const PARIS: Pin = { at: [2.35, 48.86], label: "Paris" };

describe("pins", () => {
  it("puts the mark where project() says, and only in the annotation layer", async () => {
    const map = await masen({ region: "west-europe", pins: [PARIS] });
    const at = map.project(PARIS.at);
    expect(at).not.toBeNull();

    const [mark] = marks(map.svg);
    expect(mark).toBeDefined();
    // Rounded to a tenth on the way out, which is the only difference allowed.
    expect(mark?.x).toBeCloseTo((at as [number, number])[0], 0);
    expect(mark?.y).toBeCloseTo((at as [number, number])[1], 0);

    // Nothing leaks into a neighbouring layer.
    const layers = map.svg.split('class="mp-layer');
    for (const chunk of layers.slice(1)) {
      if (chunk.startsWith(" mp-annotations")) continue;
      expect(chunk.split('class="mp-layer')[0]).not.toContain("mp-pin");
    }
  });

  it("round-trips every mark it draws back to the coordinate it was given", async () => {
    // The whole point of the layer. A mark that inverts to somewhere else is a
    // mark on ground it does not belong to, which is worse than a missing one.
    const pins: Pin[] = [];
    for (let lon = -180; lon <= 180; lon += 15) {
      for (let lat = -75; lat <= 75; lat += 15) pins.push({ at: [lon, lat] });
    }
    for (const projection of ["orthographic", "equal-earth", "mercator"] as const) {
      const map = await masen({ region: "africa", projection, size: [700, 700], pins });
      // Only the marks a reader can see. A pixel far outside the canvas can sit
      // near a globe's limb, where the projection is compressed hard enough
      // that rounding the coordinate to a tenth of a unit on the way out moves
      // the inverse by degrees — true, and not a property about pins.
      const drawn = marks(map.svg).filter((mark) => mark.fit === "1");
      expect(drawn.length, `${projection} drew nothing`).toBeGreaterThan(0);
      for (const mark of drawn) {
        const back = map.invert([mark.x, mark.y]);
        expect(back, `${projection}: a mark at a pixel that is nowhere`).not.toBeNull();
        const [lon, lat] = back as [number, number];
        const match = pins.find(
          (pin) => Math.abs(pin.at[0] - lon) < 0.5 && Math.abs(pin.at[1] - lat) < 0.5,
        );
        expect(match, `${projection}: a mark at [${mark.x}, ${mark.y}] is not on any pin`).toBeDefined();
      }
    }
  });

  it("drops a coordinate on the far side of a globe rather than mirroring it", async () => {
    // Africa-centred. The Pacific is behind the globe, and d3 hands back a
    // pixel for it anyway — one that lands squarely on Angola.
    const map = await masen({
      region: "africa",
      projection: "orthographic",
      size: [800, 800],
      pins: [
        { at: [15, 0], label: "visible" },
        { at: [-160, -10], label: "Pacific" },
        { at: [-165, 0], label: "Pacific too" },
      ],
    });
    const drawn = marks(map.svg);
    expect(drawn.map((m) => m.label)).toEqual(["visible"]);
    // And the projection really did offer a pixel for the one that was dropped,
    // so the test is about the guard rather than about d3 refusing.
    expect(map.project([-160, -10])).not.toBeNull();
  });

  it("states whether a mark is on the canvas instead of deciding for the caller", async () => {
    const map = await masen({
      region: "west-europe",
      projection: "conic-conformal",
      theme: "minimal",
      size: [600, 600],
      // Paris is framed; the Kamchatka coordinate is a real place the camera
      // is simply not pointed at.
      pins: [PARIS, { at: [158.65, 53.05], label: "Petropavlovsk" }],
    });
    const drawn = marks(map.svg);
    expect(drawn).toHaveLength(2);
    expect(drawn[0]?.fit).toBe("1");
    expect(drawn[1]?.fit).toBe("0");
    // The fact is stated in the document and acted on by the stylesheet.
    expect(map.css).toContain('.mp-anno[data-fit="0"]');
  });

  it("carries the caller's handle and category through to the markup", async () => {
    const map = await masen({
      region: "west-europe",
      pins: [{ at: [2.35, 48.86], id: "p1", kind: "capital" }],
    });
    const [mark] = marks(map.svg);
    expect(mark?.id).toBe("p1");
    expect(mark?.kind).toBe("capital");
  });

  it("moves the label off the mark without moving the mark", async () => {
    const plain = await masen({ region: "west-europe", pins: [PARIS] });
    const shifted = await masen({
      region: "west-europe",
      pins: [{ ...PARIS, offset: [-30, 0] }],
    });
    const [a] = marks(plain.svg);
    const [b] = marks(shifted.svg);

    expect(b?.x).toBe(a?.x);
    expect(b?.y).toBe(a?.y);
    expect(b?.labelX).toBeLessThan(a?.labelX as number);
    // Pushed left, the text has to end at the offset rather than start there,
    // or it runs straight back over the mark it was moved away from.
    expect(a?.anchor).toBe("start");
    expect(b?.anchor).toBe("end");
  });

  it("draws a mark with no label as a mark and nothing else", async () => {
    const map = await masen({ region: "west-europe", pins: [{ at: [2.35, 48.86] }] });
    const [mark] = marks(map.svg);
    expect(mark).toBeDefined();
    expect(mark?.label).toBeNull();
    expect(annotationLayer(map.svg)).not.toContain("<title>");
  });

  it("refuses a coordinate that cannot be one", async () => {
    const bad: Array<readonly [Pin["at"], RegExp]> = [
      [[0, 100], /latitude/],
      [[200, 0], /longitude/],
      [[Number.NaN, 0], /finite/],
    ];
    for (const [at, message] of bad) {
      await expect(masen({ region: "west-europe", pins: [{ at }] })).rejects.toThrow(message);
    }
    // The mistake that actually happens gets told what it was.
    await expect(
      masen({ region: "west-europe", pins: [{ at: [48.86, 2.35] as never }] }),
    ).resolves.toBeDefined();
    await expect(
      masen({ region: "west-europe", pins: [{ at: [48.86, 102.35] }] }),
    ).rejects.toThrow(/\[lon, lat\], not \[lat, lon\]/);
  });

  it("leaves the layer emitted and empty when annotations are switched off", async () => {
    const map = await masen({
      region: "west-europe",
      pins: [PARIS],
      layers: { annotations: false },
    });
    expect(map.svg).toContain('class="mp-layer mp-annotations"');
    expect(annotationLayer(map.svg).trim()).toBe("");
    // And the description does not announce a mark that is not in the document.
    expect(/aria-label="([^"]*)"/.exec(map.svg)?.[1]).not.toContain("Paris");
  });

  it("still rejects a coordinate that cannot be one when the layer is off", async () => {
    // Switching a layer off controls what is drawn, not whether the options
    // were valid — otherwise a bad pin hides until someone turns pins back on.
    await expect(
      masen({
        region: "west-europe",
        pins: [{ at: [0, 100] }],
        layers: { annotations: false },
      }),
    ).rejects.toThrow(/latitude/);
  });

  it("never moves the camera to take a pin in", async () => {
    // A mark is placed on the map; the map is not reframed around the mark, or
    // every mark already placed shifts under the reader.
    const without = await masen({ region: "west-europe", projection: "conic-conformal" });
    const with_ = await masen({
      region: "west-europe",
      projection: "conic-conformal",
      pins: [{ at: [158.65, 53.05], label: "Petropavlovsk" }],
    });
    expect(with_.project([2.35, 48.86])).toEqual(without.project([2.35, 48.86]));
  });

  it("names in the description only the marks a reader can see", async () => {
    const map = await masen({
      region: "africa",
      projection: "orthographic",
      size: [800, 800],
      pins: [
        { at: [15, 0], label: "visible" },
        { at: [-160, -10], label: "behind the globe" },
        { at: [30, 60], label: "off the canvas" },
        { at: [20, 5] },
      ],
    });
    const described = /aria-label="([^"]*)"/.exec(map.svg)?.[1] ?? "";
    expect(described).toContain("visible");
    expect(described).not.toContain("behind the globe");
    expect(described).not.toContain("off the canvas");
  });

  it("says nothing about annotations on a map that has none", async () => {
    const map = await masen({ region: "west-europe" });
    expect(/aria-label="([^"]*)"/.exec(map.svg)?.[1]).not.toContain("marking");
    expect(annotationLayer(map.svg).trim()).toBe("");
  });
});

interface Box {
  readonly id: string | null;
  readonly kind: string | null;
  readonly fit: string | null;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly leader: readonly [number, number, number, number];
  readonly rows: readonly string[];
  readonly textX: number;
}

function boxes(svg: string): Box[] {
  const layer = annotationLayer(svg);
  const found: Box[] = [];
  for (const group of layer.matchAll(/<g class="mp-anno mp-callout"([^>]*)>([\s\S]*?)<\/g>/g)) {
    const attributes = group[1] as string;
    const body = group[2] as string;
    const rect = /<rect class="mp-callout-box"([^>]*)\/?>/.exec(body)?.[1] ?? "";
    const d = attribute(/<path class="mp-callout-leader"([^>]*)\/?>/.exec(body)?.[1] ?? "", "d") ?? "";
    const [, x1, y1, x2, y2] = /M(-?[\d.]+),(-?[\d.]+)L(-?[\d.]+),(-?[\d.]+)/.exec(d) ?? [];
    const text = /<text class="mp-label"([^>]*)>([\s\S]*?)<\/text>/.exec(body);
    found.push({
      id: attribute(attributes, "data-id"),
      kind: attribute(attributes, "data-kind"),
      fit: attribute(attributes, "data-fit"),
      x: Number(attribute(rect, "x")),
      y: Number(attribute(rect, "y")),
      w: Number(attribute(rect, "width")),
      h: Number(attribute(rect, "height")),
      leader: [Number(x1), Number(y1), Number(x2), Number(y2)],
      rows: [...(text?.[2] ?? "").matchAll(/<tspan[^>]*>([\s\S]*?)<\/tspan>/g)].map((m) =>
        (m[1] as string).trim(),
      ),
      textX: Number(attribute(text?.[1] ?? "", "x")),
    });
  }
  return found;
}

const NOTE: Callout = {
  at: [4.84, 45.76],
  text: "Rail hub reopened in March after eight months of repairs",
};

describe("callouts", () => {
  it("points its leader from the coordinate to the corner the offset named", async () => {
    const map = await masen({
      region: "west-europe",
      callouts: [{ ...NOTE, offset: [60, -90] }],
    });
    const at = map.project(NOTE.at) as [number, number];
    const [box] = boxes(map.svg);
    expect(box).toBeDefined();

    // The line starts where the thing it describes is.
    expect(box?.leader[0]).toBeCloseTo(at[0], 0);
    expect(box?.leader[1]).toBeCloseTo(at[1], 0);
    // And ends at the offset, which is a corner of the box.
    expect(box?.leader[2]).toBeCloseTo(at[0] + 60, 0);
    expect(box?.leader[3]).toBeCloseTo(at[1] - 90, 0);

    const corners = [
      [box?.x, box?.y],
      [(box?.x as number) + (box?.w as number), box?.y],
      [box?.x, (box?.y as number) + (box?.h as number)],
      [(box?.x as number) + (box?.w as number), (box?.y as number) + (box?.h as number)],
    ];
    const hit = corners.some(
      ([cx, cy]) =>
        Math.abs((cx as number) - (box?.leader[2] as number)) < 0.2 &&
        Math.abs((cy as number) - (box?.leader[3] as number)) < 0.2,
    );
    expect(hit, "the leader lands on a corner of its own box").toBe(true);
  });

  it("grows the box in the direction the offset points", async () => {
    const map = await masen({
      region: "west-europe",
      callouts: [
        { ...NOTE, offset: [50, 50] },
        { ...NOTE, offset: [-50, -50] },
      ],
    });
    const at = map.project(NOTE.at) as [number, number];
    const [down, up] = boxes(map.svg);

    // Positive: the corner is the top-left and the box extends right and down.
    expect(down?.x).toBeCloseTo(at[0] + 50, 0);
    expect(down?.y).toBeCloseTo(at[1] + 50, 0);
    // Negative: the corner is the bottom-right and the box extends left and up.
    expect((up?.x as number) + (up?.w as number)).toBeCloseTo(at[0] - 50, 0);
    expect((up?.y as number) + (up?.h as number)).toBeCloseTo(at[1] - 50, 0);
  });

  it("keeps the caption inside the box at the worst width a real face runs", async () => {
    // The estimator is tuned to under-read, because the label engine hides a
    // name that does not fit and over-reading would hide names that do. A box
    // has the opposite failure: under-read and the caption prints out through
    // the side. 1.28 is the worst ratio measured in a browser with
    // getComputedTextLength() across the three bundled stacks at weights 400,
    // 500 and 700 — an independent number, so lowering the slack fails here.
    const WORST = 1.28;
    // `noir` is in here on purpose: it sets --label-track: 0.3, and tracking is
    // a flat per-character length the estimator has no reason to know about.
    // Over a twenty-character line that is six units, and it was enough to
    // print a caption out through the side of its own box.
    for (const theme of ["minimal", "noir", "atlas"]) {
    const map = await masen({
      region: "west-europe",
      theme,
      callouts: [NOTE, { at: [12.5, 41.9], text: "Hamburg" }],
    });
    const size = Number(/--place-label-size:\s*([\d.]+)/.exec(map.css)?.[1]);
    const advance = Number(/--label-advance:\s*([\d.]+)/.exec(map.css)?.[1]);
    const track = Number(/--label-track:\s*([\d.]+)/.exec(map.css)?.[1] ?? 0);
    expect(size).toBeGreaterThan(0);

    for (const box of boxes(map.svg)) {
      const widest = Math.max(
        ...box.rows.map((row) => (row.length * size * advance + row.length * track) * WORST),
      );
      const inset = box.textX - box.x;
      expect(inset, "the caption starts inside its own box").toBeGreaterThan(0);
      expect(
        box.w,
        `${theme}: box ${box.w} too narrow for ${widest.toFixed(1)} of text plus ${inset} either side`,
      ).toBeGreaterThanOrEqual(widest + inset * 2 - 0.6);
    }
    }
  });

  it("wraps to the width it was given and no wider", async () => {
    const narrow = await masen({
      region: "west-europe",
      callouts: [{ ...NOTE, width: 90 }],
    });
    const wide = await masen({
      region: "west-europe",
      callouts: [{ ...NOTE, width: 260 }],
    });
    const [a] = boxes(narrow.svg);
    const [b] = boxes(wide.svg);

    expect(a?.rows.length).toBeGreaterThan(b?.rows.length as number);
    expect(a?.w).toBeLessThan(b?.w as number);
    expect(a?.w).toBeLessThanOrEqual(90 + 20);
    // Nothing is lost in the wrapping, whichever column it is set in.
    expect(a?.rows.join(" ")).toBe(NOTE.text);
    expect(b?.rows.join(" ")).toBe(NOTE.text);
  });

  it("shares the pin's guard against the far side of a globe", async () => {
    const map = await masen({
      region: "africa",
      projection: "orthographic",
      size: [800, 800],
      callouts: [
        { at: [15, 0], text: "visible" },
        { at: [-160, -10], text: "Pacific" },
      ],
    });
    expect(boxes(map.svg).map((b) => b.rows.join(" "))).toEqual(["visible"]);
    expect(map.project([-160, -10])).not.toBeNull();
  });

  it("names the option that was wrong when a coordinate cannot be one", async () => {
    await expect(
      masen({ region: "west-europe", callouts: [{ at: [0, 100], text: "x" }] }),
    ).rejects.toThrow(/callouts\[0\]\.at/);
  });

  it("draws captions over marks, never under them", async () => {
    // A box is opaque. Drawn first, it would be covered by any pin beside it.
    const map = await masen({
      region: "west-europe",
      pins: [{ at: [4.84, 45.76], label: "Lyon" }],
      callouts: [NOTE],
    });
    const layer = annotationLayer(map.svg);
    expect(layer.indexOf("mp-pin")).toBeLessThan(layer.indexOf("mp-callout"));
  });

  it("sets the caption on its box rather than on a halo", async () => {
    // The one piece of text on the map with no casing: it has a ground of its
    // own, and a halo over a solid fill only fattens the glyphs.
    const map = await masen({ region: "west-europe", theme: "minimal", callouts: [NOTE] });
    expect(map.css).toMatch(/\.mp-label\[data-kind="callout"\][^}]*fill:\s*var\(--anno-ink\)/);
    expect(map.css).toMatch(/\.mp-label\[data-kind="callout"\][^}]*stroke:\s*none/);
  });

  it("carries its caption into the accessible description", async () => {
    const map = await masen({ region: "west-europe", callouts: [NOTE] });
    expect(/aria-label="([^"]*)"/.exec(map.svg)?.[1]).toContain("Rail hub reopened");
  });
});

interface Curve {
  readonly id: string | null;
  readonly kind: string | null;
  readonly fit: string | null;
  readonly d: string;
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  /** The control point, or null for a straight line. */
  readonly control: readonly [number, number] | null;
}

function curves(svg: string): Curve[] {
  const layer = annotationLayer(svg);
  const found: Curve[] = [];
  for (const group of layer.matchAll(/<g class="mp-anno mp-arrow"([^>]*)>([\s\S]*?)<\/g>/g)) {
    const attributes = group[1] as string;
    const d =
      attribute(
        /<path class="mp-arrow-line"([^>]*)\/?>/.exec(group[2] as string)?.[1] ?? "",
        "d",
      ) ?? "";
    const bowed = /M(-?[\d.]+),(-?[\d.]+)Q(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)/.exec(d);
    const straight = /M(-?[\d.]+),(-?[\d.]+)L(-?[\d.]+),(-?[\d.]+)/.exec(d);
    const n = (v: string | undefined) => Number(v);
    found.push({
      id: attribute(attributes, "data-id"),
      kind: attribute(attributes, "data-kind"),
      fit: attribute(attributes, "data-fit"),
      d,
      start: bowed
        ? [n(bowed[1]), n(bowed[2])]
        : [n(straight?.[1]), n(straight?.[2])],
      end: bowed
        ? [n(bowed[5]), n(bowed[6])]
        : [n(straight?.[3]), n(straight?.[4])],
      control: bowed ? [n(bowed[3]), n(bowed[4])] : null,
    });
  }
  return found;
}

const ODESA: Arrow["from"] = [30.73, 46.48];
const MADRID: Arrow["to"] = [-3.7, 40.42];

describe("arrows", () => {
  it("runs from one coordinate to the other and nowhere else", async () => {
    const map = await masen({
      region: "europe",
      arrows: [{ from: ODESA, to: MADRID, id: "a1", kind: "grain" }],
    });
    const from = map.project(ODESA) as [number, number];
    const to = map.project(MADRID) as [number, number];
    const [curve] = curves(map.svg);
    expect(curve).toBeDefined();
    expect(curve?.start[0]).toBeCloseTo(from[0], 0);
    expect(curve?.start[1]).toBeCloseTo(from[1], 0);
    expect(curve?.end[0]).toBeCloseTo(to[0], 0);
    expect(curve?.end[1]).toBeCloseTo(to[1], 0);
    expect(curve?.id).toBe("a1");
    expect(curve?.kind).toBe("grain");
  });

  it("bows to the side the sign asks for, and not at all at zero", async () => {
    const map = await masen({
      region: "europe",
      arrows: [
        { from: ODESA, to: MADRID, bow: 0.25 },
        { from: ODESA, to: MADRID, bow: -0.25 },
        { from: ODESA, to: MADRID, bow: 0 },
      ],
    });
    const [left, right, flat] = curves(map.svg);

    // Straight is a line, not a curve that happens to be flat.
    expect(flat?.control).toBeNull();
    expect(flat?.d).toContain("L");

    expect(left?.control).not.toBeNull();
    expect(right?.control).not.toBeNull();

    // The two bows land on opposite sides of the chord they share.
    const side = (c: Curve): number => {
      const [ax, ay] = c.start;
      const [bx, by] = c.end;
      const [cx, cy] = c.control as [number, number];
      return Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    };
    expect(side(left as Curve)).not.toBe(0);
    expect(side(left as Curve)).toBe(-side(right as Curve));
  });

  it("drops the whole arrow when either end is behind the globe", async () => {
    // Half an arrow is not a partial answer — it is a line pointing at a place
    // the reader was never told about.
    const map = await masen({
      region: "africa",
      projection: "orthographic",
      size: [800, 800],
      arrows: [
        { from: [15, 0], to: [30, -20] },
        { from: [15, 0], to: [-160, -10] },
        { from: [-160, -10], to: [15, 0] },
      ],
    });
    expect(curves(map.svg)).toHaveLength(1);
    // Both of the dropped ends did have a pixel on offer.
    expect(map.project([-160, -10])).not.toBeNull();
  });

  it("needs both ends on the canvas to call itself fitted", async () => {
    const map = await masen({
      region: "west-europe",
      projection: "conic-conformal",
      size: [600, 600],
      arrows: [
        { from: [2.35, 48.86], to: [13.4, 52.52] },
        { from: [2.35, 48.86], to: [158.65, 53.05] },
      ],
    });
    const drawn = curves(map.svg);
    expect(drawn).toHaveLength(2);
    expect(drawn[0]?.fit).toBe("1");
    expect(drawn[1]?.fit).toBe("0");
  });

  it("draws no arrow between two coordinates that share a pixel", async () => {
    // No direction, so no curve and nothing to orient a head along.
    const map = await masen({
      region: "europe",
      detail: "110m",
      arrows: [{ from: [30.73, 46.48], to: [30.7301, 46.4801] }],
    });
    expect(curves(map.svg)).toHaveLength(0);
  });

  it("keeps its head through the flattening pass", async () => {
    // A marker is a presentation attribute, and the flattened form exists for
    // readers that ignore the stylesheet. An arrow that arrives without its
    // head is a line — the same failure as a choropleth exporting flat.
    const map = await masen({
      region: "europe",
      theme: "noir",
      arrows: [{ from: ODESA, to: MADRID }],
    });
    const document = await map.render();
    expect(document).toMatch(/id="mp-arrowhead-[^"]+"/);
    expect(document).toMatch(/marker-end="url\(#mp-arrowhead-[^"]+\)"/);
    // And the head it names is the one this document defines.
    const referenced = /marker-end="url\(#(mp-arrowhead-[^")]+)\)"/.exec(document)?.[1];
    expect(document).toContain(`id="${referenced}"`);
  });

  it("emits the head because the stylesheet asks, not because an arrow does", async () => {
    // The same rule the hatch pattern has followed since Phase 5: a definition
    // is materialised when the *stylesheet* references it, because that is the
    // only thing the defs block can see. So a themed map carries the marker
    // whether or not it draws an arrow — a couple of hundred bytes, and the
    // alternative is making the defs block depend on the content it sits above.
    const themed = await masen({ region: "europe", detail: "110m", theme: "noir" });
    expect(themed.svg).toContain("mp-arrowhead");

    // With no stylesheet there is nothing to ask, and nothing is emitted.
    const bare = await masen({ region: "europe", detail: "110m" });
    expect(bare.svg).not.toContain("mp-arrowhead");
    expect(bare.svg).not.toContain("mp-stripe");
  });

  it("names which end was wrong", async () => {
    await expect(
      masen({ region: "europe", arrows: [{ from: [0, 100], to: MADRID }] }),
    ).rejects.toThrow(/arrows\[0\]\.from/);
    await expect(
      masen({ region: "europe", arrows: [{ from: ODESA, to: [0, 100] }] }),
    ).rejects.toThrow(/arrows\[0\]\.to/);
  });

  it("runs beneath the marks rather than over them", async () => {
    // A connection is context for the things it connects, not the reverse.
    const map = await masen({
      region: "europe",
      arrows: [{ from: ODESA, to: MADRID }],
      pins: [{ at: ODESA, label: "Odesa" }],
      callouts: [{ at: MADRID, text: "and to here" }],
    });
    const layer = annotationLayer(map.svg);
    expect(layer.indexOf("mp-arrow")).toBeLessThan(layer.indexOf("mp-pin"));
    expect(layer.indexOf("mp-pin")).toBeLessThan(layer.indexOf("mp-callout"));
  });
});

/**
 * Routes: the ordering is the primitive.
 *
 * Everything a route is made of already shipped — a pin is a mark with a name
 * beside it, an arrow is a line between two coordinates — so the tests here are
 * about the one thing that is new, which is that the stops are in an order and
 * the line follows it. The failure worth catching is the far side of a globe:
 * threading past a stop the camera cannot see draws a leg between two places
 * that are not adjacent, and on a globe that leg is a chord through the planet.
 */
const STOCKHOLM: Pin["at"] = [18.06, 59.33];
const SUNDSVALL: Pin["at"] = [17.31, 62.39];
const KIRUNA: Pin["at"] = [20.22, 67.85];

function routeGroups(svg: string): string[] {
  return [...annotationLayer(svg).matchAll(/<g class="mp-anno mp-route"[\s\S]*?<\/g>/g)].map(
    (m) => m[0] as string,
  );
}

/**
 * The route's polyline, or null when no leg was drawn.
 *
 * Read off the `mp-route-line` path by name rather than with the generic
 * attribute helper, whose `d="..."` pattern also matches the tail of
 * `data-id="..."` — which is how the first version of this read a route's id
 * as its geometry.
 */
function line(group: string): string | null {
  const match = /<path class="mp-route-line" d="([^"]*)"/.exec(group);
  return match === null ? null : (match[1] as string);
}

/** Every point of a route's polyline, in canvas units. */
function legs(group: string): Array<[number, number]> {
  const d = line(group) ?? "";
  return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as [number, number],
  );
}

describe("routes", () => {
  it("threads the stops in the order they were given", async () => {
    const map = await masen({
      region: ["SE", "NO", "FI"],
      routes: [
        {
          id: "r1",
          kind: "rail",
          label: "Norrland",
          stops: [
            { at: STOCKHOLM, label: "Stockholm" },
            { at: SUNDSVALL, label: "Sundsvall" },
            { at: KIRUNA, label: "Kiruna" },
          ],
        },
      ],
    });
    const [group] = routeGroups(map.svg);
    expect(group).toBeDefined();
    expect(attribute(group as string, "data-id")).toBe("r1");
    expect(attribute(group as string, "data-kind")).toBe("rail");

    // Each vertex is where that stop projects, in sequence. A route that
    // visited the same three places in another order would pass every string
    // assertion and be a different journey.
    const drawn = legs(group as string);
    expect(drawn).toHaveLength(3);
    for (const [index, at] of [STOCKHOLM, SUNDSVALL, KIRUNA].entries()) {
      const [x, y] = map.project(at) as [number, number];
      expect(drawn[index]?.[0]).toBeCloseTo(x, 0);
      expect(drawn[index]?.[1]).toBeCloseTo(y, 0);
    }
  });

  it("puts a mark at every stop, smaller where the stop is minor", async () => {
    const map = await masen({
      region: ["SE", "NO", "FI"],
      routes: [
        {
          stops: [
            { at: STOCKHOLM, label: "Stockholm" },
            { at: SUNDSVALL, kind: "minor" },
            { at: KIRUNA },
          ],
        },
      ],
    });
    const [group] = routeGroups(map.svg);
    const radii = [...(group as string).matchAll(/<circle class="mp-route-stop"[^>]*\sr="([\d.]+)"/g)].map(
      (m) => Number(m[1]),
    );
    expect(radii).toHaveLength(3);
    expect(radii[1]).toBeLessThan(radii[0] as number);
    expect(radii[2]).toBe(radii[0]);
  });

  it("names only the stops that were given names", async () => {
    const map = await masen({
      region: ["SE", "NO", "FI"],
      routes: [{ stops: [{ at: STOCKHOLM, label: "Stockholm" }, { at: SUNDSVALL }, { at: KIRUNA }] }],
    });
    const [group] = routeGroups(map.svg);
    const named = [...(group as string).matchAll(/data-kind="route"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(named).toEqual(["Stockholm"]);
  });

  it("leaves the line bare when asked", async () => {
    const map = await masen({
      region: ["SE", "NO", "FI"],
      routes: [{ marks: false, stops: [{ at: STOCKHOLM }, { at: KIRUNA }] }],
    });
    const [group] = routeGroups(map.svg);
    expect(group).toContain("mp-route-line");
    expect(group).not.toContain("mp-route-stop");
  });

  /**
   * The far side of a globe breaks the line rather than being threaded past.
   *
   * `project()` answers a coordinate behind the planet with a pixel on the near
   * side, so skipping a dropped stop would draw a leg from Stockholm to
   * somewhere in the Atlantic that is really New Zealand. The line has to stop
   * and start again instead.
   */
  it("breaks rather than threading past a stop it cannot see", async () => {
    const map = await masen({
      region: "europe",
      projection: "orthographic",
      routes: [
        {
          stops: [
            { at: STOCKHOLM },
            // The Chatham Islands: as far behind a Europe-facing globe as it gets.
            { at: [-176.5, -43.9] },
            { at: KIRUNA },
          ],
        },
      ],
    });
    const [group] = routeGroups(map.svg);
    expect(group).toBeDefined();
    // Two visible stops, no line between them, because they are not adjacent.
    const marks = [...(group as string).matchAll(/mp-route-stop/g)];
    expect(marks).toHaveLength(2);
    expect(
      line(group as string),
      "a leg was drawn across a stop the camera cannot see",
    ).toBeNull();
  });

  it("draws every visible run when only the middle is missing", async () => {
    const map = await masen({
      region: "europe",
      projection: "orthographic",
      routes: [
        {
          stops: [
            { at: STOCKHOLM },
            { at: SUNDSVALL },
            { at: [-176.5, -43.9] },
            { at: KIRUNA },
            { at: [17.42, 68.44] },
          ],
        },
      ],
    });
    const [group] = routeGroups(map.svg);
    const d = line(group as string) ?? "";
    // Two subpaths: the pair before the gap and the pair after it.
    expect([...d.matchAll(/M/g)]).toHaveLength(2);
  });

  it("refuses a coordinate that cannot be one", async () => {
    await expect(
      masen({ region: "europe", routes: [{ stops: [{ at: [200, 0] }] }] }),
    ).rejects.toThrow(/routes\[0\]\.stops\[0\]\.at/);
  });

  it("runs beneath the marks, alongside the arrows", async () => {
    const map = await masen({
      region: ["SE", "NO", "FI"],
      routes: [{ stops: [{ at: STOCKHOLM }, { at: KIRUNA }] }],
      pins: [{ at: SUNDSVALL, label: "Sundsvall" }],
    });
    const layer = annotationLayer(map.svg);
    expect(layer.indexOf("mp-route")).toBeLessThan(layer.indexOf("mp-pin"));
  });
});
