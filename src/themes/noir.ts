import { compose } from "./structure.js";

/**
 * Dark ground, fine linework, one warm accent.
 *
 * Land is a slate against a near-black sea and the border network is what
 * carries the map — restraint rather than absence, which is the correction
 * this theme needed. It was first written with land ten values off the sea in
 * every channel, on the theory that a dark editorial map should whisper. At
 * that separation the continents were not quiet, they were gone: on a world
 * map the coastline hairline was the only evidence there was land at all. The
 * fills below step in even increments from the land, so a political map made
 * of them still reads as one family.
 *
 * Dark-first, so its dark block is small and honest. There is no inversion to
 * make: the ground drops to near-black for a reader already in the dark and
 * the linework steps back a little to match, which is all a theme built for
 * dark has left to do.
 */
export const noir = compose({
  tokens: `
  --bg: #0B0E11;
  --sea: #0B0E11;
  --land: #232B33;
  --land-edge: #3E4A55;
  --land-edge-width: 0.6;
  --border: #7C8894;
  --border-width: 0.7;
  --border-dash: none;
  --accent: #D8A657;
  --accent-edge: #0B0E11;
  --bin-1: #262E36;
  --bin-2: #3D3826;
  --bin-3: #625432;
  --bin-4: #96793C;
  --bin-5: #D8A657;
  --fill-1: #232B33;
  --fill-2: #2E3942;
  --fill-3: #394650;
  --fill-4: #44525E;
  --fill-5: #4F5F6C;
  --fill-6: #5A6C7A;
  --prism-side: #10161B;
  --accent-side: #8F6D38;
  --place: #E4E7EA;
  --ink: #E4E7EA;
  --ink-muted: #7A848F;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --label-size: 13;
  --place-label-size: 11;
  --label-track: 0.3;
  --label-weight: 500;
  --label-advance: 0.58;
  --label-halo: #0B0E11;
  --label-halo-width: 2.6;

  --stripe: #6C7681;
  --stripe-width: 1.2;
  --water: #3A6379;
  --water-width: 0.9;
  --graticule: #232A31;
  --graticule-width: 0.4;
  --equator: #39434C;
  --desert: #2A2620;
  --forest: #1E2A22;
  --mountain: #262A2E;
  --glacier: #2E363C;
  --sea-ink: #5E7386;
  --road: #8A6A33;
  --neighbour: #171E25;
  --anno: #E5762B;
  --anno-ink: #0B0E11;
  --pressure-low: #E5762B;
  --pressure-high: #4D9BE0;
  --pin-size: 7;
  --furniture-ink: #7A848F;`,
  dark: `
  --bg: #050709;
  --sea: #050709;
  --land: #1B222A;
  --land-edge: #333E48;
  --border: #6B7681;
  --place: #D6DADE;
  --ink: #D6DADE;
  --label-halo: #050709;
  --neighbour: #10161C;
  --prism-side: #0A0F13;
  --accent-side: #7C5E30;
  --stripe: #5C6570;`,
});
