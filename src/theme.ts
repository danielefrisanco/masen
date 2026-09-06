import { hashCss, parseCss, scopeCss, serializeCss, type CssNode } from "./css.js";
import { atlas } from "./themes/atlas.js";
import { blueprint } from "./themes/blueprint.js";
import { contrast } from "./themes/contrast.js";
import { minimal } from "./themes/minimal.js";
import { noir } from "./themes/noir.js";
import { dusk } from "./palettes/dusk.js";
import { patina } from "./palettes/patina.js";
import { moss } from "./palettes/moss.js";
import { sand } from "./palettes/sand.js";
import { slate } from "./palettes/slate.js";
import {
  condensed,
  grotesk,
  humanist,
  mono,
  serif,
} from "./typefaces/index.js";

// Insertion order is the order they are documented and emitted in. `minimal`
// first because it is the default; the rest from quietest to loudest.
export const THEMES: Readonly<Record<string, string>> = Object.freeze({
  minimal,
  atlas,
  noir,
  blueprint,
  contrast,
});
export const PALETTES: Readonly<Record<string, string>> = Object.freeze({
  sand,
  slate,
  moss,
  patina,
  dusk,
});
export const TYPEFACES: Readonly<Record<string, string>> = Object.freeze({
  humanist,
  serif,
  grotesk,
  condensed,
  mono,
});

export const THEME_NAMES: readonly string[] = Object.freeze(Object.keys(THEMES));
export const PALETTE_NAMES: readonly string[] = Object.freeze(Object.keys(PALETTES));
export const TYPEFACE_NAMES: readonly string[] = Object.freeze(Object.keys(TYPEFACES));

export interface ResolvedTheme {
  /** The stylesheet, already scoped. Empty when nothing was themed. */
  readonly css: string;
  /** Extra class for the root element, or `null` when there is no theme. */
  readonly scope: string | null;
  readonly nodes: readonly CssNode[];
}

export const EMPTY_THEME: ResolvedTheme = { css: "", scope: null, nodes: [] };

/**
 * A stylesheet cannot contain `</style` — the HTML parser would close the
 * element early and spill the rest of the CSS into the page as text. Themes are
 * data from the caller, so this is checked rather than assumed.
 */
function assertEmbeddable(css: string, source: string): void {
  if (/<\/\s*style/i.test(css) || css.includes("<!--")) {
    throw new Error(
      `masen: ${source} contains a sequence that cannot be embedded in a <style> element ` +
        `("</style" or "<!--"). Remove it, or apply the stylesheet externally.`,
    );
  }
}

type Kind = "theme" | "palette" | "typeface";

const TABLES: Readonly<Record<Kind, Readonly<Record<string, string>>>> = {
  theme: THEMES,
  palette: PALETTES,
  typeface: TYPEFACES,
};

async function readStylesheet(reference: string, kind: Kind): Promise<string> {
  const table = TABLES[kind];
  const bundled = table[reference];
  if (bundled !== undefined) return bundled;

  // A stylesheet, passed inline.
  if (reference.includes("{")) return reference;

  if (reference.endsWith(".css")) {
    const { readFile } = await import("node:fs/promises");
    try {
      return await readFile(reference, "utf8");
    } catch {
      throw new Error(`masen: could not read ${kind} stylesheet "${reference}"`);
    }
  }

  const known = Object.keys(table).join(", ");
  throw new Error(
    `masen: unknown ${kind} "${reference}". ` +
      `Expected one of: ${known} — or a path to a .css file, or a stylesheet.`,
  );
}

/** Token overrides become one more rule on the root, so the cascade merges them. */
function tokensToCss(tokens: Readonly<Record<string, string>>): string {
  const declarations = Object.entries(tokens)
    .map(([name, value]) => {
      const property = name.startsWith("--") ? name : `--${name}`;
      return `  ${property}: ${value};`;
    })
    .join("\n");
  return declarations === "" ? "" : `.mp {\n${declarations}\n}`;
}

export interface ThemeRequest {
  readonly theme?: string;
  readonly palette?: string;
  readonly typeface?: string;
  readonly tokens?: Readonly<Record<string, string>>;
}

/**
 * Resolve theme, palette and overrides into one scoped stylesheet.
 *
 * Order is the entire implementation: theme, then palette, then typeface, then
 * overrides. Later declarations win, so a palette needs no merge logic to beat
 * a theme and an override needs none to beat either — the cascade already does
 * it. Palette and typeface never meet, because one carries only colour and the
 * other only type, which is what lets them be chosen independently.
 */
export async function resolveTheme(request: ThemeRequest): Promise<ResolvedTheme> {
  const parts: string[] = [];

  if (request.theme !== undefined) {
    const css = await readStylesheet(request.theme, "theme");
    assertEmbeddable(css, `theme "${request.theme}"`);
    parts.push(css);
  }
  if (request.palette !== undefined) {
    const css = await readStylesheet(request.palette, "palette");
    assertEmbeddable(css, `palette "${request.palette}"`);
    parts.push(css);
  }
  if (request.typeface !== undefined) {
    const css = await readStylesheet(request.typeface, "typeface");
    assertEmbeddable(css, `typeface "${request.typeface}"`);
    parts.push(css);
  }
  if (request.tokens !== undefined) {
    const css = tokensToCss(request.tokens);
    assertEmbeddable(css, "token overrides");
    if (css !== "") parts.push(css);
  }

  if (parts.length === 0) return EMPTY_THEME;

  const combined = parts.join("\n\n");
  // Scoping from a hash of the stylesheet keeps output deterministic: the same
  // theme always yields the same class, so snapshots stay byte-identical, and
  // two different themes on one page cannot collide.
  const scope = `mp-t-${hashCss(combined)}`;
  const nodes = scopeCss(parseCss(combined), scope);

  return { css: serializeCss(nodes), scope, nodes };
}
