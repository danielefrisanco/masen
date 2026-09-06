import { checkAnchor, place, placeBox } from "./furniture.js";
import { el, text as textNode, type SvgNode } from "./svg.js";
import type { Size, Watermark } from "./types.js";

/**
 * A watermark: a wordmark or a logo, stamped on the canvas.
 *
 * **This is attribution, not protection.** A watermark on an SVG is a node in a
 * file the reader can open, select and delete — it marks provenance and it
 * cannot enforce anything. Nothing here is a rights mechanism, and a caller who
 * needs one needs something other than a vector graphic. It exists for the same
 * reason `credit` does: a map that leaves a browser as a file has no
 * surrounding page to carry a mark, so the mark has to come out of the
 * generator or it does not exist.
 *
 * Placed in `.mp-furniture` like the rest, which puts it above every geographic
 * layer. A wordmark under the map would be a texture; over it, it is a stamp.
 */

/** How big a wordmark is by default, as a fraction of the shorter side. */
const TEXT_FRACTION = 0.1;

/** The box a logo is fitted inside when the caller does not size one. */
const IMAGE_BOX = 120;

/**
 * What a file extension means, for the Node path that embeds a logo.
 *
 * The list is short on purpose: these are the formats an SVG renderer can be
 * relied on to decode from a data URI. A format outside it is refused by name
 * rather than embedded and left to fail silently at read time.
 */
const MIME: Readonly<Record<string, string>> = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
});

/**
 * Turn a caller's `image` into something that survives the file being moved.
 *
 * A path is read and embedded. The whole point of this library's output is that
 * one file is the whole map — a watermark that referenced a logo on disk would
 * make the SVG stop working the moment it was emailed to anyone.
 */
async function embed(image: string): Promise<string> {
  if (image.startsWith("data:")) return image;

  const dot = image.lastIndexOf(".");
  const extension = dot === -1 ? "" : image.slice(dot).toLowerCase();
  const mime = MIME[extension];
  if (mime === undefined) {
    throw new Error(
      `masen: watermark.image "${image}" is neither a data: URI nor a path ` +
        `ending in ${Object.keys(MIME).join(", ")}`,
    );
  }

  // Imported lazily so browser bundles never pull in node:fs. In a browser the
  // caller passes a data URI, which is handled above and never reaches here.
  const { readFile } = await import("node:fs/promises");
  let bytes: Buffer;
  try {
    bytes = await readFile(image);
  } catch {
    throw new Error(`masen: could not read watermark.image "${image}"`);
  }
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/**
 * Build the watermark layer.
 *
 * Text and image are exclusive rather than composable. A logo above a wordmark
 * is a lockup, and a lockup has its own spacing, alignment and proportions that
 * only the person who owns the mark can decide — supplying one here would be
 * guessing at someone else's brand. A caller who has both can pass the lockup
 * as one image.
 */
export async function watermarkLayer(
  watermark: Watermark,
  size: Size,
  inset: number,
): Promise<SvgNode[]> {
  const { text, image } = watermark;
  if (text !== undefined && image !== undefined) {
    throw new Error("masen: watermark takes text or image, not both");
  }
  if (text === undefined && image === undefined) {
    throw new Error("masen: watermark needs text or image");
  }
  const anchor = checkAnchor(watermark.anchor ?? "centre", "watermark.anchor");

  if (text !== undefined) {
    if (text === "") return [];
    const fontSize = watermark.size ?? Math.round(Math.min(size[0], size[1]) * TEXT_FRACTION);
    const at = place(size, anchor, inset);
    return [
      el(
        "text",
        {
          class: "mp-watermark",
          "data-anchor": anchor,
          x: at.x,
          y: at.y,
          "text-anchor": at.textAnchor,
          "dominant-baseline": at.baseline,
          // A presentation attribute, so a theme that wants a different size
          // still wins — the geometry only has to pick a number, not own it.
          "font-size": fontSize,
        },
        [textNode(text)],
      ),
    ];
  }

  const width = watermark.width ?? IMAGE_BOX;
  const height = watermark.height ?? width;
  const [x, y] = placeBox(size, anchor, inset, [width, height]);
  return [
    el("image", {
      class: "mp-watermark",
      "data-anchor": anchor,
      x,
      y,
      width,
      height,
      // The box bounds the logo; it never stretches it. This is what lets the
      // caller size a watermark without the library knowing the image's aspect
      // ratio, which it has no way to measure outside a browser — the same
      // wall `--label-advance` exists to get around.
      preserveAspectRatio: "xMidYMid meet",
      href: await embed(image as string),
    }),
  ];
}
