/**
 * Prove the built site is complete before it is deployed.
 *
 * Run after `npm run tool:build`, and before the artifact is uploaded.
 *
 * The failure this exists for has a nasty shape: the tool loads, the form
 * works, and then a *later* request — for a file only fetched when someone
 * ticks a layer — comes back 404. Nothing at build time complains, because
 * Vite emitted a reference and a reference is all it promised. Whether the file
 * arrived is a separate question, and it is the one nobody asks until a person
 * is looking at a broken page.
 *
 * So: every asset the page names must exist, and the map data must be among
 * them. `.nojekyll` is checked too, because one of Vite's own chunk names
 * begins with a double underscore and Jekyll deletes those without a word.
 */
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const OUT = new URL("../tool/dist/", import.meta.url);
const root = OUT.pathname;

const index = await readFile(join(root, "index.html"), "utf8").catch(() => {
  throw new Error("masen: tool/dist/index.html is missing — run `npm run tool:build` first");
});

// Everything the page asks the browser to go and get.
const referenced = [...index.matchAll(/(?:src|href)="(\/masen\/[^"]+)"/g)].map(
  (match) => (match[1] ?? "").replace("/masen/", ""),
);
assert.ok(referenced.length > 0, "index.html references no assets at all");

for (const path of referenced) {
  await stat(join(root, path)).catch(() => {
    throw new Error(`masen: index.html points at ${path}, which was not built`);
  });
  console.log(`  ✓ ${path}`);
}

/**
 * The data is not referenced by the HTML — it is fetched by the library at run
 * time, from URLs Vite rewrote inside the bundle. So it cannot be checked the
 * way the scripts and stylesheets are; it has to be looked for by name.
 *
 * Every tier of every file, because a missing one does not break the page, it
 * breaks one checkbox: `cover-50m` going astray leaves a tool where mountains
 * work at 110m and fail at 50m, which is the kind of bug that reaches a user.
 */
const assets = await readdir(join(root, "assets"));
const WANTED = ["110m", "50m", "ocean-110m", "ocean-50m", "cover-110m", "cover-50m"];
for (const name of WANTED) {
  const found = assets.find((file) => new RegExp(`^${name}-[A-Za-z0-9_-]+\\.json$`).test(file));
  assert.ok(found, `masen: no ${name}.json in the build — did \`npm run build:data\` run?`);
  const { size } = await stat(join(root, "assets", found));
  // A truncated copy is worse than a missing one: it 200s and then fails to
  // parse, three modules deep.
  assert.ok(size > 10_000, `masen: ${found} is only ${size} bytes, which cannot be right`);
  console.log(`  ✓ assets/${found}  ${(size / 1024).toFixed(0)} KB`);
}

/**
 * The gallery, which the header links to and this script would otherwise miss.
 *
 * The link is `<a href="./gallery.html">` and the sweep above only sees the
 * asset URLs Vite rewrote — Vite does not touch anchors, which is the whole
 * reason a relative link works here and also the reason nothing else would
 * notice it going missing. A broken link out of the tool's own header is
 * exactly the shape of failure this file exists for.
 *
 * The size floor is generous but not nothing: an empty snapshot directory
 * still produces a valid page, headings and all, with no maps on it.
 */
const gallery = await stat(join(root, "gallery.html")).catch(() => {
  throw new Error(
    "masen: the header links to gallery.html and the build does not contain one — " +
      "`npm run gallery -- tool/dist/gallery.html` is part of `tool:build`",
  );
});
assert.ok(
  gallery.size > 500_000,
  `masen: gallery.html is only ${(gallery.size / 1024).toFixed(0)} KB, which means it was ` +
    "built from an empty test/__snapshots__/gallery",
);
console.log(`  ✓ gallery.html  ${(gallery.size / 1024 / 1024).toFixed(1)} MB`);

await stat(join(root, ".nojekyll")).catch(() => {
  throw new Error(
    "masen: no .nojekyll in the build. Jekyll silently deletes files whose names begin with " +
      "an underscore, and Vite names one of its chunks `__vite-browser-external-<hash>.js`.",
  );
});
console.log("  ✓ .nojekyll");

console.log("the built site is complete");
