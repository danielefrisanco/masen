# Changelog

All notable changes to this project are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Pre-1.0 policy.** While on `0.x`, the minor bump carries breaking changes and
the patch bump carries everything else — the public API is not yet stable.
`1.0.0` is the taxonomy freeze, which is not scheduled; from there normal semver
applies. **Being on npm is not that promise.** `0.15.0` is the first published
version, and it is published precisely to find out which of these names are
wrong while the version number still says they may be.

**The class taxonomy is public API.** Renaming or reordering a class, a data
attribute, or a token is a breaking change, exactly like changing a function
signature — themes in the wild depend on those names.

## [Unreleased]

### Added

**The map no longer claims Crimea is Russia without saying so.** Disputed and
breakaway areas are drawn as a hatched overlay, **on by default**, from
`ne_50m_admin_0_breakaway_disputed_areas` — 28 areas, 35 KB. New `disputed`
option to turn it off. New `.mp-hatch` features carrying `data-kind`
(`disputed` / `breakaway` / `indeterminate`) and `data-name`, inside the
existing `.mp-land` group — **no new layer slot, so the frozen paint order is
untouched.**

### Why this was a defect and not a feature request

The country geometry resolves contested territory *de facto*: Simferopol falls
inside feature 643, Russia, at every tier shipped. That came in with
`world-atlas` and was never chosen. The library was asserting something
contested in its own voice, unasked, to an audience of newsrooms. Hatching marks
the contested edge instead of resolving it — reassignment would need Natural
Earth's point-of-view layer, which is 10m-only and 13.2 MB, and would swap one
silent claim for another.

Each area carries a `<title>` with Natural Earth's own status line. Crimea's is
*"Admin. by Russia; Claimed by Ukraine"* — quoted, not composed here.

### What measuring found

- **`NAME` is the claimant, not the territory.** It reads "India" seven times
  and "Ukraine" twice. `BRK_NAME` is the territory — Crimea, Abkhazia,
  Transnistria, Aksai Chin — and the build now fails if it is ever absent.
- **The overlay had to be clipped.** It is a global list, so unclipped a map of
  Ukraine emitted Arunachal Pradesh and North Borneo as path data nobody could
  see. Clipped to the canvas, the same map draws four areas.
- **Clipping was not enough.** The gallery caught what the tests did not: a map
  of the Sahara put hatch slivers in the eastern Mediterranean, because the
  Golan Heights and the Ilemi Triangle are inside that frame's longitudes with
  no land drawn under them. Areas are now matched against the countries
  actually drawn, which is the rule the water filter already followed — a lake
  filtered on the viewport alone floats over open sea for the same reason.
- **50m only.** `ne_110m_admin_0_breakaway_disputed_areas` is a 404. A 110m map
  draws nothing here, and the README says so rather than leaving it to be found.

The overlay is deliberately not disputed-specific machinery: a hatched area is
geometry plus a kind plus a name, which is equally "excluded", "evacuated" or
"under review". Widening `stripe` to take a polygon breaks no caller, so it
waits for a real map that asks.

### Added

**Eleven icons for the half of a news map Maki does not cover** — `oil`,
`natural-gas`, `storage-tank`, `mine`, `power-station`, `nuclear`, `military`,
`bunker`, `camp`, `border-crossing`, `ruins`. Forty in the vocabulary now, in
two new groups: *energy and extraction*, and *borders and conflict*. Purely
additive; no existing name moved.

### Why this was cheaper than the plan thought

The plan said for six phases that this vocabulary **did not exist in any
public-domain set and would have to be drawn by hand**. That was asserted rather
than measured, and it was wrong. [Temaki](https://github.com/rapideditor/temaki)
is an expansion pack for Maki from the iD/Rapid editor team, **also CC0**, 557
icons, carrying most of it already. Nothing in anyone's output credits anyone,
which is the property that ruled out Tabler and Lucide and still rules.

### What measuring found that reading names did not

Both of these came from rendering the candidates, and both would have shipped as
defects otherwise:

- **Temaki's grid is not uniform.** 485 of its 557 icons are 15×15; the rest are
  drawn at 48, 50 or 100. A 50-unit path in a 15-unit box draws a shape more
  than three times too big and nothing downstream would say so. The vendoring
  script now refuses anything off the grid, and refuses any icon drawn with a
  `<circle>` or `<rect>` rather than silently vendoring half of it.
- **Its line-drawn glyphs do not survive pin size.** `power_tower`,
  `wind_turbine` and `military_checkpoint` are legible in a picker at 44px and
  turn to grey mush at the 15 units a pin actually draws. What is vendored is
  deliberately the solid half, because the standard is that a map using both
  sets must not show two house styles side by side. Rendered on a real map, it
  does not.

Two candidates were rejected on what they depict rather than on weight:
Temaki's `gas` is a flame, and Maki's `fire-station` is already a flame — two
glyphs that look alike is the failure a small vocabulary exists to avoid. And
`pipe` is a **tobacco pipe**.

Names are remapped on the way in, because Temaki names a file for the object
drawn while this vocabulary is named for what a map is saying with it:
`lift_gate` is a barrier arm, `border-crossing` is why anyone puts one on a map.
The published side keeps Maki's hyphens rather than importing snake_case into
one vocabulary.

### Still to draw

**`pipeline`** — the one named gap that Temaki genuinely does not fill — and a
true conflict glyph, for which `ruins` is a proxy rather than an answer. Two
drawings, where the plan had budgeted a set.

## [0.16.0] — 2026-09-06

**The library is called `masen`.** It was `neatline` from 0.11.0 to 0.15.1, and
before that `mapper`. This is the second rename and it is for a better reason
than the first.

### Why

`mapper` went because npm already had the name. `neatline` goes because
**somebody else's map-making software already had the word** — Neatline, an
Omeka plugin from the Scholars' Lab at Virginia, later Performant Software: a
tool for building exhibits with maps and timelines, fourteen years old, holding
`neatline.org`. Not a registry collision — it has never been on npm, so
`@neatline/map` was never contested — but a collision in the only place that
matters for a project about to be announced, which is what somebody finds when
they go looking. Two map-drawing tools, one word.

The domain was what prompted the check; the incumbent is what settled it.
`neatline.dev` was free and could have been taken. It would have meant building
an audience inside somebody else's search results.

`masen` was chosen for having nothing behind it: no npm package, no PyPI
package, no repository of the name, no software product anywhere. It is a place
near where this was written, which is a naming tradition with a long history and
no obligations.

### Breaking

- **The exported function is `masen()`**, not `neatline()`. A rename, nothing
  else — every option, every return value and every behaviour is unchanged.
- **The package is `masen-map`**, not `@neatline/map`. The project is `masen`
  everywhere else — the repository, the site, the wordmark, the exported
  function — but the npm name could not be. **Bare `masen` is refused by npm's
  similarity filter**, the same mechanism that refused bare `neatline` for
  being close to `readline`; npm reports it as too near `base`, `case` and
  `raven`. **And the `masen` organisation is held** by an account with no
  packages, so `@masen/map` was not available either. `masen-map` is the same
  shape `@neatline/map` had — the brand, then what it is. `@neatline/map` is
  deprecated on npm and points here.

  Two lessons, both cheap to have learned twice: **a registry 404 means the
  name is unregistered, not that it is publishable** — the similarity filter
  only runs at publish time and cannot be tested any other way. And **an npm
  scope being empty is not the same as it being available**.
- **The tool moved** to `danielefrisanco.github.io/masen/`. Old links break —
  GitHub redirects the repository, not the Pages path.
- **Error messages** are prefixed `masen:` rather than `neatline:`.

### Not breaking, deliberately

**The `mp-` class prefix does not move**, and neither does any class, data
attribute or token. `mp` is short for *map*, not for the project, which is why
it survived the first rename too. Every theme anyone has written still works,
which is the whole reason the taxonomy is versioned separately from the name.

## [0.15.1] — 2026-09-05

Three regions that had no name, a frame the size of Russia, and a layer that
was drawn and could not be seen. All three arrived from using the tool rather
than from reading the code, which is now the third release running where that
has been the source.

### Three new region presets

`caucasus`, `baltics` and `central-africa`. A preset is a saved list of ISO
codes and nothing more, so these cost no machinery — and the tool picked all
three up without being told, because its form reads `REGION_PRESET_NAMES` off
the library.

**Central Africa was a genuine hole rather than a missing convenience.** North,
west, east and southern *look* like a complete partition of the continent and
are not: the middle was never named, so the DRC — the second largest country in
Africa — belonged to no regional preset at all, and the neighbours had taken
the edges of it, Chad into `north-africa` and Angola into `southern-africa`. It
takes the UN's Middle Africa grouping, which has the merit of being somebody
else's editorial decision rather than this file's.

`caucasus` was reachable only through `asia` — a frame eleven time zones wide
for three countries that fit inside one. It is the three South Caucasus states,
and it stops there for a data reason rather than a political one: the North
Caucasus is a set of Russian republics, and Natural Earth draws Russia whole at
country level, so asking for it means asking for Russia.

`baltics` is the mildest of the three. Estonia, Latvia and Lithuania were
always inside `east-europe`, which is a usable frame — it just tells a
different story at four times the scale.

**`ST` is in `central-africa` and is absent from the 110m tier**, which carries
177 countries against 241 at 50m. That is safe here in a way it was not for
`GF`: São Tomé is an island, so at 110m it is simply not drawn, where French
Guiana was part of a shape Natural Earth draws as France and omitting it opened
a hole in the coastline.

### `east-europe` no longer contains Russia

**This changes what an existing preset draws.** Natural Earth has one Russia
and draws it whole, so including it framed the camera from Kaliningrad to
Kamchatka: Siberia took two thirds of the canvas and every country the preset
is named for — Poland, Ukraine, the Baltics, all of them — was crushed into the
left quarter with the labels overlapping each other.

The file had already made this decision everywhere else and only missed it
here. `europe` carries no `RU` either, and `east-europe` was the sole preset in
the file containing it. Russia is still perfectly reachable: `region: ["RU"]`
is a map of Russia, and `neighbours: true` now puts it along this frame's
eastern edge as context, which is where a reader expects to find it rather than
instead of the subject.

### `contrast` drew neighbours in the colour of its own ground

`--neighbour` was `#E8E8E8` against an `#E8E8E8` background in light and
`#171717` against `#171717` in dark — **byte-identical in both schemes**, and
so since the layer shipped. Turning neighbours on put Poland and Czechia in the
markup and nothing on the map, and west-europe stopped dead at the German
border, which is precisely the failure Phase 8b built the layer to fix.

This is the sixth defect of exactly that shape, and the theme's own comment two
tokens above records the fifth, where `--glacier` was `#FFFFFF` on `#FFFFFF`
land. `--neighbour` is `#C8C8C8` in light and `#3A3A3A` in dark now.

**The test had been excusing it, which is the more useful half.** The contrast
floor already listed `--neighbour` among the fills it checks, with a comment
saying that a neighbour nobody can see is not context. But the assertion was
`Math.max(fill, outline)` — either half will do — and `contrast` draws a black
coastline at ΔE 92, so every fill in that theme passed on the strength of an
outline `--neighbour` never receives: **`structure.ts` draws neighbours with
`stroke: none`**, alone among the fills being checked. The compound rule was
handing the one strokeless fill an outline it does not have.

**And the first fix for that was wrong too.** Judging `--neighbour` at the same
floor as a country fill failed 24 of 30 presets, which is a rule mis-set rather
than a library-wide defect: context is *meant* to be faint, and Phase 8b's rule
for the layer is that it must not compete with the subject. The spread said so —
`contrast` at 0.0 and every other preset between 2.7 and 11 — and rendering
west-europe across that range settled which of those are real. Blueprint at 3.5
and minimal/slate at 2.9 draw Poland quietly and legibly; contrast draws
nothing. So the line sits between *quiet* and *absent* rather than between quiet
and loud, and the floor for this one token is 2, judged on its fill alone.

### The tool

None of this ships in the package — `files` carries `dist`, `themes`,
`palettes`, `typefaces` and `data` — but it is where the release came from.

A **Feedback button** beside the downloads, sending a message and the map that
prompted it to whoever built this, with no account asked of anyone and nothing
landing in public. The plan had specified a pre-filled GitHub issue; that was
dropped before it was built, because an issue demands a login before a reader
is allowed to say anything.

The tool now carries **the house style of the site that links to it**, and the
**header stays put** while the form beside it scrolls.

## [0.15.0] — 2026-08-31

**Phase 9 is complete.** There is a tool: a page over this library where you
pick a region, a projection and a theme, click the map to mark it, and take the
result away as a file. Everything runs in the reader's browser — the geometry,
the stylesheet, the raster — so there is no server and no account.

The library changed less than the tool did, which was the point. Three additions
came out of using it, and every one of them was a gap the form made obvious.

### Degree labels on the graticule, and the bug they found

`graticule: { labels: true }` writes each line's latitude or longitude on the
frame. Placement follows the rule the scale bar set — measure the drawn
geometry, do not trust the projection's name. A number goes where its line meets
the edge of the *drawn map*, which is not always the canvas: `fitExtent` leaves
slack on one axis, and a world map in equal-earth sits inset by eighty units at
the top.

The edge is chosen once per axis, not once per line. Judged line by line, a
conic's western meridians leave through the left while its central ones leave
through the bottom, and the numbers scatter over two and a half sides of the
frame with 55°N written across 25°W in the corner where the two rows meet.
Longitudes along the bottom, latitudes down the left, unless the conventional
edge carries less than two thirds of the grid. Numbers landing on each other are
thinned first — every meridian on a globe ends at the same pole — and an axis
with fewer than two left says nothing at all, because a reader counts *between*
labels and a single number teaches none of the spacing.

**The lines were not reaching the frame.** They were sampled across the region's
bounds plus a quarter, which is not what the canvas shows: reaching the left
edge of a west-europe conic at 50°N takes a longitude of 26°W, and the margin
stopped at 19°W. Every conic ever drawn with a graticule had parallels ending a
few units short of the edge, and nobody noticed, because a faint line stopping
just inside the frame looks like a faint line. A number that refuses to be
placed does not. The grid is sampled across the ground the canvas actually shows
now, measured by inverting a grid of pixels through the projection with the same
round-trip guard the annotations take.

### A pin's size, as a token the geometry reads

`--pin-size` sets the radius of a pin's mark — and, with it, the icon inside.
It had to be a token rather than a CSS rule a caller writes: a pin is a circle
*and* a glyph scaled to sit inside it, so a rule reaching only the circle grows
the mark and leaves the icon rattling around in it. The geometry reads the value
out of the resolved stylesheet, exactly as it already reads `--label-size`.

Every bundled theme declares it. The class taxonomy is unchanged; the token
vocabulary gains one name.

### A map can have no cities on it

`placeRank` and `labelRank` take `0` now, which is the convention `seaNames`
already used: 0 is the absence of a rank rather than the lowest one. They are
two switches, not one. `placeRank: 0` draws no settlements at all — the right
map for borders, for terrain, for one carrying its own marks. `labelRank: 0`
keeps the dots and names none of them, which is the other half of the sentence
the defaults already make.

No logic changed to allow it: `place.rank > maxRank` was already true of every
rank at zero. Only the types said otherwise.

### The tool

**The form is a workflow**, not the order the controls were built in: Subject,
Frame, What it shows, Marks, Look. The projection and the canvas decide one
thing between them and sat in different groups for no reason but history; Look
went last, being the only group whose answers do not change what the reader is
being shown.

**The last map comes back.** The query string is kept and a bare address reopens
it — with one rule settling the conflict, which is that a shared link always
wins. *Start over* is the way out, because a convenience with no way out is a
trap.

**The preview has a scale of its own.** Fit stays the default; 50%, 100% and
200% are multiples of the canvas's own units, so 100% is the size the file will
actually be.

**The map answers back beside the control that asked.** Not errors — after the
decoder there are almost none — but controls that asked for something the frame
does not contain and look exactly as they do when they worked: glaciers over
Spain, sea names where none fit, a numbered graticule on a globe. Read off the
drawn SVG, never predicted.

**The map takes a keyboard**: focusable, with a cross moved by the arrows and
placed with Enter, held in the map's own units so it survives the zoom. And a
phone layout tested at 390 × 840, where the map goes first.

Pins carry an icon each — `kind` has doubled as a Maki name since Phase 8 and
the tool never sent one — chosen before the click and stored on the pin, so a
map can carry an airport, a hospital and three plain marks.

### Fixed

- **Naming a pin took its icon off.** The rename handler rebuilt the pin as
  `{ at, label }` and dropped everything else on it. Both list edits are
  functions now rather than object literals inside DOM listeners, which is the
  other half of the fix: a transformation buried in an event handler cannot be
  tested.
- **The `?` explanations were unreadable**, cropped to the width of a sidebar
  that scrolls. Fixed to the viewport, opened at the `?` that was clicked,
  repositioned rather than closed when the panel scrolls, and dismissed by a
  click anywhere else.

### The tool's own tests, in a document

Everything about the tool that could be tested as data already was — the URL
round trip, the mark encoder, the export sizes — and **both of the bugs a person
found were in the part data cannot reach.** A `<label>` wrapping a `<select>`
forwarded clicks to it, so a dropdown closed as soon as it opened and only
stayed open while the mouse button was held. A rename handler rebuilt a pin as
`{ at, label }`, so typing a name into a pin dropped with an airport on it
turned it back into a plain mark. Neither is visible in a config object, and
both are a few lines of DOM.

So `test/dom` builds the real form in a real document and operates the real
controls: what a click does, what appears when, and what survives an edit. Both
bugs now have a test that fails without their fix, and so do the things that
only exist as behaviour — the icon dropdown appearing only while pins are being
dropped, an explanation closing when something else is clicked, Escape closing
it *without* the map's own handler seeing the key.

The environment is per-file rather than global: `happy-dom` for these, Node for
everything else, because the library's tests must keep running where the library
runs. And `test/dom` belongs to the tool's tsconfig rather than the library's —
the same boundary 09e walked into from the other side, when a test importing the
export module dragged `window` into a compile that has no DOM on purpose.

What is still not covered, said plainly: the rasteriser, which needs a canvas
happy-dom does not have, and the wiring in `main.ts`, which is a page rather
than a function. Both are checked by driving a real browser.

### The "?" boxes escape the panel, and close when you click away

Filed under 09f, the design pass, and done early because the boxes were
unreadable rather than untidy. An explanation absolutely positioned inside the
form was cropped to the width of the sidebar and clipped at its edge by the very
thing that makes the form usable — it scrolls, and a scrolling box crops its
contents. Fixed to the viewport and positioned by script now: clear of the whole
panel rather than merely of the `?`, so every explanation opens at the same
edge, over the map, at a width a paragraph can live in.

Which is two things the browser then stops doing. A fixed box does not follow
its anchor, so scrolling the panel would leave it behind pointing at a control
that has moved — any scroll closes it. And a popover with no way out feels
stuck, so a click anywhere outside closes it, including on another `?`, so two
are never open at once. Escape closes it too, and stops there rather than also
abandoning a half-drawn arrow.

A group's `?` moved up beside its heading, where it annotates the heading,
instead of floating alone on the line below where it reads as a control.

### Taking the map away

Phase 09e. SVG and PNG, both from the same `render()` — the flattened document,
every computed value on a presentation attribute. That property has been there
since Phase 3 and does real work here for the first time: an `<img>` holding an
SVG is a sealed box that fetches nothing, so a map whose colours lived only in a
`<style>` block would rasterise as black shapes, and one reaching for a webfont
would rasterise without it or taint the canvas and refuse to be read back.

**No server-side rasteriser.** `resvg` or `sharp` would be a dependency the
library will not take and does not need, because every browser already ships
one: draw the SVG into a canvas, ask for `toBlob()`.

**The plan's rule about size belongs to one format, not both.** A poster and a
preview are the same document twice — true of a PNG, and not of an SVG, which
has no size at all. That is the whole advantage of the format, so naming a
vector file `1920x1240` would be claiming something about it that is not true.
The multiplier is the raster's; the SVG is written at the canvas it was drawn
for.

A second correction would have shipped a blank file. A canvas has a limit on
each side *and* a separate one on its area: 8000 × 8000 clears the first while
being a quarter of a gigabyte of RGBA before the encoder is asked for anything,
and past either limit `toBlob` answers `null` with nothing said on the way in.
Sizes that cannot be produced are left out of the menu rather than offered and
then failed — except 1×, which is always offered, since refusing it would be
refusing to save the map the tool has just drawn.

**And the module split along the line 09c drew.** `tool/` needs DOM types and
the library must not have them; `tsc --noEmit` compiles `src` *and* `test`, so
a test importing a module full of `document` dragged that module into the
library's own typecheck, where every browser global is an error. Adding `DOM`
to the library's `lib` would have been the wrong fix for the reason 09c already
gave. So `export.ts` decides what to export, at what size and what to call it,
and is pure enough to test; `raster.ts` does the canvas work, is unreachable
from any test, and says so in its own header.

### The map as something you click

Phase 09d. Four gestures, and not one of them draws anything new — pins,
arrows, routes and `is-highlighted` have all been in the library since Phases 3
and 5. What is new is that a pointer decides where they go: a pin is one click,
an arrow is two, a route is a stop per click until it is finished, and
highlighting is a click on a country rather than on the ground. That the three
annotation primitives are exactly a one-, two- and n-point gesture is a
coincidence, but it is the one the interface is built on.

**Everything is stored as lon/lat, never as pixels.** `getScreenCTM()` undoes
the viewBox and the CSS that scales the map into its column, so a map shown at
any size is clicked accurately; `invert()` undoes the projection. A mark stored
in pixels comes unstuck the moment the map is reframed, and a test holds the
property directly: the same pin lands on two different pixels under mercator and
albers, and on the same ground.

**The far side of a globe is handled in the interface too.** Outside an
orthographic disc there is no ground, `invert()` says so with `null`, and the
page refuses the click out loud instead of doing nothing.

Marks are the first state in the tool that is a *list*, so they carry their own
encoder: `hl=FR,DE`, `pin=lon,lat,Label`, `arrow=lon,lat,lon,lat`,
`route=lon,lat;lon,lat`. Coordinates are rounded to four decimal places — about
eleven metres — at the moment they are made, so the map draws what the link
says. A label shares the pin's parameter with the separators stripped out,
because two parallel lists that can fall out of step is a worse failure than a
lost comma. Every list is capped, since a URL is the one input to this tool that
arrives from somewhere other than its own form.

**`highlight` is the only mark the library rejects.** An unrecognised code
throws and takes the whole render with it, so codes are resolved against the
library's own table at decode time and dropped if it does not know them —
sharper than the rule 09c set for everything else, and the same reasoning.

Which country was clicked comes from `elementsFromPoint` rather than a
point-in-polygon test: the browser has already decided what is under a pixel in
order to paint it, and the topmost-first list steps past a city dot or a label
instead of mistaking it for the country underneath. A neighbour carries an ISO
code and cannot be highlighted — context must not compete with the subject — so
clicking one says why.

**The mode is deliberately not in the URL.** Marks are what somebody made; the
gesture that placed them is not, and a shared link that dropped its reader into
arrow-drawing mode would be sharing the tool rather than the map.

Phase 09a — the library in a browser. No user interface: the one thing in the
runtime path that could not work in a page, fixed where it is cheapest to test.

### One data loader instead of three

`loadWorld`, `loadOcean` and `loadCover` each built a URL and read it through
`node:fs/promises`; 8d and 8e added the second and third. They now share one
`readData(url)` that **branches on the protocol**: a `file:` URL is read from
disk, anything else is fetched.

Asking rather than trying, and the order is the reason. Node has had a global
`fetch` since 18, so "try fetch, fall back to the filesystem" would make every
Node caller pay a failed request for a `file:` URL before getting the answer.
The protocol is free to check and cannot be wrong — a package on disk resolves
`import.meta.url` to `file:`, and a bundle served over HTTP resolves it to
wherever it was served from.

The failure message follows the reader. On disk it still says
`npm run build:data`; over HTTP it names the URL that went unanswered, because
telling someone who opened a web page to run a build script sends them
somewhere they cannot go.

### Sixteen more regions, and a picker that shows their names

The continent list left most of the world unreachable without writing codes by
hand. Twenty-five presets now: `east-europe`, `nordics`, `balkans`,
`mediterranean`, `central-america`, `caribbean`, `north-africa`, `west-africa`,
`east-africa`, `southern-africa`, `middle-east`, `central-asia`, `south-asia`,
`southeast-asia`, `east-asia` and `pacific` join the nine that were there. All
appended, none reordered, so no existing name moves.

They overlap on purpose — Turkey is in four of them — because a region is a
frame somebody wants rather than a partition of the planet.

**`countryTable(detail)`** returns every country the data can draw, with its
name. `isoTable()` has been here since Phase 1 and answers a different question:
it is the code-to-numeric-id map and carries no names, so a caller building a
picker had codes and nothing to show beside them. The tier is an argument
because the tiers hold different countries — 177 at 110m, 241 at 50m.

### Every option as a control, and a link that rebuilds the map

Phase 09c. A form over `MapOptions` — region as a preset or a list of ISO
codes, projection, theme, palette, typeface, detail, the layer switches, the
two name ranks, canvas size, credit, and sliders for `--border-width` and
`--label-size`. Nothing in it knows what a theme *is*: the dropdowns are built
from `THEME_NAMES`, `PALETTE_NAMES`, `PROJECTION_NAMES` and the rest, so a
palette added to the library appears in the tool on the next build.

**The whole configuration is in the URL, and that is in this sub-phase rather
than a later one on purpose.** State threaded through afterwards has to be
retrofitted into every control at once; doing it while there is one control is
nearly free. Two rules keep the links usable: only what differs from the
default is written, so a fresh page has a bare address and a shared one carries
exactly the decisions its author made; and the keys are readable, because they
end up somewhere people look at them.

Nothing in the decoder throws. A URL is user input arriving from a link that
may have been edited, truncated by a chat client, or written against an older
version of the tool, and the useful answer to a bad parameter is the default —
drawn immediately. The one thing that must not happen is a value reaching the
library that it will reject, because that fails the whole render rather than one
control, so an unknown region, an out-of-range number and an invented cover kind
are each dropped at the edge. A test draws every configuration the URL can
express.

**What a URL cannot carry, said rather than hidden:** a caller-supplied GeoJSON
region has no short form. The library still takes one; the tool declines to
encode it, and offers a preset or a list of codes.

The country field is a searchable multi-select rather than a text box, with the
name beside every code — nobody knows Switzerland is `CH` unless they have met
the problem before. Its list comes from `countryTable()` at the current detail,
so it can never offer a country that then fails to appear.

**Two bugs found by someone using it.** A `<label>` wrapping a `<select>`
forwards clicks to it, so a click landing on the dropdown fired twice — opening
the menu and closing it again — and it only stayed open while the mouse button
was held. The labels point at their controls by `for` now. And `--border-width:
0` did remove the borders, but every country still carried its own outline from
`--land-edge-width`, which reads as the slider not working; that token has a
slider of its own, so both lines are reachable and either can be turned off.
Type can go down to 6 now rather than stopping at 8.

`.nojekyll` ships with the build. If Pages ever processes the output with
Jekyll, it silently deletes files whose names begin with an underscore — and
Vite names one of its chunks `__vite-browser-external-<hash>.js`, which is the
module standing in for `node:fs/promises`. `npm run tool:build` also verifies
the built site before it can be deployed: every asset the page names must
exist, and all six data files must be present and the right size. Vite emitting
a *reference* is not the same as the file arriving, and the difference only
shows up as a 404 in somebody's browser.

`tool/` is typechecked now, through a second tsconfig. It needs DOM types and
the library must not have them — with `DOM` in the library's `lib`, a stray
`document` in `src/` typechecks cleanly and then throws in Node, which is
exactly the class of bug 09a existed to remove.

### A skeleton, on a real address

Phase 09b. `npm run tool:dev` and `npm run tool:build` build a page that draws
one hard-coded map, and a Pages action publishes it off `main`. Deliberately a
page nobody chose the contents of: the sub-phase is about the pipeline, and a
static site whose deploy is first attempted at the end of a phase is a site that
turns out to have worked only on the machine that built it.

**The base path is the trap it was set up to catch.** A GitHub project site is
served from `/neatline/`, not `/`, and a wrong base does not fail loudly — the
server answers a request for data with its 404 page, `JSON.parse` chokes on
`<`, and what reaches the console is a syntax error three modules down. The dev
server runs on the same base as the deploy, and the page names that failure
rather than leaving it to be inferred.

**Vite resolves the data URLs itself, and a copy step was written before that
was checked.** The library asks for `../data/<name>.json` against
`import.meta.url`; Vite recognises that pattern even with a variable in it,
globs the directory at build time and rewrites it into a lookup of hashed asset
URLs. The plugin that copied `data/` beside the bundle was three and a half
megabytes of duplicate. What it does now is the part Vite cannot: fail the build
when `data/` is empty, since an empty glob ships a tool that draws nothing and
says nothing about why.

### The library did not bundle for a browser, and the plan said it did

The plan claimed the `node:fs` imports were "lazy, on paths the tool never
takes, so a bundler drops all three". **A bundler does not drop a dynamic
import — it has to resolve it**, and esbuild targeting a browser failed
outright with `Could not resolve "fs/promises"`. Two things were wrong:

- **tsup was stripping the `node:` prefix** from every builtin import in the
  shipped build. That prefix is the only thing telling a bundler the name is a
  builtin rather than a package to go and find. `removeNodeProtocol: false`
  keeps it, and `external: [/^node:/]` stops `platform: "neutral"` trying to
  resolve it on disk.
- **Nothing said what a browser should do with the builtin once named.** A
  `browser` field maps `node:fs/promises` to an empty module, so a browser build
  resolves it and never executes it — `readData` checks the protocol first.

`npm run check` now bundles `dist/` for a browser and fails if a live `node:`
import comes back. It is checked there rather than in the test suite because it
is a fact about `dist/`, which is what a bundler sees.

### Published, as `@neatline/map`

This is the version that went to npm, and it went under a scoped name. npm
refuses the bare `neatline` as too close to `readline` — a typosquat guard, and
not one worth arguing with. The scope turned out to be the better shape anyway:
`neatline` is a project rather than a single library, so the org is where a
second one would go, and `@neatline/graph` is the kind of thing that would sit
beside this. Nothing else moved — the repository, the site and the `mp-` class
prefix are unchanged.

Publishing is a release, not a push. `.github/workflows/publish.yml` runs on
`release: published` and authenticates over OIDC through npm's Trusted
Publishers, so there is no `NPM_TOKEN` in this repository to leak or rotate. It
runs `npm publish` and nothing else on purpose: `prepublishOnly` is
`npm run check`, so the gate is the same one a person gets locally.

## [0.14.0] — 2026-08-30

Phase 8d, closed at five items, and Phase 8e — the second ingest, where
everything left starts with a download rather than a keystroke. Land cover and
sea names shipped; **roads and rail moved forward to Phase 10, on a
measurement.**

### Land cover

`terrain: true` draws desert, mountain and glacier into `.mp-terrain`, the
layer reserved since v1, over the land it tints and under the water. Each shape
carries `data-kind`; `--desert`, `--mountain` and `--glacier` move from
reserved to live. A list rather than `true` draws only what it names, which is
how a map of the Alps gets its mountains without the Sahara arriving too.

**There is no forest.** Natural Earth publishes no forest polygon at any tier —
land cover of that kind lives in rasters — and deriving one from a climate band
would make this the only layer here that invents its subject. Three that are
true beats four where one is made up. `--forest` stays reserved.

**The classification only exists at 10m, and the plan did not know that.**
`geography_regions_polys` is the source and it ships `FEATURECLA` populated at
10m alone: at 50m and 110m the column is blank on **every** feature, so those
files are a list of named shapes with no way to tell the Sahara from
Scandinavia. `NE_ID` is stable across tiers, so the ingest joins the 10m table
onto the coarser geometry — 60 of 60 at 110m, 522 of 522 at 50m — and throws
rather than shipping an unclassed blob. The class is still Natural Earth's;
nothing here guesses from a name.

Clipped twice: to the viewport for the ocean's reason, and to the land the map
drew, because a cover polygon is a climate band on a coarse outline and runs
out over the sea wherever the coast is finer than the band. Its geometry is a
file of its own — 52 KB at 110m, 589 KB at 50m — read only when this is on.

**Three themes were carrying cover colours that had never been drawn**, which
is the fifth defect of that exact shape in this project and the first caught in
the same week the token went live. `atlas` and `minimal` inherited a cream
desert and a near-white glacier into their dark blocks, where the Sahara came
out as a lamp over near-black land; `contrast` inherited a black `--sea-ink`
onto a `#171717` dark ground, a name the reader is told is there and cannot
see. All three now author the values for the ground they are drawn on.

### The names of seas

`seaNames` sets the names of seas, gulfs and straits in italic on the water in
`--sea-ink`, into the same labels layer country and city names use, carrying
`data-kind="sea"`. `--sea-ink` moves from reserved to live.

The rule it keeps, and a reader can check it: **a sea is named when its middle
is on the map.** The anchor is the interior point furthest from that sea's own
shore, because a centroid is not good enough for the shapes worth naming — the
Mediterranean's falls over Sicily. It is computed once at build time and the
polygon is then discarded, which is what turns 1.5 MB of coastline into 9 KB of
anchors that ride along in the bundle. The trade is stated rather than hidden:
a map framed on a sliver of a sea whose middle lies elsewhere does not get that
sea's name.

Ranked 1–3 the way settlements are — oceans and great seas, then the named
basins, then straits and bights — and judged **last** in the collision pass, so
a sea name gives way to every name on land.

### Routes

`routes: [{ stops: [{ at, label? }, …] }]` — a line through a list of places
with a ring at each. The fourth annotation primitive, and the only item in this
phase that needed nothing downloaded, which is why it did not wait behind the
road layer. Nothing in it is new except the ordering, and the ordering is the
meaning: a reader follows a route.

`kind: "minor"` draws a smaller ring, so a branch reads as a branch.
`marks: false` leaves the bare line. **A stop the camera cannot see breaks the
line rather than being threaded past** — skipping it would draw a leg between
two places that are not adjacent, and on a globe that leg is a chord through
the planet.

`mp-route`, `mp-route-line` and `mp-route-stop` join the reserved class list.

### Roads and rail, moved to Phase 10

Not deferred on a feeling. The files were downloaded and counted, and the
plan's guess — "strongest in North America and Europe, thin elsewhere" — is
right in direction and much starker in fact. Of the roads Natural Earth
carries, the share that is classified at all:

| | classified | of | by length |
|---|---|---|---|
| North America | 8,802 | 9,237 | 95% |
| Oceania | 746 | 856 | 88% |
| Europe | 3,382 | 9,849 | 45% |
| Asia | 5,250 | 25,505 | 13% |
| South America | 274 | 4,204 | 5% |
| **Africa** | **208** | **6,761** | **1.7%** |

Africa has 420,000 km of road in the file and 7,000 km of it is classified. A
map of the Sahel drawing only what is classified shows almost nothing; drawing
everything shows an unlabelled tangle. Both are wrong, and neither is fixable
by rendering code.

The weight is the second half of it. Vendored and trimmed, the classified roads
are **5.4 MB** and the railroads **23.6 MB** — against 884 KB for everything
else this phase vendored — and both exist at 10m only, so a world map has no
thinned version to fall back on. What roads actually need first is a thinning
pipeline and a coverage gate, neither of which exists, and both of which are
build machinery rather than a road feature. So the item moves *forward* to
Phase 10, after the tool, which is where anyone will first ask for it.

### Ingest, made reproducible

`scripts/fetch-natural-earth.mjs` downloads, trims and vendors the Natural
Earth sources no npm package carries. `vendor/places-*.raw.json` had been there
since Phase 4 with no record of where it came from; there is one now. Files are
trimmed on the way in rather than on the way out — a Natural Earth GeoJSON
carries about thirty translation columns per feature — so what is committed is
what will be used.

### The graticule

The layer reserved since v1 is filled, and nothing above it moved — which is
the whole return on having reserved it. `graticule: true` takes a spacing
chosen from the region (roughly six lines across, snapped to 0.5/1/2/5/10/15/
30/45), or `graticule: { step: 10 }` / `{ step: [45, 10] }` says which.

The equator and the tropics are drawn apart from the grid, on `--equator`
rather than `--graticule`, and the parallel set skips those three latitudes so
they are never stroked twice. A parallel at the pole is not drawn at all: it is
a point, and on a cylindrical projection it would be a line across the top of
the map claiming the pole is a place.

The lines are built here rather than taken from `d3.geoGraticule()` for one
reason — a generator that returns an undifferentiated MultiLineString cannot
say which of its lines is the equator.

`--graticule`, `--graticule-width` and `--equator` move from reserved to live.

### An explicit centre

`center: 160` builds the projection around that meridian; `center: [100, 20]`
turns a globe to face that coordinate. This is the projection's **axis**, not
the middle of the canvas — `fitExtent` still frames the region wherever the
rotation puts it, so what changes is how far the meridians fan and how much the
map shears, not where the subject sits on the paper.

It also overrides the rule that keeps a world map Atlantic-centred, which is
the point: a Pacific-centred world map is exactly what no automatic rule will
ever produce for you.

A latitude is accepted only by projections that turn in both axes. Tilting a
cylinder or a cone off the equator makes an *oblique* aspect — a different map
rather than a recentred one — so asking for one throws instead of quietly
obliging.

### A contrast floor, and three palettes that were under it

The known defect is fixed and now has a test under it. `sand` set
`--land-edge` to the background colour exactly, `dusk` did the same, and
`slate` set it to white on a near-white sea — so a pale country on a coast had
neither a fill nor an outline dividing it from the water, and Eritrea was
simply not there. All three now have a real coastline: `#CDBB98`, `#2E4053`
and `#B6BFC9`.

**The metric is perceptual difference, not a WCAG contrast ratio.** The ratio
was tried first and rejected by measurement: it scores `atlas` at 1.04 — a
failing grade — because atlas draws a warm tan coast on a cold blue sea at
almost identical lightness, and that coast is unmistakable on screen. WCAG
cannot see hue, and half the cartography here is hue. ΔE in Lab sorts the
presets the way an eye does, and the floor of 10 is set from `moss` (13.8, the
weakest preset judged readable) rather than from a round number.

The floor is compound, because the failure is: a country reads against the sea
if **either** its own fill differs from the water **or** the line drawn round
it does.

One thing the measurement turned up on the way: a palette is appended after a
theme, including after the theme's dark block, and `@media` carries no
specificity — so **a palette replaces a theme's dark mode** rather than being
overridden by it. `minimal` + `dusk` is a dark map in daylight. That is what
choosing a palette means here, and it is now written down.

### The sea, as a shape

`sea: true` draws the ocean as a polygon under everything, filled from
`--sea`. A twelfth layer, `.mp-ocean`, and the one that could be added late
without breaking anything: it went *underneath* all eleven, and nothing
restacks when a layer is put below the bottom. Under the graticule rather than
over it, because an atlas draws its meridians across water.

**What it fixes.** `--bg` paints the whole canvas and the land is drawn on top,
so blue has never meant "water" — it has meant "nothing was drawn here". Those
are the same thing only when the region has coastline all the way round. They
come apart the moment the frame holds land the map is not drawing: a map of
Croatia painted Bosnia the same colour as the Adriatic, a map of Italy painted
Austria as sea, and a map of Switzerland put the whole of central Europe
underwater.

**Clipped to the canvas, which is the difference between shipping it and not.**
The ocean is one polygon carrying every coastline on earth. Drawn unclipped, a
520×400 map of Greece came out **806 KB** of path data for the few gulfs anyone
can see, and a map of Switzerland came out **858 KB** to draw nothing at all.
`clipExtent` cuts it against the viewport before it is emitted: Greece is 11 KB,
and an inland frame clips to nothing — which is the honest answer there, since
no ocean reaches Switzerland.

**The geometry lives in its own file.** 74 KB at 110m and 985 KB at 50m, half
again the size of the rest of the bundle, read only when `sea` is on. An opt-in
layer every caller downloads is not opt-in — and the loading seam has been async
and swappable since Phase 4 exactly so a layer could move out of the bundle
without reaching anyone.

`--sea` is live, and set by every preset. The five whose ground is already an
ocean set it to that same colour, so turning this on cannot change a map that
was already right; the five whose ground is paper or transparent give the sea a
colour of its own, because those are the ones the old answer was wrong for.

Depth is filed as a far-future improvement rather than built. Natural Earth
publishes bathymetry as depth bands and the rendering would be nothing new —
`data-depth` and `--sea-1…n`, the shape the choropleth already has — but it
exists only at 10m, so it starts with a download.

### A palette that is not atlas-muted

`limes` — flat editorial plates, brick red and ochre against olive on a deep
teal sea, with near-black linework. The four that came before it all suit a
reference map and none of them suits a page someone is meant to stop at.

Its sea is the dark half, which has one consequence worth knowing: its
`--furniture-ink` and `--sea-ink` are *light*, because a credit line and the
name of a gulf are both set on the water.

## [0.13.0] — 2026-08-29

Phase 8 opens here. `invert()` first, because it is the one thing in the phase
nothing else can be built on top of. Then pins, which are where the annotation
API gets decided: arrows, callouts and icons all have to say *where*, and
whatever shape the pin takes, the other three copy it.

### Fixed

- **`contrast` drew ice in the colour of the land under it**, and roads in the
  colour of the land over it. `--glacier` was `#FFFFFF`, which is that theme's
  `--land`; and `--road` was never redefined in the dark block, so it stayed
  black on black land. Neither had ever rendered, because terrain and roads are
  both reserved — which is exactly why neither had been caught.

  Found by a new preset test rather than by a picture. Four of this phase's
  defects were one mistake wearing different names: a preset copying a
  neighbouring value into a token nothing consumed yet. Nine reserved tokens sit
  in that position today. What cannot be checked is whether they look good; what
  can is that each differs from what it will be drawn against, because a tint
  the colour of its ground is not a tint. `contrast`'s whole cover ramp moved
  below `#D8` as a result, so it clears the white land above it and the grey sea
  beside it.

- **Two maps can share a document.** The stylesheets have been scoped to a hash
  of themselves since Phase 3, which made this look as though it already worked.
  It did not: an `url(#…)` resolves against the whole document and the SVG ids
  were constants, so with two maps on a page every `url(#mp-land-clip)` found
  whichever map the parser reached first — one map's rivers clipped to another
  map's coastline, and nothing in either file to say so. This was the one item
  marked *blocking* for the web tool's live preview.

  Every id a map emits is now namespaced by a hash of that map: `mp-land-clip`,
  `mp-stripe`, `mp-relief`, `mp-relief-soft`, and the `mp-shadow-n` filters the
  flattening pass generates.

  **The authored name does not change.** A theme still writes
  `filter: url(#mp-relief)`, which is what the docs promise and what every
  stylesheet in the wild already says; only the emitted pair moves, together —
  the id on the definition, the reference in `map.css`, and the reference baked
  onto a presentation attribute when styles are flattened. An id the caller
  invented is left exactly as written.

  The hash is derived rather than counted, so a map's bytes never depend on how
  many maps were built before it. It covers the stylesheet, the land outline,
  the canvas, the projection, the detail tier and the subject — the last of
  those because a map of France and a map of Italy on one theme, neither drawing
  water, have no clip path to tell them apart and were handing the same name to
  two different documents.

- **`scripts/build-gallery.mjs` no longer rewrites ids by hand.** It has been
  namespacing every id in every snapshot since the contact sheet was added,
  which fixed the gallery and nobody else's page. The library does it now.

### Changed

- **The `furniture` layer is `live`**, `mp-credit` leaves `RESERVED_CLASSES`
  because it is now a layer's own feature class, and `--furniture-ink` goes
  live. Additive; no name changed and no layer moved.

- **`--anno` has its own shade in every preset**, instead of being a copy of
  `--accent`. All nine shipped the two byte-for-byte identical, which was
  harmless while nothing consumed `--anno` and wrong the moment something did:
  on a map with a highlight *and* an annotation — which is the map this whole
  layer exists to make — the pin, the leader line and the balloon were drawn in
  the highlighted country's own colour and sank into it. Light presets take a
  deeper shade of the same family and dark ones a lifted shade, so an annotation
  still reads as part of the design rather than as a clash.

  The casing added with the pins hid half of this: a mark cased in `--label-halo`
  survives a colour it matches, and a callout's box and leader do not. Both are
  now held by a preset test asserting `--anno` differs from `--accent` *and* from
  `--label-halo`, in light and in dark, for every theme and palette.

- **A callout's box is outlined in `--anno-ink`**, so the balloon has an edge on
  any ground it lands on rather than relying on its fill alone.

- **`--anno-ink` is live**, and only inside a callout. The comment left on it a
  day ago said it would start doing something "when a callout has a box to put
  ink inside", and that is exactly what happened: the box is filled from
  `--anno`, the caption is set in `--anno-ink`, and every preset has been
  carrying a value that contrasts against `--anno` since Phase 3. A pin's label
  still takes `--ink`, because it sits beside its mark rather than inside it.

- **`LabelSizes` carries `track`.** `--label-track` was read by nothing, and the
  width estimator ignored letter-spacing entirely — which is fine for the label
  fit test, since it errs low on purpose, and wrong for anything that has to
  draw a box around text. The country and settlement labels are unchanged; only
  the callout consumes it.

- **The `annotations` layer is `live`** rather than `reserved`, `mp-pin-mark`
  joins the class list, and `--anno` moves from `reserved` to `live`. All three
  are additive — no name changed and no layer moved, so every theme already
  written keeps working — but the contract snapshot locks the status of each,
  and it fails on purpose until someone says the change was meant.

- **`--anno-ink` stays reserved, and its meaning is written down.** It was the
  obvious fill for a pin's label and would have been invisible: every preset
  sets it to the same value as `--label-halo`, because what it was authored to
  mean is the ink drawn *on top of* a mark, legible against `--anno`. A pin's
  label sits beside the mark rather than inside it, so it takes `--ink` like
  every other name on the map. This starts doing something when a callout has a
  box to put ink inside.

- **`RESERVED_CLASSES` says what it actually holds.** It was documented as
  "claimed but not built" and stopped being that when the first prism was drawn:
  `mp-prism-top` and `mp-hatch-line` are emitted on every extruded and hatched
  map and are still in the list. The rule it really follows is that `LAYERS`
  names one feature class per layer and everything else a document can contain
  is named here, built or not.

### Added

- **`watermark`, and Phase 8c closes.** A wordmark or a logo stamped on the
  canvas. A bare string is text at the centre; `{ image }` takes a `data:` URI,
  or under Node a path to a `.png`, `.jpg`, `.gif`, `.webp` or `.svg`, which is
  read and **embedded**. The whole point of this library's output is that one
  file is the whole map, and a watermark referencing a logo on disk would stop
  working the moment the SVG was emailed to anyone.

  **It is attribution, not protection**, and the docs say so rather than letting
  anyone assume otherwise: a watermark on an SVG is a node in a file the reader
  can open, select and delete. It marks provenance and enforces nothing.

  A logo is given a *box* and fitted inside it, never stretched — the library
  has no way to measure an image's aspect ratio outside a browser, the same wall
  `--label-advance` exists to get around. `text` and `image` are exclusive,
  because a logo above a wordmark is a lockup and a lockup's proportions belong
  to whoever owns the mark.

- **`scaleBar` and `compass`, and the two claims a map has to earn.** These are
  the only furniture that says something about the *ground* rather than about
  who made the map. A credit line cannot be wrong. A bar reading `500 km` on a
  frame where 500 km is sometimes 80 units and sometimes 160 is simply false,
  and nothing in the markup says so.

  So neither is drawn on request alone. The canvas is sampled — a few hundred
  probes through `project` and `invert` — and the piece appears only if its
  claim holds: `scaleBar` when the largest local scale over the smallest is
  within `tolerance` (default `1.1`), `compass` when north leans no more than
  `tolerance` degrees off vertical (default `5`).

  **The rule this replaced was wrong in both directions, and it was this
  project's own.** "A scale bar is meaningful only for the conformal and
  equal-area projections" had never been measured. Mercator is conformal and
  varies by **2.76** across a frame of Europe, so the rule would have permitted
  a bar that lies by nearly three to one. Orthographic is neither family and
  varies by **1.07** over India, so the rule would have forbidden one closer to
  true than the bar it had just allowed. Honesty depends on the extent, not on
  the projection's family — the same lesson the `invert()` round trip taught
  earlier in this phase, which is that a category is not a measurement.

  The two claims come apart, which is what no family rule can express:
  `europe/mercator` gets an arrow and no bar; `west-europe/conic-conformal`
  gets a bar and no arrow, its scale uniform to three per cent while its
  meridians fan 22° apart at the corners.

  The bar's number is always 1, 2 or 5 times a power of ten, so the width is
  derived from the number rather than the number from the width — a bar reading
  237 km is a bar nobody can step across a map. `units: "mi"` measures in miles.
  Verified by laying the drawn length down in three places on each canvas and
  asking the sphere how far that is: worst error 3.8% across eight maps.

- **`map.distortion()`** — `{ scale, north, kmPerUnit, samples }`, measured on
  first call and kept. A refusal a caller cannot inspect is a bug report waiting
  to happen: asking for a scale bar and receiving none should be answerable with
  a number. A map that never asks never pays for the sampling.

- **`.mp-scale` and `.mp-compass` stop being reserved**, each a group holding
  its mark and its number — `.mp-scale-bar` / `.mp-scale-label` and
  `.mp-compass-needle` / `.mp-compass-label` — because a theme has to be able to
  restyle the measurement and the text of it apart.

- **`credit`, and the furniture layer stops being empty.** Phase 8c opens here.
  A line of text on the canvas — a source, a byline, a date — anchored to one of
  nine positions and styled from `--furniture-ink`. A bare string takes the
  default anchor; `{ text, anchor }` names one.

  The anchor is to this layer what `at` is to the annotations: the one decision
  the rest of it copies. A watermark, a legend, a scale bar and a north arrow
  all have to answer *where on the canvas*, and they will all answer it this
  way. It carries an alignment as well as a point, which is the half that is
  easy to forget — a credit anchored `bottom-right` is text whose *end* sits
  there, and placed by coordinate alone a long one runs off the canvas.

  This is the only layer that is not geographic, and the test that matters says
  so: the same credit on four maps of different regions under four different
  projections lands on exactly the same pixel. The moment that fails, it has
  stopped being furniture and become a caption on the ground.

  Its inset is the map's own `padding`, so furniture lines up with the margin
  the map was already drawn inside. It is deliberately absent from the
  accessible description — a credit says who made the map, which is not what the
  map is *of*.

- **Icons: twenty-nine of Maki, inlined.** A pin's `kind` doubles as the icon
  name — no separate option, because the vocabulary's names *are* the
  conventional values for `kind`, which is what it was reserved for. A `kind`
  naming no icon stays a plain mark and keeps its `data-kind`, so a caller's own
  category goes on working rather than throwing or drawing a blank.

  Maki is CC0. That is the reason it is the set: anything under MIT or ISC —
  Tabler, Lucide, however good they look — propagates a credit-line requirement
  into every map anyone generates, and a library that quietly does that to its
  users is not one worth shipping. Nothing in the output credits anyone.

  The glyph is inked from `--anno-ink` on a mark filled with `--anno`, and the
  mark grows to hold it. The path is **inlined per pin** rather than referenced
  from a `<symbol>`: a `<use>` puts its content in a shadow tree where a
  class-based fill is unreliable across renderers and unreachable by the
  flattening pass. Duplicating a few hundred bytes is much the cheaper mistake
  than an icon that vanishes on export.

  `scripts/build-icons.mjs` vendors the subset and the output is committed, so a
  checkout builds without the icon package present. Its first run emitted every
  path with XML character references intact — `&#xA;` where Maki carries a line
  break inside a `d` attribute — which escapes on the way into the document and
  arrives as literal text no path command recognises. Every icon would have
  drawn as nothing. The script now decodes and then validates that each path
  contains only characters a path command uses, and a test asserts the same of
  the committed data.

  Maki has 215 icons and covers what sits on the ground. It has no `oil`,
  `natural-gas`, `pipeline` or `mine`, so the plan's claim that the geopolitical
  half has to be drawn is now measured rather than asserted.

- **`arrows` — a curve between two coordinates, with a head on the far end.**
  Trade, migration, supply lines. The third primitive, and the first with two
  `at`s rather than one, so the locator settled for the pin has to hold twice
  over: both ends are validated the same way, both are guarded the same way, and
  an arrow with either end behind a globe is dropped **whole**. Half an arrow is
  not a partial answer — it is a line pointing at somewhere the reader was never
  told about.

  `bow` is how far the curve leaves the straight line, as a fraction of the
  distance between the ends, and its sign is the side it bows to — which is how
  a caller gets an arrow off a coastline or out from under one running the other
  way. `0` emits a real straight line rather than a curve that happens to be
  flat. A curve is the default because two places on a map usually have
  something between them, and a straight chord runs through whatever is in the
  way and reads as a border or a route.

  Arrows are drawn beneath the pins and callouts: a connection is context for
  the things it connects, not the reverse. Two coordinates that project to the
  same pixel draw nothing, because there is no direction to orient a head along.

- **`marker-start`, `marker-mid` and `marker-end` survive flattening.** They are
  presentation attributes in SVG 1.1 and the flattening pass did not carry them,
  so an arrow exported for a reader that ignores stylesheets would have arrived
  as a line with no head. That is the same failure this project has already
  shipped twice — a choropleth flattened to one colour in 0.7, a prism flattened
  to a silhouette in 0.6 — and it is the exact reader the flattened form exists
  for. Found before it shipped this time, by checking the list rather than the
  render.

- **`callouts` — a caption tied to a coordinate by a leader line.** The second
  annotation primitive, and it says `where` the way the first one does: same
  `at`, same validation, same round-trip guard against the far side of a globe,
  same `data-fit`. That was the point of settling the pin first.

  It is a separate primitive rather than an option on the pin because the two
  differ in which half carries the meaning. A pin says *there is something here*
  and the mark is the subject; a callout says *this sentence is about here*, and
  the words are. Hence the box: a single word can sit on a coastline behind a
  halo and a sentence cannot. There is deliberately no mark at the anchor — the
  leader already ends there, and a caller who wants a dot adds a pin at the same
  coordinate, which is the composition this layer exists for.

  `offset` places the corner of the box nearest the point and the box grows away
  from it, so the sign of the offset is the direction the box goes and the leader
  always lands on a corner the caller can predict. `width` sets the column the
  caption wraps in; the wrap is greedy rather than the even-split search the
  country labels use, because that one is balancing two lines of a name and this
  one is setting a sentence in a column.

  **The box is sized from an estimate, and the estimate had to be taught two
  things.** SVG cannot measure text outside a browser, so the width comes from
  `--label-advance` — which the label engine tunes to read *low*, because a name
  that does not fit is hidden and over-reading would hide names that fit. A box
  fails the other way: under-read and the caption prints out through the side,
  which is what the first render did. So the callout rounds the estimate up by
  30%, measured with `getComputedTextLength()` across the three bundled stacks at
  weights 400, 500 and 700, where a realistic caption runs at most 1.28× the
  estimate. And it adds `--label-track`, which nothing had been reading: `noir`
  sets it to 0.3, and over a twenty-character line that is six units the box was
  not accounting for. Both are held by a test that computes the bound from an
  independently measured constant, so lowering either fails.

- **`pins`, and the annotation layer stops being empty.** A mark at a
  coordinate, optionally with a word beside it, rendered into the
  `.mp-annotations` group reserved since Phase 2. `{ at: [lon, lat], label?,
  id?, kind?, offset? }` — `at` is the locator the rest of the layer will
  inherit, and it is a coordinate rather than a pixel for the reason `invert()`
  exists at all: a pixel is only meaningful for the exact region, projection and
  canvas size that produced it.

  `at` deliberately takes nothing but a coordinate. Accepting an ISO code or a
  settlement name would be convenient and is cheap to add later — widening an
  option breaks no caller, which is the same bargain `neighbours` took — while
  deciding now what `at: "Springfield"` means would settle a question no real
  map has asked yet.

  Two things go wrong with a pin, and they turned out to need two different
  answers. **A coordinate on the far side of a globe is dropped.** It has no
  pixel of its own and gets one anyway: the far hemisphere projects onto the
  same disc as the near one, so a pin at 160°W 10°S lands at [369, 491] on an
  Africa-centred orthographic, which is Angola. This is the `invert()` clamping
  problem running the other way, and it is worse, because `invert()` at least
  produces a coordinate someone might sanity-check while this produces a mark
  that simply looks right. The guard is the same round trip: `invert()` answers
  with the near side by construction, so a coordinate that comes back as itself
  was visible. Measured over five projections, nine regions and a 9° grid, a
  visible coordinate returns within 3.6e-11 degrees and a hidden one misses by
  at least 0.09 — an empty band nine orders of magnitude wide, and the threshold
  sits in the middle of it.

  **A coordinate that survives that but lands off the canvas is drawn**, marked
  `data-fit="0"`. It is a real place the camera is not pointed at, which is a
  fact rather than an error — so the engine states it and the stylesheet acts on
  it, exactly as it does for a name too big for its country.

  Out-of-range coordinates throw rather than being dropped quietly, the way an
  unrecognised `highlight` code does. A latitude past 90 is told what it
  probably was, because `[lat, lon]` is the mistake that actually happens.

  The accessible description names the marks — but only the ones a reader can
  see. A pin dropped for being behind the globe, or hidden for being off the
  canvas, is not in the description, because it is not on the map.

- **`--anno` is live**, and the mark is cased in `--label-halo`. Found by
  rendering and looking: every bundled preset sets `--anno` to the same value as
  `--accent`, so the first pin dropped on a highlighted country was drawn in the
  country's own colour and vanished — on the exact map this layer exists to
  make. The casing is the one the label beside it already gets, so a mark reads
  against any ground and the two are separated from the map the same way.

- **`map.invert([x, y])`** — a point on the canvas as a coordinate, the inverse
  of `project()`. `project()` is enough for anyone placing a pin by hand: they
  know the coordinate and want the pixel. It is the wrong direction for anyone
  placing one with a pointer, where the drop arrives in pixels and has to be
  stored as lon/lat — store the pixel and the pin comes unstuck from the ground
  the moment the region, the projection or the canvas size changes. The
  annotation layer and the tool both rest on this.

  It returns `null` for a pixel that is not on the map, and finding out whether
  a pixel is on the map turned out to be the whole of the work. d3 clamps its
  inverse trigonometry instead of failing, so a point past the edge of an
  orthographic globe does not come back as nothing — it comes back as a
  coordinate on the limb, and the corner of a canvas invents a place in the
  Atlantic. So the answer is put back through the projection and checked
  against the pixel it came from: a real point returns within a thousandth of
  a unit, a clamped one misses by more than twenty.

  Tested as a geometric property rather than as markup, which is what it is —
  a round trip that closes in every projection, and a grid over a globe where
  nothing invert() answers is a place the map would not put back.

- **A gallery entry carrying the whole phase deliverable** — region, highlight,
  marker and a captioned callout, on one map. Two things came out of rendering
  it and looking, neither of which any assertion would have caught: the caption
  overflowed its box, which is what turned up the tracking bug; and the entry
  labelled a pin "Odesa corridor" while sitting on Kyiv's coordinates, which is
  the kind of error a committed snapshot of a real place should not ship.

- **A gallery entry with marks on it.** Pins are the layer whose failure is
  least visible in the markup, so the contact sheet carries one that can be
  looked at, and `npm run gallery` detects it. Its pins are deliberately not
  capitals: a pin on a city the map already names writes the name twice, a few
  units apart in two weights, which is the caller's choice to make and reads as
  a rendering fault at gallery size.

- **Ten gallery entries outside Western Europe.** Twelve of the thirty-two
  existing entries were the same thirteen countries, which demonstrates that
  the themes differ from one another and very little else. The additions are
  South Asia, Southeast Asia, East Africa, the Middle East, the Nordics, Japan
  and Korea, the Southern Cone, the Caribbean, South America and Central Asia —
  each a region the presets do not cover, each carrying an option the gallery
  exercised in one place or none.

  The one that matters most is `east-africa-choropleth`: the gallery contained
  no choropleth at all, every data map in it encoding quantity as height
  instead. 0.7 shipped a choropleth that exported as a single flat colour with
  the whole suite green, and until now nothing in the gallery would have caught
  that happening again.

  All ten were rendered with their stylesheets stripped and looked at. Five
  were changed as a result: the Caribbean dropped Trinidad, which sits seven
  degrees south of everything else and pushed its own label off the canvas; the
  Nordics moved from a portrait canvas to a landscape one, Iceland to Finland
  being 53° of longitude against 16° of latitude; and Southeast Asia moved off
  the moss palette, which grounds its sea in stone grey-green on purpose and
  washes out where three quarters of the frame is water.

  The last two were geography rather than composition, and neither would have
  failed a test. **Nassau was drawn in open sea**: at 110m the Bahamas simplify
  to a handful of blobs and New Providence is not one of them, while the city
  dot comes from a separate dataset at its true coordinate — so the Caribbean
  renders at 50m. And **East Africa had a hole in the Horn**, because Somaliland
  is one of the five features Natural Earth ships with no ISO code and the
  hand-written region list did not carry its user-assigned `XS`. It is in the
  region now and deliberately not in `values`: hatched instead, which is what
  hatching is for.

- **`npm run gallery`, a contact sheet of every snapshot.** Committing the SVGs
  only half solves the problem the gallery exists for: a directory of forty-two
  files is not something anyone opens either. This puts them all on one page, in
  the browser, at a size where a flat choropleth or a black square is obvious at
  a glance.

  What each map is said to demonstrate is read back off the markup rather than
  off the test that wrote it, so the page cannot claim a feature a file does not
  contain. That distinction is not academic — the first version tested the whole
  file and reported every feature on every map, because each bundled theme
  carries rules for `data-bin` and `.is-highlighted` whether the map uses them
  or not. Wrong in a way that looked right.

  The output is untracked, the same bargain the plan gets: three megabytes of
  inline SVG is a diff nobody can read, and the snapshots are the tracked thing.

### Fixed

- **A scattered country can carry its own name.** The fit test measured a name
  against the width of the shape beneath the anchor, which is right for a
  landmass and wrong for an archipelago: no single Philippine island is as wide
  as the word *Philippines*, so the name was written into every document and
  then hidden as unfittable — while every printed atlas sets it across the whole
  group, over the water between the islands, because the group is the thing
  being named.

  So when a country is more than one piece and no piece can hold its name, the
  room it has is now the reach of the group. **The anchor does not move**: it
  stays on the largest island and the name overhangs from there, the way
  *Portugal* overhangs into the Atlantic. Only the measurement changes, which
  means this can reveal a name and can never relocate one.

  It reveals Philippines on every map of Asia, and Angola, Chile, Fiji, Japan
  and Indonesia on the world maps. Brunei and Timor-Leste stay hidden, which is
  correct — they are genuinely too small, and that is what the test is for.

### Changed

- **The Node floor is 20.** `engines` said `>=18` and nothing ever tested it.
  It could not be tested either: `vitest` 4 depends on `rolldown`, which imports
  `styleText` from `node:util` — added in Node 20.12 — so the suite failed at
  startup on 18 before a single test ran. Rather than keep an untested promise
  alive with a separate build-then-run-on-18 job, the floor moves to 20, which
  is what the toolchain needs and what CI actually exercises. Node 18 left
  maintenance in April 2025.

  Breaking in principle; nothing is published, so nobody is on it.


## [0.12.0] — 2026-08-28

Phase 7 — harden. Nothing new to look at; everything here is about the library
being safe to hand to someone else.

This phase was called **Ship** and it bundled two different things: being ready
to publish, and publishing. Only the first is engineering work, so they split.
Publishing is now an unscheduled `1.0.0` and nothing downstream waits on it.

### Added

- **The cross product, as invariants rather than as pictures.** Nine regions by
  five projections by five themes is 225 maps. Committing 225 snapshots means
  nobody ever opens one, which is the exact failure this project has had three
  times. So the gallery stays curated and human-sized, and the combinations
  nobody will look at are checked for the things that can be stated as facts:
  it renders, it draws land, every coordinate is finite, the land is on the
  canvas, the same input gives the same output, and every token resolves.
  153 new assertions in about five seconds.
- **A contract lock.** The policy at the top of this file says a class, a data
  attribute or a token is public API. A policy stated only in prose gets broken
  by accident — someone tidies a name, the suite stays green, and every theme
  in the wild stops matching. `test/contract.test.ts` snapshots the layers,
  reserved classes, tokens and preset names, plus a separate assertion on paint
  order, which a snapshot of names alone cannot catch.
- **A `LICENSE` file.** `package.json` has declared MIT since Phase 0 and the
  text was never there.
- **A licence table in the README**, naming every source and its obligation.
  A map made with this carries no attribution requirement, which is deliberate
  rather than lucky, and worth writing down before a source that *does* require
  one is ever added.

### Notes

- One invariant is weaker than it looks and is kept anyway: *the land is on the
  canvas* passes for every combination today, including Mercator at the poles,
  because framing solves through `fitExtent` and clamps. It is a regression
  guard for a framing change, not a bug it caught.
- "README built around the class taxonomy" was already true — the taxonomy has
  been the second section since Phase 3.

## [0.11.0] — 2026-08-28

The library is called **neatline**. `mapper` was taken on npm, and it named the
machine rather than the thing it makes — a neatline is the ruled border drawn
around a finished map, which is closer to what this produces.

**Breaking**, under the pre-1.0 policy. Nothing about the output changed: every
map this version renders is byte-identical to what `0.10.0` rendered. What
changed is what you type.

### Changed

- `mapper()` is now `neatline()`, and the package is `neatline`.
- `MapperOptions` is now `MapOptions`, which pairs with the `MapResult` it has
  always returned.
- Error messages are prefixed `neatline:` instead of `mapper:`.
- Subpath imports follow the package: `neatline/themes/atlas.css`,
  `neatline/palettes/moss.css`, `neatline/typefaces/condensed.css`.

### Unchanged

- **The whole class taxonomy.** `mp` is short for *map*, not for the old
  package name, so every selector any theme has ever written still matches.
  `mp-` also stays clear of `nl-`, which would have read as the ISO code for
  the Netherlands sitting in a document full of `data-iso` attributes.
- Every token, data attribute, layer name and paint order.

## [0.10.0] — 2026-08-27

Names. Country and settlement labels, the layer slot reserved since Phase 2.

**Breaking**, under the pre-1.0 policy: every map now carries names by default,
so existing output changes. `layers: { labels: false }` restores the old
document exactly.

### Added

- **Country names**, placed at the balance point of the largest piece of the
  country *that is on the canvas* — not the centroid of the whole geometry,
  which puts "France" in the Atlantic, because France's geometry reaches French
  Guiana. That is the same fact that once made France the frontmost country in
  Europe for prism depth sorting; it has now cost two features.
- **A deeper anchor when the balance point will not do.** Where the centroid
  falls outside the country — every crescent, every Croatia — the name goes to
  the point furthest from any edge, found by refining a grid. The plan called
  for a curated table of thirty hand-tuned anchors instead; the geometry knows
  the answer, and unlike a table it cannot go stale when the source data does.
- **Two-line names**, broken at the most even word gap, when one line does not
  fit. This is what rescues *United Kingdom*, *South Korea*, *Sri Lanka* and
  *Papua New Guinea*.
- **Settlement names**, beside their dots, governed by `labelRank` — one step
  tighter than `placeRank` by default, because a dot is a mark and a name is a
  word. A name is never written for a settlement whose dot was filtered out.
- **`--place-label-size`, `--label-halo` and `--label-halo-width`**, live in all
  five presets and both palettes. The casing is one `paint-order: stroke`
  rather than a second copy of every label.
- **`names`** — replace the name of anything the map labels, keyed by ISO code
  for a country and by name for a city. This is how a map is produced in a
  language other than English: the bundled sources carry English only, and
  neither `world-atlas` nor the vendored Natural Earth places file has a single
  translated name field, so a `language` option would mean shipping name tables
  this package does not have. The override is what can honestly be offered
  today, and it covers every language rather than a chosen list.
- Four gallery renders: `europe-named`, `west-europe-named-cities`,
  `asia-named-blueprint`, and `west-europe-unnamed` for the layer switched off.

- **A `typeface` axis** — `"humanist"`, `"serif"`, `"grotesk"`, `"condensed"`,
  `"mono"`, a `.css` path, or a stylesheet. What a palette is for colour, this
  is for lettering: tokens only, so it lays over any theme and never fights one
  over structure. Colour has had a swappable axis since 0.3; type could only be
  changed by naming an exact font stack and guessing at sizes to match it.
  Resolution order is now theme → palette → typeface → tokens, and tokens still
  win, as they always have.
- **`--label-advance`**, the one token that is a measurement rather than a
  style: how wide the chosen face runs, as a fraction of the label size. The
  fit test has no font metrics — SVG cannot measure text outside a browser — so
  the stylesheet that chose the face is the only thing that knows. `condensed`
  declares `0.46` against `humanist`'s `0.58`, which is what earns it the extra
  names it can genuinely carry.
- **`--label-track` and `--label-weight`**, so a typeface can set tracking and
  weight rather than only a stack.
- **Two more palettes**, `slate` (cool neutral, the register of a report) and
  `moss` (warm greens on stone, a walking map). Four in total.

### Fixed

- **noir was too dark to read.** Land sat ten values off the sea in every
  channel, on the theory that a dark editorial map should whisper. At that
  separation the continents were not quiet, they were gone: on a world map the
  coastline hairline was the only evidence there was land at all. Land, borders
  and the political fills all step up; the theme is still dark and still
  restrained.
- **A country name no longer sits on its own capital's name.** A capital
  usually sits near the middle of its country, which is exactly where the
  country's name goes — "Madrid" ran through "Spain", "Bern" through
  "Switzerland" and "Amsterdam" through "Netherlands" on the same map. The
  country name steps one line up or down, and only if the step keeps it on the
  country: moving "Belgium" clear of "Brussels" by putting it in France helps
  nobody.
- **A world map is no longer mush.** Names are laid down in order and anything
  landing on one already placed is marked `data-fit="0"`. This is not a
  placement solver — nothing is moved twice and nothing is retried — but the
  world has some two hundred capitals and a world map has room for about
  thirty, and without it every one of them was drawn.
- **`neighbours` was still marked `reserved` in the taxonomy** after shipping
  in 0.8.0. The status was wrong, not the layer.

### Changed

- The `labels` layer is `live`. `--label-size` now means the country label
  size specifically; settlement names read `--place-label-size`.
- `Recorder` and the plane geometry the prism layer used moved to `src/rings.ts`,
  because labels need the same projected outlines.
- The colour-token test now derives what counts as a colour from a rule — not a
  `-width` or a `-size`, not `--font` or `--border-dash` — instead of listing
  the exceptions, which had to be edited every time the vocabulary grew.

### Known limits

Two country names can still overlap on a crowded map, and a settlement name can
cross a border it does not belong to. There is no font metrics engine: label
width is estimated from an average glyph advance, and a write-time token
override passed to `render()` arrives after the geometry is settled, so the fit
test cannot follow it. Ranks exist so a theme can thin its way out.

## [0.9.0] — 2026-08-27

Two layer slots reserved. **Breaking**, in the way the pre-1.0 policy exists
for: inserting a layer restacks everything above it, so this is the last cheap
moment to do it. Nothing new draws.

### Added

- **A `graticule` layer**, at the very bottom of the stack — the grid the world
  is drawn on, which land covers. Parallels, meridians, the equator and the
  tropics, when they are built
- **A `terrain` layer**, directly above the land it tints and below the water,
  because a river runs over a forest. Land cover: desert, forest, mountain,
  glacier
- **Eight reserved tokens** — `--graticule`, `--graticule-width`, `--equator`,
  `--desert`, `--forest`, `--mountain`, `--glacier`, `--sea-ink` — with values
  in every bundled theme and palette, so the day either layer starts drawing,
  every preset already knows what it looks like

### Changed

- Both placements are the kind that can only be made once. Reserving them costs
  two empty groups; making the same decision after 1.0 would cost a major
- The colour-token test is now a rule rather than a list — anything named
  `-width` is a measurement — since a list is edited when the vocabulary grows
  and that is exactly the moment it gets forgotten

## [0.8.0] — 2026-08-27

Phase 5 — presets and fill modes. Five themes, two fill modes that need no
data, and the fix that made the last release's choropleth actually visible.

### Fixed

- **Attribute selectors were dropped when flattening.** `inline.ts` matched
  class selectors only, so every rule keyed on a data attribute was skipped on
  the way out: `[data-bin]`, `[data-kind]`, and — had this not been found —
  `[data-fill]`. The consequences shipped in 0.7 and went unnoticed because the
  tests only ever asserted on strings. A choropleth exported as one flat
  colour, and **rivers exported with no stroke at all**, which is to say
  invisible. Both worked in a browser, which is why the gallery looked fine to
  anything that reads `<style>` and wrong to everything else
- **Rivers ran off the map.** A river is one feature from source to mouth, so
  keeping the Danube because it crosses Austria kept all of it — it carried on
  across the sea to the Black Sea on every map of Western Europe. Water is now
  clipped to the land actually drawn, which is also the truer statement
- **Prism walls were lighter than the tops they carried**, inverting the light
  source and turning a choropleth prism map to mud. A wall is in shadow, so
  `--prism-side` is now darker than any band that can sit on it. The
  choropleth ramps were widened at the same time — five browns inside a narrow
  lightness range read as one brown
- **A highlight lost to a band.** `.mp-country.is-highlighted` and
  `.mp-country[data-bin="3"]` have identical specificity, so source order
  decided it, and the band was written last. Highlight is the caller naming a
  country outright; a band is a number it fell into. Highlight now wins, and a
  test holds the ordering
- **A highlighted prism wall used `filter: brightness()`**, a CSS filter
  function SVG 1.1 does not accept — so every viewer that ignores stylesheets
  drew the wall in the top's colour and flattened the prism to a silhouette.
  It is now the `--accent-side` token
- **Palettes covered half the colour vocabulary.** `dusk` set `--land` but no
  `--bin-n`, so a choropleth came out in pale daylight bands over a night sea
- **`mercator` and `equal-earth` never turned to face their region.**
  `fitExtent` scales and translates but does not rotate, so a map of Asia was
  drawn from a Greenwich-centred projection — 90° out from the part of it that
  is faithful, and sheared accordingly. The conics and `orthographic` already
  rotated, which is exactly why South America looked right and Asia did not.
  Both now centre on their region's meridian, and stop doing so past a 180°
  span, where a world map should keep the Atlantic in the middle
- **The central meridian was computed wrongly across the antimeridian.**
  `(west + east) / 2` puts Oceania — 113°E to -180°E — at 33°W, on the other
  side of the planet. Longitude span and centre are now computed with the wrap,
  which the conics and `orthographic` inherit as well

### Added

- **Three presets — `noir`, `blueprint`, `contrast`** — joining `minimal` and
  `atlas`. `noir` is dark ground and hairline linework with no fills to speak
  of; `blueprint` is white linework on drafting blue, monospaced, with dashed
  boundaries; `contrast` is black and white sized for legibility, and is the
  one preset that overrides the shared structure — a filled lake in black and
  white reads as a hole punched in the land, so its lakes are outlines
- **A dark block on every preset.** Tokens are role-named, so it is a value
  swap and nothing structural. An explicit `palette` still wins, because it is
  applied after the theme and the cascade settles it: asking for `sand` gets
  sand whatever the reader's system is set to
- **`fill: "political"`** — every country a colour none of its neighbours has,
  written out as `data-fill`. No data needed. The adjacency was already known:
  the border mesh visits every shared arc to find the boundaries, so recording
  the graph costs one more pass and no new geometry. Welsh–Powell colouring,
  ties broken on the code so the same map always comes out the same way. Four
  colours suffice for Europe, five for the world, and there are six to draw on
- **`stripe`** — diagonal hatching over named countries, for the thing a map
  has to say that is not a quantity: disputed, claimed, excluded, no data.
  Drawn as an overlay rather than a fill, so a hatched country keeps whatever
  colour it already had and the two readings stack. The first thing to use the
  `<defs>` slot reserved in Phase 2 for a pattern
- **A shared structural stylesheet.** Five themes repeating forty rules is five
  places for them to drift, so the rules live once in `structure.ts` and read
  entirely from tokens. New tokens carry what the duplication used to:
  `--land-edge-width`, `--border-dash`, `--water-width`, `--accent-side`,
  `--stripe`, `--stripe-width`, and `--fill-1` … `--fill-6`
- **An `antarctica` region preset**, and a gallery image for every continent.
  `north-america` and `oceania` were never rendered before; `oceania` is the one
  that matters, since it straddles the antimeridian. Antarctica is one country
  and the one place a cylindrical projection cannot describe — the pole is a
  line there rather than a point — so it is drawn orthographic
- **`test/presets.test.ts`** — what a preset has to be, as tests rather than as
  prose: every live token defined, a dark block that introduces nothing new,
  every colour parseable, highlight ordered after the bands, and no country
  anywhere sharing a neighbour's political fill

### Changed

- `inline.ts` understands attribute selectors — presence and equality, quoted
  or not. Still not a CSS engine; anything it cannot read is still skipped and
  reported rather than half-applied
- The `<defs>` block is no longer always empty: it carries the land clip path
  when water is drawn, and any pattern or filter the stylesheet references

## [0.7.0] — 2026-08-27

Choropleth colour, and three prism fixes.

### Added

- **`values` and `bins`** — classify a value per country into bands, written out
  as `data-bin` and `data-value` for a theme to colour. The library still never
  picks a colour. Bands are by **rank**, not by equal value intervals: map data
  is usually skewed enough that five equal slices of European GDP put Germany
  alone at the top and everything else at the bottom, which shows nothing
- `values` defaults to whatever `extrude` was given, so one set of numbers
  drives height and colour together — or either alone
- `--bin-1` … `--bin-5` tokens, with a sequential ramp in both bundled themes
- **`.mp-prism-edge`** — a raised country's own share of the shared borders,
  lifted onto its surface

### Fixed

- **Corsica painted over Sardinia.** Paint order used each country's lowest
  projected point, and France's geometry reaches French Guiana, which projects
  far below the canvas — so France sorted frontmost in Europe. Only geometry the
  reader can actually see now decides depth
- **Belgrade appeared on a map of Western Europe.** Places were tied to a drawn
  country only when Natural Earth recorded an ISO code for them; Serbia has
  none, so its cities passed through unattributed. Those are now placed by
  containment
- **Borders cut through raised prisms.** A mesh line is shared by two countries,
  so once they stand at different heights there is no single height it can sit
  at. Each country now carries its own share, lifted to its own surface —
  briefly they were suppressed entirely, which was the wrong answer
- Settlement dots ride up with the prism they stand on

## [0.6.0] — 2026-08-27

Prism maps: height as quantity. Brought forward from v2 — the reserved class
names turned out to be most of the design.

### Added

- **`extrude`** — raise each country off the map so height reads as quantity.
  A number lifts everything uniformly; `{ values }` lifts each country in
  proportion, taking raw numbers (GDP, headcount, anything) and scaling them
  against the largest, so the caller never has to think in SVG units.
  `height` sets what the largest becomes
- `.mp-prism` wrapping `.mp-prism-side` and `.mp-prism-top`, carrying
  `data-iso`, `data-name` and `data-height`. `.is-highlighted` works on a prism
  exactly as it does on a flat country
- `--prism-side` token; two gallery renders, `europe-gdp-prism` and
  `italy-raised`
- `createProjection` takes optional headroom, so an extruded map leaves room
  above the geometry instead of clipping its tallest prism at the top edge

### Notes

- The solid is built by sweeping the projected outline: the footprint, one quad
  per edge running up to the raised copy, and the raised copy on top. That works
  for any polygon — concave, holed or in pieces — with no geometry library. Each
  quad is wound consistently before being written, because the winding of an
  edge follows whichever way the outline happens to run, and two quads of
  opposite winding punch a hole in each other under the nonzero fill rule
- Countries are drawn back to front by their lowest point, so a nearer prism
  stands in front of the one behind rather than being cut into by it

## [0.5.0] — 2026-08-27

Neighbours, built-in filters, and two water fixes. Brought forward from later
phases because each turned out to be small once the slots were reserved.

### Added

- **`neighbours: true`** — the surrounding countries drawn as context beneath
  the region, into the layer reserved in Phase 2. Never labelled, never
  highlighted, and excluded from the camera, so turning context on cannot move
  the subject. Planned for v1.2; the reserved slot made it a filter and a class
- **Built-in SVG filters**, referenced from a theme by name:
  `filter: url(#mp-relief)`. A stylesheet cannot create SVG elements, so
  effects needing markup were out of a theme's reach — these close that gap, and
  are the first real use of the reserved `<defs>` block. Emitted only when
  referenced. `FILTER_NAMES` lists them
- `mp-relief` and `mp-relief-soft` — lit relief rather than a drop shadow. A
  shadow only separates a shape from its ground; relief needs a lit face and an
  unlit one, so the land's own alpha is blurred into a height map and lit with
  `feDiffuseLighting`. The light is **multiplied**, not added: a specular
  highlight bleaches the land to white and throws the theme's colour away.
  Its constant is normalised by `1/sin(elevation)` so flat ground returns at
  full brightness and only the slopes shade
- `inlineStyles` also materialises a CSS `drop-shadow()` into a real
  `feDropShadow`, since SVG 1.1 only permits `url(#id)` in the `filter`
  attribute and older viewers drop the CSS function silently
- `west-europe-neighbours` gallery render; `--neighbour` is now a live token

### Fixed

- **Water was matched by bounding box, which put Lake Constance on a map of
  France.** France's box spans Guadeloupe to Réunion — those are France — so box
  overlap admitted anything in between. Boxes are still used as a cheap
  pre-filter, but the question is now answered with `geoContains` against the
  countries actually drawn
- **Rivers were invisible.** They were being emitted correctly, but every
  palette's water sat a shade away from its land colour at 0.8 stroke width.
  Water is now distinctly blue across all four, and rivers are stroked at 1.1

## [0.4.0] — 2026-08-27

Phase 4 — data pipeline. Maps now carry water and cities.

### Added

- **A build step producing `data/`**, and `loadWorld()` reads only that. The
  library no longer resolves a devDependency off disk at call time, which is
  what tied it to Node — sources stay on the build machine, the extract ships
- **Lakes and rivers** in `.mp-hydro`, from `sane-topojson`. 275 lakes and 461
  rivers at 50m. Water is matched against the countries actually drawn, not the
  framed rectangle — filtering on the viewport alone floats Scandinavian lakes
  over open sea on a map whose northern edge stops at Denmark
- **Cities** in `.mp-places`, from Natural Earth populated places, vendored.
  Ranked 1–3: capitals and the largest cities, then everything over a million,
  then the rest. Capitals are promoted regardless of size — a map showing Milan
  but not Bern is wrong — but the bands are otherwise population, so Hamburg,
  Lyon and Turin appear where a capitals-only rule would have missed them
- **`placeRank`** — how far down the ranking to draw. Default 2
- Four new gallery renders: `west-europe-cities`, `france-rivers`,
  `europe-no-water`, and `west-europe-relief` — the raised-landmass look, which
  needs no data and no markup at all: `filter: drop-shadow(...)` is a CSS
  declaration, so a theme can simply say it. `filter` is carried through the
  `inlineStyles` pass with the other paint properties
- `--place` token; `--water` is now live rather than reserved

### Fixed

- **Framing and drawing are now separate questions**, which they should always
  have been. The camera is fitted to each country's core; everything is then
  drawn into it. What falls outside the frame is invisible rather than deleted —
  what a paper atlas does, and the only arrangement where nothing can go missing
  from a map that is showing it. Previously the outlying pieces were removed
  from the output, which meant a world map had no Alaska and no French Guiana
- **Sicily and Sardinia were being clipped off Italy**, along with several
  Japanese islands. Two mistakes: the core's scale was measured from the
  distance to its centroid — near zero for any country with one dominant
  landmass — instead of from the core's own extent; and distances were measured
  from the country's centroid, which for France sits in the Atlantic because
  French Guiana drags it there, putting mainland France 7° from its own centre.
  The core is now anchored on the largest piece and scaled by its extent
- **Framing is judged one country at a time.** It was judged across the
  whole region, which broke at 50m: France carries dozens of polygons there,
  enough of them overseas that the outlier threshold stretched until it caught
  nothing, and a map of France framed the Atlantic from Guadeloupe to Réunion.
  Country-by-country is also the only framing that gets every case right —
  French Guiana is 15% of France by area, Alaska 17% of the US and Patagonia
  14% of South America, so no threshold on *size* can separate them, and no
  threshold on distance can either. What distinguishes them is that Guiana and
  Alaska are outliers within their own country while Patagonia is simply where
  Argentina is. Continental France, the lower 48 and mainland Portugal now frame
  correctly, while Indonesia's archipelago and New Zealand stay whole

### Notes

- `data/` is generated and not committed; `vendor/` holds the raw Natural Earth
  input. `npm run check` builds the data first
- Oceania still spans the antimeridian, which widens its frame. Pre-existing,
  and a projection problem rather than a framing one

## [0.3.1] — 2026-08-27

### Added

- **A reserved `<defs>` block**, emitted empty ahead of everything drawn. A
  stylesheet can express more than expected — the raised-landmass relief look is
  `filter: drop-shadow(...)`, plain CSS with no markup — but gradients, patterns
  and the arrow markers a flow map needs are SVG *elements*, not declarations,
  and anything referenced by `url(#…)` needs a home that exists from v1
- Reserved class names for data-driven renderings: `.mp-prism`, `.mp-prism-top`,
  `.mp-prism-side`, `.mp-flow`, `.mp-symbol`. A prism map extrudes each country
  by its value, so a country stops being one path and becomes a top face plus
  side walls — a different rendering of the land layer rather than a new layer,
  which is why these are classes and not a slot

## [0.3.0] — 2026-08-27

Phase 3 — theming, palettes and layer control. Maps stop being wireframes.

### Added

- **`theme`, `palette` and `tokens` on `MapOptions`.** Applied in that
  order, and the ordering *is* the implementation — a palette beats a theme and
  an override beats a palette because each is a later declaration. No merge
  logic, no schema, no validation layer
- **The palette/theme split.** A theme carries structure — weights, dashes,
  type; a palette carries only colour. Both target users want the same move:
  keep the style, change the colours. Because tokens are named by role, a
  palette *is* a set of token values, so this cost nothing to implement
- Bundled themes `minimal` and `atlas`, palettes `dusk` and `sand`. Each can
  instead be a path to a `.css` file or a stylesheet passed inline
- **A token vocabulary of seventeen names**, exported as `TOKENS`. Six are
  reserved and unused; a theme can set them today and they begin working when
  their layer arrives, which is cheaper than revising every theme later
- **`layers`** — controls which slots carry content, never whether a slot
  exists. The stack is a fixed contract. The saving is file size, not
  appearance
- **`render(options?)`** on `MapResult` — the document as a portable artifact,
  without writing a file. `toFile()` is now `render()` plus a write
- **`inlineStyles`** — resolves the cascade onto presentation
  attributes for Figma and Illustrator, which ignore `<style>`, and for the
  renderers found in 0.2.0 that let an attribute beat a stylesheet. The
  stylesheet still ships alongside, so both paths resolve to the same paint
- **A gallery of eight committed renders** in `test/__snapshots__/gallery/`,
  across themes, palettes, projections and canvas shapes. 0.2.0 shipped a map
  that rendered as a solid black square while every string assertion passed;
  snapshots that a person can open are the fix — and each one is now checked to
  carry visible paint with its stylesheet stripped out, since the first version
  of this gallery rendered only where `<style>` was honoured
- `themes/*.css` and `palettes/*.css` are generated at build time from the
  same strings the library uses, so the published files cannot drift from the
  bundled ones

### Changed

- **`render()` and `toFile()` flatten the theme by default** (`inlineStyles`
  now defaults to `true`). A file gets opened by whatever the reader happens to
  have, and many viewers, thumbnailers and design tools ignore `<style>`
  entirely — which rendered a themed map as black shapes. `toString()` is
  unchanged and remains the small, stylesheet-only form for embedding in a page
- **The default `minimal` theme was too faint to read** against a white page.
  Land and border contrast raised; still minimal, now legible
- **Every rule is scoped to a class derived from a hash of the stylesheet**
  (`.mp.mp-t-k3f9a1z`). A `<style>` block inside inline SVG applies to the whole
  host page, so two themed maps would otherwise overwrite each other and a map
  would restyle anything sharing a class name. Hashing keeps it deterministic:
  same theme, same class, byte-identical output
- `map.svg` stays geometry-only but now carries the scope class, so a caller
  serving `map.css` separately still has something for it to match.
  `map.toString()` is the complete document
- `RenderOptions` gained `palette`, so one built map can be written several
  ways — light, dark, flattened — without recomputing the geometry

### Notes

- Theme stylesheets are authored as strings in `src/` rather than read from
  disk, so `neatline()` stays isomorphic. Reading a `.css` at call time would make
  the library Node-only, which is the constraint Phase 4 exists to remove
- `<style>` content is emitted raw, and wrapped in CDATA only when it contains
  `&` or `<`. Escaping is wrong there: an HTML parser treats style content as
  raw text, so `&gt;` would arrive as four literal characters and break a child
  selector. A stylesheet containing `</style` is rejected rather than emitted

## [0.2.0] — 2026-08-27

Phase 2 — class taxonomy and the node-tree emitter. The document shape is now
frozen, which is what everything after this builds against.

A minor bump because the emitted SVG changed shape, and by this project's own
policy the class taxonomy is public API.

### Added

- **The class taxonomy**, documented in the README and exported at runtime as
  `LAYERS`, `ROOT_CLASS`, `LAYER_CLASS`, `BACKGROUND_CLASS`, `HIGHLIGHT_CLASS`
  and `RESERVED_CLASSES`. Exporting it means the Phase 9 web tool never has to
  hard-code a class name, and that the docs cannot drift from the emitter
- **Nine layer groups in fixed paint order**, every one emitted even when
  empty: `mp-neighbours`, `mp-land`, `mp-hydro`, `mp-borders`, `mp-roads`,
  `mp-places`, `mp-labels`, `mp-annotations`, `mp-furniture`. Adding a layer later would
  restack everything beneath it and break themes in the wild; thirty bytes per
  empty slot is the cheapest insurance in the project
- **`.mp-furniture`** — the one non-geographic layer, reserved and empty. Credit
  lines, watermarks and legends are placed on the canvas in fixed user units
  rather than at a coordinate, so they must not move when the camera does.
  Reserved alongside `.mp-credit`, `.mp-watermark`, `.mp-legend`, `.mp-scale`
  and `.mp-compass`
- **`.mp-bg`** — a rectangle covering the canvas, so a theme can colour the
  ocean without the consumer wrapping the SVG in a styled element
- **Real international borders**, meshed from shared arcs so each boundary is
  drawn once rather than once per neighbour. Invisible for an opaque hairline,
  obviously wrong for a translucent or dashed one. No new dependency:
  `topojson-client` already shipped `mesh`
- **Accessibility**: `role="img"` plus `aria-label` and a matching `<title>` on
  the root, and a per-country `<title>` for hover. The root role keeps assistive
  technology from announcing two hundred paths
- **`title` option** — the generated label can only ever describe geography, and
  a map of election results is not "a map of Western Europe"
- **Caller-supplied GeoJSON as a region.** `Region` has always included
  `FeatureCollection`; the resolver threw on it. The declared type no longer
  lies

### Changed

- The SVG is built as a **node tree and serialised once** (`src/svg.ts`) rather
  than concatenated. Escaping now happens in one place instead of at each call
  site, and Phase 8 appends to a node that already exists
- Root `<svg>` carries explicit `width`/`height` alongside `viewBox`, so files
  written with `toFile()` have an intrinsic size in design tools and raster
  converters. CSS overrides both
- `preserveAspectRatio="xMidYMid meet"` is explicit rather than relying on the
  SVG default
- Internal: `loadCountries()` became `loadWorld()`, returning a `World` that
  exposes `borders()` as a capability instead of leaking the topology. Not a
  public export; Phase 4 can serve borders from a precomputed mesh without any
  caller noticing

### Fixed

- **The background rectangle painted the whole map black.** `.mp-bg` shipped
  without a `fill`, and SVG's default fill is black, so a full-canvas rect
  covered the document before any layer drew — an unthemed map rendered as a
  solid black square. It now carries `fill="none"`, which is structural rather
  than stylistic, and which any theme rule overrides. Regression-tested, and
  the geometry-only render verified against a real renderer rather than by
  reading the markup
- The neighbours layer sits **above the background and below the land**. The
  plan placed it above the water, which was wrong — lakes and rivers are drawn
  on top of the land they sit in, so context would have covered its own subject

### Notes

- `.mp-hydro`, `.mp-roads`, `.mp-places` and `.mp-labels` are reserved and
  always empty: `world-atlas` carries country polygons and nothing else. The
  populated-places and hydrography data they need arrives in Phase 4
- The water *layer* is `.mp-hydro` rather than `.mp-water` so it does not
  collide with the `.mp-water` feature class. Layers are plural, features are
  singular, and this is the one place where English forced an exception

## [0.1.0] — 2026-08-27

Phase 1 — geometry core. `neatline()` now produces real maps.

### Added

- Region resolvers: presets, code lists, bounding boxes. Presets are saved
  code lists rather than a separate mechanism, and are explicit because the
  topology carries no continent field and because membership is an editorial
  call — "Western Europe" has no single correct definition
- Projection registry as a lookup table: `mercator`, `conic-conformal`,
  `albers`, `equal-earth`, `orthographic`. Conic standard parallels are derived
  from the region's latitude span, so a conic works anywhere without the caller
  knowing what a parallel is
- `fitExtent` camera, coordinate rounding via `geoPath.digits(1)`
- `map.project([lon, lat])` — the hook the annotation layer will hang from
- Country identity: alpha-2, ISO numeric and user-assigned codes all resolve to
  one canonical id, emitted as `data-iso`
- `isoTable()` publishing every accepted code
- Highlighting via `highlight: ["FR"]`, emitted as `.is-highlighted`
- Unrecognised codes throw rather than silently producing an empty map

### Changed

- **`neatline()` is now async.** The full dataset is 8 MB across detail tiers, so
  geometry has to be loaded per region rather than bundled wholesale. Deciding
  this now avoids a breaking change later
- Dropped the Phase 0 tests that asserted the absence of geometry

### Fixed

- **Framing no longer includes overseas territories.** France governs French
  Guiana, so its geometry reaches South America; fitting to raw bounds framed
  the Atlantic and squashed Europe into a corner. Outlying pieces are rejected
  by angular distance from the region's centre — not by area, since Guyane is
  13% of France and an area threshold would never catch it. A safety valve
  leaves genuinely dispersed regions (Oceania, the world) untouched

### Decided

- **Outlying pieces are dropped from the output, not just the camera** — a map
  of France is continental France. This is a default, not a statement about
  what belongs to whom: Guyane is France. Representing overseas territories
  properly, with insets or an explicit opt-in, is planned work
- **ISO codes are the canonical id, not the topology's numeric.** Five features
  (Kosovo, Somaliland, N. Cyprus, Indian Ocean Ter., Siachen Glacier) ship with
  no id at all, so "fall back to the number" had nothing to fall back to. They
  get user-assigned codes from the `X` range ISO reserves for private use —
  `XK`, `XS`, `XN`, `XI`, `XG`. These are ours, not ISO, and are flagged as
  such in `isoTable()`

### Known

- `world-atlas` is a devDependency and geometry is read from disk, so the
  library is Node-only until Phase 4 bundles per-region extracts. The seam is
  isolated in `src/topology.ts`
- Regions are drawn without surrounding context — a West Europe map ends at the
  German border rather than fading into Poland. Context is a Phase 2 question

## [0.0.1] — 2026-08-27

Phase 0 — scaffold. No geometry yet; the package builds, tests, and imports.

### Added

- npm package with dual ESM/CJS output via `exports`, types emitted for both
- Runtime dependencies pinned to exactly two: `d3-geo`, `topojson-client`
- TypeScript strict, plus `noUncheckedIndexedAccess` for the coordinate work
  ahead. `lib` excludes DOM on purpose, so the emitter cannot reach for
  `document` and break under Node
- Public type surface settled in `src/types.ts` — regions, projections, detail
  tiers, render options, `MapResult`. Every option is plain, JSON-serialisable
  data; no callbacks anywhere, which is what will let an editor UI drive the
  same API later
- `neatline()` stub emitting a valid, correctly sized, empty document
- vitest with SVG file snapshots — snapshots land in `test/__snapshots__/` as
  real `.svg` files that open in a browser, so geometry regressions are visible
  rather than a string diff
- Two tests asserting Phase 0's *boundaries* (no `<path>` emitted, `project()`
  still deferred), so scope creep fails loudly
- `scripts/verify-exports.mjs` — imports the built artifacts under both module
  systems and calls them
- `npm run check`: typecheck → test → build → verify exports

### Decided

- **npm, not pnpm.** pnpm is not installed on the dev machine and there is no
  workspace to gain from it. One command to switch if that changes.
- **No default export.** Mixing it with named exports forces CJS consumers to
  write `.default`; the API is `neatline({...})` regardless.
- **Snapshots as `.svg` files** rather than `.snap`, for a library whose output
  is meant to be looked at.

### Known

- The npm name `neatline` is taken (v0.2.5), as is `svg-neatline`. A real name is
  needed before `1.0.0`; a scoped name is the zero-effort fallback. Nothing is
  blocked until publish.
- One `low` audit advisory remains in the esbuild dev-server chain —
  Windows-only, dev-server-only, devDependency, never reaching consumers.
  `npm audit fix` does not resolve it.

## Planned

Version targets for the remaining phases, so the roadmap and the release
history stay the same document.

The original table guessed one version per phase and was wrong from Phase 5
onward — phases landed across several releases each, so Phase 5 shipped at
`0.8.0` and Phase 6 at `0.10.0`, not `0.5.0` and `0.6.0`. The release history
above is the record of what shipped; this table is only what is left.

| Version | Phase | Ships |
| --- | --- | --- |
| `0.13.0` | 8 · Annotations | `invert()`, annotations layer, inlined icons, legend, ocean layer, a brighter palette |
| `0.14.0` | 9 · Routes | Roads and rail — bundling the data, and the class it needs |
| `1.0.0` | — · Publish | npm publish with provenance. **Not scheduled.** |
| — | 10 · Tool | The web app the library exists to feed |

See the [build plan](https://claude.ai/code/artifact/1ad97eac-6e9c-4944-96fb-3e6530d9e83d) for what each of those means and why they are in
that order. It is the single source for the roadmap; this table is only the
version ledger.

**Publishing is a decision, not a phase.** Phase 7 was originally "Ship", which
bundled *being ready to publish* with *publishing*. Those are different things
and only the first one is engineering work, so they are split: Phase 7 does
everything that has to be true before a `1.0.0` — the snapshot suite, the
documentation, the written semver policy — and stops. The publish itself waits
until it is asked for.

Phase 8 keeps its meaning from the entries above, which refer to it by number,
and grew to carry the legend, the ocean layer and a brighter palette — each is
something the tool needs and none is large alone. Routes split out of it because
that one is gated on acquiring data, not on drawing it.

[Unreleased]: https://github.com/danielefrisanco/masen/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/danielefrisanco/masen/compare/v0.15.1...v0.16.0
[0.15.1]: https://github.com/danielefrisanco/masen/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/danielefrisanco/masen/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/danielefrisanco/masen/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/danielefrisanco/masen/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/danielefrisanco/masen/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/danielefrisanco/masen/compare/v0.10.0...v0.11.0
[0.7.0]: https://github.com/danielefrisanco/masen/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/danielefrisanco/masen/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/danielefrisanco/masen/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/danielefrisanco/masen/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/danielefrisanco/masen/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/danielefrisanco/masen/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/danielefrisanco/masen/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/danielefrisanco/masen/releases/tag/v0.1.0
[0.0.1]: https://github.com/danielefrisanco/masen/releases/tag/v0.0.1
