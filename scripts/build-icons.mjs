/**
 * Vendor a subset of Maki and Temaki into the source tree.
 *
 * Both are CC0 — public domain, no attribution obligation — which is the whole
 * reason they are the sets this library can use. Anything under MIT or ISC
 * (Tabler, Lucide, however good they look) would propagate a credit-line
 * requirement into every map anyone generates, and a library that quietly does
 * that to its users is not one worth shipping.
 *
 * The art is inlined at build time and committed, rather than regenerated on
 * every install, so a checkout builds identically without the icon packages
 * present. Re-run this when the subset changes:
 *
 *     npm run build:icons
 *
 * **Maki covers what sits on the ground and stops there.** It has 215 icons and
 * none of `oil`, `natural-gas`, `pipeline` or `mine` — the geopolitical half a
 * news map runs on. The plan said for six phases that this half did not exist in
 * any public-domain set and would have to be drawn. **That was wrong, and
 * measuring it is what showed so:** Temaki is an expansion pack for Maki from
 * the iD/Rapid editor team, also CC0, 557 icons, and it carries most of the
 * missing vocabulary already.
 *
 * **Two things about Temaki have to be guarded rather than assumed**, and both
 * were found by rendering the candidates rather than by reading their names:
 *
 * 1. **Its grid is not uniform.** 485 of its 557 icons are 15x15; the rest are
 *    drawn at 48, 50 or 100. The `viewBox` check below is what keeps one of
 *    those out — a 50-unit path dropped into a 15-unit box draws a shape four
 *    times too big, and nothing downstream would say so.
 * 2. **Its line-drawn glyphs do not survive pin size.** `power_tower`,
 *    `wind_turbine` and `military_checkpoint` are legible in a picker at 44px
 *    and turn to grey mush at the 15 units a pin actually draws. The subset
 *    below is deliberately the *solid* half of Temaki, because the standard is
 *    that a map using both sets must not show two house styles side by side.
 *
 * **What is still missing, and now precisely:** `pipeline` — Temaki's `pipe` is
 * a tobacco pipe — and a true conflict glyph, for which `ruins` is a proxy
 * rather than an answer. Two drawings, not a set.
 */
import { readFile, writeFile } from "node:fs/promises";

const OUT = "src/icons.ts";

/**
 * The subset, grouped by what a map is usually saying when it reaches for one.
 * Kept small on purpose: a vocabulary nobody can hold in their head is one
 * where every author picks a different icon for the same thing.
 *
 * A group is either a list of names — where what this library publishes and
 * what the source file is called are the same — or a mapping of the published
 * name to the source file. Temaki needs the second form: it names its files for
 * the object drawn, and this vocabulary is named for what a map is saying with
 * it. `lift_gate` is a barrier arm; `border-crossing` is why anyone puts one on
 * a map. The published side also keeps Maki's hyphens rather than importing a
 * second naming convention into one vocabulary.
 */
const SETS = [
  {
    label: "Maki",
    dir: "node_modules/@mapbox/maki/icons",
    groups: {
      "movement and logistics": ["airport", "harbor", "rail", "ferry", "bus", "fuel", "bridge"],
      "industry and energy": ["industry", "warehouse", "dam", "windmill", "construction"],
      "civic and public": [
        "hospital",
        "police",
        "fire-station",
        "school",
        "bank",
        "embassy",
        "town-hall",
      ],
      settlement: ["town", "city", "village"],
      "land and landmark": ["mountain", "park", "lighthouse", "monument"],
      situation: ["danger", "roadblock", "shelter"],
    },
  },
  {
    label: "Temaki",
    dir: "node_modules/@rapideditor/temaki/icons",
    groups: {
      // `natural-gas` rather than `gas`, because `fuel` is already a petrol
      // pump and half the world reads "gas" as exactly that. Temaki's own
      // `gas` icon is a flame, which is unusable here for a different reason:
      // Maki's `fire-station` is also a flame, and two glyphs that look alike
      // in one vocabulary is the failure this set is kept small to avoid.
      "energy and extraction": {
        oil: "oil_well",
        "natural-gas": "propane_tank",
        "storage-tank": "storage_tank",
        mine: "mineshaft_cage",
        "power-station": "cooling_tower",
        nuclear: "cooling_tower_radiation",
      },
      "borders and conflict": {
        military: "military",
        bunker: "bunker",
        camp: "army_tent",
        "border-crossing": "lift_gate",
        ruins: "ruins",
      },
    },
  },
];

/** Published name to source file, whichever form the group was written in. */
function pairs(group) {
  return Array.isArray(group) ? group.map((name) => [name, name]) : Object.entries(group);
}

/**
 * Undo XML character references.
 *
 * Several of Maki's files carry their line breaks inside the `d` attribute as
 * `&#xA;` and `&#x9;` rather than as literal whitespace. Captured raw and
 * emitted straight back out, the `&` is escaped on the way into the document
 * and the path arrives containing the seven literal characters `&#xA;` — which
 * is not a path command, and the icon draws as nothing.
 */
function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

/** The `d` of the path (or paths) the source draws each icon with. */
function pathOf(svg, name) {
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]*)"/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error(`${name}: no path`);
  // Whitespace inside a `d` is legal, and these files carry tabs and newlines
  // from hand-editing. Collapsing it keeps the emitted module readable and the
  // output byte-stable.
  const cleaned = paths.map((d) => decode(d).replace(/\s+/g, " ").trim());
  for (const d of cleaned) {
    if (/[&<>"]/.test(d)) throw new Error(`${name}: path still carries markup: ${d.slice(0, 60)}`);
    if (!/^[MmZzLlHhVvCcSsQqTtAa0-9eE,.\s+-]+$/.test(d)) {
      throw new Error(`${name}: path has a character no path command uses`);
    }
  }
  return cleaned.join(" ");
}

/**
 * Anything the source draws that is not a `<path>`.
 *
 * `pathOf` reads paths and nothing else, which was safe while Maki was the only
 * source — every Maki icon is a single fill path. Across 557 Temaki icons that
 * is an assumption rather than a fact, and a `<circle>` silently skipped is an
 * icon that draws most of itself and looks merely wrong.
 */
function otherShapes(svg) {
  return [...svg.matchAll(/<(circle|rect|line|polygon|polyline|ellipse|text)\b/g)].map((m) => m[1]);
}

const entries = [];
const seen = new Map();

for (const set of SETS) {
  for (const [group, members] of Object.entries(set.groups)) {
    const icons = [];
    for (const [name, file] of pairs(members)) {
      // One vocabulary, so one namespace. Two sources make a collision possible
      // for the first time, and a duplicate key would quietly keep whichever
      // was vendored last.
      const already = seen.get(name);
      if (already !== undefined) {
        throw new Error(`${name}: already vendored from ${already}`);
      }
      seen.set(name, set.label);

      const svg = await readFile(`${set.dir}/${file}.svg`, "utf8");

      const box = /viewBox="([^"]*)"/.exec(svg)?.[1];
      if (box !== "0 0 15 15") {
        throw new Error(
          `${file}: viewBox is ${box}, not "0 0 15 15" — Temaki's grid is mixed, ` +
            `and a path drawn on a bigger one renders far outside the mark that holds it`,
        );
      }

      const stray = otherShapes(svg);
      if (stray.length > 0) {
        throw new Error(`${file}: draws with <${stray.join(">, <")}>, which is not vendored`);
      }

      icons.push({ name, file, d: pathOf(svg, file) });
    }
    entries.push({ group, label: set.label, icons });
  }
}

const body = entries
  .map(
    ({ group, label, icons }) =>
      `  // ${group} — ${label}\n` +
      icons
        .map(
          (i) =>
            `  ${JSON.stringify(i.name)}: ${JSON.stringify(i.d)},` +
            (i.name === i.file ? "" : ` // ${i.file}`),
        )
        .join("\n"),
  )
  .join("\n");

const total = entries.reduce((n, e) => n + e.icons.length, 0);
const counts = SETS.map(
  (s) => `${[...seen.values()].filter((l) => l === s.label).length} from ${s.label}`,
).join(", ");

await writeFile(
  OUT,
  `/**
 * Maki and Temaki, inlined.
 *
 * Generated by \`scripts/build-icons.mjs\` — do not edit by hand. Both sets are
 * CC0, which is the reason they are the sets this library uses: a set requiring
 * attribution would propagate that obligation into every map anyone generates.
 * Every icon here is drawn on the same 15x15 grid at the same weight, so two of
 * them side by side look like one set rather than two.
 *
 * The paths are inlined per mark rather than referenced from a \`<symbol>\`.
 * A \`<use>\` puts its content in a shadow tree, where a class-based fill is
 * unreliable across renderers and unreachable by the flattening pass — and the
 * flattened form exists precisely for the reader that ignores stylesheets. This
 * project has shipped that failure three times; duplicating a few hundred bytes
 * of path data is much the cheaper mistake.
 *
 * ${total} icons — ${counts}. Maki covers what sits on the ground; Temaki carries
 * the geopolitical half a news map runs on, which the plan spent six phases
 * believing would have to be drawn by hand. \`pipeline\` is the one named gap
 * left: Temaki's \`pipe\` is a tobacco pipe.
 */

/** Every icon is drawn on this grid, in its own units. */
export const ICON_GRID = 15;

export const ICONS: Readonly<Record<string, string>> = Object.freeze({
${body}
});

export const ICON_NAMES: readonly string[] = Object.freeze(Object.keys(ICONS));

export function isIconName(value: string): boolean {
  return Object.hasOwn(ICONS, value);
}
`,
  "utf8",
);

console.log(`  ${OUT}  ${total} icons — ${counts} (both CC0)`);
