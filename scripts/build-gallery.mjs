/**
 * Build the gallery contact sheet — every committed snapshot on one page.
 *
 * The gallery exists because this project has three times shipped a map that
 * every string assertion passed and no one had looked at. Committing the SVGs
 * only half solves that: a directory of forty-two files is not something anyone
 * opens either. This puts them on one page, in the browser, at a size where a
 * flat choropleth or a black square is obvious at a glance.
 *
 * The page is derived from the files themselves rather than from the test that
 * writes them — the title comes from the root `aria-label`, the shape from the
 * viewBox, and what each map demonstrates is read back off the markup. So the
 * page can never claim a map contains something the file does not.
 *
 * Output is untracked on purpose, the same bargain the plan gets: several
 * megabytes of inline SVG makes a diff nobody can read. It is built rather
 * than stored — by `npm run gallery` locally, and by the Pages workflow, which
 * copies it into `tool/dist/gallery.html` so the published site carries it at
 * `/masen/gallery.html`.
 *
 * That publish is why there is no webfont here any more; the reason is written
 * where the fonts used to be.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";

const DIR = "test/__snapshots__/gallery";
// Default for a person running `npm run gallery` to go and look; the site build
// passes `tool/dist/gallery.html` so the deployed page comes out of this one
// script rather than out of a copy step in a workflow file nobody reads.
const OUT = process.argv[2] ?? "gallery.html";

/** What a map demonstrates, read back off the file rather than off its options. */
const FEATURES = [
  ["neighbours", (s) => s.includes('class="mp-neighbour"')],
  ["choropleth", (s) => s.includes("data-bin=")],
  ["political fill", (s) => s.includes("data-fill=")],
  ["hatching", (s) => s.includes("data-stripe=")],
  ["prism", (s) => s.includes('class="mp-prism')],
  ["highlight", (s) => s.includes("is-highlighted")],
  ["relief", (s) => s.includes("#mp-relief")],
  ["names", (s) => s.includes('data-kind="country"')],
  ["cities", (s) => s.includes('data-kind="place"')],
  ["water", (s) => s.includes('class="mp-water"')],
  ["pins", (s) => s.includes('class="mp-anno mp-pin"')],
  ["callouts", (s) => s.includes('class="mp-anno mp-callout"')],
  ["arrows", (s) => s.includes('class="mp-anno mp-arrow"')],
  ["icons", (s) => s.includes('class="mp-icon"')],
  ["credit", (s) => s.includes('class="mp-credit"')],
];

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const files = (await readdir(DIR)).filter((f) => f.endsWith(".svg")).sort();
const cards = [];

for (const file of files) {
  const slug = file.replace(/\.svg$/, "");
  const raw = await readFile(`${DIR}/${file}`, "utf8");

  // The root aria-label, not the first <title> — every country carries a
  // <title> of its own for hover, and those come later in the document.
  const label = /<svg[^>]*aria-label="([^"]*)"/.exec(raw)?.[1] ?? slug;
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(raw) ?? [, "0", "0"];
  // Detect against the markup with the stylesheet removed. Every bundled theme
  // carries rules for `data-bin`, `data-fill` and `.is-highlighted` whether or
  // not the map uses them, so testing the whole file reports every feature on
  // every map — which is worse than reporting none, because it looks right.
  const drawn = raw.replace(/<style>[\s\S]*?<\/style>/, "");
  const found = FEATURES.filter(([, test]) => test(drawn)).map(([name]) => name);

  // No id rewriting any more. The library namespaces every id it emits by a
  // hash of the map, which is what this script used to have to do by hand —
  // and doing it by hand only ever fixed the gallery, never anyone else's page.
  const svg = raw
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1");

  cards.push(`      <figure class="card" id="${escape(slug)}">
        <div class="plate">${svg}</div>
        <figcaption>
          <h2>${escape(label)}</h2>
          <p class="chips">${found.map((f) => `<span class="chip">${escape(f)}</span>`).join("")}</p>
          <p class="file"><code>${escape(slug)}.svg</code> · ${w}×${h}</p>
        </figcaption>
      </figure>`);
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>masen gallery — ${files.length} maps</title>
<style>
  /*
   * No webfont, and no <link> to one. This page used to load three IBM Plex
   * families from Google Fonts, which was defensible while it was a local file
   * nobody but its author opened. It is published now, beside the tool, on the
   * same domain — and the tool turned Inter down for exactly this reason: the
   * README promises a map that asks nothing of the network, and a sibling page
   * that phones a third party on load breaks that promise in the one place a
   * sceptical reader would check it.
   *
   * The colours are the tool's, for the same reason. Two pages one click apart
   * that look like different authors cost more than a typeface buys.
   */
  :root {
    --ground: #fbfaf8; --panel: #ffffff; --plate: #ffffff;
    --ink: #1c1b19; --ink-soft: #5c574f; --line: #e6e2da; --accent: #f97316;
    --f-head: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --f-body: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --f-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #0f0e0d; --panel: #1b1916; --plate: #ebe8e2;
      --ink: #f3f1ec; --ink-soft: #a8a298; --line: #2c2924; --accent: #f59e0b;
    }
  }
  :root[data-theme="dark"] {
    --ground: #0f0e0d; --panel: #1b1916; --plate: #ebe8e2;
    --ink: #f3f1ec; --ink-soft: #a8a298; --line: #2c2924; --accent: #f59e0b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: clamp(1.5rem, 4vw, 3.5rem) clamp(1rem, 4vw, 3rem) 5rem;
    background: var(--ground); color: var(--ink);
    font-family: var(--f-body); font-size: 16px; line-height: 1.6;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }
  header { border-bottom: 2px solid var(--ink); padding-bottom: 1.5rem; margin-bottom: 3rem; }
  .eyebrow {
    font-family: var(--f-mono); font-size: .7rem; letter-spacing: .18em;
    text-transform: uppercase; color: var(--accent); margin: 0 0 .8rem;
  }
  h1 {
    font-family: var(--f-head); font-weight: 700; letter-spacing: -.02em;
    font-size: clamp(1.9rem, 5vw, 2.9rem); line-height: 1.05; margin: 0 0 .8rem;
  }
  header p.stand { margin: 0; max-width: 62ch; color: var(--ink-soft); }
  .grid { display: grid; grid-template-columns: 1fr; gap: 2.5rem; }
  @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
  .card { margin: 0; display: flex; flex-direction: column; gap: .7rem; scroll-margin-top: 1rem; }
  /*
   * No padding, which is a fix rather than a preference. Every snapshot paints
   * its own ground edge to edge, and roughly half of them carry a dark block
   * of their own — so in the dark scheme a half-rem gutter drew a pale ring
   * around exactly those maps, and the ring read as the defect. There is no
   * plate colour that suits both halves; the answer is not to show one.
   * The plate colour survives as the fallback for a map that ever paints less
   * than its whole viewBox.
   *
   * (No backticks in here. This whole page is one template literal, and a
   * backtick in a comment ends it — which is a build error two hundred lines
   * from the thing that caused it.)
   */
  .plate {
    background: var(--plate); border: 1px solid var(--line); border-radius: 2px;
    overflow: hidden; line-height: 0;
  }
  .plate svg { width: 100%; height: auto; display: block; }
  figcaption { display: flex; flex-direction: column; gap: .3rem; }
  figcaption h2 {
    font-family: var(--f-head); font-weight: 600; font-size: 1.1rem;
    letter-spacing: -.01em; margin: 0;
  }
  .chips { display: flex; flex-wrap: wrap; gap: .3rem; margin: 0; }
  .chip {
    font-family: var(--f-mono); font-size: .66rem; letter-spacing: .04em;
    color: var(--accent); border: 1px solid currentColor; border-radius: 2px;
    padding: .08rem .35rem;
  }
  .file { margin: 0; font-size: .72rem; color: var(--ink-soft); }
  .file code { font-family: var(--f-mono); font-size: .95em; }
  /* The tool's pills, rule for rule. Someone arriving here from the tool should
     not have to work out that it is the same project. */
  .by { display: flex; gap: 1rem; margin-top: 1.2rem; }
  .by a {
    color: var(--ink-soft); text-decoration: none; font-size: .85rem;
    padding: .2rem .65rem; border: 1px solid var(--line); border-radius: 999px;
    transition: color .15s, border-color .15s, background .15s;
  }
  .by a:hover, .by a:focus-visible {
    color: var(--accent); border-color: var(--accent); background: rgb(245 158 11 / .14);
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">masen · gallery</p>
    <h1>${files.length} maps, as files someone can open</h1>
    <p class="stand">Every committed snapshot in <code>${DIR}</code>, exactly as it renders. What each map is said to demonstrate is read back off the markup rather than off the test that wrote it, so nothing here can claim a feature the file does not contain.</p>
    <!-- A relative link, so this page works from the built site, from a local
         preview, and from a file:// open of the untracked build. -->
    <nav class="by">
      <a href="./">Open the tool</a>
      <a href="https://github.com/danielefrisanco/masen" rel="noopener" target="_blank">Source</a>
    </nav>
  </header>
  <div class="grid">
${cards.join("\n")}
  </div>
</div>
</body>
</html>
`;

await writeFile(OUT, page, "utf8");
const kb = Buffer.byteLength(page) / 1024;
console.log(`  ${OUT}  ${(kb / 1024).toFixed(1)} MB  (${files.length} maps)`);
