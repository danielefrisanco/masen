/**
 * Warm greens on a stone ground, the colouring of a walking map. The sea is a
 * grey-green rather than a blue, which is what keeps the land's greens from
 * reading as water — the mistake that once lost Croatia into the Adriatic on
 * the atlas theme.
 */
export const moss = `
.mp {
  --bg: #D9DCD0;
  --sea: #BACFD5;
  --land: #EDEBDD;
  --land-edge: #B7B8A4;
  --border: #5E6350;
  --accent: #A8582C;
  --accent-edge: #EDEBDD;
  --bin-1: #F1EFE2;
  --bin-2: #D6DCBE;
  --bin-3: #AFC195;
  --bin-4: #7E9A6C;
  --bin-5: #4C6B45;
  --fill-1: #E3E4C8;
  --fill-2: #C9D9C2;
  --fill-3: #EBD9BE;
  --fill-4: #D8C9D2;
  --fill-5: #E7CFC0;
  --fill-6: #C2D2D6;
  --prism-side: #3A4232;
  --accent-side: #74381A;
  --place: #33372A;
  --ink: #33372A;
  --ink-muted: #6E735E;
  --label-halo: #EDEBDD;

  --stripe: #6E735E;
  --water: #6E93A0;
  --graticule: #C3C6B6;
  --equator: #9BA08A;
  --desert: #E8DDBC;
  --forest: #BCCFAE;
  --mountain: #D5CDB8;
  --glacier: #EEF3F2;
  --sea-ink: #62808C;
  --road: #A8582C;
  --neighbour: #E2E1D2;
  --anno: #71361A;
  --anno-ink: #EDEBDD;
  --pressure-low: #9C4A26;
  --pressure-high: #2F5F80;
  --furniture-ink: #6E735E;
}
`.trim();
