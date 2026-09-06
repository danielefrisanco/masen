import { describe, expect, it } from "vitest";
import { masen, type MapOptions } from "../src/index.js";

/**
 * A gallery, not a checksum.
 *
 * Phase 2 shipped a map that rendered as a solid black square while every
 * string assertion passed, because nothing in the suite ever looked at the
 * result. These snapshots are committed as real `.svg` files so a diff is
 * something a person can open, and so the spread of themes, palettes,
 * projections and canvas shapes is visible at a glance rather than inferred.
 */
const GALLERY: ReadonlyArray<readonly [string, MapOptions]> = [
  [
    "west-europe-minimal",
    { region: "west-europe", projection: "conic-conformal", theme: "minimal" },
  ],
  [
    "west-europe-atlas",
    { region: "west-europe", projection: "conic-conformal", theme: "atlas" },
  ],
  [
    "west-europe-dusk",
    { region: "west-europe", projection: "conic-conformal", theme: "minimal", palette: "dusk" },
  ],
  [
    "west-europe-highlight",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: "minimal",
      palette: "sand",
      highlight: ["FR", "BE", "NL", "LU"],
      title: "Benelux and France",
    },
  ],
  [
    "world-equal-earth",
    { region: "world", projection: "equal-earth", theme: "atlas", size: [1200, 620] },
  ],
  [
    "africa-wide",
    { region: "africa", projection: "equal-earth", theme: "minimal", palette: "sand", size: [1200, 700] },
  ],
  [
    "south-america-orthographic",
    { region: "south-america", projection: "orthographic", theme: "atlas", size: [800, 800] },
  ],
  [
    "west-europe-cities",
    {
      region: "west-europe",
      detail: "50m",
      projection: "conic-conformal",
      theme: "atlas",
      title: "Western Europe: major cities and rivers",
    },
  ],
  [
    "france-rivers",
    {
      region: ["FR"],
      detail: "50m",
      projection: "conic-conformal",
      theme: "minimal",
      palette: "sand",
      placeRank: 3,
      size: [800, 800],
    },
  ],
  [
    "europe-no-water",
    {
      region: "europe",
      projection: "conic-conformal",
      theme: "minimal",
      layers: { hydro: false, places: false },
      size: [900, 900],
    },
  ],
  // The raised-landmass look editorial maps use. No data, no markup, no defs —
  // `filter: drop-shadow()` is a CSS declaration, so a theme can simply say it.
  [
    "west-europe-relief",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: `.mp { --sea: #9FBACB; --land: #F3ECDC; --edge: #C0B49A; --ink: #57503F; }
.mp .mp-bg { fill: var(--sea); }
.mp .mp-land { filter: url(#mp-relief); }
.mp .mp-country { fill: var(--land); stroke: var(--edge); stroke-width: 0.7; }
.mp .mp-border { fill: none; stroke: var(--ink); stroke-width: 0.9; }
.mp .mp-water[data-kind="lake"] { fill: var(--sea); }
.mp .mp-place { fill: var(--ink); }`,
      title: "Western Europe in relief",
    },
  ],
  // Context, not subject: the surrounding countries fade in beneath the region
  // and are excluded from the camera, so the framing is identical without them.
  [
    "west-europe-neighbours",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: "atlas",
      neighbours: true,
      title: "Western Europe, with its neighbours",
    },
  ],
  // Height as quantity — the map most people mean by "3D". Values are raw
  // (GDP in $bn here) and scaled against the largest.
  [
    "europe-gdp-prism",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: "atlas",
      size: [1000, 900],
      extrude: {
        values: {
          DE: 4460, GB: 3340, FR: 3050, IT: 2250, ES: 1620, NL: 1120,
          CH: 885, IE: 545, AT: 515, BE: 630, DK: 405, PT: 290, LU: 85,
        },
        height: 150,
      },
      title: "Western Europe by GDP",
    },
  ],
  // One country lifted off the rest, which is the other thing extrusion is for.
  [
    "italy-raised",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: "atlas",
      size: [900, 900],
      extrude: { values: { IT: 1 }, height: 60 },
      highlight: ["IT"],
      title: "Italy, raised",
    },
  ],
  // The three presets Phase 5 added. Each is shown on the same region and
  // projection as `west-europe-minimal`, so what differs between the files is
  // only ever the theme.
  [
    "west-europe-noir",
    { region: "west-europe", projection: "conic-conformal", theme: "noir" },
  ],
  [
    "west-europe-blueprint",
    { region: "west-europe", projection: "conic-conformal", theme: "blueprint" },
  ],
  [
    "west-europe-contrast",
    { region: "west-europe", projection: "conic-conformal", theme: "contrast" },
  ],
  // Political fill: no data, no legend — colour only so that no country
  // matches the one beside it.
  [
    "europe-political",
    {
      region: "europe",
      projection: "conic-conformal",
      theme: "atlas",
      fill: "political",
      size: [900, 900],
      title: "Europe",
    },
  ],
  // The same idea where the theme has no six hues to give it: blueprint fills
  // with steps of its own blue, which still keeps every neighbour distinct.
  [
    "africa-political-blueprint",
    {
      region: "africa",
      projection: "equal-earth",
      theme: "blueprint",
      fill: "political",
      size: [1000, 900],
      title: "Africa",
    },
  ],
  // Every preset has to survive a highlight — that is the shot people judge.
  [
    "west-europe-noir-highlight",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: "noir",
      highlight: ["DE"],
      title: "Germany",
    },
  ],
  [
    "world-contrast",
    {
      region: "world",
      projection: "equal-earth",
      theme: "contrast",
      size: [1200, 620],
      layers: { places: false },
    },
  ],
  // Asia, for a region whose shape and scale test the framing differently from
  // Europe: an equal-area projection over a span wide enough that a conformal
  // one would be indefensible.
  [
    "asia-dusk",
    {
      region: "asia",
      projection: "equal-earth",
      theme: "minimal",
      palette: "dusk",
      size: [1200, 800],
      title: "Asia",
    },
  ],
  [
    "asia-political",
    {
      region: "asia",
      projection: "equal-earth",
      theme: "atlas",
      fill: "political",
      size: [1200, 800],
      title: "Asia",
    },
  ],
  // Two encodings composing rather than competing: members filled with the
  // accent, candidates hatched over their own political colour.
  [
    "europe-union",
    {
      region: "europe",
      projection: "conic-conformal",
      theme: "atlas",
      size: [900, 900],
      highlight: [
        "AT", "BE", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
        "IE", "IT", "LV", "LT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
      ],
      stripe: ["AL", "BA", "MD", "ME", "MK", "RS", "UA"],
      title: "The European Union and its candidate countries",
    },
  ],
  // The two continents the gallery was missing, so every one is now rendered
  // at least once. `oceania` is the important one: it straddles the
  // antimeridian, which is where centring a projection on its region either
  // works or produces a map of the wrong half of the planet.
  [
    "north-america-albers",
    {
      region: "north-america",
      projection: "albers",
      theme: "minimal",
      palette: "sand",
      size: [1100, 900],
      title: "North America",
    },
  ],
  [
    "oceania-noir",
    {
      region: "oceania",
      projection: "equal-earth",
      theme: "noir",
      size: [1100, 800],
      title: "Oceania",
    },
  ],
  // A continent that is one country, at the one place a cylindrical projection
  // cannot describe: the pole is a line there, not a point, so Antarctica comes
  // out as a smear across the bottom of the map. Orthographic turns the globe
  // to look straight down at it instead.
  [
    "antarctica-orthographic",
    {
      region: "antarctica",
      projection: "orthographic",
      theme: "blueprint",
      size: [900, 900],
      layers: { hydro: false },
      title: "Antarctica",
    },
  ],
  [
    "europe-named",
    {
      region: "europe",
      theme: "minimal",
      size: [1000, 900],
      title: "Europe, named",
    },
  ],
  [
    "west-europe-named-cities",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: "atlas",
      size: [1000, 800],
      placeRank: 2,
      labelRank: 2,
      title: "Western Europe and its cities",
    },
  ],
  [
    "asia-named-blueprint",
    { region: "asia", theme: "blueprint", size: [1100, 900], title: "Asia, named" },
  ],
  [
    "west-europe-unnamed",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: "minimal",
      layers: { labels: false },
      title: "Western Europe, unlabelled",
    },
  ],
  [
    "italy-brand-tokens",
    {
      region: ["IT"],
      projection: "mercator",
      theme: "minimal",
      tokens: { land: "#0B5D3B", "land-edge": "#F4F1E8", bg: "#F4F1E8" },
      size: [600, 800],
      title: "Where we operate",
    },
  ],

  // Ten maps outside Western Europe. Twelve of the entries above are the same
  // thirteen countries, which proves the themes differ from one another and
  // very little else: framing, label thinning and political fill all behave
  // differently on a region that is mostly water, or mostly desert, or sits at
  // a latitude where the parallels crowd. Each of these is a region the presets
  // do not cover, and each carries an option the gallery was exercising in only
  // one place or none.

  // Neighbours somewhere the context is bigger than the subject. In Western
  // Europe the surrounding countries are peers; here China sits behind the
  // whole northern edge, so this is the map that shows whether context stays
  // context.
  [
    "south-asia-neighbours",
    {
      region: ["IN", "PK", "NP", "BD", "LK", "BT"],
      projection: "conic-conformal",
      theme: "atlas",
      neighbours: true,
      size: [900, 900],
      title: "South Asia, with its neighbours",
    },
  ],
  // A region that is mostly sea. The camera is fitted to land, so an
  // archipelago is the case where it can drift out into open water and frame
  // nothing at all. Atlas rather than moss: moss grounds its sea in stone
  // grey-green on purpose, which is right for a walking map of a continent and
  // washes out where three quarters of the frame is water.
  [
    "southeast-asia-cities",
    {
      region: ["ID", "MY", "TH", "VN", "PH", "KH", "LA", "MM", "BN", "TL"],
      projection: "equal-earth",
      theme: "atlas",
      size: [1100, 700],
      placeRank: 2,
      title: "Southeast Asia",
    },
  ],
  // The gallery had no choropleth in it at all: every data map above encodes
  // its quantity as height. 0.7 shipped a choropleth that exported as one flat
  // colour with the whole suite green, which is precisely the failure a file
  // someone opens is here to catch.
  //
  // Somaliland is XS, one of the five features Natural Earth ships with no ISO
  // code at all. Leaving it out does not leave it blank — it leaves a hole in
  // the Horn, because Somalia's polygon stops at a border the map is not
  // drawing. It is in the region and deliberately not in `values`: hatched
  // instead, which is what hatching is for — the thing that is not a quantity.
  //
  // Moss, and not by preference: on sand the lightest bin is #F1E8D5 against a
  // #F6F1E7 ground, and `--land-edge` is the ground colour exactly, so a
  // low-value country on a coast has neither a fill nor an outline that
  // separates it from the sea. Eritrea simply disappeared. Slate is worse.
  // Moss gives the lightest bin a ground to sit on and draws a real coastline.
  [
    "east-africa-choropleth",
    {
      region: ["ET", "KE", "TZ", "UG", "RW", "BI", "SS", "SO", "XS", "DJ", "ER"],
      projection: "equal-earth",
      theme: "minimal",
      palette: "moss",
      size: [900, 900],
      values: {
        ET: 126, KE: 55, TZ: 65, UG: 47, RW: 14,
        BI: 13, SS: 11, SO: 18, DJ: 1.1, ER: 3.7,
      },
      bins: 5,
      stripe: ["XS"],
      title: "East Africa by population, in millions",
    },
  ],
  // Political fill has to keep neighbours distinct without a palette built for
  // the region. Sixteen countries in a ring is a harder graph than Europe's.
  [
    "middle-east-political",
    {
      region: ["TR", "SY", "LB", "IL", "PS", "JO", "IQ", "IR", "SA", "YE", "OM", "AE", "QA", "KW", "EG"],
      projection: "conic-conformal",
      theme: "atlas",
      fill: "political",
      size: [1000, 800],
      title: "The Middle East",
    },
  ],
  // High latitude, where the standard parallels have to be chosen from the
  // region or Norway stretches past recognition.
  [
    "nordics-dusk",
    {
      region: ["SE", "NO", "FI", "DK", "IS"],
      projection: "conic-conformal",
      theme: "minimal",
      palette: "dusk",
      size: [1100, 700],
      title: "The Nordics",
    },
  ],
  // Three countries, two of them narrow and one of them islands — the smallest
  // region in the gallery that is still more than one country.
  [
    "japan-korea-highlight",
    {
      region: ["JP", "KR", "KP"],
      projection: "conic-conformal",
      theme: "noir",
      highlight: ["JP"],
      size: [800, 900],
      title: "Japan",
    },
  ],
  // Extrusion away from the region it was built on, and over a long thin
  // country where the side walls are most of what you see.
  [
    "southern-cone-prism",
    {
      region: ["AR", "CL", "UY", "PY", "BO"],
      projection: "conic-conformal",
      theme: "atlas",
      size: [800, 1000],
      extrude: { values: { AR: 646, CL: 335, UY: 77, PY: 43, BO: 45 }, height: 120 },
      title: "The Southern Cone by GDP",
    },
  ],
  // Small islands and nothing else, none large enough to anchor a camera on
  // its own. Trinidad belongs to the Caribbean and is deliberately not here:
  // it sits seven degrees south of the rest, so including it empties half the
  // canvas and pushes its own label off the edge. A region is what frames
  // together, not what a continent list says.
  //
  // 50m, and not for the detail: at 110m the Bahamas simplify down to a few
  // blobs that New Providence is not one of, so Nassau — a real coordinate
  // from a separate dataset — is drawn in open sea. Small islands are where a
  // simplified coastline and an exact point stop agreeing with each other.
  [
    "caribbean-islands",
    {
      region: ["CU", "HT", "DO", "JM", "BS", "PR"],
      detail: "50m",
      projection: "mercator",
      theme: "minimal",
      palette: "moss",
      size: [1100, 600],
      placeRank: 1,
      title: "The Caribbean",
    },
  ],
  // The `names` override doing what it shipped for: the same map in the
  // language the region speaks, without the library carrying a name table.
  [
    "south-america-espanol",
    {
      region: "south-america",
      projection: "equal-earth",
      theme: "minimal",
      palette: "sand",
      size: [800, 1000],
      names: {
        BR: "Brasil", PE: "Perú", BO: "Bolivia", GF: "Guayana Francesa",
        SR: "Surinam", FK: "Islas Malvinas",
      },
      title: "América del Sur",
    },
  ],
  // Landlocked, and the one map here that Phase 8d is aimed at: with no
  // coastline in frame, `--bg` is not the sea — it is showing through every
  // gap between countries that the region does not draw. This is the before
  // shot for the ocean layer.
  [
    "central-asia-inland",
    {
      region: ["KZ", "UZ", "TM", "TJ", "KG", "AF", "MN"],
      projection: "conic-conformal",
      theme: "contrast",
      size: [1100, 700],
      title: "Central Asia",
    },
  ],
  // The map Phase 8 exists to make: a region, a highlight, and marks where the
  // things happened. Pins are the one layer whose failure is invisible in the
  // markup — a mark drawn at a plausible pixel on the wrong ground reads as
  // correct — so the gallery has to carry one that can be looked at.
  //
  // The pin on Paris is the case that matters most: it sits on the highlighted
  // country, where --anno and --accent are the same colour in every preset, and
  // only the casing keeps it visible.
  [
    "west-europe-pins",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: "minimal",
      palette: "sand",
      highlight: ["FR"],
      // Deliberately not capitals. A pin on a city the map already names draws
      // the name twice, in two weights, a few units apart — the caller's choice
      // to make, but it reads as a rendering fault at gallery size, and the
      // gallery exists so that a fault is obvious at a glance.
      pins: [
        { at: [4.84, 45.76], label: "Lyon", kind: "site" },
        { at: [5.37, 43.3], label: "Marseille", offset: [0, 18] },
        { at: [9.19, 45.46], label: "Milan", id: "milan" },
        { at: [9.99, 53.55], label: "Hamburg", offset: [-14, -4] },
      ],
      title: "Four marks, two of them on the highlighted country",
    },
  ],
  // The phase deliverable, whole: region, highlight, marker, captioned callout.
  // The callout is the one annotation with a ground of its own, so this is also
  // the only entry where --anno-ink is doing anything.
  [
    "europe-callouts",
    {
      region: "europe",
      projection: "conic-conformal",
      theme: "noir",
      size: [1100, 800],
      highlight: ["UA"],
      // The bundled name is the older transliteration; this is what the
      // `names` override is for, and it renames the dot and the label together.
      names: { Kiev: "Kyiv" },
      // Odesa, at Odesa's coordinates — the grain port the caption is about.
      pins: [{ at: [30.73, 46.48], label: "Odesa", kind: "port", offset: [12, 12] }],
      callouts: [
        {
          at: [30.73, 46.48],
          text: "Grain exports resumed here in July, under a corridor agreement that lapsed in November",
          offset: [-96, -150],
          width: 190,
          id: "corridor",
        },
        {
          at: [-3.7, 40.42],
          text: "Set to the left of its point",
          offset: [-40, 60],
          kind: "aside",
        },
      ],
      title: "A captioned callout, and a mark it shares a coordinate with",
    },
  ],
  // Arrows, which are the one annotation whose head lives in the defs block —
  // so this is also the gallery's only check that a marker survives the
  // flattening every snapshot is written through.
  [
    "europe-arrows",
    {
      region: "europe",
      projection: "conic-conformal",
      // Plain atlas, no palette. `slate` sets --land within a hair of --bg, so
      // the land went flat against the sea and the arrows were the only thing
      // with any contrast on the page — which is the open palette defect the
      // plan records, and not something a gallery entry should be showing off.
      theme: "atlas",
      size: [1100, 800],
      names: { Kiev: "Kyiv" },
      pins: [{ at: [30.73, 46.48], label: "Odesa", kind: "port", offset: [12, 12] }],
      arrows: [
        { from: [30.73, 46.48], to: [-3.7, 40.42], kind: "grain" },
        { from: [30.73, 46.48], to: [12.5, 41.9], bow: -0.18, kind: "grain" },
        { from: [30.73, 46.48], to: [21.0, 52.23], bow: 0, kind: "grain" },
      ],
      title: "Three routes out of one port, one of them straight",
    },
  ],
  // Icons, which are the reason `kind` is free text rather than an enumeration:
  // the vocabulary's names are the conventional values, and `flooding` here
  // names no icon and stays a plain mark rather than throwing or drawing a
  // blank. Maki is CC0, so nothing in this file obliges anyone to credit it.
  [
    "west-europe-icons",
    {
      region: "west-europe",
      projection: "conic-conformal",
      // Not slate. That palette sets --land within a hair of --bg and the land
      // goes flat against the sea; this is the third entry today that had to
      // move off it, which is the open contrast defect the plan records under
      // 8d earning its place there.
      theme: "minimal",
      palette: "moss",
      size: [1000, 900],
      labelRank: 1,
      pins: [
        { at: [4.48, 51.92], kind: "harbor", label: "Rotterdam" },
        { at: [2.55, 49.01], kind: "airport", label: "Roissy" },
        { at: [8.68, 49.42], kind: "industry", label: "Ludwigshafen" },
        { at: [-3.0, 53.4], kind: "windmill", label: "Burbo Bank", offset: [0, 22] },
        { at: [11.26, 43.77], kind: "monument", label: "Firenze" },
        { at: [5.72, 45.19], kind: "danger", label: "Site B", offset: [0, 22] },
        { at: [-1.55, 47.22], kind: "flooding", label: "No icon for this" },
      ],
      title: "Seven marks, six of which name an icon",
      credit: "Boundaries: Natural Earth · masen",
    },
  ],
  // The furniture layer, which is the only one that is not geographic. The
  // credit sits at a canvas position and stays there however the map beneath it
  // is reframed — which is the whole reason it is a layer of its own.
  [
    "world-credited",
    {
      region: "world",
      projection: "equal-earth",
      theme: "atlas",
      size: [1200, 640],
      credit: { text: "Natural Earth · public domain", anchor: "bottom-left" },
      title: "A credit line on the canvas, not on the ground",
    },
  ],
  [
    // A conic fitted to its region: scale uniform to three per cent, so the bar
    // is drawn — and meridians fanning twenty degrees apart at the corners, so
    // the arrow is not. Asking for both and getting one is the feature.
    "west-europe-measured",
    {
      region: "west-europe",
      projection: "conic-conformal",
      theme: "atlas",
      size: [900, 700],
      scaleBar: true,
      compass: true,
      credit: "Distances true to 3% across this frame",
      title: "A scale bar the frame has earned",
    },
  ],
  [
    // The mirror case, and the one the old rule got backwards. Mercator is
    // conformal, so "a bar suits the conformal projections" would allow one
    // here — where the same ruler reads nearly three times longer at the top of
    // the frame than the bottom. No bar. But north is exactly up on every
    // mercator ever drawn, at any extent, so the arrow stands.
    "europe-mercator-north",
    {
      region: "europe",
      projection: "mercator",
      theme: "blueprint",
      size: [900, 700],
      scaleBar: true,
      compass: true,
      // Bottom-left: the bottom-right corner of this frame is Cyprus, and a
      // credit laid over Nicosia reads as a rendering fault at gallery size.
      credit: { text: "Scale varies 2.8:1 — no bar drawn", anchor: "bottom-left" },
      title: "North is up, and nothing else is true",
    },
  ],
  [
    // Small enough that both claims hold at once, which is the only kind of map
    // that carries the whole set: bar, arrow and credit, three corners apart.
    "indonesia-furnished",
    {
      region: ["ID"],
      projection: "conic-conformal",
      theme: "minimal",
      size: [1000, 600],
      scaleBar: { units: "mi", anchor: "bottom-left" },
      compass: { anchor: "top-left" },
      credit: "masen",
      title: "Bar, arrow and credit, in three corners",
    },
  ],
  [
    // A watermark marks provenance and enforces nothing — it is a text node in
    // a file the reader can open, select and delete. Drawn in the furniture
    // layer, which is above everything, so it is a stamp rather than a texture.
    "africa-provisional",
    {
      region: "africa",
      projection: "albers",
      theme: "atlas",
      size: [900, 900],
      watermark: "PROVISIONAL",
      credit: "Boundaries as drawn are not authoritative",
      compass: true,
      title: "A watermark marks provenance, it does not enforce it",
    },
  ],
  [
    // The grid, on the projection that bends it most. A conic fans its
    // meridians, so a graticule drawn in screen space would be a ladder here
    // and the map would be lying about its own geometry.
    "south-america-graticule",
    {
      region: "south-america",
      projection: "conic-conformal",
      theme: "atlas",
      size: [900, 900],
      graticule: true,
      title: "Parallels and meridians, bent by the projection that draws them",
    },
  ],
  [
    // The equator and the tropics, drawn from `--equator` rather than
    // `--graticule`. A map that marks the tropics at the weight of 20°N is
    // not marking them.
    "africa-tropics",
    {
      region: "africa",
      projection: "albers",
      theme: "minimal",
      palette: "patina",
      size: [900, 900],
      graticule: { step: 10 },
      title: "The equator and the tropics, told apart from the grid",
    },
  ],
  [
    // An explicit centre moves the projection's axis, not the camera. The
    // world map every reader has seen is Atlantic-centred; this is the other
    // one, and it is the case the automatic centring deliberately refuses.
    "world-pacific",
    {
      region: "world",
      projection: "equal-earth",
      theme: "atlas",
      size: [1200, 700],
      center: 160,
      graticule: true,
      // Thinned to the top band: the point of this entry is where the
      // antimeridian sits, and two hundred overlapping city names bury it.
      labelRank: 1,
      placeRank: 1,
      title: "A Pacific-centred world, which no automatic rule would produce",
    },
  ],
  [
    // The palette that is not atlas-muted. Flat editorial plates on a dark
    // sea — which is why its furniture ink is light where every other
    // palette's is dark.
    "europe-patina",
    {
      region: "europe",
      projection: "conic-conformal",
      theme: "atlas",
      palette: "patina",
      size: [1000, 900],
      fill: "political",
      credit: "Natural Earth",
      title: "Editorial colour: flat plates, near-black linework, a dark sea",
    },
  ],
  [
    // The case the sea layer exists for. Without it `--bg` paints the whole
    // canvas, so the Turkish coast reads as Aegean and the Balkans read as
    // open water — land the map is not drawing, painted as sea. The ground is
    // set to paper here so the difference is the thing you look at.
    "aegean-sea",
    {
      region: ["GR"],
      projection: "mercator",
      theme: "atlas",
      size: [900, 700],
      sea: true,
      tokens: { "--bg": "#F2EAD8" },
      credit: "Natural Earth",
      title: "The sea as a shape, so the land it is not stops being water",
    },
  ],
  [
    // The same layer on a palette whose ground is already paper, so it needs
    // no token override to show what it does. Croatia is a crescent and Bosnia
    // sits inside the curve of it: without the sea layer the Adriatic and
    // Bosnia are the same colour, and the coast cannot be found at all.
    "adriatic-sea",
    {
      region: ["HR"],
      projection: "mercator",
      theme: "minimal",
      palette: "sand",
      size: [900, 700],
      sea: true,
      labelRank: 1,
      placeRank: 1,
      title: "Croatia, where the Adriatic and Bosnia used to be one colour",
    },
  ],
  [
    // Land cover, on the one region where a reader can check it against what
    // they already know: the Sahara covers almost the whole frame and stops
    // exactly where the Nile and the Sahel are. 50m, because the classification
    // at 110m carries two deserts for the whole planet.
    "sahara-cover",
    {
      region: ["DZ", "LY", "EG", "NE", "TD", "ML", "MR", "MA", "TN", "SD"],
      detail: "50m",
      projection: "mercator",
      theme: "atlas",
      size: [900, 620],
      terrain: true,
      sea: true,
      seaNames: true,
      labelRank: 1,
      placeRank: 1,
      credit: "Natural Earth",
      title: "The Sahara as cover, and the Nile as the line it stops at",
    },
  ],
  [
    // The other half of the layer, and the harder one: mountains are a shape
    // nobody draws from memory, so the Alpine arc, the Pyrenees, the Apennines
    // and the Carpathians all have to arrive in the right place at once.
    "alps-cover",
    {
      region: ["CH", "IT", "FR", "AT", "DE", "SI"],
      detail: "50m",
      projection: "conic-conformal",
      theme: "minimal",
      palette: "sand",
      size: [900, 620],
      terrain: ["mountain"],
      sea: true,
      seaNames: 3,
      labelRank: 1,
      placeRank: 1,
      title: "The Alps, the Pyrenees and the Apennines, with the water named",
    },
  ],
  [
    // The one thing in this phase that needed nothing downloaded. A main line
    // with a branch hanging off it, which is the shape the reference map that
    // prompted it had: ringed stops along an ordered line, the branch drawn in
    // smaller marks so it reads as a branch rather than a second main line.
    "norrland-route",
    {
      region: ["SE", "NO", "FI"],
      detail: "50m",
      projection: "conic-conformal",
      theme: "minimal",
      palette: "moss",
      size: [620, 820],
      sea: true,
      seaNames: true,
      placeRank: 1,
      labelRank: 1,
      routes: [
        {
          label: "Stambanan genom övre Norrland",
          stops: [
            { at: [18.06, 59.33], label: "Stockholm" },
            { at: [17.14, 60.67], label: "Gävle" },
            { at: [17.31, 62.39], label: "Sundsvall" },
            { at: [20.26, 63.83], label: "Umeå" },
            { at: [21.48, 65.58], label: "Luleå" },
            { at: [20.22, 67.85], label: "Kiruna" },
            { at: [17.42, 68.44], label: "Narvik", kind: "minor" },
          ],
        },
        {
          label: "Inlandsbanan",
          kind: "branch",
          stops: [
            { at: [17.31, 62.39] },
            { at: [14.64, 63.18], label: "Östersund", kind: "minor" },
            { at: [19.03, 65.59], label: "Arvidsjaur", kind: "minor" },
            { at: [20.22, 67.85] },
          ],
        },
      ],
      title: "A route is an ordered list of places, and a branch is another one",
    },
  ],
];

describe("gallery", () => {
  it.each(GALLERY)("renders %s", async (name, options) => {
    const map = await masen({ detail: "110m", ...options });
    // `render()`, not `toString()`: these files exist to be opened, and many
    // viewers ignore <style>. The stylesheet still ships inside them.
    await expect(await map.render()).toMatchFileSnapshot(
      `./__snapshots__/gallery/${name}.svg`,
    );
  });

  // Every file in the gallery has to survive a reader that ignores stylesheets,
  // or the gallery cannot do the one job it exists for.
  it.each(GALLERY)("gives %s paint a viewer can see without css", async (_name, options) => {
    const map = await masen({ detail: "110m", ...options });
    const artifact = await map.render();
    const withoutStyle = artifact.replace(/<style>[\s\S]*?<\/style>/, "");
    // An extruded map draws prisms rather than flat countries, so either
    // carries the paint — what matters is that something visible does.
    expect(withoutStyle).toMatch(
      /<path class="mp-(country|prism-top)"[^>]*fill="#[0-9A-Fa-f]{3,6}"/,
    );
  });

  it("keeps the small stylesheet-only form available", async () => {
    const map = await masen({ region: ["FR"], detail: "110m", theme: "atlas" });
    const small = map.toString();
    const portable = await map.render();
    expect(small).not.toContain('fill="#F2EAD8"');
    expect(portable).toContain('fill="#F2EAD8"');
    expect(small.length).toBeLessThan(portable.length);
  });
});
