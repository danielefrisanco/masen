/**
 * Write the bundled themes, palettes and typefaces out as real `.css` files.
 *
 * They are authored as TypeScript strings so that `masen()` stays isomorphic —
 * reading a stylesheet from disk at call time would make the library Node-only,
 * which is exactly the constraint Phase 4 is working to remove. But consumers
 * still want the plain files: to link one in a page, to fork one as a starting
 * point, or to let a bundler handle it. So the strings are the source and these
 * files are generated from them, rather than the two drifting apart.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { THEMES, PALETTES, TYPEFACES } from "../dist/index.js";

const BANNER = "/* Generated from src/. Edit the source, not this file. */\n";

let count = 0;
for (const [directory, table] of [
  ["themes", THEMES],
  ["palettes", PALETTES],
  ["typefaces", TYPEFACES],
]) {
  await mkdir(directory, { recursive: true });
  for (const [name, css] of Object.entries(table)) {
    await writeFile(`${directory}/${name}.css`, `${BANNER}${css}\n`, "utf8");
    console.log(`  ${directory}/${name}.css`);
    count += 1;
  }
}
console.log(`${count} stylesheets written`);
