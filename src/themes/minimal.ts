import { compose } from "./structure.js";

/**
 * The default. Flat fills, hairline edges, no ocean — designed to be dropped
 * into a page that already has a background of its own.
 *
 * `--bg: transparent` is why the dark block is short: with no ground of its
 * own, the map inherits the page's, so only the land and its linework have to
 * move. Everything darkens by the same relationship rather than inverting,
 * which keeps the highlight reading as the same colour in both.
 */
export const minimal = compose({
  tokens: `
  --bg: transparent;
  --sea: #DCE7EC;
  --land: #D8D8D2;
  --land-edge: #FFFFFF;
  --land-edge-width: 0.5;
  --border: #94948C;
  --border-width: 0.75;
  --border-dash: none;
  --accent: #C2482F;
  --accent-edge: #FFFFFF;
  --bin-1: #EDEDE8;
  --bin-2: #C6CFC5;
  --bin-3: #9CAFA3;
  --bin-4: #6E857A;
  --bin-5: #435850;
  --fill-1: #B9C7B4;
  --fill-2: #DFCBA8;
  --fill-3: #A9BECF;
  --fill-4: #D3AFB4;
  --fill-5: #C9C49A;
  --fill-6: #B6ADC6;
  --prism-side: #29352F;
  --accent-side: #8A3320;
  --place: #2B2B29;
  --ink: #2B2B29;
  --ink-muted: #80807A;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --label-size: 13;
  --place-label-size: 11;
  --label-track: 0;
  --label-weight: 500;
  --label-advance: 0.58;
  --label-halo: #FFFFFF;
  --label-halo-width: 2.4;

  --stripe: #6E6E68;
  --stripe-width: 1.6;
  --water: #8FB0C4;
  --water-width: 1.1;
  --graticule: #C9C9C3;
  --graticule-width: 0.4;
  --equator: #A8A8A0;
  --desert: #E8DFC4;
  --forest: #B9C9B0;
  --mountain: #CFC6B6;
  --glacier: #F2F4F5;
  --sea-ink: #7E96A6;
  --road: #B08A3E;
  --neighbour: #F0F0EE;
  --anno: #8E2F1C;
  --anno-ink: #FFFFFF;
  --pressure-low: #B8412B;
  --pressure-high: #2F6FA8;
  --pin-size: 7;
  --furniture-ink: #80807A;`,
  dark: `
  --land: #2E3134;
  --sea: #16242C;
  --land-edge: #16181A;
  --border: #6E747A;
  --accent: #E2694A;
  --accent-edge: #16181A;
  --bin-1: #24272A;
  --bin-2: #2F3A36;
  --bin-3: #3F5049;
  --bin-4: #55685E;
  --bin-5: #7A9184;
  --fill-1: #364039;
  --fill-2: #453D2F;
  --fill-3: #2F3B45;
  --fill-4: #443338;
  --fill-5: #41402E;
  --fill-6: #383345;
  --prism-side: #14181A;
  --accent-side: #9C4832;
  --place: #DCDCD6;
  --ink: #DCDCD6;
  --ink-muted: #85898D;
  --label-halo: #1A1D1F;

  --stripe: #9A9A94;
  --water: #4C7A96;
  /* Cover authored for the dark land; the light values are far too bright on it. */
  --desert: #46473C;
  --mountain: #3D4246;
  --glacier: #5C6970;
  --neighbour: #202325;
  --anno: #F79A78;
  --anno-ink: #16181A;
  --pressure-low: #F08A5D;
  --pressure-high: #5FA3D9;
  --furniture-ink: #85898D;`,
});
