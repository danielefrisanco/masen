/**
 * Vendor the Natural Earth sources that no npm package carries.
 *
 * Countries, lakes and rivers arrive through `world-atlas` and `sane-topojson`,
 * which are devDependencies and need no help. Everything else this library
 * draws — populated places, land cover, sea names — exists only as a file on
 * Natural Earth's servers, so it is downloaded once, trimmed, and committed
 * under `vendor/`. `build-data.mjs` reads what lands here; nothing at runtime
 * does. Run this only when a source changes:
 *
 *     node scripts/fetch-natural-earth.mjs
 *
 * **Trimmed on the way in, not on the way out.** A Natural Earth GeoJSON
 * carries about thirty `name_xx` translation columns and a `wikidataid` on
 * every feature, and the physical-region files carry every continent as a
 * polygon. Vendoring them whole would put roughly five megabytes in git to
 * ship a hundred kilobytes, so the download keeps the columns the build reads
 * and drops the rest. What is vendored is what will be used.
 *
 * **The land-cover classification only exists at 10m, and that is the one
 * interesting thing here.** `geography_regions_polys` is the source for desert
 * and mountain cover, and Natural Earth publishes it at three tiers — but the
 * `FEATURECLA` column is populated at 10m only. At 50m and 110m it is blank on
 * every single feature, so those files are a list of named shapes with no way
 * to tell the Sahara from Scandinavia. The classification is recoverable
 * because `NE_ID` is stable across tiers: joining the 10m table onto the
 * coarser geometry matches 60 of 60 features at 110m and 522 of 522 at 50m.
 * The class still comes from Natural Earth. Nothing here guesses at a name.
 *
 * Everything Natural Earth publishes is public domain.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { geoBounds, geoCentroid, geoContains, geoDistance } from "d3-geo";

const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const TIERS = ["110m", "50m"];

/**
 * The cover classes that ship, and the names they are emitted under.
 *
 * Three, and the third comes from a different file. Natural Earth's physical
 * regions are classed into twenty-three kinds, most of which are not cover at
 * all — `Island`, `Continent`, `Coast`, `Pen/cape` are places rather than
 * ground. Of the ones that are, only these two describe the ground in a way a
 * theme can honestly tint. `Plateau` and `Plain` were considered and dropped:
 * they are named regions more than surfaces, and tinting the Iberian Peninsula
 * as a plateau says something a reader would not accept.
 *
 * There is no forest. Natural Earth has no forest polygon at any tier — land
 * cover of that kind lives in rasters — and inventing one from a climate band
 * would be the only dishonest layer in the library.
 */
const COVER = new Map([
  ["Desert", "desert"],
  ["Range/mtn", "mountain"],
]);

async function fetchJson(name) {
  const response = await fetch(`${BASE}/${name}.geojson`);
  if (!response.ok) {
    throw new Error(`could not download ${name}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function write(path, value) {
  const text = JSON.stringify(value);
  await writeFile(path, text, "utf8");
  console.log(`  ${path}  ${(text.length / 1024).toFixed(0)} KB`);
}

function collection(features) {
  return { type: "FeatureCollection", features };
}

/**
 * Title case for a name that arrives shouting.
 *
 * Natural Earth's `name` column is inconsistent — "Mediterranean Sea" and
 * "INDIAN OCEAN" sit in the same file — and the `label` column is uppercase
 * throughout, so neither can be used as it stands. Casing is a rendering
 * decision anyway: a theme that wants small caps sets `text-transform`, and it
 * can only do that if what it is given is not already shouted.
 */
function titleCase(name) {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s\-'(])([a-zà-ɏ])/g, (_, before, letter) => before + letter.toUpperCase())
    .replace(/\b(Of|The|And|De|Du|Da|Del|La|Le|Los|San)\b/g, (word, _match, index) =>
      index === 0 ? word : word.toLowerCase(),
    );
}

/** Every vertex of a polygon, flattened, so a candidate point can be scored against the edge. */
function vertices(coordinates, into = []) {
  if (typeof coordinates[0] === "number") {
    into.push(coordinates);
    return into;
  }
  for (const part of coordinates) vertices(part, into);
  return into;
}

/**
 * A point inside a sea, as far from its shore as the sampling can find.
 *
 * The centroid is the obvious answer and it is wrong for exactly the seas worth
 * naming: the Mediterranean is a long bent basin whose centroid is somewhere
 * over Sicily, and a label anchored there is on land. So this is a pole of
 * inaccessibility instead — the interior point furthest from the boundary —
 * approximated by a grid search that keeps only points `geoContains` says are
 * inside, scored by distance to the nearest vertex, then refined twice around
 * the winner.
 *
 * It runs here rather than at render time because the answer never changes.
 * A sea's shape is fixed; only the frame around it moves.
 */
function interiorPoint(feature) {
  const [[west, south], [east, north]] = geoBounds(feature);
  // geoBounds reports an antimeridian-crossing shape with west > east. Unrolling
  // the east edge past 180 keeps the sampling inside the shape rather than
  // sweeping the long way round the planet.
  const right = east < west ? east + 360 : east;
  const edge = vertices(feature.geometry.coordinates);

  const score = (point) => {
    if (!geoContains(feature, point)) return -1;
    let nearest = Infinity;
    for (const vertex of edge) {
      const distance = geoDistance(point, vertex);
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  };

  let best = null;
  let bestScore = -1;
  let [x0, x1, y0, y1] = [west, right, south, north];
  const STEPS = 24;
  for (let pass = 0; pass < 3; pass++) {
    const dx = (x1 - x0) / STEPS;
    const dy = (y1 - y0) / STEPS;
    for (let i = 0; i <= STEPS; i++) {
      for (let j = 0; j <= STEPS; j++) {
        const lon = ((x0 + i * dx + 540) % 360) - 180;
        const lat = y0 + j * dy;
        const found = score([lon, lat]);
        if (found > bestScore) {
          bestScore = found;
          best = [lon, lat];
        }
      }
    }
    if (best === null) break;
    // Narrow to a window around the winner and look again.
    [x0, x1] = [best[0] - dx, best[0] + dx];
    [y0, y1] = [best[1] - dy, best[1] + dy];
  }

  return best ?? geoCentroid(feature);
}

/**
 * Three bands from Natural Earth's five, so a theme thins sea names the way it
 * thins settlements. Oceans and the great seas are rank 1; the named basins
 * that a country-sized map frames are rank 2; straits, bights and the rest are
 * rank 3.
 */
function seaRank(scalerank) {
  if (scalerank <= 1) return 1;
  if (scalerank === 2) return 2;
  return 3;
}

await mkdir("vendor", { recursive: true });

// The classification table, downloaded for its two columns and thrown away.
// 5.4 MB of 10m geometry arrives so that 24 KB of it can be vendored.
console.log("classification (ne_10m_geography_regions_polys)");
const classified = await fetchJson("ne_10m_geography_regions_polys");
const classOf = new Map();
for (const item of classified.features) {
  if (item.properties.NE_ID != null) classOf.set(String(item.properties.NE_ID), item.properties.FEATURECLA);
}
console.log(`  ${classOf.size} regions classed at 10m`);

for (const tier of TIERS) {
  console.log(`\n${tier}`);

  const regions = await fetchJson(`ne_${tier}_geography_regions_polys`);
  const cover = [];
  let unclassed = 0;
  for (const item of regions.features) {
    const found = classOf.get(String(item.properties.NE_ID));
    if (found === undefined) {
      unclassed++;
      continue;
    }
    const kind = COVER.get(found);
    if (kind === undefined) continue;
    cover.push({ type: "Feature", properties: { k: kind, n: item.properties.NAME }, geometry: item.geometry });
  }
  // A miss would mean the join silently produced a thinner map rather than a
  // broken one, which is the kind of failure that ships. Say so instead.
  if (unclassed > 0) {
    throw new Error(
      `masen: ${unclassed} of ${regions.features.length} regions at ${tier} have no 10m classification. ` +
        `The NE_ID join is the only thing standing between this file and an unclassed blob — fix it rather than working around it.`,
    );
  }

  const glaciers = await fetchJson(`ne_${tier}_glaciated_areas`);
  for (const item of glaciers.features) {
    cover.push({ type: "Feature", properties: { k: "glacier", n: null }, geometry: item.geometry });
  }
  await write(`vendor/cover-${tier}.raw.json`, collection(cover));

  /**
   * Seas are vendored as points, not as polygons, and that is a decision worth
   * naming because it is the one place this phase trades quality for weight.
   *
   * The polygons are 1.5 MB across the two tiers and they are never drawn —
   * `.mp-ocean` already draws the water, and a sea polygon exists here only to
   * say where its name goes. So the anchor is computed once, at build time, and
   * the shape is thrown away. The cost is a rule the reader can still state:
   * **a sea is named when its middle is on the map.** Frame the Aegean and you
   * get "Aegean Sea"; frame Lisbon and you do not get "North Atlantic Ocean"
   * spilling in from a thousand kilometres west, which is the right answer more
   * often than it is the wrong one. Labelling the visible sliver of a sea whose
   * middle is off-frame needs the polygon back, and is a real improvement
   * waiting for someone who wants it.
   */
  const marine = await fetchJson(`ne_${tier}_geography_marine_polys`);
  const seas = [];
  for (const item of marine.features) {
    const [lon, lat] = interiorPoint(item);
    seas.push({
      n: titleCase(item.properties.name),
      k: item.properties.featurecla,
      x: Math.round(lon * 1e3) / 1e3,
      y: Math.round(lat * 1e3) / 1e3,
      r: seaRank(item.properties.scalerank ?? 4),
    });
  }
  seas.sort((a, b) => a.r - b.r || a.n.localeCompare(b.n));
  await write(`vendor/seas-${tier}.raw.json`, seas);
}

console.log("\nvendored");
