import { describe, expect, it } from "vitest";
import { masen, type Pressure } from "../src/index.js";
import { pressureAt } from "../src/weather.js";

/**
 * Isobars, tested by what they claim about the ground.
 *
 * An isobar is a promise that every point on it has the same pressure. So the
 * test that matters is not that a path appears but that its points, put back
 * through the projection, read the level it is labelled with — and that a
 * low's rings close around the low rather than somewhere near it.
 */

const LOW: Pressure = { centres: [{ at: [-15, 58], value: 976, id: "atlantic" }] };

function paths(svg: string): { value: number; points: [number, number][]; closed: boolean }[] {
  return [...svg.matchAll(/<path class="mp-isobar" data-value="([\d.]+)" fill="none" d="([^"]+)"/g)].map(
    (match) => ({
      value: Number(match[1]),
      points: [...(match[2] as string).matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(
        (p) => [Number(p[1]), Number(p[2])] as [number, number],
      ),
      closed: (match[2] as string).endsWith("Z"),
    }),
  );
}

function inside([x, y]: readonly [number, number], ring: readonly [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

interface Band {
  kind: string;
  depth: number;
  from: number;
  to: number;
  rings: [number, number][][];
}

function bands(svg: string): Band[] {
  return [...svg.matchAll(/<path class="mp-pressure-band"[^>]*>/g)].map(([tag]) => {
    const attribute = (name: string): string | undefined =>
      new RegExp(`${name}="([^"]+)"`).exec(tag)?.[1];
    return {
      kind: attribute("data-kind") as string,
      depth: Number(attribute("data-depth")),
      from: Number(attribute("data-from") ?? -Infinity),
      to: Number(attribute("data-to") ?? Infinity),
      rings: (attribute(" d") as string)
        .split("Z")
        .filter((ring) => ring !== "")
        .map((ring) =>
          [...ring.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(
            (p) => [Number(p[1]), Number(p[2])] as [number, number],
          ),
        ),
    };
  });
}

/** Inside by the even-odd rule, which is the rule a band is drawn with. */
function within(point: readonly [number, number], band: Band): boolean {
  return band.rings.filter((ring) => inside(point, ring)).length % 2 === 1;
}

function layer(svg: string, name: string): string {
  const start = svg.indexOf(`class="mp-layer mp-${name}"`);
  const next = svg.indexOf('class="mp-layer', start + 1);
  return svg.slice(start, next === -1 ? undefined : next);
}

describe("pressure field", () => {
  it("reads the centre's own value at the centre", () => {
    expect(pressureAt([{ at: [10, 50], value: 990 }], [10, 50])).toBeCloseTo(990, 6);
  });

  it("returns to the baseline far from every centre", () => {
    expect(pressureAt([{ at: [10, 50], value: 990 }], [-150, -40])).toBeCloseTo(1013, 3);
  });

  it("reaches further along a stretched axis than across it", () => {
    const centre = { at: [0, 0] as const, value: 980, stretch: 2, angle: 90 };
    // 90° is east: 1,500 km east is along the axis, 1,500 km north is across.
    const east = pressureAt([centre], [13.49, 0]);
    const north = pressureAt([centre], [0, 13.49]);
    expect(east).toBeLessThan(north);
  });
});

describe("isobars", async () => {
  const map = await masen({ region: "europe", detail: "110m", size: [800, 700], pressure: LOW });
  const lines = paths(map.svg);

  it("draws them into the weather layer, one value per level", () => {
    expect(lines.length).toBeGreaterThan(3);
    const levels = new Set(lines.map((line) => line.value));
    for (const level of levels) expect(level % 4).toBe(0);
    expect(layer(map.svg, "weather")).toContain("mp-isobar");
  });

  it("puts every point of a line at the pressure it is labelled with", () => {
    // Within a hectopascal: the line is interpolated on a six-unit grid and
    // then smoothed, so it is right to within a cell, not to the pixel.
    for (const line of lines) {
      for (const point of line.points.filter((_, index) => index % 7 === 0)) {
        const ground = map.invert(point);
        if (ground === null) continue;
        expect(Math.abs(pressureAt(LOW.centres, ground) - line.value)).toBeLessThan(1);
      }
    }
  });

  it("closes the rings nearest a low around the low itself", () => {
    const centre = map.project([-15, 58]);
    if (centre === null) throw new Error("the low is on the map");
    const rings = lines.filter((line) => line.closed && line.value <= 996);
    expect(rings.length).toBeGreaterThan(0);
    for (const ring of rings) expect(inside(centre, ring.points)).toBe(true);
  });

  it("marks the low above the names, where the caller put it", () => {
    const centre = map.project([-15, 58]);
    if (centre === null) throw new Error("the low is on the map");
    const [x, y] = centre;
    const annotations = layer(map.svg, "annotations");
    expect(annotations).toContain('class="mp-pressure" data-kind="low" data-id="atlantic"');
    expect(annotations).toContain(`x="${Math.round(x * 10) / 10}" y="${Math.round(y * 10) / 10}"`);
    expect(layer(map.svg, "weather")).not.toContain("mp-pressure");
  });

  it("draws the same chart from the same centres", async () => {
    const again = await masen({ region: "europe", detail: "110m", size: [800, 700], pressure: LOW });
    expect(again.svg).toBe(map.svg);
  });

  it("takes the marks away with the layer", async () => {
    const off = await masen({
      region: "europe",
      detail: "110m",
      size: [800, 700],
      pressure: LOW,
      layers: { weather: false },
    });
    expect(off.svg).not.toContain("mp-isobar");
    expect(off.svg).not.toContain("mp-pressure");
  });
});

describe("shading", async () => {
  const CENTRES: Pressure["centres"] = [
    { at: [-15, 58], value: 972 },
    { at: [20, 50], value: 1030, radius: 1500 },
  ];
  const map = await masen({
    region: "europe",
    detail: "110m",
    size: [800, 700],
    pressure: { centres: CENTRES, shading: true },
  });
  const drawn = bands(map.svg);
  // A lattice over the canvas, and what the field reads under each node.
  const probes: { point: [number, number]; value: number }[] = [];
  for (let x = 5; x < 800; x += 15) {
    for (let y = 5; y < 700; y += 15) {
      const ground = map.invert([x, y]);
      if (ground !== null) probes.push({ point: [x, y], value: pressureAt(CENTRES, ground) });
    }
  }

  it("is off unless asked for", async () => {
    const plain = await masen({ region: "europe", detail: "110m", size: [800, 700], pressure: LOW });
    expect(plain.svg).not.toContain("mp-pressure-band");
  });

  it("draws under the isobars, in the weather layer", () => {
    const weather = layer(map.svg, "weather");
    expect(drawn.length).toBeGreaterThan(4);
    expect(weather.lastIndexOf("mp-pressure-band")).toBeLessThan(weather.indexOf("mp-isobar"));
  });

  it("tints every point with the band its pressure falls in", () => {
    // A hectopascal of slack, for the same reason the isobars have it.
    let checked = 0;
    for (const { point, value } of probes) {
      for (const band of drawn.filter((b) => within(point, b))) {
        expect(value).toBeGreaterThan(band.from - 1);
        expect(value).toBeLessThan(band.to + 1);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(probes.length / 3);
  });

  it("never tints a point twice, so a translucent band means one thing", () => {
    // Apart from the width of a line, where two bands share an edge.
    const doubled = probes.filter(({ point }) => drawn.filter((b) => within(point, b)).length > 1);
    expect(doubled.length).toBeLessThan(probes.length / 100);
  });

  it("tints a weak high all the way out to where the chart turns", async () => {
    // A tropical H of 1015, at 1 hPa: 1013 is a line of its own, so no band
    // holds it and every band under the H is the high's colour.
    const weak = await masen({
      region: { bbox: [93, 3, 118, 24] },
      detail: "110m",
      size: [800, 700],
      pressure: { centres: [{ at: [108, 13.2], value: 1015, radius: 300 }], interval: 1, shading: true },
    });
    const tinted = bands(weak.svg);
    expect(tinted.map((band) => band.from)).toEqual([1013, 1014]);
    expect(tinted.every((band) => band.kind === "high")).toBe(true);
  });

  it("leaves the band that holds normal pressure bare", () => {
    // At 4 hPa that band is 1012 to 1016; a hectopascal in from each edge.
    let checked = 0;
    for (const { point, value } of probes) {
      if (value > 1013 && value < 1015) {
        checked += 1;
        expect(drawn.some((b) => within(point, b))).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("deepens toward each centre, the low warm and the high cool", () => {
    const at = (position: [number, number]): Band | undefined => {
      const point = map.project(position);
      if (point === null) throw new Error("the centre is on the map");
      return drawn.find((b) => within(point, b));
    };
    const low = at([-15, 58]);
    const high = at([20, 50]);
    expect(low?.kind).toBe("low");
    expect(high?.kind).toBe("high");
    expect(low?.depth).toBe(Math.max(...drawn.filter((b) => b.kind === "low").map((b) => b.depth)));
    expect(high?.depth).toBe(Math.max(...drawn.filter((b) => b.kind === "high").map((b) => b.depth)));
    // 972 is 41 hPa under normal: deeper than the deepest step, and drawn at it.
    expect(low?.depth).toBe(8);
  });

  it("stops at the limb of a globe, and reaches it", async () => {
    const globe = await masen({
      region: "world",
      projection: "orthographic",
      detail: "110m",
      size: [600, 600],
      pressure: { centres: [{ at: [0, 20], value: 960, radius: 5000 }], shading: true },
    });
    const centre = globe.project([0, 20]);
    if (centre === null) throw new Error("the low faces the camera");
    const step = ([x, y]: [number, number], by: number): [number, number] => {
      const length = Math.hypot(x - centre[0], y - centre[1]);
      return [x + ((x - centre[0]) / length) * by, y + ((y - centre[1]) / length) * by];
    };
    const vertices = bands(globe.svg).flatMap((band) => band.rings.flat());
    // Half a unit toward the middle is always ground: nothing leaks into space.
    for (const vertex of vertices) expect(globe.invert(step(vertex, -0.5))).not.toBeNull();
    // And some of it is on the limb itself, not a grid cell short of it.
    expect(vertices.some((vertex) => globe.invert(step(vertex, 1)) === null)).toBe(true);
  });
});

describe("isobar values", () => {
  it("do not pile up around a deep low", async () => {
    const map = await masen({
      region: { bbox: [93, 3, 118, 24] },
      detail: "110m",
      size: [800, 700],
      pressure: { centres: [{ at: [114.5, 16.5], value: 962, radius: 420 }] },
    });
    const values = [
      ...map.svg.matchAll(/<text class="mp-label" data-kind="isobar" x="([\d.]+)" y="([\d.]+)"/g),
    ].map((m) => [Number(m[1]), Number(m[2])] as const);
    expect(values.length).toBeGreaterThan(4);
    for (const [i, a] of values.entries()) {
      for (const b of values.slice(i + 1)) expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(20);
    }
  });
});

describe("marks", () => {
  it("print the chart's pressure under the letter, which two close lows deepen", async () => {
    // Alone, each would read 1000. Together each sits in the other's pull, and
    // the ring drawn round them says so — so the letter has to say it too.
    const centres = [
      { at: [0, 50] as const, value: 1000, id: "west" },
      { at: [3, 50] as const, value: 1000, id: "east" },
    ];
    const map = await masen({ region: "europe", detail: "110m", size: [800, 700], pressure: { centres } });
    const printed = Math.round(pressureAt(centres, [0, 50]));
    expect(printed).toBeLessThan(990);
    expect(layer(map.svg, "annotations")).toMatch(
      new RegExp(`data-id="west">[^]*?data-kind="pressure"[^>]*>${printed}<`),
    );
  });

  it("are left off a centre that only shapes the field", async () => {
    const shaped = await masen({
      region: "europe",
      detail: "110m",
      size: [800, 700],
      pressure: { centres: [{ ...LOW.centres[0], mark: false }] as Pressure["centres"] },
    });
    expect(shaped.svg).not.toContain("mp-pressure-mark");
    // The field is the same field: the lines do not move when the letter goes.
    const marked = await masen({ region: "europe", detail: "110m", size: [800, 700], pressure: LOW });
    expect(paths(shaped.svg)).toEqual(paths(marked.svg));
  });
});

describe("pressure validation", () => {
  it("refuses a value that is not a sea-level pressure", async () => {
    await expect(
      masen({ region: "europe", detail: "110m", pressure: { centres: [{ at: [0, 50], value: 97.6 }] } }),
    ).rejects.toThrow(/hectopascals/);
  });

  it("refuses a centre written as [lat, lon]", async () => {
    await expect(
      masen({ region: "europe", detail: "110m", pressure: { centres: [{ at: [58, -115], value: 990 }] } }),
    ).rejects.toThrow(/\[lon, lat\]/);
  });
});
