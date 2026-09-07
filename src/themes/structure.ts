/**
 * The structure every bundled theme shares.
 *
 * A theme is meant to be colour and weight, not layout logic, and five themes
 * repeating the same forty rules is five places for them to drift. So the rules
 * live here once and read entirely from tokens — a theme supplies values, and
 * anything genuinely structural about it goes in `extra`.
 *
 * That constraint is also what makes palettes worth having: because every
 * width, dash and hue arrives through a custom property, a palette can restyle
 * a map without knowing a single selector.
 *
 * One rule of the lighting model is enforced by the palettes rather than here:
 * a prism's wall is in shadow, so `--prism-side` has to be darker than any
 * band that can sit on top of it. A pale wall under a dark band inverts the
 * light source, and a choropleth prism map turns to mud.
 *
 * The highlighted wall is `--accent-side` and not `brightness()` on the accent
 * for the usual reason: a CSS filter function is not a value SVG 1.1 accepts,
 * so every viewer that ignores stylesheets drew the wall in the same colour as
 * the top and flattened the prism into a silhouette.
 *
 * The same reason rules out `calc()` anywhere here. Flattening substitutes
 * custom properties but does not evaluate arithmetic, so a settlement name set
 * in `calc(var(--label-size) * 0.8)` would export as that string in a
 * `font-size` attribute, which is not a length. Hence `--place-label-size` is
 * a token of its own rather than a fraction of another.
 */

const BANDS = [1, 2, 3, 4, 5];
const FILLS = [1, 2, 3, 4, 5, 6];

const rules = (build: (n: number) => string, over: readonly number[]): string =>
  over.map(build).join("\n");

/**
 * Order matters more than it looks.
 *
 * `.mp-country.is-highlighted` and `.mp-country[data-bin="3"]` have identical
 * specificity, so whichever is written last wins. Highlight is the caller
 * naming a country outright, and a band is a number it happened to fall in —
 * so highlight is written last and takes it. Before this was settled,
 * highlighting a country on a choropleth silently returned its band colour.
 */
export const STRUCTURE = `
.mp .mp-bg { fill: var(--bg); }

.mp .mp-sea { fill: var(--sea); stroke: none; }

.mp .mp-grid {
  fill: none;
  stroke: var(--graticule);
  stroke-width: var(--graticule-width);
}
.mp .mp-grid[data-kind="equator"],
.mp .mp-grid[data-kind="tropic"] { stroke: var(--equator); }

.mp .mp-neighbour { fill: var(--neighbour); stroke: none; }

.mp .mp-country {
  fill: var(--land);
  stroke: var(--land-edge);
  stroke-width: var(--land-edge-width);
  stroke-linejoin: round;
}

${rules((n) => `.mp .mp-country[data-bin="${n}"] { fill: var(--bin-${n}); }`, BANDS)}
${rules((n) => `.mp .mp-country[data-fill="${n}"] { fill: var(--fill-${n}); }`, FILLS)}

.mp .mp-country.is-highlighted {
  fill: var(--accent);
  stroke: var(--accent-edge);
}

/**
 * Land cover, tinted over the land and under the water.
 *
 * Unstroked on purpose. A cover polygon is a climate band with no edge in the
 * world — the Sahara does not stop at a line — so outlining one draws a border
 * that is not there. The tint is the whole statement.
 */
.mp .mp-cover { stroke: none; }
.mp .mp-cover[data-kind="desert"] { fill: var(--desert); }
.mp .mp-cover[data-kind="mountain"] { fill: var(--mountain); }
.mp .mp-cover[data-kind="glacier"] { fill: var(--glacier); }

.mp .mp-water[data-kind="lake"] { fill: var(--water); stroke: none; }
.mp .mp-water[data-kind="river"] {
  fill: none;
  stroke: var(--water);
  stroke-width: var(--water-width);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mp .mp-border {
  fill: none;
  stroke: var(--border);
  stroke-width: var(--border-width);
  stroke-dasharray: var(--border-dash);
  stroke-linejoin: round;
  stroke-linecap: round;
}

.mp .mp-road { fill: none; stroke: var(--road); }
.mp .mp-place { fill: var(--place); stroke: none; }

.mp .mp-prism-top {
  fill: var(--land);
  stroke: var(--land-edge);
  stroke-width: var(--land-edge-width);
}
.mp .mp-prism-side { fill: var(--prism-side); stroke: none; }
.mp .mp-prism-edge {
  fill: none;
  stroke: var(--border);
  stroke-width: var(--border-width);
  stroke-dasharray: var(--border-dash);
}
${rules((n) => `.mp .mp-prism[data-bin="${n}"] .mp-prism-top { fill: var(--bin-${n}); }`, BANDS)}
${rules((n) => `.mp .mp-prism[data-fill="${n}"] .mp-prism-top { fill: var(--fill-${n}); }`, FILLS)}
.mp .mp-prism.is-highlighted .mp-prism-top { fill: var(--accent); }
.mp .mp-prism.is-highlighted .mp-prism-side { fill: var(--accent-side); }

/*
 * A country smaller than the dot standing on it, given an outline it can be
 * seen by.
 *
 * The library states the fact and this decides the appearance, which is the
 * whole bargain: no geometry is invented, no shape is grown, and the polygon
 * under this rule is exactly the one the data supplies. A stroke centred on a
 * 0.2-unit outline reads as a dot of the stroke's own width, which is why it
 * works at all — Vatican cannot be enlarged, but it can be drawn with a pen
 * thick enough to see.
 *
 * The width is 3 rather than a multiple of the border, because calc() is ruled
 * out above and because 3 is a measurement rather than a taste: it is the
 * width of the smallest settlement dot this library draws, so a country that
 * has disappeared comes back at exactly the size of the smallest mark already
 * on the map, and no larger.
 *
 * The paint order keeps the fill above its own stroke, so a highlighted
 * microstate still shows its accent colour rather than a ring of border ink.
 */
.mp .mp-country[data-unseen] {
  stroke: var(--border);
  stroke-width: 3;
  stroke-linejoin: round;
  paint-order: stroke;
}

.mp .mp-hatch { fill: url(#mp-stripe); stroke: none; }
.mp .mp-hatch-line { fill: none; stroke: var(--stripe); stroke-width: var(--stripe-width); }

.mp .mp-label {
  fill: var(--ink);
  font-family: var(--font);
  font-size: var(--label-size);
  font-weight: var(--label-weight);
  letter-spacing: var(--label-track);
  stroke: var(--label-halo);
  stroke-width: var(--label-halo-width);
  stroke-linejoin: round;
  paint-order: stroke;
}

.mp .mp-label[data-kind="place"] {
  fill: var(--ink-muted);
  font-size: var(--place-label-size);
}

/*
 * A degree written on the frame.
 *
 * Muted rather than drawn in --graticule: the grid is meant to be faint enough
 * to read a map through, and a number at that weight is a number nobody reads.
 * It keeps the halo every label has, because the frame is wherever the map
 * happens to reach it — sea on one edge and land on the next.
 */
.mp .mp-label[data-kind="grid"] {
  fill: var(--ink-muted);
  font-size: var(--place-label-size);
  letter-spacing: 0.04em;
}

/*
 * The name of a sea, set on the water in its own ink.
 *
 * Italic and letter-spaced, because that is how an atlas has distinguished
 * water from land for four hundred years and it is doing real work: a reader
 * can tell "Adriatic Sea" from a country name without reading either. The
 * casing is deliberately dropped: --label-halo is a land colour in every
 * preset, and a name on the water wants the water behind it.
 */
.mp .mp-label[data-kind="sea"] {
  fill: var(--sea-ink);
  font-size: var(--place-label-size);
  font-style: italic;
  letter-spacing: 0.08em;
  stroke: none;
}

/*
 * A route: one line through the stops, and a ring at each of them.
 *
 * The mark is a ring rather than a disc — stroked in the annotation colour and
 * filled with the casing — because a stop is a place the line passes through
 * and a disc reads as a place it ends. Same casing the pin's mark takes, so a
 * route crossing a highlighted country stays visible.
 */
.mp .mp-route-line {
  fill: none;
  stroke: var(--anno);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mp .mp-route-stop {
  fill: var(--label-halo);
  stroke: var(--anno);
  stroke-width: 2.2;
}
.mp .mp-route-stop[data-kind="minor"] { stroke-width: 1.6; }

.mp .mp-label.is-highlighted { font-weight: 700; }

.mp .mp-label[data-fit="0"] { display: none; }

/*
 * The annotation layer.
 *
 * The pin's label is a .mp-label, so it arrives already carrying the type
 * stack, the tracking and the casing — the halo is the whole difference
 * between a name that reads over a coastline and one that dissolves into it,
 * and a class of its own would have had to restate all of it. It is set at the
 * settlement size and bold: an annotation is the point of the map, so it
 * out-ranks a city name drawn at the same size.
 *
 * It is deliberately NOT filled with --anno-ink, which is the obvious guess
 * and would be invisible. Every bundled preset sets --anno-ink to the same
 * value as --label-halo — white on minimal and contrast, #F2EAD8 on atlas,
 * #0B0E11 on noir — because what it was authored to mean is the ink drawn on
 * top of a mark, legible against --anno. Filling text with it and casing that
 * text in --label-halo paints white on white. So it stays reserved until a
 * callout has a box to put ink inside, and a pin's label takes --ink, like
 * every other name on the map.
 */
/*
 * The mark is cased, and it has to be. Every bundled preset sets --anno to the
 * same value as --accent — deliberately, so a marked map and a highlighted one
 * agree — which means a pin dropped on a highlighted country is drawn in the
 * country's own colour and disappears. That is not a hypothetical: a region,
 * a highlight and a marker is the map this whole layer exists to make.
 *
 * So the mark gets the same casing its label gets, from the same two tokens.
 * A pin then reads against any ground the map can put under it, including an
 * accent-coloured country, and the mark and the word beside it are separated
 * from the map in the same way rather than in two different ways.
 */
.mp .mp-pin-mark {
  fill: var(--anno);
  stroke: var(--label-halo);
  stroke-width: var(--label-halo-width);
}

/* Ink drawn on the mark, which is what --anno-ink means. The glyph carries no
   stroke of its own: Maki is drawn as solid shapes at this size and outlining
   one closes its counters. */
.mp .mp-icon { fill: var(--anno-ink); stroke: none; }

.mp .mp-label[data-kind="pin"] {
  font-size: var(--place-label-size);
  font-weight: 700;
}

/*
 * The arrow: a curve with a head on the far end.
 *
 * The head is a marker, which is an SVG element and therefore something a
 * stylesheet cannot make for itself — so the theme names it and the definition
 * is emitted, the same bargain the relief filter and the hatch pattern take.
 * Its fill comes from a class rather than from the arrow, because a marker
 * resolves colour where it sits, in the defs block, and not where it is used.
 */
.mp .mp-arrow-line {
  fill: none;
  stroke: var(--anno);
  /* A literal, like the callout's leader and for the same reason: no token in
     the vocabulary means "the weight of a drawn connection", and adding one is
     a contract change nobody has asked for. */
  stroke-width: 2;
  stroke-linecap: round;
  marker-end: url(#mp-arrowhead);
}

.mp .mp-arrow-head { fill: var(--anno); stroke: none; }

/*
 * The callout: a leader line, a filled box, and the caption inside it.
 *
 * The caption is the one piece of text on the map that does NOT take the halo.
 * Every other label is set over whatever the geography put beneath it and needs
 * casing to survive; this one is set on a solid box of its own, where a halo
 * would only fatten the glyphs against a ground already doing the work. So the
 * stroke is turned off and the fill comes from --anno-ink, which is the value
 * every preset has carried since Phase 3 for exactly this.
 */
.mp .mp-callout-leader {
  fill: none;
  stroke: var(--anno);
  /* A literal rather than a token. --border-width is a hairline on most
     presets and a leader drawn at it disappears, and no token in the
     vocabulary means "the weight of a pointing line". Adding one is a contract
     change nobody has asked for, and widening later breaks no theme. */
  stroke-width: 1.25;
  stroke-linecap: round;
}

/* Outlined in its own ink, so the balloon has an edge on any ground it lands
   on — including a highlighted country, which is the one place a fill alone
   cannot be relied on to separate it. */
.mp .mp-callout-box {
  fill: var(--anno);
  stroke: var(--anno-ink);
  stroke-width: 1;
}

.mp .mp-label[data-kind="callout"] {
  fill: var(--anno-ink);
  font-size: var(--place-label-size);
  font-weight: 500;
  stroke: none;
}

/*
 * A pin whose coordinate falls outside the canvas. The mark is mostly off the
 * edge already; this stops the sliver of it that overlaps from reading as a
 * mark of its own. Same bargain the labels take — the engine states the fact,
 * the stylesheet decides what to do about it.
 */
.mp .mp-anno[data-fit="0"] { display: none; }

/*
 * The furniture layer: on the canvas, not on the map.
 *
 * Set at the settlement size rather than from a token of its own. A credit is
 * small text and --place-label-size is the small text size a theme has already
 * chosen, so a condensed face or a larger typeface carries the credit with it
 * instead of leaving it behind. A theme that wants it smaller still says so in
 * one rule.
 */
.mp .mp-credit,
.mp .mp-scale-label,
.mp .mp-compass-label {
  fill: var(--furniture-ink);
  font-family: var(--font);
  font-size: var(--place-label-size);
  letter-spacing: var(--label-track);
}

/*
 * A scale bar is a rule with a tick rising at each end, and the ticks are the
 * part that makes it a measurement — they say where it stops. Literal weight,
 * for the same reason the callout's leader carries one: this is a rule about
 * this mark, not a line on the map, and reading --border-width here would let a
 * theme with heavy borders turn a measurement into a bar of paint.
 */
.mp .mp-scale-bar {
  fill: none;
  stroke: var(--furniture-ink);
  stroke-width: 1.5;
}

.mp .mp-compass-needle {
  fill: var(--furniture-ink);
}

/*
 * A watermark is the one piece of furniture meant to sit *under* the reader's
 * attention rather than in it, which is what the opacity is for — a mark of
 * provenance should not compete with the map it marks.
 *
 * One rule for both forms. The type properties are inert on an <image> and a
 * fill is inert on a logo, so a wordmark and a mark can share a selector rather
 * than needing an element-qualified one, which the flattening pass would then
 * have to be able to parse.
 */
.mp .mp-watermark {
  fill: var(--furniture-ink);
  font-family: var(--font);
  font-weight: 600;
  letter-spacing: var(--label-track);
  opacity: 0.18;
}
`.trim();

export interface ThemeParts {
  /** Declarations for the light `.mp` block. */
  readonly tokens: string;
  /**
   * Declarations for the dark block. Only tokens belong here: a rule whose
   * only definition sits inside the media query never applies to a reader
   * whose system is light, and the map renders half-styled.
   */
  readonly dark: string;
  /** Rules this theme needs that the shared structure cannot express. */
  readonly extra?: string;
}

/**
 * Assemble one theme.
 *
 * The dark block is written last on purpose. A palette is applied after the
 * whole theme, so it lands later still and wins — which is the behaviour worth
 * having: asking for `palette: "sand"` gets sand, whatever the reader's system
 * is set to. Automatic dark is the default, never an override.
 */
export function compose(parts: ThemeParts): string {
  const sections = [
    `.mp {\n${parts.tokens.trim()}\n}`,
    STRUCTURE,
    parts.extra?.trim(),
    `@media (prefers-color-scheme: dark) {\n.mp {\n${parts.dark.trim()}\n}\n}`,
  ];
  return sections.filter((section) => section !== undefined && section !== "").join("\n\n");
}
