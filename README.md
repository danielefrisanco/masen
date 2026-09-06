# masen

[![npm](https://img.shields.io/npm/v/masen-map)](https://www.npmjs.com/package/masen-map)
[![license](https://img.shields.io/npm/l/masen-map)](LICENSE)

Generate standalone, CSS-themeable SVG maps from a region and a stylesheet.

No tile server, no fonts pipeline, no API key, no runtime model call.
Same input, byte-identical output.

```ts
import { masen } from "masen-map";

const map = await masen({
  region: "west-europe",
  projection: "conic-conformal",
  highlight: ["FR", "DE", "BE"],
  title: "Rail freight volume, 2024",
});

await map.toFile("europe.svg", { theme: "minimal" });
```

## Make a map without installing anything

[![The tool being used: a region chosen, the detail raised, neighbours turned
on, the stylesheet swapped, and a pin dropped on the map — with the link
underneath changing as it lands](https://raw.githubusercontent.com/danielefrisanco/masen/main/media/demo.gif)](https://danielefrisanco.github.io/masen/)

**→ [danielefrisanco.github.io/masen](https://danielefrisanco.github.io/masen/)**

Twenty-six seconds of it being used — a region, a level of detail, neighbours,
a different stylesheet, and a pin. No narration. Sharper as
[MP4](https://raw.githubusercontent.com/danielefrisanco/masen/main/media/demo.mp4)
or [WebM](https://raw.githubusercontent.com/danielefrisanco/masen/main/media/demo.webm),
and there is a [still](https://raw.githubusercontent.com/danielefrisanco/masen/main/media/poster.png)
for the places that show a card rather than play a video. All four are made by
`npm run demo`, which drives the deployed page — so they are remade when the
interface moves rather than left to go quietly out of date.

**Or see what it draws first: [the gallery](https://danielefrisanco.github.io/masen/gallery.html)** —
every committed snapshot on one page, sixty of them, which is faster than
reading any of what follows.

A page over this library: pick a region, a projection, a theme, the layers you
want, and it draws. **Everything runs in your browser** — the geometry, the
stylesheet, the file — so there is no server, no account and nothing sent
anywhere.

The whole configuration lives in the address bar, so a map you made is a link
you can send and the link rebuilds it exactly:

```
…/masen/?region=GR,TR,BG&projection=mercator&theme=atlas&detail=50m&seaNames=1
```

Only what you changed is written down, so a fresh page has a clean URL.

**The map is also something you click.** Choose a gesture and point at it: one
click drops a pin, two draw an arrow, a sequence traces a route, and a click on
a country highlights it. Every mark is stored as a longitude and a latitude
rather than as a pixel, so changing the projection, the region or the canvas
size moves the map underneath the marks and leaves them exactly where you put
them — and they travel in the link with everything else.

**Take it away as a file.** SVG, which is the better format for anyone who
will restyle it later, or PNG at up to four times the canvas — a map re-renders
at any size because it is geometry rather than pixels, so a preview in a browser
column and a poster at 4000 pixels are the same document twice. The PNG is
rasterised by the browser itself, from the flattened form: there is no
server-side rasteriser here and no dependency on one.

Run it locally with `npm run tool:dev`; `npm run tool:build` produces the static
site, and a GitHub Action deploys it from `main`. The tool is a thin form over
`MapOptions` and nothing more, which is possible only because no option in this
library is a callback — a UI can build the entire configuration as data and hand
it over.

## Status

Early, but complete enough to use, and **on npm**. Phases 0–9 are done: the
library, and [a tool over it](https://danielefrisanco.github.io/masen/) where
you pick a region, a projection and a theme, click the map to mark it, and take
the result away as a file. The package builds under both ESM and CJS, resolves
real geometry, emits the frozen document shape below, themes it, and carries
lakes, rivers, cities, names, the sea, land cover, a graticule and four kinds of
annotation.

```sh
npm i masen-map
```

**Scoped, for two reasons.** npm refuses the bare name `masen` as too close
to `readline` — and `masen` is a project rather than a single library, so the
org is where a second one would go. This is the map; `@masen/graph` is the
kind of thing that would sit beside it. The repository, the site and the `mp-`
class prefix are unchanged.

**`0.x` is doing real work here.** The class taxonomy below is what a `1.0.0`
would be promising to hold still, and it has not been in enough hands yet to
know which of its names are wrong. Being on npm before that promise is how it
gets into those hands; the version number is the disclaimer.

Eleven of the twelve layer slots carry something. **Roads is the last one still
empty**, and it is waiting on data rather than on code: of the roads Natural
Earth publishes, 1.7% of Africa's road length carries a classification, so the
layer would be a lie outside two continents. A legend is deferred to v2. The
[build plan](https://claude.ai/code/artifact/1ad97eac-6e9c-4944-96fb-3e6530d9e83d) says when each arrives and what it is waiting on.

## The class taxonomy

The real public API is the shape of the document, not the function signature.
Every theme anyone writes is a set of selectors against these names, so they are
versioned like a function signature and change only on a major.

The root is `<svg class="mp">` — `mp` for *map*, not for the library, which is
why the prefix survived the rename from `mapper` and will survive the next one.

Inside it, a `.mp-bg` rectangle covers the canvas, then twelve layer groups in
**fixed paint order**, bottom to top. Every slot is emitted on every map, empty
or not: inserting one later would restack everything above it and break themes
in the wild.

| Layer group | Feature class | Data attributes | Carries |
|---|---|---|---|
| `.mp-ocean` | `.mp-sea` | — | The sea as a shape, under everything |
| `.mp-graticule` | `.mp-grid` | `data-kind` | Parallels, meridians, the equator and tropics |
| `.mp-neighbours` | `.mp-neighbour` | `data-iso`, `data-name` | Surrounding countries drawn as context |
| `.mp-land` | `.mp-country` | `data-iso`, `data-name` | Filled land polygons, one node per country |
| `.mp-terrain` | `.mp-cover` | `data-kind` | Desert, mountain and glacier, tinted over the land |
| `.mp-hydro` | `.mp-water` | `data-kind` | Lakes and rivers, drawn over the land |
| `.mp-borders` | `.mp-border` | `data-kind` | Shared boundaries, each drawn once |
| `.mp-roads` | `.mp-road` | `data-kind` | *Reserved* · motorway, trunk, primary |
| `.mp-places` | `.mp-place` | `data-name`, `data-iso`, `data-rank`, `data-pop` | Settlement dots, ranked 1–3 |
| `.mp-labels` | `.mp-label` | `data-kind`, `data-rank`, `data-fit`, `data-iso`, `data-capital` | Country and settlement names |
| `.mp-annotations` | `.mp-anno` | `data-id`, `data-kind`, `data-fit` | Pins, callouts and arrows |
| `.mp-furniture` | `.mp-credit` | `data-anchor` | Credits, watermarks, scale bars, north arrows · legend reserved |

`.is-highlighted` is a modifier on any feature named in `highlight`.
A pin is a `.mp-anno.mp-pin` group holding a `.mp-pin-mark` circle and, where
it has one, a `.mp-label` carrying `data-kind="pin"`. A callout is a
`.mp-anno.mp-callout` group holding a `.mp-callout-leader` path, a
`.mp-callout-box` rect and a `.mp-label` carrying `data-kind="callout"`.
An arrow is a `.mp-anno.mp-arrow` group holding one `.mp-arrow-line` path, with
its head drawn by a `.mp-arrow-head` marker in the defs block. A pin whose
`kind` names an icon also carries a `.mp-icon` group, tagged `data-icon`.
`.mp-watermark`, `.mp-legend`, `.mp-scale` and `.mp-compass` are claimed but
not yet emitted.

Every layer but the last is geographic — its contents move when the projection
or region changes. `.mp-furniture` is the exception: a credit line or watermark
is placed on the canvas in fixed user units and must not shift when the camera
does, which is why it is a layer of its own and sits above everything else.

`.mp-bg` and the `.mp-borders` group ship with `fill="none"`. That is structural,
not stylistic: SVG's default fill is black, so a full-canvas rectangle or a line
path with no theme applied would render as a black square and a filled blob.
Presentation attributes have zero specificity, so any theme rule overrides them.

Every layer group carries `mp-layer` alongside its own class, and **every one is
emitted even when empty**. That is deliberate: inserting a layer later would
restack everything beneath it and break themes already in the wild. Empty slots
cost about thirty bytes and buy a stable stack for the life of v1.

The taxonomy is also readable at runtime, so tooling never has to hard-code it:

```ts
import { LAYERS } from "masen-map";

LAYERS.map((layer) => layer.className);
// ["mp-neighbours", "mp-land", "mp-hydro", "mp-borders", ...]
```

### Borders are meshed, not outlined

`.mp-border` comes from the shared arcs between countries, so the
France–Germany boundary is one line rather than two stacked on top of each
other. Coastlines are excluded — they are already the silhouette of the land
layer. This matters the moment a theme makes borders translucent or dashed,
where doubled lines render visibly wrong.

The group carries `fill="none"` as a presentation attribute, because a line path
with the SVG default fill renders as a filled blob.

### A note on non-browser renderers

Browsers follow the spec: presentation attributes have zero specificity, so
`.mp-bg { fill: … }` in a theme overrides the built-in `fill="none"`. Verified
in Chromium.

Some non-browser renderers get this backwards and let the attribute win —
ImageMagick's built-in MSVG renderer is one. A map themed with a `<style>` block
will show an unpainted background there. This is the same class of problem as
design tools that ignore `<style>` entirely, and it is what the planned
`inlineStyles` render option exists to solve, by flattening computed values onto
presentation attributes before writing the file.

### Accessibility

The root carries `role="img"` with an `aria-label` and a matching `<title>`.
Each country also carries its own `<title>`, which browsers show on hover;
because the root is `role="img"`, assistive technology reads the one label
instead of announcing two hundred paths.

The generated label describes the geography (`"Map of Western Europe,
highlighting France and Belgium"`). Pass `title` to say what the map is actually
about — a map of election results is not "a map of Western Europe".

## Theming

Three inputs, applied in cascade order. There is no merge step, no schema and
no validation layer, because the cascade already does that work.

```ts
const map = await masen({
  region: "west-europe",
  theme: "atlas",              // structure: weights, dashes, type
  palette: "dusk",             // colour only, applied over the theme
  tokens: { accent: "#C2482F" } // final say
});

map.css              // the resolved stylesheet, scoped
map.svg              // geometry only — pair it with map.css yourself
map.toString()       // complete, styled by its <style> block — for embedding
await map.render()   // complete and portable — renders without CSS support
await map.toFile(p)  // render(), written to disk

map.project([lon, lat]) // a coordinate as a point on the canvas
map.invert([x, y])      // a point on the canvas as a coordinate
```

### Regions

Twenty-five presets, each a saved list of ISO codes — `"west-europe"` expands to
exactly what you could have written by hand, which is why they are explicit
rather than derived from a continent field the topology does not carry.

| | |
|---|---|
| Whole world | `world` |
| Europe | `europe`, `west-europe`, `east-europe`, `nordics`, `balkans`, `mediterranean` |
| Americas | `north-america`, `central-america`, `caribbean`, `south-america` |
| Africa | `africa`, `north-africa`, `west-africa`, `east-africa`, `southern-africa` |
| Asia | `asia`, `middle-east`, `central-asia`, `south-asia`, `southeast-asia`, `east-asia` |
| Elsewhere | `oceania`, `pacific`, `antarctica` |

**They overlap on purpose.** Turkey is in `europe`, `balkans`, `middle-east` and
`asia`; Egypt is in `africa`, `north-africa` and `middle-east`. A region is a
frame somebody wants, not a partition of the planet — and every one of these is
an editorial choice with a defensible alternative, which is why they are written
down in one visible place rather than inferred.

Anything not covered is a list of codes: `region: ["CH", "AT", "SI"]`. To build
a picker over them, `countryTable()` returns every country the data can draw
with its name:

```ts
const countries = await countryTable("110m");   // [{ code: "AF", name: "Afghanistan" }, …]
```

The tier is part of the question rather than a detail — **the two tiers do not
hold the same countries**, 177 at 110m against 241 at 50m, because the coarse
one drops the small ones. `isoTable()` answers a different question and carries
no names: it is the code-to-numeric-id map the topology is keyed by.

### The presets

| Theme | |
|---|---|
| `minimal` | Flat fills, hairline edges, no ocean — for a page with a ground of its own |
| `atlas` | Printed-atlas paper on a cold sea, dashed boundaries, serif |
| `noir` | Dark ground, slate land, fine linework, one warm accent |
| `blueprint` | White linework on drafting blue, monospaced, dashed boundaries |
| `contrast` | Black and white sized for legibility — heavy strokes, no muted ink |

Palettes are colour only, and restyle any theme without touching a weight, a
dash or the type:

| Palette | |
|---|---|
| `sand` | Warm paper and a deep green accent |
| `slate` | Cool neutral grey, one cold blue — the register of a report |
| `moss` | Warm greens on stone, the colouring of a walking map |
| `limes` | Editorial plates — brick and ochre on a deep teal sea, near-black linework |
| `dusk` | Night blues, for a dark page |

### Every preset keeps its coastlines findable

There is a floor under how close two colours a map puts side by side may be,
and it is enforced by a test rather than by taste.

It exists because the preset tests only ever asked whether a token *resolves*.
Every one of them passed on a `sand` map where `--land-edge` was the background
colour exactly and the lightest band was four points off it — so a pale country
on a coast had neither a fill nor an outline dividing it from the sea, and
Eritrea was simply not there. Nothing was undefined. Nothing threw.

The rule is compound, because that is the shape of the failure: a country reads
against the water if **either** its own fill differs from the sea **or** the
line drawn round it does. So a pale choropleth band is legal on a theme with a
real coastline and illegal on one without.

**The measure is perceptual difference, not a WCAG contrast ratio.** The ratio
was tried first and rejected by measurement — it scores `atlas` a failing 1.04,
because atlas draws a warm tan coast on a cold blue sea at almost identical
lightness, and that coast is unmistakable. WCAG cannot see hue, and half the
cartography here is hue.

If you write your own theme and it puts a country within ΔE 10 of the sea, this
test will say so and name the token.

### The typefaces

Type is a category you pick, the same way colour is:

```ts
await masen({ region: "west-europe", theme: "atlas", typeface: "serif" });
```

| | |
|---|---|
| `humanist` | The system UI face. Even colour, no affect — the default voice |
| `serif` | A book face with a little tracking; the printed-atlas register |
| `grotesk` | Swiss signage: neutral, tight, slightly heavy |
| `condensed` | Narrow. **Reach for this on a crowded map** — more names fit |
| `mono` | Even widths, for maps that sit beside figures |

A typeface carries only type tokens, exactly as a palette carries only colour,
so the two are chosen independently and neither can fight the theme over
structure. Sizes travel with the stack because they have to — a serif needs a
fraction more room than a grotesk.

Only stacks already on the machine. A map is a standalone file with no network,
so a webfont would arrive as a request the document cannot make.

One of the tokens a typeface sets is not a style at all. `--label-advance` is
how wide the face runs, as a fraction of the size — the fit test has no font
metrics, and the only thing that knows the answer is the stylesheet that chose
the face. `condensed` declares `0.46` where `humanist` declares `0.58`, and
that is precisely why more names fit.

### Dark mode

Every preset ships a `@media (prefers-color-scheme: dark)` block, so a map
dropped into a page follows the reader's system. Because tokens are role-named
it is a value swap and nothing structural.

An explicit `palette` still wins — it is applied after the theme, so the
cascade settles it. Asking for `sand` gets sand whatever the system is set to;
automatic dark is the default, never an override.

One consequence worth knowing: `render()` flattens the theme onto presentation
attributes, and a media query cannot be flattened — whether it applies is not
known until someone looks at it. So the flattened attributes carry the light
values and the stylesheet still ships alongside. A browser honours the dark
block; a design tool gets the light map.

### Two output forms, for two different readers

`toString()` is styled by its stylesheet alone. That is the right form to embed
in a page: the browser applies the `<style>` block, and the file stays small.

`render()` and `toFile()` **flatten the theme onto presentation attributes by
default**, because a file gets opened by whatever the reader happens to have —
a design tool, a file-manager thumbnailer, an editor preview — and many of those
ignore `<style>` entirely, which renders a themed map as black shapes. The
stylesheet still ships inside, so a browser honours the CSS and everything else
honours the attributes. Both resolve to the same paint.

Pass `inlineStyles: false` for the smallest possible file when you know the
target understands stylesheets.

**A theme carries structure; a palette carries only colour.** That split is the
point: both a newsroom and a company want to keep a style and change its
colours, not rewrite it. Because tokens are named by role, a palette *is* a set
of token values — so recolouring costs nothing to implement.

Bundled themes are `minimal` and `atlas`; bundled palettes are `dusk` and
`sand`. Any of them can instead be a path to a `.css` file or a stylesheet
passed inline. The files ship too, for linking or forking:

```ts
import "masen/themes/atlas.css";
```

### Tokens

Named by role, never by appearance. `--ink`, never `--dark-gray` — the second
is a lie the moment someone writes a dark theme, and renaming it later breaks
every theme in the wild.

| Token | Controls |
|---|---|
| `--bg` | Canvas ground — the ocean, or transparent |
| `--land` / `--land-edge` / `--land-edge-width` | Country fill and outline |
| `--border` / `--border-width` / `--border-dash` | Shared boundaries |
| `--accent` / `--accent-edge` | Anything highlighted |
| `--bin-1` … `--bin-5` | Bands of a classified value |
| `--fill-1` … `--fill-6` | Political fill |
| `--stripe` / `--stripe-width` | Diagonal hatching |
| `--prism-side` / `--accent-side` | Walls of a raised country |
| `--water` / `--water-width` | Lakes and rivers |
| `--place` | Settlement dots |
| `--neighbour` | Context countries |
| `--anno` | The mark a pin is drawn with, and a callout's box and leader |
| `--anno-ink` | Ink on an annotation: a callout's caption, a pin's icon |
| `--furniture-ink` | Text and marks on the canvas — a credit, a watermark, a scale bar, a north arrow |
| `--ink` / `--ink-muted` | Country names / settlement names |
| `--font` / `--label-size` / `--place-label-size` | Type |
| `--label-halo` / `--label-halo-width` | The casing drawn behind label text |
| `--road` `--anno` `--anno-ink` `--furniture-ink` | *Reserved* — set them now, they start working when their layer lands |
| `--graticule` `--graticule-width` `--equator` | *Reserved* — the grid, the equator and the tropics |
| `--desert` `--forest` `--mountain` `--glacier` | *Reserved* — land cover |
| `--sea-ink` | *Reserved* — names of seas, gulfs and straits |

Every bundled theme defines every live token, and a test holds it: a theme that
misses one leaves a map wearing another theme's colour in that one place.

Two of these encode a rule rather than a preference. `--prism-side` has to be
darker than any band that can sit on top of it — a pale wall under a dark top
inverts the light source and a prism map turns to mud. And `--accent-side`
exists because the obvious `filter: brightness()` is a CSS filter function that
SVG 1.1 does not accept, so every viewer ignoring stylesheets drew the wall in
the top's colour and flattened the prism into a silhouette.

### Styles are scoped to one map

A `<style>` block inside inline SVG is **not** scoped to that SVG — it applies
to the whole host page. Two differently themed maps on a page would overwrite
each other, and a map would restyle anything sharing a class name.

So every rule is scoped to a class derived from a hash of the stylesheet
itself: `.mp.mp-t-k3f9a1z .mp-country`. Deterministic, so the same theme always
produces the same class and output stays byte-identical; distinct, so two
themes cannot collide.

### So are the ids

Stylesheets have been scoped to a hash of themselves since the beginning, which
made it look as though two maps could already share a page. They could not. An
`url(#…)` resolves against the whole document, and the SVG ids were constants —
so with two maps on one page, every `url(#mp-land-clip)` found whichever map the
parser reached first, and one map's rivers were clipped to the other's
coastline, with nothing in either file to say so.

Every id a map emits now carries a hash of that map:

```
<clipPath id="mp-land-clip-1y4m1b6">   <pattern id="mp-stripe-1y4m1b6">
```

**The name you write does not change.** A theme still says
`filter: url(#mp-relief)` and `fill: url(#mp-stripe)`, which is what the docs
above promise and what every stylesheet already says. Only the emitted pair
moves, and it moves together: the id on the definition and the reference in the
`css` shipped beside it. An id you invented yourself is left exactly as written —
only the `mp-` names are namespaced.

The hash is derived, never counted, because the same input has to give the same
output: a counter would make a map's bytes depend on how many maps were built
before it. Two maps that agree on theme, canvas, projection, detail and subject
get the same scope, which is correct — they are the same map, and a page holding
it twice is holding one document twice.

### How flattening works

`inlineStyles` resolves the cascade and writes the computed paint onto each
element as presentation attributes. It is not a CSS engine. It handles class selectors and descendant combinators,
which is what the bundled themes use and what the authoring convention asks for.
Selectors beyond that are skipped rather than half-applied.

### Framing, and why nothing goes missing

A country's geometry includes everything it governs: France reaches to French
Guiana, the United States to Alaska and Hawaii. Fitting a camera to that frames
an ocean.

So the camera is fitted to each country's **core** — anchored on its largest
piece and scaled by that core's own extent — and then **everything is drawn**.
Guyane is still in a map of France; it simply falls outside the viewport, the
way a paper atlas handles it. Continental France, the lower 48 and mainland
Portugal frame correctly, while Sicily, Sardinia, Indonesia's archipelago and
New Zealand's two islands all stay whole, and a world map shows every last one
of them.

### Coordinates and pixels

```ts
const map = await masen({ region: "west-europe" });

const paris = map.project([2.35, 48.86]); // → [x, y], or null
const ground = map.invert([500, 500]);    // → [lon, lat], or null
```

`project()` is how anything gets placed by hand: you know where the thing
happened, and you want the point on the canvas to draw it at.

`invert()` runs the other way, and it exists for the case where the pixel comes
first — a drag, a click, a drop. **Store the coordinate, never the pixel.** A
pixel is only meaningful for the exact region, projection and canvas size that
produced it; the same map at another size, or reframed to a wider region, puts
that pixel somewhere else entirely. A coordinate stays on the same ground
forever.

Both return `null` when there is no answer. For `invert()` that means the pixel
is not on the map at all — the corners of a canvas fall outside an orthographic
globe, and those corners are nowhere, not somewhere. It is worth checking:
d3 clamps its inverse trigonometry rather than failing, so the raw projection
would answer a corner with a coordinate on the limb, and a pin dropped off the
edge of the world would come to rest in the Atlantic.

On a globe the far hemisphere projects onto the same disc, so one pixel names
two coordinates. `invert()` returns the one facing the reader.

### Relief without data

```css
.mp .mp-land { filter: url(#mp-relief); }
```

`mp-relief` and `mp-relief-soft` are built in. A stylesheet cannot create SVG
elements, so a theme names the effect and the definition is written into the
reserved `<defs>` — only when referenced. `FILTER_NAMES` lists what is
available.

They are lighting filters, not shadows. A shadow separates a shape from its
ground; relief needs a lit face and an unlit one, so the land's own alpha is
blurred into a height map and lit from the north-west. The light is *multiplied*
rather than added, which keeps the theme's colour instead of bleaching it white.

No elevation model, no raster, no data. Worth separating from *terrain*, which
is a data problem — glaciers, salt flats and depth bands are real vectors, but
land contour lines would have to be derived from an elevation model.
See `west-europe-relief.svg` in the gallery.

### Colour by value

```ts
await masen({
  region: "west-europe",
  values: { DE: 4460, FR: 3050, IT: 2250, ES: 1620, PT: 290 },
  bins: 5,
});
```

Each country is classified into a band and marked `data-bin="4"`, which the
theme colours from `--bin-1` … `--bin-5`. The library never picks the colour.

Bands are by **rank**, not equal value intervals — map data is usually skewed
enough that five equal slices of European GDP put Germany alone in the top band
and everything else in the bottom one.

`values` defaults to whatever `extrude` was given, so one set of numbers can
drive height and colour at once.

A highlight beats a band. `.mp-country.is-highlighted` and
`.mp-country[data-bin="3"]` have identical specificity, so the one written last
wins — and highlight is the caller naming a country outright, where a band is a
number it happened to fall into.

### Colour without data

```ts
await masen({ region: "africa", fill: "political" });
```

Every country gets a colour none of its neighbours has, written out as
`data-fill` for the theme to resolve from `--fill-1` … `--fill-6`. The oldest
convention in map-making, and the sensible default for a map with nothing to
encode.

It costs almost nothing: the border mesh already visits every shared arc to
find the boundaries, so the adjacency graph comes out of the same pass. Four
colours suffice for Europe and five for the world — six exist because a real
country graph is not quite the planar one the four-colour theorem is about.

Political fill defers to a band. A country carrying a number is already saying
something with its colour, and two encodings on one fill is one of them lying.

### Hatching

```ts
await masen({
  region: "europe",
  highlight: [...members],
  stripe: ["AL", "BA", "MD", "ME", "MK", "RS", "UA"],
});
```

For the thing a map has to say about a country that is not a quantity —
disputed, claimed, excluded, no data. It is an overlay rather than a fill, so a
hatched country keeps whatever colour it already had and the two readings
stack.

The pattern lives in `<defs>` and the line inside it carries a class, so a
theme styles it like everything else. It has to be a class: `currentColor`
inside a pattern resolves where the pattern *sits*, in the defs block, not
where it is used.

### Height as quantity

```ts
await masen({
  region: "west-europe",
  extrude: { values: { DE: 4460, FR: 3050, IT: 2250, ES: 1620 }, height: 150 },
});
```

Each country is raised in proportion to its value — a prism map. Values are raw
(GDP here, or headcount, or anything else) and scaled against the largest, so
you never have to think in SVG units. `extrude: 40` lifts everything uniformly
instead, and `extrude: { values: { IT: 1 } }` raises a single country off the
rest.

Each country becomes `.mp-prism` wrapping `.mp-prism-side` and `.mp-prism-top`,
with `data-height` alongside the usual attributes. `.is-highlighted` works on a
prism exactly as on a flat country. See `europe-gdp-prism.svg` and
`italy-raised.svg` in the gallery.

Nothing about this is a raster trick: the solid is built by sweeping the
projected outline upward, so it stays vector, themeable and diffable.

### Projections face their region

A projection is centred on its region's meridian before being fitted to the
canvas — `fitExtent` solves scale and position but never rotation, so without
this a map of Asia is drawn from the far edge of a Greenwich-centred projection
and arrives sheared.

Only the central meridian moves for the cylindrical and pseudocylindrical
projections; tilting one off the equator gives an oblique aspect, which is a
deliberate choice rather than a default. `orthographic` turns in both axes,
because a globe has no other way to look at a place.

Past a 180° span the region is effectively the world, and rotating stops being
a service — so a world map keeps the Atlantic in the middle, where readers
expect it.

Regions that cross the antimeridian are handled with the wrap: Oceania reports
as 113°E to -180°E, and averaging those two numbers would centre the map on the
opposite side of the planet.

`antarctica` is the exception that proves this section: a pole is a line rather
than a point in any cylindrical projection, so it smears across the bottom of
the map. Draw it `orthographic`.

### The sea, as a shape

```ts
await masen({ region: ["HR"], sea: true, palette: "sand" });
```

Without this, `--bg` paints the whole canvas and the land is drawn over it — so
blue has never meant *water*, it has meant *nothing was drawn here*. Those are
the same thing only when your region has coastline all the way round.

They come apart the moment the frame holds land you did not ask for. A map of
Croatia painted Bosnia the same colour as the Adriatic. A map of Italy painted
Austria as sea. A map of Switzerland put the whole of central Europe underwater.

`sea: true` draws the real ocean polygon into `.mp-ocean`, the bottom layer,
filled from `--sea`. Land the map is not drawing stays as the canvas ground
instead of pretending to be water.

**It shows only where `--bg` is not already your ocean.** `sand`, `slate`,
`moss` and `minimal` have a paper ground, so their `--sea` is a different
colour and the layer changes what you see. `atlas`, `noir`, `blueprint`,
`dusk` and `limes` set `--sea` to their background exactly, so turning it on
cannot change a coastal map that was already right — override `--bg` if you
want the two to differ.

The geometry is read from a file of its own, only when this is on: it is one
polygon with a hole for every continent, and half again the size of the rest of
the bundle. It is clipped to the canvas before it is drawn, so an inland frame
emits nothing at all rather than a megabyte of coastline nobody can see.

### Ground that is desert where it is desert

```ts
await masen({ region: ["DZ", "LY", "EG", "TD", "NE"], terrain: true });
await masen({ region: ["CH", "IT", "AT"], terrain: ["mountain"] });
```

Three kinds of land cover — `desert`, `mountain`, `glacier` — drawn into
`.mp-terrain`, over the land they tint and under the water, each shape carrying
`data-kind` and coloured from `--desert`, `--mountain` and `--glacier`. `true`
draws all three; a list draws only what it names, which is how a map of the Alps
gets its mountains without the Sahara arriving alongside them.

**There is no forest, and that is the honest half of the feature.** Natural
Earth publishes no forest polygon at any tier — land cover of that kind lives in
rasters — and deriving one from a climate band would make this the only layer in
the library that invents its subject. `--forest` stays a reserved token against
the day a source exists.

**The classification is Natural Earth's own, recovered rather than guessed.**
`geography_regions_polys` is the source, and it ships the `FEATURECLA` column
populated at 10m only: at 50m and 110m every feature has it blank, so those
files are a list of named shapes with no way to tell the Sahara from
Scandinavia. `NE_ID` is stable across tiers, so the build joins the 10m table
onto the coarser geometry — 60 of 60 features at 110m, 522 of 522 at 50m, and
the ingest script throws rather than shipping an unclassed blob.

Cover is clipped to the land the map actually drew, for the reason rivers are: a
cover polygon is a climate band drawn to a coarse outline, so it runs out over
the sea wherever the coast is finer than the band, and glaciated areas genuinely
extend onto floating ice. It is read from a file of its own, only when this is
on.

### The names of seas

```ts
await masen({ region: ["GR"], sea: true, seaNames: 3 });
```

Seas, gulfs, straits and bights, set in italic on the water in `--sea-ink`, into
the same `.mp-labels` layer country and city names use — `data-kind="sea"`, with
`data-sea` naming which kind of water it is.

The rule, which you can check: **a sea is named when its middle is on the map.**
The anchor is the point furthest from that sea's own shore, computed once at
build time, because a centroid is not good enough for the shapes worth naming —
the Mediterranean's falls over Sicily. The polygon is then discarded, which is
what keeps a hundred and eighteen names down to 7 KB. The cost of that trade is
worth knowing before you turn it on: a map framed on a *sliver* of a sea whose
middle lies elsewhere does not get that sea's name.

`seaNames` takes a rank, the way `labelRank` does — 1 is the oceans and the
great seas, 2 adds the named basins, 3 adds the straits and bights. `true` means
2. Sea names are judged **last** in the collision pass, so they give way to
every name on land: the land is the subject, and a name on the water is the one
that can be spared.

### The grid the world is drawn on

```ts
await masen({ region: "south-america", graticule: true });
await masen({ region: "world", graticule: { step: 15 } });
```

Parallels and meridians, at the bottom of the stack under everything else.

The spacing is chosen from the region unless you name one: roughly six lines
across the span, snapped to a step a reader can count in — 0.5, 1, 2, 5, 10,
15, 30 or 45 degrees. So a map of Switzerland gets a degree grid and a map of
the world gets a 45° one, and neither had to be asked for. `step` takes one
number for both axes or `[longitude, latitude]`.

**The equator and the tropics are drawn apart from the grid**, on `--equator`
rather than `--graticule`, and the parallel set skips those three latitudes so
none of them is ever stroked twice. A map that draws the Tropic of Cancer at
the weight of 20°N is not marking it.

Each line carries `data-kind` — `meridian`, `parallel`, `equator`, `tropic` —
so a theme can reach any of them:

```css
.mp .mp-grid[data-kind="meridian"] { stroke-dasharray: 2 3; }
```

A parallel at the pole is not drawn: it is a point, and on a cylindrical
projection it would come out as a line across the top of the map claiming the
pole is a place.

### Centring on a meridian

```ts
await masen({ region: "world", projection: "equal-earth", center: 160 });
await masen({ region: "world", projection: "orthographic", center: [100, 20] });
```

Overrides the automatic centring of the section above.

**This is the projection's axis, not the middle of the canvas.** `fitExtent`
still frames the region wherever the rotation puts it, so what moves is how far
the meridians fan, how much the map shears and which way is up — not where your
subject sits on the paper.

It also beats the 180° rule, which is the point: a Pacific-centred world map is
exactly the thing no automatic rule will ever hand you.

A latitude is taken only by a projection that turns in both axes —
`orthographic`. Passing one to a cylinder or a cone throws, rather than quietly
returning an oblique aspect, which is a different map rather than a recentred
one.

### Water is clipped to land

A river is one feature from its source to its mouth, so keeping the Danube
because it passes through Austria keeps the whole of it — and it used to carry
on across the sea to the Black Sea on every map of Western Europe. The hydro
layer is clipped to the land actually drawn, which is also the truer statement:
a river is on land.

### Neighbours

```ts
await masen({ region: "west-europe", neighbours: true });
```

The surrounding countries, drawn beneath the region as context. Never labelled,
never highlighted, and **excluded from the camera** — so turning context on
cannot move your subject. Styled from `--neighbour`.

### Marks

```ts
await masen({
  region: "west-europe",
  highlight: ["FR"],
  pins: [
    { at: [4.84, 45.76], label: "Lyon", kind: "site" },
    { at: [5.37, 43.30], label: "Marseille", offset: [0, 18] },
    { at: [9.99, 53.55], label: "Hamburg", id: "h1", offset: [-14, -4] },
  ],
});
```

A dot where the thing happened, and a word saying what it was. Pins render into
`.mp-annotations`, above every geographic layer and below the furniture.

`at` is a coordinate, `[lon, lat]`, and **never a pixel**. A pixel is only
meaningful for the exact region, projection and canvas size that produced it, so
a map reframed or resized detaches every mark placed in pixels. Where a mark is
placed with a pointer, [`invert()`](#coordinates-and-pixels) is what turns the
drop back into a coordinate to store. This is the shape arrows, callouts and
icons will copy — they all have to say *where*, and they will all say it this
way.

`label` sets text beside the mark; omit it and the pin is a mark and nothing
else. `id` becomes `data-id`, which is how an editor finds the node it drew
again. `kind` becomes `data-kind` for a theme to style — free text rather than
an enumeration, because the icon vocabularies that will supply the conventional
values have not landed yet. `offset` moves the **label**, in user units, never
the mark: a negative `dx` anchors the text at its far end so it does not run
back across the mark it was moved away from.

Marks are **excluded from the camera**, exactly as neighbours are. Placing one
never moves the map out from under the marks already placed.

**Two things can go wrong with a pin, and they get two different answers.**

A coordinate on the far side of a globe is *dropped*. It has no pixel of its
own, but it is handed one anyway — the far hemisphere projects onto the same
disc as the near one, so a pin at 160°W lands squarely on Angola on an
Africa-centred orthographic, and nothing about the markup would say it was
wrong. They are caught by round trip: `invert()` answers with the near side by
construction, so a coordinate that comes back as itself was visible and one that
comes back as somewhere else was not.

A coordinate that survives that but lands outside the canvas is *drawn*,
carrying `data-fit="0"`. It is a real place the camera simply is not pointed at,
and that is a fact about the map rather than an error — so the document states
it and the stylesheet acts on it, the same bargain a name too big for its
country gets. The bundled themes hide it.

A coordinate that cannot be one at all throws, and a latitude past 90 is told
what it probably was:

```
masen: pins[0].at has a latitude of 102.35, which is outside [-90, 90] —
coordinates are [lon, lat], not [lat, lon]
```

The mark is `--anno`, cased in `--label-halo` — the same casing its label gets.
The casing is not decoration: every bundled preset sets `--anno` to the same
value as `--accent`, so a pin dropped on a highlighted country is drawn in the
country's own colour, and a region plus a highlight plus a marker is exactly the
map this layer exists to make.

### Captions

```ts
await masen({
  region: "europe",
  pins: [{ at: [30.73, 46.48], label: "Odesa" }],
  callouts: [
    {
      at: [30.73, 46.48],
      text: "Grain exports resumed here in July, under a corridor agreement that lapsed in November",
      offset: [-96, -150],
      width: 190,
    },
  ],
});
```

A callout says `where` exactly as a pin does — same `at`, same guards, same
`data-fit`. What differs is which half carries the meaning. A pin says *there is
something here* and the mark is the subject; a callout says *this sentence is
about here*, and the words are the subject while the line only points.

That is why a callout has a box and a pin does not. A single word can sit on a
coastline behind a halo; a sentence cannot. The box is filled from `--anno` and
the caption is set in `--anno-ink` — the one piece of text on the map drawn with
no casing at all, because it already has a ground of its own.

`offset` places the **corner of the box nearest the point**, and the box grows
away from there — so the sign of the offset is the direction the box goes, and
the leader always lands on a corner you can predict. `width` is the widest the
caption sets before it wraps (default 180 user units); the wrap is greedy, and a
single word longer than the column is left long rather than hyphenated.

There is no mark at the anchor. The leader already ends there, and a caller who
wants a dot as well adds a pin at the same coordinate — which is the composition
the whole layer is built for, rather than a second way to draw one circle.

**One caveat worth knowing.** SVG cannot measure text outside a browser, so the
box is sized from `--label-advance` and `--label-track`, which is an estimate.
It rounds up by 30% — measured as the worst case a real caption runs across the
bundled stacks — so a box is sometimes a little wider than it strictly needs to
be. That is the right way round: a box slightly too wide costs whitespace, and a
box too narrow prints the caption out through its own side.

### Furniture, and the canvas

```ts
await masen({
  region: "world",
  credit: "Natural Earth · public domain",
  // or: credit: { text: "Reuters graphics", anchor: "bottom-left" }
});
```

`.mp-furniture` is **the one layer that is not geographic.** Everything in every
other layer is somewhere on the ground and moves when the projection or the
region changes. A credit line is on the *paper*: it belongs to one of nine
canvas positions, in fixed user units, and stays there however the map beneath
it is reframed.

```
top-left        top        top-right
left           centre           right
bottom-left    bottom    bottom-right
```

An anchor carries an alignment as well as a point, which is the half that is
easy to forget: a credit anchored `bottom-right` is not text *placed at* the
corner, it is text whose **end** sits there. Placed by coordinate alone, a long
one runs off the canvas.

The inset is the map's own `padding`, so furniture lines up with the margin the
map was already drawn inside rather than inventing a second one. Styling comes
from `--furniture-ink`.

The credit deliberately **does not** appear in the accessible description. It
says who made the map, which is not what the map is *of* — announcing it would
put the byline ahead of the subject.

Nothing here is an obligation this library imposes: Natural Earth is public
domain, Maki is CC0, and masen is MIT. `credit` exists because a map that
leaves a browser as a file has no surrounding page to carry a caption, so the
credit has to come out of the generator or it does not exist at all.

### A scale bar and a north arrow, when the map has earned them

```ts
const map = await masen({
  region: ["FR"],
  projection: "conic-conformal",
  scaleBar: true,          // or { anchor, maxWidth, units: "km" | "mi", tolerance }
  compass: true,           // or { anchor, tolerance }
});

map.distortion();          // { scale, north, kmPerUnit, samples }
```

These two are the only furniture that makes a claim about the **ground** rather
than about the map's provenance. A credit line cannot be wrong. A bar reading
`500 km` on a frame where 500 km is sometimes 80 units and sometimes 160 is
simply false, and nothing in the markup says so.

So neither is drawn on request alone. The canvas is sampled — a few hundred
probes through `project` and `invert` — and the piece appears only if the claim
holds:

| | claims | drawn when | default |
|---|---|---|---|
| `scaleBar` | one length means one distance everywhere | largest local scale ÷ smallest ≤ `tolerance` | `1.1` |
| `compass` | up is north everywhere | north leans ≤ `tolerance` degrees from up | `5` |

**The usual rule — "a scale bar suits the conformal and equal-area
projections" — is wrong in both directions, and this library does not use it.**
Measured across the drawn frame:

| region · projection | scale varies | north leans | gets |
|---|---|---|---|
| `europe` · mercator | 2.76 | 0.0° | arrow only |
| `west-europe` · conic-conformal | 1.03 | 22.3° | bar only |
| `CH` · mercator | 1.05 | 0.0° | both |
| `world` · equal-earth | huge | 64.4° | neither |

Mercator is conformal and varies by nearly three to one over Europe, so the old
rule would permit a bar that lies. Orthographic is neither family and varies by
1.07 over India, so the old rule would forbid one closer to true than the bar it
just allowed. Honesty depends on the **extent**, not on the projection's family,
and it is measurable — which is the same discipline the `invert()` round trip
settled for annotations: measure the property, do not assert the category.

`map.distortion()` reports the measurement, so asking for a bar and receiving
none is answerable with a number rather than a guess. It is computed on first
call and kept, and a map that never asks never pays for it.

The bar's number is always a round one — 1, 2 or 5 times a power of ten — so the
**width is derived from the number** rather than the number from the width. A
bar reading 237 km is a bar nobody can step across a map.

### Watermarks

```ts
await masen({
  region: "africa",
  watermark: "PROVISIONAL",
  // or: watermark: { image: "./logo.svg", anchor: "bottom-right", width: 90 }
});
```

**A watermark is attribution, not protection.** It is a node in a file the
reader can open, select and delete — it marks provenance and it cannot enforce
anything. Nothing here is a rights mechanism, and a caller who needs one needs
something other than a vector graphic.

An `image` is **embedded**, not linked: a `data:` URI passes through untouched,
and under Node a path to a `.png`, `.jpg`, `.gif`, `.webp` or `.svg` is read and
base64'd into the document. The whole point of this library's output is that one
file is the whole map, and a watermark referencing a logo on disk would stop
working the moment the SVG was emailed to anyone. The `<image>` carries a plain
SVG 2 `href` rather than a duplicate `xlink:href`, which would double the
payload of the logo to satisfy renderers older than about 2019.

You give a **box**, and the logo is fitted inside it — never stretched. The
library has no way to measure an image's aspect ratio outside a browser, which
is the same wall `--label-advance` exists to get around, so `width` and
`height` bound the mark rather than setting it.

`text` and `image` are exclusive. A logo above a wordmark is a lockup, and a
lockup's spacing and proportions belong to whoever owns the mark; pass the
lockup as one image.

Styling is `--furniture-ink` at `opacity: 0.18` — one CSS rule changes it:

```css
.mp .mp-watermark { opacity: 0.4; }
```

### Furniture does not dodge itself

The nine anchors are yours to assign, and nothing stops you putting a watermark
and a scale bar in the same corner. The defaults are three different corners on
purpose — `credit` bottom-right, `scaleBar` bottom-left, `compass` top-right,
`watermark` centre — but there is no layout engine underneath them, and there is
deliberately no auto-placement: where a mark of provenance sits is an editorial
decision, not a packing problem.

### Icons

```ts
import { ICON_NAMES } from "masen-map";

await masen({
  region: "west-europe",
  pins: [
    { at: [4.48, 51.92], kind: "harbor", label: "Rotterdam" },
    { at: [2.55, 49.01], kind: "airport", label: "Roissy" },
    { at: [-1.55, 47.22], kind: "flooding", label: "No icon for this" },
  ],
});
```

A pin's `kind` doubles as the icon name. There is no separate option, because
the icon vocabulary's names *are* the conventional values for `kind` — that is
what it was reserved for.

**A `kind` that names no icon is not an error.** It stays a plain mark and keeps
its `data-kind` for a theme to style, so a category of your own invention goes
on working. `ICON_NAMES` is exported if you want to check first, and
`isIconName()` if you want to ask.

The set is **[Maki](https://github.com/mapbox/maki)**, which is **CC0** — public
domain, no attribution obligation. That is the whole reason it is the set this
library uses: anything under MIT or ISC would propagate a credit-line
requirement into every map anyone generates, and quietly doing that to you is
not something a map library should do. Nothing in your output credits anyone.

Twenty-nine icons, grouped by what a map is usually saying:

| | |
|---|---|
| Movement and logistics | `airport` `harbor` `rail` `ferry` `bus` `fuel` `bridge` |
| Industry and energy | `industry` `warehouse` `dam` `windmill` `construction` |
| Civic and public | `hospital` `police` `fire-station` `school` `bank` `embassy` `town-hall` |
| Settlement | `town` `city` `village` |
| Land and landmark | `mountain` `park` `lighthouse` `monument` |
| Situation | `danger` `roadblock` `shelter` |

Deliberately small: a vocabulary nobody can hold in their head is one where
every author picks a different icon for the same thing.

Maki covers what sits on the ground. It has no `oil`, `natural-gas`, `pipeline`
or `mine` — the geopolitical half a news map runs on does not exist in any
public-domain set, and drawing one to Maki's weight and grid is its own piece of
work, not yet done.

The glyph is inked from `--anno-ink` on a mark filled with `--anno`, and the
mark grows to hold it. The path is **inlined into each pin** rather than
referenced from a `<symbol>`: a `<use>` puts its content in a shadow tree, where
a class-based fill is unreliable across renderers and unreachable by the
flattening pass — and the flattened form exists precisely for the reader that
ignores stylesheets.

### Connections

```ts
await masen({
  region: "europe",
  arrows: [
    { from: [30.73, 46.48], to: [-3.7, 40.42], kind: "grain" },
    { from: [30.73, 46.48], to: [12.5, 41.9], bow: -0.18 },
    { from: [30.73, 46.48], to: [21.0, 52.23], bow: 0 },
  ],
});
```

Trade, migration, supply lines. The first primitive with two coordinates rather
than one, so the guards a pin's `at` gets are applied twice — and an arrow with
either end on the far side of a globe is dropped **whole**. Half an arrow is not
a partial answer; it is a line pointing at somewhere the reader was never told
about.

`bow` is how far the curve leaves the straight line, as a fraction of the
distance between the ends. Its **sign is the side it bows to**, which is how you
get an arrow off a coastline or out from under a second arrow running the other
way. `0` draws a straight line — a real `L`, not a curve that happens to be
flat. It is a curve by default because two places on a map usually have
something between them, and a straight chord runs through whatever is in the way
and reads as a border or a route.

Arrows are drawn **beneath** pins and callouts, because a connection is context
for the things it connects rather than the other way round. `data-fit="0"` needs
both ends on the canvas: an arrow whose destination is off the map has not said
where it goes.

The head is an SVG `<marker>`, which is markup rather than a declaration — so it
lives in the defs block and the theme names it, exactly as the relief filter and
the hatch pattern do. It is styled through `.mp-arrow-head` rather than
inherited from the arrow, because a marker resolves colour where it *sits*, in
the defs block, and not where it is used.

### Routes

```ts
await masen({
  region: ["SE", "NO", "FI"],
  routes: [{
    label: "Stambanan genom övre Norrland",
    stops: [
      { at: [18.06, 59.33], label: "Stockholm" },
      { at: [17.31, 62.39], label: "Sundsvall" },
      { at: [20.22, 67.85], label: "Kiruna" },
      { at: [17.42, 68.44], label: "Narvik", kind: "minor" },
    ],
  }],
});
```

A line through a list of places with a ring at each — a rail line, a march, an
itinerary. Nothing in it is new except the ordering, which is the part that
carries the meaning: a reader *follows* a route, and following needs a sequence.
A stop is a pin by another name (`at`, `label`, `offset`, `kind` all mean what
they mean there), and a leg is an arrow without a head.

`kind: "minor"` draws a smaller ring, which is how a branch reads as a branch
rather than as a second main line. `marks: false` leaves the bare line. The
route's own `label` becomes its `<title>` and part of the map's description.

**A stop the camera cannot see breaks the line rather than being threaded
past.** Skipping it would draw a leg between two places that are not next to
each other — on a globe, a chord straight through the planet — and a route that
claims a journey nobody makes is worse than a route with a gap in it. So the
line is one path of several subpaths, one per visible run.

A route is **not** a road. A road is a fact about the world that has to arrive
from Natural Earth; a route is a claim you are making. That is why routes are
annotations and `.mp-roads` is still an empty layer.

### Cities

Settlements are ranked 1–3: capitals and the largest cities, then everything
over a million, then the rest. `placeRank` decides how far down to draw
(default 2 — which on Western Europe means the thirteen capitals plus Milan,
Hamburg, Munich, Lyon, Marseille, Turin and Barcelona). Every dot also carries
`data-rank`, so a theme can thin them further with one CSS rule.

### Names

Country and settlement names, on by default.

```ts
await masen({ region: "west-europe", theme: "atlas" });     // names included
await masen({ region: "west-europe", labelRank: 2 });       // name more cities
await masen({ region: "west-europe", layers: { labels: false } });  // none
```

`labelRank` decides how far down the settlement ranking to *name* the dots that
are drawn — it defaults to 1, one step tighter than `placeRank`, because a dot
is a mark and a name is a word. Countries are not ranked by you: a country is
named if its name fits inside it, which is a fact about the map, not a setting.

**What placement actually does.** There is no label-placement solver here, and
this is the honest limit of drawing a map as an SVG. What there is:

- **The anchor is the balance point of the largest piece of the country that is
  on the canvas** — not the centroid of all of it, which puts "France" in the
  Atlantic because France's geometry reaches French Guiana. When that point
  falls outside the country, as it does for every crescent and every Croatia,
  it is replaced by the point furthest from any edge.
- **A name that does not fit is set over two lines** at the most even break —
  which is what rescues *United Kingdom*, *South Korea* and *Papua New Guinea*.
- **A country name steps clear of its own capital's name**, one line up or one
  line down, and only if the step keeps it on the country. A capital usually
  sits near the middle of its country, which is exactly where its country's
  name goes; without this, "Madrid" runs through "Spain" on every map.
- **Whatever still overlaps is hidden.** Names are laid down in order — the
  countries with room to be named first, then settlements in the order the data
  ranks them — and anything landing on one already placed is marked
  `data-fit="0"`. Nothing is moved twice and nothing is retried. The world has
  some two hundred capitals and a world map has room for about thirty, so the
  only question is which thirty.

**Nothing is ever dropped from the document.** Every name is written out, and
`data-fit="0"` is hidden by a stylesheet rule you can turn off:

```css
.mp .mp-label[data-fit="0"] { display: revert; }   /* show every name */
.mp .mp-label[data-rank="3"] { display: none; }    /* drop the cramped ones */
.mp .mp-label[data-kind="place"] { display: none; } /* countries only */
.mp .mp-label[data-capital] { font-weight: 600; }
```

Every label carries `data-kind` — `country`, `place`, `sea`, or `pin`, `route`
and `callout` from the annotation layer — plus `data-rank` 1–3 and `data-iso`. For a country, rank is how comfortably the name fits: 1 has room to
spare, 3 overhangs. For a settlement it is the same rank the dot carries.

The fit test has no font metrics — SVG offers no way to measure text outside a
browser — so it estimates width from an average glyph advance and reads
`--label-size` and `--place-label-size` out of your resolved stylesheet. Change
those tokens through `tokens:` and the fit test follows; change them in a
write-time override passed to `render()` and it cannot, because the geometry is
settled by then.

**The limitation that remains:** two country names can still overlap on a very
crowded map, and a settlement name can cross a border it does not belong to.
Ranks exist so a theme can thin its way out of both.

### Names in another language

The bundled data is English. `names` replaces the name of anything the map
labels — keys are ISO codes for countries and settlement names for cities:

```ts
await masen({
  region: "west-europe",
  names: { DE: "Deutschland", FR: "Frankreich", Munich: "München" },
});
```

The new name is the map's name for that feature throughout: the label, the
`data-name` attribute, the hover title, and the accessible description. There
is no `language: "de"` option, because it would need name tables this package
does not ship.

### Choosing layers

```ts
await masen({ region: "west-europe", layers: { borders: false } });
```

This empties `.mp-borders`; it never removes the group. The stack is a fixed
contract, and a document whose shape depends on its options is one no theme can
be written against. The saving is file size, not appearance — hiding a layer is
one CSS rule, but not emitting its path data is real bytes.

## Scripts

| | |
|---|---|
| `npm run check` | typecheck → test → build → verify exports |
| `npm run fetch:data` | download and vendor the Natural Earth sources no package carries |
| `npm run build:data` | build `data/` from `vendor/` and the source packages |
| `npm run build` | dual ESM/CJS bundle plus types |
| `npm test` | vitest; snapshots land in `test/__snapshots__/` as real `.svg` files you can open |
| `npm run dev` | rebuild on change |

## The gallery

`test/__snapshots__/gallery/` holds committed renders across themes, palettes,
projections and canvas shapes, including one map of every continent. They are snapshots, so a diff fails the build —
but they are real `.svg` files, so a diff is also something a person can open.
That matters twice over: Phase 2 shipped a map that rendered as a solid black
square while every string assertion passed, and Phase 3 first shipped this
gallery in a form that only renders where `<style>` is honoured. Every file here
is now checked to carry visible paint with its stylesheet stripped out.

```bash
npm run gallery   # → gallery.html, every snapshot on one page
```

A directory of forty-two SVG files is not something anyone opens either, so
`npm run gallery` builds a contact sheet: all of them inline, in the browser, at
a size where a flat choropleth or a black square is obvious at a glance. What
each map is said to demonstrate is **read back off the markup** rather than off
the test that wrote it, so the page cannot claim a feature a file does not
contain. The output is untracked — three megabytes of inline SVG is a diff
nobody can read, and the snapshots are the tracked thing.

One detail worth knowing if you put several maps in one page yourself: the
stylesheets are safe, because each is scoped to a hash of itself, but the SVG
**ids are not** — `mp-land-clip`, `mp-stripe` and `mp-relief` are constants, so
every `url(#…)` resolves to whichever map came first. The gallery builder
namespaces them per map; anyone embedding two maps on a page has to do the same
until that is fixed.

## License

MIT — see [LICENSE](LICENSE).

**A map made with this carries no attribution obligation, and that is
deliberate.** The users this is built for are publishers, so the geometry was
kept on public-domain sources on purpose rather than by luck.

| What | Source | Licence | Attribution |
| --- | --- | --- | --- |
| Country polygons, coastlines | [Natural Earth](https://www.naturalearthdata.com/) via `world-atlas` | Public domain / ISC | None |
| Lakes, rivers | Natural Earth via `sane-topojson` | Public domain / MIT | None |
| Populated places | Natural Earth, vendored under `vendor/` | Public domain | None |
| Land cover — desert, mountain, glacier | Natural Earth, vendored under `vendor/` | Public domain | None |
| Sea and gulf names | Natural Earth, vendored under `vendor/` | Public domain | None |
| Projection maths | `d3-geo` | ISC | None |
| Topology decoding | `topojson-client` | ISC | None |
| Pin icons | [Maki](https://labs.mapbox.com/maki-icons/) by Mapbox, vendored into `src/icons.ts` | CC0-1.0 | None |

`d3-geo` and `topojson-client` are ordinary dependencies rather than bundled
into `dist`, so their own licence files arrive with them and their terms are
satisfied without this package restating anything. Maki is CC0 and vendored,
because 29 inlined path strings is cheaper than a dependency. The Natural Earth
extracts under `vendor/` are committed rather than fetched, which is why
`npm run build:data` needs no network — and why a publish does not either.

If a source that *does* require attribution is ever added — Eurostat GISCO or
OpenStreetMap are the two that would tempt it — the credit has to be rendered
by the emitter rather than left to the caller, because the person downloading
an SVG from a browser has nowhere else to put it.
