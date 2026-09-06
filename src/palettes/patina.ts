/**
 * Editorial colour, in the manner of a geopolitical review.
 *
 * The four palettes that came before it are all atlas-muted, which suits a
 * reference map and does not suit a page someone is meant to stop at. This one
 * is the opposite bargain: flat saturated plates — brick red and ochre against
 * olive and deep teal — with the linework nearly black, the way a printed
 * political review draws a map that has to carry an argument across a spread.
 *
 * The sea is the dark half here, which is the one structural consequence worth
 * knowing about: `--furniture-ink` and `--sea-ink` are *light*, because a
 * credit line and the name of a gulf are both set on the water. Every other
 * palette can take its furniture ink straight from its muted ink; this one
 * cannot, and a dark credit on this sea is invisible.
 *
 * `--fill-6` is a sage green and not a blue, for the same reason the atlas
 * theme has no blue plate: on a map with a sea this colour a blue country
 * reads as water.
 */
export const patina = `
.mp {
  --bg: #1D5C64;
  --sea: #1D5C64;
  --land: #E9D9B4;
  --land-edge: #B08E5A;
  --border: #241F1A;
  --accent: #B5382B;
  --accent-edge: #241F1A;
  --bin-1: #F0E2C2;
  --bin-2: #E3C48C;
  --bin-3: #D49A55;
  --bin-4: #BF6B3A;
  --bin-5: #9E3B26;
  --fill-1: #E0C48E;
  --fill-2: #C3CE9E;
  --fill-3: #E8B39A;
  --fill-4: #CBB3C6;
  --fill-5: #EBD3A0;
  --fill-6: #A9C4B4;
  --prism-side: #6B2517;
  --accent-side: #7A2419;
  --place: #241F1A;
  --ink: #241F1A;
  --ink-muted: #6B5A44;
  --label-halo: #E9D9B4;

  --stripe: #8A6A3C;
  --water: #2E7C84;
  --graticule: #2E6E76;
  --equator: #4E8E96;
  --desert: #EFD9A0;
  --forest: #B7C48C;
  --mountain: #D8C29A;
  --glacier: #EDF3F2;
  --sea-ink: #A8CDD2;
  --road: #B5382B;
  --neighbour: #D2C09A;
  --anno: #8E2A20;
  --anno-ink: #F2E7CE;
  --furniture-ink: #D9C7A0;
}
`.trim();
