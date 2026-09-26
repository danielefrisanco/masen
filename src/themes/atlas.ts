import { compose } from "./structure.js";

/**
 * A printed-atlas look: warm paper land on a cold sea, borders heavier than
 * coastlines and dashed the way an administrative boundary is drawn on paper.
 * Its political fills are the traditional plate tints — the pale yellows,
 * greens and lilacs a school atlas used, chosen to sit under black linework
 * without competing with it. None of them is a pale blue, deliberately: on a
 * map with a sea this colour, a blue country reads as water, and Croatia
 * disappeared into the Adriatic until the tint was changed to lilac.
 */
export const atlas = compose({
  tokens: `
  --bg: #A8C0CC;
  --sea: #A8C0CC;
  --land: #F2EAD8;
  --land-edge: #C9BFA6;
  --land-edge-width: 0.8;
  --border: #6E6152;
  --border-width: 1.4;
  --border-dash: 5 2.5;
  --accent: #8C3B4A;
  --accent-edge: #F2EAD8;
  --bin-1: #F7EFDC;
  --bin-2: #E4CDA2;
  --bin-3: #C9A468;
  --bin-4: #A2733C;
  --bin-5: #6E4520;
  --fill-1: #EDDBA6;
  --fill-2: #C2D6AE;
  --fill-3: #E0B0A0;
  --fill-4: #C6BCDC;
  --fill-5: #DED2BE;
  --fill-6: #93BFA8;
  --prism-side: #382A16;
  --accent-side: #5E2731;
  --place: #3A342A;
  --ink: #3A342A;
  --ink-muted: #7A7263;
  --font: ui-serif, Georgia, "Times New Roman", serif;
  --label-size: 13;
  --place-label-size: 11;
  --label-track: 0.2;
  --label-weight: 400;
  --label-advance: 0.58;
  --label-halo: #F2EAD8;
  --label-halo-width: 2.4;

  --stripe: #6E6152;
  --stripe-width: 1.8;
  --water: #7FA0B4;
  --water-width: 1.1;
  --graticule: #B9AE97;
  --graticule-width: 0.4;
  --equator: #8E8069;
  --desert: #EFE0B4;
  --forest: #C3D2AE;
  --mountain: #D6C6A6;
  --glacier: #EDF2F4;
  --sea-ink: #5E7C90;
  --road: #B5462F;
  --neighbour: #E6DEC9;
  --anno: #5E2230;
  --anno-ink: #F2EAD8;
  --pressure-low: #A63A3A;
  --pressure-high: #2E5F8F;
  --pin-size: 7;
  --furniture-ink: #7A7263;`,
  dark: `
  --bg: #101D26;
  --sea: #101D26;
  --land: #2C2A24;
  --land-edge: #4A4437;
  --border: #938872;
  --accent: #B4525F;
  --accent-edge: #101D26;
  --bin-1: #2E2A21;
  --bin-2: #453C2A;
  --bin-3: #5F5034;
  --bin-4: #7C673F;
  --bin-5: #A5874F;
  --fill-1: #4A4127;
  --fill-2: #33422F;
  --fill-3: #4C332C;
  --fill-4: #2B3E4B;
  --fill-5: #40334A;
  --fill-6: #4E3F25;
  --prism-side: #15140F;
  --accent-side: #7A3742;
  --place: #E8E0CC;
  --ink: #E8E0CC;
  --ink-muted: #948B78;
  --label-halo: #1A1812;

  --stripe: #A2977F;
  --water: #3E6C86;
  /*
   * Land cover, authored for the dark ground rather than inherited from the
   * light block. The light values are a cream desert and a near-white glacier,
   * which over a #2C2A24 land turn the Sahara into a lamp — the fifth defect of
   * exactly this shape in this project, and the first one caught by rendering a
   * token the same week it went live rather than years later.
   */
  --desert: #48412F;
  --mountain: #3C3B34;
  --glacier: #5A6870;
  --sea-ink: #89A6B8;
  --neighbour: #1B2A33;
  --anno: #D9848F;
  --anno-ink: #101D26;
  --pressure-low: #E07A85;
  --pressure-high: #6AA6D6;
  --furniture-ink: #948B78;`,
});
