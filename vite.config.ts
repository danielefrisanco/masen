import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATA = resolve(here, "data");

/**
 * The base path, and the trap it exists to spring early.
 *
 * A GitHub *project* site is served from `/masen/`, not from `/`. That one
 * segment is the whole reason 09b deploys a page that does almost nothing: if
 * the base is wrong the map does not fail loudly — it asks for a file, gets the
 * 404 page, and reports a JSON parse error from three modules down.
 *
 * The dev server runs on the same base for the same reason. A local site served
 * from `/` and a deployed one served from `/masen/` are not the same site,
 * and the difference should not first appear in an action log.
 */
const BASE = "/masen/";

/**
 * Check that there is data to serve, and get out of the way.
 *
 * This started as a plugin that copied `data/` next to the bundle, on the
 * reasoning that the library resolves every file as `../data/<name>.json`
 * against `import.meta.url`. **That was unnecessary, and the build said so:**
 * Vite recognises `new URL(\`../data/${name}.json\`, import.meta.url)` even with
 * a variable in it, globs the directory at build time, and rewrites the whole
 * construction into a lookup of hashed asset URLs. The copy was three and a
 * half megabytes of duplicate.
 *
 * So the plugin's job is the part Vite cannot do: say something useful when
 * `data/` is missing. Vite's glob over an empty directory produces an empty
 * lookup and no error at all — the failure surfaces much later, in a browser,
 * as `undefined` where a URL should be.
 *
 * Worth knowing before swapping bundlers: this rewriting is a Vite behaviour,
 * not a guarantee. The library asks for a plain relative URL and works without
 * it — that is what `readData` is for — but a bundler that leaves the URL alone
 * needs `data/` deployed beside the bundle.
 */
function dataPresent(): Plugin {
  return {
    name: "masen-data-present",

    /**
     * Emit `.nojekyll`, because one of our own filenames is a Jekyll landmine.
     *
     * If GitHub Pages ever processes this output with Jekyll — which it does
     * whenever the source is a branch rather than an action — Jekyll silently
     * drops every file and directory whose name begins with an underscore. Vite
     * names one of its chunks `__vite-browser-external-<hash>.js`, and that is
     * the module standing in for `node:fs/promises`. It would go missing, the
     * bundle would fail to load, and nothing anywhere would say why.
     *
     * An empty `.nojekyll` at the root turns the whole pass off. It costs
     * nothing when the source is already an action.
     */
    generateBundle() {
      this.emitFile({ type: "asset", fileName: ".nojekyll", source: "" });
    },
    async buildStart() {
      let names: string[] = [];
      try {
        names = (await readdir(DATA)).filter((name) => name.endsWith(".json"));
      } catch {
        // Falls through to the same message: an absent directory and an empty
        // one are the same problem with the same fix.
      }
      if (names.length === 0) {
        this.error(
          "masen: data/ has no map data in it. Run `npm run build:data` before building the tool — " +
            "Vite globs that directory at build time, and an empty glob ships a tool that cannot draw anything.",
        );
      }
    },
  };
}

/**
 * The version the page was built from, and where to read what it changed.
 *
 * Read from `package.json` at build time rather than typed into the page, so
 * it cannot drift from the release: the reason to show it at all is to match a
 * feedback message — or a screenshot — to the `masen-map` that drew the map,
 * and to see whether the deploy has caught up with npm.
 *
 * The link goes to the version's own CHANGELOG entry, not to a GitHub Release:
 * the site deploys on merge, and the release is created by hand afterwards, so
 * for a while the release page does not exist and the link would 404. The
 * changelog entry is on `main` by the time the page is.
 *
 * **A version with no changelog entry fails the build**, because the anchor
 * would point at nothing and nobody would notice until someone clicked it.
 */
function version(): Plugin {
  const pkg = JSON.parse(readFileSync(resolve(here, "package.json"), "utf8")) as { version: string };
  const changelog = readFileSync(resolve(here, "CHANGELOG.md"), "utf8");
  const heading = changelog
    .split("\n")
    .find((line) => line.startsWith(`## [${pkg.version}]`));
  // GitHub's heading anchor: lowercased, punctuation dropped, each space a
  // hyphen — "## [0.20.1] — 2026-11-08" becomes "0201--2026-11-08".
  const anchor = heading
    ?.slice(3)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
  const link = `https://github.com/danielefrisanco/masen/blob/main/CHANGELOG.md#${anchor ?? ""}`;

  return {
    name: "masen-version",
    buildStart() {
      if (heading === undefined) {
        this.error(
          `masen: package.json says ${pkg.version} and CHANGELOG.md has no "## [${pkg.version}]" entry — ` +
            "the tool links its version to that entry.",
        );
      }
    },
    config: () => ({ define: { __MASEN_VERSION__: JSON.stringify(pkg.version) } }),
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html.replaceAll("%MASEN_VERSION%", pkg.version).replaceAll("%MASEN_CHANGELOG%", link),
    },
  };
}

export default defineConfig({
  root: resolve(here, "tool"),
  base: BASE,
  plugins: [dataPresent(), version()],
  build: {
    outDir: resolve(here, "tool/dist"),
    emptyOutDir: true,
    // The weight here is map data, fetched on demand rather than parsed at
    // load. A chunk-size warning would only ever be about d3-geo and topojson,
    // which are the library and are not going anywhere.
    chunkSizeWarningLimit: 800,
  },
});
