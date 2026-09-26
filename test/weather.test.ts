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
