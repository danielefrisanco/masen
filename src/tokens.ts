/**
 * The token vocabulary.
 *
 * Named by role, never by appearance: `--ink`, never `--dark-gray`. A token
 * called `--dark-gray` is a lie the moment someone writes a dark theme, and
 * renaming it later breaks every theme in the wild.
 *
 * Reserved tokens are part of the vocabulary from v1 and simply unused. A theme
 * can set them today and they will start doing something when their layer
 * arrives, which is cheaper than asking every theme to be revised then.
 */

export interface TokenSpec {
  readonly name: string;
  readonly status: "live" | "reserved";
  readonly controls: string;
}

export const TOKENS: readonly TokenSpec[] = Object.freeze([
  { name: "--bg", status: "live", controls: "Canvas ground — the ocean, or transparent" },
  { name: "--land", status: "live", controls: "Country fill" },
  { name: "--land-edge", status: "live", controls: "Country outline, usually a hairline" },
  { name: "--land-edge-width", status: "live", controls: "Country outline width, in user units" },
  { name: "--border", status: "live", controls: "Shared boundary stroke" },
  { name: "--border-width", status: "live", controls: "Boundary stroke width, in user units" },
  { name: "--border-dash", status: "live", controls: "Boundary dash pattern, or `none`" },
  { name: "--accent", status: "live", controls: "Fill for anything highlighted" },
  { name: "--accent-edge", status: "live", controls: "Outline for anything highlighted" },
  { name: "--bin-1", status: "live", controls: "Lowest band of a classified value" },
  { name: "--bin-2", status: "live", controls: "Second band" },
  { name: "--bin-3", status: "live", controls: "Third band" },
  { name: "--bin-4", status: "live", controls: "Fourth band" },
  { name: "--bin-5", status: "live", controls: "Highest band" },
  // Political fill needs no data: it colours a country so that it differs from
  // each of its neighbours. Four are provably enough for any map on a plane;
  // six leaves room for the exclaves and shared-arc quirks that make a real
  // country graph not quite planar.
  { name: "--fill-1", status: "live", controls: "First political-fill colour" },
  { name: "--fill-2", status: "live", controls: "Second political-fill colour" },
  { name: "--fill-3", status: "live", controls: "Third political-fill colour" },
  { name: "--fill-4", status: "live", controls: "Fourth political-fill colour" },
  { name: "--fill-5", status: "live", controls: "Fifth political-fill colour" },
  { name: "--fill-6", status: "live", controls: "Sixth political-fill colour" },
  { name: "--prism-side", status: "live", controls: "The extruded wall of a raised country" },
  { name: "--accent-side", status: "live", controls: "The wall of a raised country that is highlighted" },
  { name: "--place", status: "live", controls: "Settlement dots" },
  { name: "--ink", status: "live", controls: "Primary text" },
  { name: "--ink-muted", status: "live", controls: "Secondary text" },
  { name: "--font", status: "live", controls: "Type stack for all text" },
  { name: "--label-size", status: "live", controls: "Country label size, in user units" },
  { name: "--place-label-size", status: "live", controls: "Settlement label size, in user units" },
  { name: "--label-track", status: "live", controls: "Letter-spacing on label text, in user units" },
  { name: "--label-weight", status: "live", controls: "Label font weight" },
  // Not a style: a measurement. SVG offers no way to measure text outside a
  // browser, so the fit test that decides whether a name goes on a country has
  // to estimate its width — and the only thing that knows how wide the chosen
  // face runs is the stylesheet that chose it. A condensed face at 0.46 fits
  // names a humanist one at 0.58 has to hide.
  { name: "--label-advance", status: "live", controls: "Average glyph width, as a fraction of the label size" },
  // A name has to sit on whatever the map put underneath it — a band, a river,
  // a border. The casing is drawn behind the glyphs with `paint-order`, which
  // is one stroke rather than a second copy of every label.
  { name: "--label-halo", status: "live", controls: "Casing drawn behind label text" },
  { name: "--label-halo-width", status: "live", controls: "Casing width, in user units" },
  { name: "--stripe", status: "live", controls: "Diagonal hatching over a marked country" },
  { name: "--stripe-width", status: "live", controls: "Hatch line width, in user units" },
  { name: "--water", status: "live", controls: "Lakes and rivers" },
  { name: "--water-width", status: "live", controls: "River stroke width, in user units" },
  { name: "--road", status: "reserved", controls: "Route strokes — Phase 4 data" },
  // The graticule went live in Phase 8d and three of the land-cover four in
  // 8e. `--forest` is the one that stayed reserved, and not for want of code:
  // Natural Earth publishes no forest polygon at any tier, so the token waits
  // on a source rather than on a layer.
  // The sea as a shape. Distinct from `--bg`, which is the canvas ground: on a
  // map framed to a coastline the two can carry the same colour and nobody can
  // tell, and on an inland map they must not, because everything that is not
  // the subject is land rather than water.
  { name: "--sea", status: "live", controls: "The ocean, drawn as a polygon" },
  { name: "--graticule", status: "live", controls: "Parallels and meridians" },
  { name: "--graticule-width", status: "live", controls: "Grid line width" },
  { name: "--equator", status: "live", controls: "The equator and the tropics, drawn apart from the grid" },
  { name: "--desert", status: "live", controls: "Arid land cover" },
  { name: "--forest", status: "reserved", controls: "Wooded land cover" },
  { name: "--mountain", status: "live", controls: "Upland and mountain cover" },
  { name: "--glacier", status: "live", controls: "Ice and permanent snow" },
  { name: "--sea-ink", status: "live", controls: "Names of seas, gulfs and straits" },
  { name: "--neighbour", status: "live", controls: "Context countries drawn behind the region" },
  { name: "--anno", status: "live", controls: "The mark a pin, arrow or callout is drawn with" },
  {
    name: "--pin-size",
    status: "live",
    controls: "The radius of a pin's mark — and, with it, the icon inside",
  },
  // Live as of the callout, and only there. Every bundled preset sets this to
  // the same value as `--label-halo`, which is exactly what it was authored to
  // mean: ink drawn *on* an annotation, legible against `--anno`. That makes it
  // right for a caption inside a filled box and wrong for a pin's label, which
  // sits beside its mark and takes `--ink` like every other name on the map —
  // filling that with this and casing it in `--label-halo` paints white on
  // white.
  { name: "--anno-ink", status: "live", controls: "Text drawn on an annotation, against --anno" },
  // Weather's own pair, because borrowing did not survive the shading: a high
  // tinted with --water is blue on a blue sea, and on noir the H itself was
  // barely there. Each preset picks the two against its own sea and land.
  { name: "--pressure-low", status: "live", controls: "A low's L and the tint around it" },
  { name: "--pressure-high", status: "live", controls: "A high's H and the tint around it" },
  { name: "--furniture-ink", status: "live", controls: "Credit lines, watermarks and legends, on the canvas" },
]);

export const TOKEN_NAMES: readonly string[] = Object.freeze(TOKENS.map((t) => t.name));

export function isTokenName(value: string): boolean {
  return TOKEN_NAMES.includes(value);
}
