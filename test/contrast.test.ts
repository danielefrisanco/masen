import { describe, expect, it } from "vitest";
import { masen, PALETTE_NAMES, THEME_NAMES } from "../src/index.js";

/**
 * A floor under how close two colours a map puts side by side may be.
 *
 * This exists because the preset tests only ever asked whether a token
 * *resolves*. Every one of them passed on a `sand` map where `--land-edge` was
 * set to the background colour exactly and the lightest band was four points
 * off it — so a low-value country on a coast had neither a fill nor an outline
 * dividing it from the sea, and Eritrea was simply not there. Nothing was
 * undefined. Nothing threw. The map was wrong.
 *
 * **The metric is perceptual difference, not luminance ratio.** The obvious
 * check — a WCAG contrast ratio — was tried first and rejected by measurement:
 * it scores `atlas` at 1.04, a failing grade, because atlas draws a warm tan
 * coastline on a cold blue sea at almost identical lightness. On screen that
 * coast is unmistakable; WCAG cannot see hue, and half the cartography here is
 * hue. ΔE (CIE76, in Lab) counts lightness, hue and chroma together, and it
 * sorts the presets the way an eye does:
 *
 *     contrast 92 · blueprint 64 · noir 28 · atlas 23 · moss 14
 *     ——— the floor ———
 *     dusk 8.7 · slate 5.9 · sand 5.8
 *
 * The three below the line all vanished when rendered and looked at; `moss`,
 * the weakest above it, is faint but legible. So the floor is set from `moss`
 * rather than from a round number: 10 is under every preset judged readable
 * and over every preset judged not.
 */

/** Perceptual difference below which a coastline stops being findable. */
const FLOOR = 10;

/**
 * The same question asked of `--neighbour`, and answered with a different
 * number — because context is *meant* to be faint. 08b's rule for the layer is
 * that it "must not compete with the subject", so holding it to the floor a
 * country fill has to clear would be demanding it break its own brief.
 *
 * **Measured, then looked at, because the first attempt got this wrong.** Reusing
 * FLOOR here failed 24 of 30 presets, which is a rule mis-set rather than a
 * library-wide defect. The spread says so plainly: `contrast` is **0.0** in
 * both schemes, and every other preset lands between **2.7** and **11**.
 * Rendering west-europe with `neighbours` across that range settles which of
 * those are real — blueprint at 3.5 and minimal/slate at 2.9 both draw Poland
 * and Czechia quietly and legibly, while contrast draws nothing at all and the
 * map stops dead at the German border, which is precisely the failure the
 * layer was built to fix.
 *
 * So the line sits between "quiet" and "absent" rather than between "quiet" and
 * "loud", and at that point the honest description of this check is *the
 * context layer may not be the colour of the ground it is drawn on*. Two is
 * under every preset that renders and over the one that does not.
 */
const NEIGHBOUR_FLOOR = 2;

/** Every colour a country's interior can take. */
const FILLS = [
  "--land",
  // Context is allowed to be quiet, not invisible. A neighbour nobody can see
  // is not context; it is an option that does nothing.
  "--neighbour",
  ...[1, 2, 3, 4, 5].map((n) => `--bin-${n}`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `--fill-${n}`),
];

type Rgb = [number, number, number];

function rgb(value: string | undefined): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? "").trim());
  if (match === null) return null;
  let digits = match[1] as string;
  if (digits.length === 3) {
    digits = digits
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16)) as Rgb;
}

/** sRGB to CIE Lab, through linear RGB and XYZ under a D65 white point. */
function lab([r, g, b]: Rgb): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047);
  const y = f(0.2126 * lr + 0.7152 * lg + 0.0722 * lb);
  const z = f((0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function difference(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * The two schemes a preset actually renders in.
 *
 * Reading the stylesheet straight through takes the last value for every token
 * and measures whichever scheme happens to be written last, which is a map
 * nobody sees. Both are shipped, so both are checked — and the rule for
 * resolving them is the cascade's, not an intuition about it.
 *
 * In dark mode every declaration applies, inside the media query and out, and
 * source order settles ties. That is not a detail: a palette is appended after
 * the theme, including after the theme's dark block, and `@media` carries no
 * specificity of its own — so **a palette replaces a theme's dark mode**
 * rather than being replaced by it, and `minimal` + `dusk` is a dark map in
 * broad daylight. Modelling this the other way round reported a failure on a
 * combination that does not exist.
 */
function schemes(css: string): Record<"light" | "dark", Record<string, string>> {
  const block = /@media \(prefers-color-scheme: dark\) \{\s*\.mp[^{]*\{([\s\S]*?)\}\s*\}/.exec(css);
  const outside =
    block === null ? css : css.slice(0, block.index) + css.slice(block.index + block[0].length);
  const read = (text: string): Record<string, string> => {
    const found: Record<string, string> = {};
    for (const match of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      found[match[1] as string] = (match[2] as string).trim();
    }
    return found;
  };
  // Light: only what sits outside the query. Dark: everything, in the order
  // the browser reads it.
  return { light: read(outside), dark: read(css) };
}

const presets: [string, string | null][] = [
  ...THEME_NAMES.map((theme) => [theme, null] as [string, null]),
  ...THEME_NAMES.flatMap((theme) => PALETTE_NAMES.map((p) => [theme, p] as [string, string])),
];

describe("every preset keeps its coastlines findable", () => {
  it.each(presets)("%s with palette %s", async (theme, palette) => {
    const map = await masen({
      region: ["CH"],
      detail: "110m",
      size: [10, 10],
      theme,
      ...(palette === null ? {} : { palette }),
    });
    const both = schemes(map.css);

    for (const scheme of ["light", "dark"] as const) {
      const tokens = both[scheme];
      const ground = rgb(tokens["--bg"]);
      // `minimal` sets `--bg: transparent` on purpose: with no ground of its
      // own the map composites onto the page, and the page's colour is not
      // something this library can measure. Nothing to check, and saying so
      // is better than a skip that looks like a pass.
      if (ground === null) {
        expect(tokens["--bg"], `${theme}: --bg is neither a colour nor transparent`).toBe(
          "transparent",
        );
        continue;
      }
      const edge = rgb(tokens["--land-edge"]);
      const outline = edge === null ? 0 : difference(ground, edge);

      for (const name of FILLS) {
        const fill = rgb(tokens[name]);
        expect(fill, `${theme}/${palette} ${scheme}: ${name} is not a colour`).not.toBeNull();
        // Either half will do — for everything that *has* both halves. A
        // country reads against the sea if its own colour differs from the
        // water, *or* if the line drawn round it does, which is why a pale
        // choropleth band is legal on a theme with a real coastline and
        // illegal on one without.
        //
        // **`--neighbour` is the exception, and the compound rule was quietly
        // excusing it.** `structure.ts` draws neighbours with `stroke: none` —
        // alone among the fills here, a neighbour has no outline at all. So
        // `Math.max(fill, outline)` handed it an outline it does not get, and
        // `contrast` passed for eleven versions with `--neighbour` set to the
        // background colour *exactly*: drawn, present in the markup, and
        // invisible. Same defect the theme's own comment describes two tokens
        // above, where `--glacier` was `--land`. The fill carries it alone.
        const separable = difference(ground, fill as Rgb);
        const context = name === "--neighbour";
        const floor = context ? NEIGHBOUR_FLOOR : FLOOR;
        const apart = context ? separable : Math.max(separable, outline);
        expect(
          apart,
          `${theme}/${palette} ${scheme}: ${name} is ${separable.toFixed(1)} from --bg` +
            (context
              ? ` — a neighbour is drawn with no outline at all, so its fill is the only` +
                ` thing that can separate it from the ground, and below ${floor} it is in` +
                ` the markup and not on the map`
              : ` and its outline is ${outline.toFixed(1)} — below ${floor} nothing separates ` +
                `a country of that colour from the sea`),
        ).toBeGreaterThanOrEqual(floor);
      }
    }
  });
});
