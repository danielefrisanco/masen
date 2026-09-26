import { compose } from "./structure.js";

/**
 * White linework on drafting blue, set in a monospaced face, with dashed
 * administrative boundaries — the conventions of a technical drawing rather
 * than of a map.
 *
 * Its political fills are steps of the same blue instead of six hues. A
 * blueprint that broke into colour would stop being one, and a tonal ramp
 * still satisfies what political fill actually promises: that no country
 * matches the one beside it. The ramp starts a clear step above the ground
 * rather than at it, so that a country holding the lowest fill still reads as
 * land where it meets the sea.
 */
export const blueprint = compose({
  tokens: `
  --bg: #10395E;
  --sea: #10395E;
  --land: #17466F;
  --land-edge: #BCD9F0;
  --land-edge-width: 0.6;
  --border: #E9F3FD;
  --border-width: 0.9;
  --border-dash: 6 3;
  --accent: #F5B841;
  --accent-edge: #10395E;
  --bin-1: #17466F;
  --bin-2: #235880;
  --bin-3: #35759A;
  --bin-4: #5E9CBE;
  --bin-5: #A8CDE4;
  --fill-1: #1B4972;
  --fill-2: #22557F;
  --fill-3: #29618C;
  --fill-4: #316D99;
  --fill-5: #3879A6;
  --fill-6: #4085B3;
  --prism-side: #0B2A47;
  --accent-side: #A2762A;
  --place: #E9F3FD;
  --ink: #E9F3FD;
  --ink-muted: #8FB4D4;
  --font: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --label-size: 12;
  --place-label-size: 10;
  --label-track: 0.25;
  --label-weight: 500;
  --label-advance: 0.58;
  --label-halo: #10395E;
  --label-halo-width: 2.4;

  --stripe: #E9F3FD;
  --stripe-width: 1.4;
  --water: #7FB3DC;
  --water-width: 0.9;
  --graticule: #4E7CA3;
  --graticule-width: 0.4;
  --equator: #BCD9F0;
  --desert: #2A5F86;
  --forest: #1F5578;
  --mountain: #27618B;
  --glacier: #7FB3DC;
  --sea-ink: #8FB4D4;
  --road: #F5B841;
  --neighbour: #133F68;
  --anno: #EF8A3C;
  --anno-ink: #10395E;
  --pressure-low: #EF8A3C;
  --pressure-high: #E8F2FF;
  --pin-size: 7;
  --furniture-ink: #8FB4D4;`,
  dark: `
  --bg: #081F35;
  --sea: #081F35;
  --land: #0D2B47;
  --land-edge: #7FA8C9;
  --border: #B9D6EF;
  --bin-1: #0D2B47;
  --bin-2: #143855;
  --bin-3: #234F71;
  --bin-4: #3C6E92;
  --bin-5: #6E9DBE;
  --fill-1: #0C2740;
  --fill-2: #10304C;
  --fill-3: #153958;
  --fill-4: #194164;
  --fill-5: #1E4A70;
  --fill-6: #22537C;
  --prism-side: #051726;
  --accent-side: #8F681F;
  --place: #CFE2F3;
  --ink: #CFE2F3;
  --ink-muted: #6E92B2;
  --label-halo: #081F35;

  --water: #558CB8;
  --neighbour: #0A2439;
  --anno-ink: #081F35;
  --accent-edge: #081F35;
  --stripe: #B9D6EF;`,
});
