import { compose } from "./structure.js";

/**
 * Pure black and white, sized for legibility rather than for elegance.
 *
 * Every choice here is the accessible one: no muted ink, because a secondary
 * grey is the first thing to fail a contrast check; heavy boundaries, because
 * a hairline disappears when a map is printed or projected; larger labels than
 * any other preset. Its bands and political fills are steps of grey with wide
 * gaps between them, so they stay distinguishable in greyscale, at low
 * resolution, and to a reader with any form of colour blindness.
 *
 * The one thing black and white cannot express is a filled lake, which would
 * read as a hole punched in the land — so lakes are drawn as outlines instead,
 * the only structural override any bundled theme needs.
 *
 * The sea is a light grey rather than white. Pure white on both sides of the
 * coastline leaves land and water telling apart only by which side of a line
 * they fall on, which is exactly the reading this theme exists to spare
 * someone. The grey is not doing the work — the black coastline is, at 21:1
 * against either — but it removes the ambiguity for nothing.
 */
export const contrast = compose({
  tokens: `
  --bg: #E8E8E8;
  --sea: #E8E8E8;
  --land: #FFFFFF;
  --land-edge: #000000;
  --land-edge-width: 2;
  --border: #000000;
  --border-width: 3.5;
  --border-dash: none;
  --accent: #000000;
  --accent-edge: #FFFFFF;
  --bin-1: #FFFFFF;
  --bin-2: #C4C4C4;
  --bin-3: #8A8A8A;
  --bin-4: #4F4F4F;
  --bin-5: #141414;
  --fill-1: #FFFFFF;
  --fill-2: #D0D0D0;
  --fill-3: #A0A0A0;
  --fill-4: #707070;
  --fill-5: #404040;
  --fill-6: #1A1A1A;
  --prism-side: #000000;
  --accent-side: #4A4A4A;
  --place: #000000;
  --ink: #000000;
  --ink-muted: #000000;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --label-size: 15;
  --place-label-size: 13;
  --label-track: 0;
  --label-weight: 700;
  --label-advance: 0.58;
  --label-halo: #FFFFFF;
  --label-halo-width: 3.5;

  --stripe: #000000;
  --stripe-width: 2.4;
  --water: #000000;
  --water-width: 1.4;
  --graticule: #8A8A8A;
  --graticule-width: 0.6;
  --equator: #000000;
  /* Land cover has to clear white land above it and the grey sea beside it, so
     the whole ramp lives below #D8 rather than reaching for white. Glacier was
     #FFFFFF, which is exactly --land: ice drawn in the colour of the ground it
     sits on is not a tint, it is nothing. Four evenly spaced greys instead. */
  --desert: #C0C0C0;
  --forest: #A8A8A8;
  --mountain: #909090;
  --glacier: #D8D8D8;
  --sea-ink: #000000;
  --road: #000000;
  /* Was #E8E8E8 — the background exactly, so turning neighbours on put Poland
     and Czechia in the markup and nothing on the map, and west-europe stopped
     dead at the German border. The same defect the note above records for
     --glacier, which was #FFFFFF against #FFFFFF land. Neighbours are the one
     fill drawn with no stroke at all, so unlike a country there is no
     coastline to carry them and the fill has to do it alone. Grey enough to be
     found, and far short of the white the subject keeps. */
  --neighbour: #C8C8C8;
  --anno: #4A4A4A;
  --anno-ink: #FFFFFF;
  --pressure-low: #000000;
  --pressure-high: #7A7A7A;
  --pin-size: 7;
  --furniture-ink: #000000;`,
  dark: `
  --bg: #171717;
  --sea: #171717;
  --land: #000000;
  --land-edge: #FFFFFF;
  --border: #FFFFFF;
  --accent: #FFFFFF;
  --accent-edge: #000000;
  --bin-1: #000000;
  --bin-2: #3B3B3B;
  --bin-3: #757575;
  --bin-4: #B0B0B0;
  --bin-5: #EBEBEB;
  --fill-1: #000000;
  --fill-2: #2F2F2F;
  --fill-3: #5F5F5F;
  --fill-4: #8F8F8F;
  --fill-5: #BFBFBF;
  --fill-6: #E5E5E5;
  --prism-side: #FFFFFF;
  --accent-side: #B5B5B5;
  --place: #FFFFFF;
  --ink: #FFFFFF;
  --ink-muted: #FFFFFF;
  --label-halo: #000000;
  /*
   * Inherited from the light block, where it is #000000 against a #E8E8E8 sea.
   * On the dark ground that is black on #171717 — a name the reader is told is
   * there and cannot see. The theme's own rule applies: maximum separation.
   */
  --sea-ink: #FFFFFF;
  --water: #FFFFFF;
  /* Inherited #000000 from the light block, which is this theme's dark land —
     a route drawn in the colour of the ground it crosses. Light enough to read
     on black, and short of the white the water uses, so a road is not a river. */
  --road: #C8C8C8;
  /* Inherited the light block's failure into the dark one: #171717 is this
     scheme's ground, so the layer was invisible in both. */
  --neighbour: #3A3A3A;
  --anno: #B8B8B8;
  --anno-ink: #000000;
  --pressure-low: #FFFFFF;
  --pressure-high: #8A8A8A;
  --stripe: #FFFFFF;
  --furniture-ink: #FFFFFF;`,
  extra: `
.mp .mp-water[data-kind="lake"] {
  fill: var(--bg);
  stroke: var(--land-edge);
  stroke-width: var(--land-edge-width);
}`,
});
