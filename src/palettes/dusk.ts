/**
 * A palette is only colour. It carries no structure, so it can be laid over
 * any theme — the line weights, dash patterns and type of the theme survive,
 * and only the hues change. That is the whole point of naming tokens by role.
 *
 * It has to cover the whole colour vocabulary, though, not the half of it that
 * was live when it was written. A palette that sets `--land` but not `--bin-3`
 * leaves a choropleth wearing the theme's colours on the palette's ground —
 * which is how a dark palette used to render pale bands on a night sea.
 */
export const dusk = `
.mp {
  --bg: #0E1620;
  --sea: #0E1620;
  --land: #22303F;
  --land-edge: #2E4053;
  --border: #4A5F73;
  --accent: #E0794B;
  --accent-edge: #0E1620;
  --bin-1: #1C2833;
  --bin-2: #2B3F4F;
  --bin-3: #3F5B6B;
  --bin-4: #5A7B87;
  --bin-5: #8AA6AC;
  --fill-1: #22303F;
  --fill-2: #2E3B48;
  --fill-3: #263C46;
  --fill-4: #33343F;
  --fill-5: #1F3A3E;
  --fill-6: #343044;
  --prism-side: #0B1219;
  --accent-side: #93482A;
  --place: #DCE5ED;
  --ink: #DCE5ED;
  --ink-muted: #7B8B9C;
  --label-halo: #0E1620;

  --stripe: #7B8B9C;
  --water: #35607A;
  --graticule: #25323F;
  --equator: #3D5468;
  --desert: #2C2E2A;
  --forest: #1E2E2C;
  --mountain: #28313A;
  --glacier: #3A4C58;
  --sea-ink: #5A7386;
  --road: #C08A4A;
  --neighbour: #17222D;
  --anno: #F2A077;
  --anno-ink: #0E1620;
  --pressure-low: #F2A077;
  --pressure-high: #6FB0E0;
  --furniture-ink: #7B8B9C;
}
`.trim();
