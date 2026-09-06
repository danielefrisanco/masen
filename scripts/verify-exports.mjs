/**
 * Proves the built package imports cleanly under both module systems.
 * Run after `npm run build`.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const esm = await import("../dist/index.js");
const cjs = require("../dist/index.cjs");

for (const [label, mod] of [
  ["esm", esm],
  ["cjs", cjs],
]) {
  assert.equal(typeof mod.masen, "function", `${label}: named export missing`);

  const map = await mod.masen({ region: "west-europe", detail: "110m", size: [640, 480] });
  assert.ok(map.svg.startsWith("<svg"), `${label}: no svg emitted`);
  assert.ok(map.svg.includes("<path"), `${label}: no geometry emitted`);
  assert.ok(Array.isArray(map.project([2.35, 48.86])), `${label}: project() broken`);
  assert.ok(map.svg.includes('viewBox="0 0 640 480"'), `${label}: options ignored`);
  assert.equal(typeof map.project, "function", `${label}: project() missing`);
  assert.equal(typeof map.toFile, "function", `${label}: toFile() missing`);

  console.log(`  ✓ ${label}`);
}

// The exports map promises `masen/themes/minimal.css`. A promise that
// resolves to a missing file is worse than not making it.
const { readFile } = await import("node:fs/promises");
for (const [directory, table] of [
  ["themes", esm.THEMES],
  ["palettes", esm.PALETTES],
  ["typefaces", esm.TYPEFACES],
]) {
  for (const name of Object.keys(table)) {
    const path = new URL(`../${directory}/${name}.css`, import.meta.url);
    const css = await readFile(path, "utf8");
    assert.ok(css.includes(".mp"), `${directory}/${name}.css is not a map stylesheet`);
    console.log(`  ✓ ${directory}/${name}.css`);
  }
}

/**
 * And that the shipped bundle can be built for a browser at all.
 *
 * This is checked here rather than in the test suite because it is a claim
 * about `dist/`, not about `src/` — and `dist/` is what a bundler will see.
 *
 * The plan said the library's `node:fs` imports were "lazy, on paths the tool
 * never takes, so a bundler drops all three". **That was never true and this is
 * how it was found.** A bundler does not drop a dynamic import — it has to
 * resolve it, and esbuild targeting a browser failed outright with "Could not
 * resolve". Two things were wrong underneath: tsup was stripping the `node:`
 * prefix, which is the only thing that tells a bundler the name is a builtin
 * rather than a package to go and find, and nothing told it what to do with the
 * builtin once named. The prefix is kept now, and the `browser` field maps it
 * to an empty module — so a browser build resolves it, never executes it
 * (`readData` branches on the URL protocol first), and Node is untouched.
 */
const { build } = await import("esbuild");
const bundled = await build({
  entryPoints: [new URL("../dist/index.js", import.meta.url).pathname],
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const browser = bundled.outputFiles[0].text;
// `(disabled):node:fs/promises` is esbuild's own marker for a module the
// `browser` field stubbed out, so its presence is the proof rather than a
// failure. What must not appear is a live import of one.
const live = browser.match(/(?:import|require)\(\s*["']node:[^"']+["']\s*\)/g) ?? [];
assert.deepEqual(live, [], `browser bundle still imports a Node builtin: ${live.join(", ")}`);
assert.ok(browser.includes("(disabled):node:fs/promises"), "the fs branch was not stubbed — did the browser field move?");
console.log(`  ✓ browser bundle  ${(browser.length / 1024).toFixed(0)} KB, no live node: import`);

console.log("both module systems ok");
