/**
 * What to export, at what size, and what to call it.
 *
 * Deliberately free of the DOM, and not for tidiness. The library's own
 * `tsconfig` compiles `src` and `test` with `lib: ["ES2022"]` and no DOM at
 * all — which is right, because a map library that can only run in a browser is
 * a different product. A test that reaches into a module holding `document`
 * drags that module into the library's typecheck, where every browser global is
 * an error. So the decisions live here, where they can be tested, and the
 * browser work lives in `raster.ts`, where it cannot be.
 *
 * **Size belongs to the export, not to the screen.** A map re-renders at any
 * size because it is geometry rather than pixels, so a preview sized to a
 * browser column and a poster at 4000 pixels are the same document twice —
 * which makes offering both nearly free, and makes not offering it a waste of
 * the one advantage vector has. It is also why the multiplier here is the
 * *raster's* alone: an SVG has no size, and naming one `1920x1240` would be a
 * claim about it that is not true.
 */

/** How far past the canvas size a raster may go before a browser refuses it. */
const MAX_PIXELS = 8000;

/**
 * And how much of it there may be in total.
 *
 * A side limit is not enough on its own: 8000 × 8000 is inside it on both axes
 * and is 64 megapixels, which is a quarter of a gigabyte of RGBA before the PNG
 * encoder has been asked for anything. Forty megapixels is a 40-inch print at
 * 150 dpi, which is past what this tool is for.
 */
const MAX_AREA = 40e6;

export interface ExportSize {
  /** The multiplier, as it goes in the file name. */
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

/**
 * The sizes this canvas can be exported at.
 *
 * Capped rather than clamped: a browser canvas has a hard limit on its
 * dimensions and a softer one on its area, and past either the result is not a
 * small PNG, it is a blank one. A size that cannot be produced is better left
 * out of the menu than offered and then failed.
 */
export function exportSizes(width: number, height: number): readonly ExportSize[] {
  const sizes: ExportSize[] = [];
  for (const scale of [1, 2, 3, 4]) {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    // 1× is always offered: refusing it would be refusing to save the map the
    // tool has just drawn, which is not a limit anyone would accept.
    if (scale > 1 && (w > MAX_PIXELS || h > MAX_PIXELS || w * h > MAX_AREA)) continue;
    sizes.push({ scale, width: w, height: h, label: `${scale}× — ${w} × ${h}` });
  }
  return sizes;
}

/**
 * What to call the file.
 *
 * The region and the size, because the two things somebody wants to tell two
 * downloads apart by are what it is of and how big it is. A list of ISO codes
 * is a legal region and an illegal file name, so anything that is not a letter,
 * a digit or a dash becomes a dash.
 */
export function fileName(region: string, size: ExportSize, extension: string): string {
  const slug = region
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `masen-${slug === "" ? "map" : slug}-${size.width}x${size.height}.${extension}`;
}
