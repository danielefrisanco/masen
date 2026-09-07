/**
 * Build the bundled map data.
 *
 * Phase 4's real job is not "add more layers" — it is to stop reading a
 * devDependency off disk at call time, which is what made the library
 * Node-only. Sources are devDependencies and stay on the build machine;
 * `data/` is what ships and what `loadWorld()` reads.
 *
 * Three sources, each chosen for one reason:
 *   world-atlas     countries, because it carries ISO numeric ids that the
 *                   identity table already maps
 *   sane-topojson   lakes and rivers, which world-atlas does not have
 *   Natural Earth   populated places, land cover and sea names, vendored under
 *                   vendor/ by scripts/fetch-natural-earth.mjs
 *
 * Countries stay as a topology: shared borders can only be derived where arcs
 * are shared. Water needs no such thing — no two lakes share an edge — so it is
 * decoded to plain geometry, which is smaller and simpler to read back.
 *
 * The ocean is written to a file of its own rather than into the bundle, and
 * that is the whole reason it can exist at all. It is one polygon with a hole
 * for every continent, so it costs 74 KB at 110m and 985 KB at 50m — roughly
 * half again the size of everything else put together. `sea` is opt-in, and
 * an opt-in layer that every caller downloads is not opt-in. The loading seam
 * has been async and swappable since Phase 4 precisely so a layer could move
 * out of the bundle like this without reaching a caller.
 *
 * Land cover follows the ocean out for the same reason and sea names do not,
 * which is the line worth stating once: **weight decides, not opt-in-ness.**
 * Cover is 47 KB at 110m and 470 KB at 50m of polygon, so it gets its own file.
 * Sea names are 2 KB and 7 KB, because the polygons were reduced to one anchor
 * point each before they were ever vendored — a list that small is cheaper in
 * the bundle than a second network round trip would be, and it rides along.
 */
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { feature } from "topojson-client";
import { geoContains } from "d3-geo";

const require = createRequire(import.meta.url);
const TIERS = ["110m", "50m"];

/**
 * Three bands, so a theme can thin density with one CSS rule.
 *
 * Capitals are promoted regardless of size — a map that shows Milan but not
 * Bern is wrong — but the bands are otherwise population, not capital status:
 * Hamburg, Lyon, Turin and Munich all belong on a map of Western Europe.
 */
function rankOf(properties) {
  const population = properties.pop_max ?? 0;
  if (properties.adm0cap === 1 || population >= 5_000_000) return 1;
  if (population >= 1_000_000) return 2;
  return 3;
}

function trimPlaces(collection) {
  const places = [];
  for (const item of collection.features) {
    const p = item.properties;
    const [lon, lat] = item.geometry.coordinates;
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    places.push({
      // Short keys: this file is read on every call, not by a person.
      n: p.nameascii || p.name,
      i: p.iso_a2 && p.iso_a2 !== "-99" ? p.iso_a2 : null,
      x: Math.round(lon * 1e4) / 1e4,
      y: Math.round(lat * 1e4) / 1e4,
      p: p.pop_max ?? 0,
      c: p.adm0cap === 1 ? 1 : 0,
      s: p.scalerank ?? 10,
      r: rankOf(p),
    });
  }
  // Most important first, so a cap on how many to draw is a slice.
  places.sort((a, b) => a.r - b.r || a.s - b.s || b.p - a.p);
  return places;
}

/** Drop the coordinate precision that survives simplification but not the eye. */
function round(coordinates, digits) {
  if (typeof coordinates[0] === "number") {
    const f = 10 ** digits;
    return coordinates.map((n) => Math.round(n * f) / f);
  }
  return coordinates.map((c) => round(c, digits));
}

function waterLayer(topology, key, digits) {
  const object = topology.objects[key];
  if (!object) return { type: "FeatureCollection", features: [] };
  const collection = feature(topology, object);
  return {
    type: "FeatureCollection",
    features: collection.features.map((f) => ({
      type: "Feature",
      properties: {},
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates, digits) },
    })),
  };
}

await mkdir("data", { recursive: true });

for (const tier of TIERS) {
  const countries = JSON.parse(
    await readFile(require.resolve(`world-atlas/countries-${tier}.json`), "utf8"),
  );
  const sane = JSON.parse(
    await readFile(require.resolve(`sane-topojson/dist/world_${tier}.json`), "utf8"),
  );
  const places = trimPlaces(JSON.parse(await readFile(`vendor/places-${tier}.raw.json`, "utf8")));
  const rawSeas = JSON.parse(await readFile(`vendor/seas-${tier}.raw.json`, "utf8"));

  /**
   * A sea whose anchor is on land is dropped rather than shipped.
   *
   * **Measured, not suspected: two of the 29 rank-1 anchors fall inside
   * Antarctica** — Indian Ocean at 92.8°E, 80.6°S and Southern Ocean at
   * 101.0°E, 80.6°S, the same latitude, both well inland. A pole of
   * inaccessibility for a body of water cannot be on a continent, so those two
   * are wrong however they were produced, and nothing downstream can tell.
   *
   * The vendored file holds an anchor and no polygon — the shapes were dropped
   * at fetch time to save 1.5 MB — so this cannot recompute a better point; it
   * can only refuse a bad one. Refusing is the right half to do here anyway: a
   * label the reader can check against the coastline under it is the one thing
   * worse than no label, and "Indian Ocean" set across Antarctica is exactly
   * that.
   *
   * The real fix is the one 08c named and deferred: vendor the marine polygons
   * back, and label the visible part of a sea whose middle is off-frame rather
   * than only the sea whose middle is on it. Until then this keeps the wrong
   * ones out of the bundle and says how many it kept out.
   */
  // Decoded once: `countries` is a topology, and containment needs shapes.
  const land = feature(countries, countries.objects.countries).features;
  const seas = rawSeas.filter((sea) => !land.some((f) => geoContains(f, [sea.x, sea.y])));
  const rawCover = JSON.parse(await readFile(`vendor/cover-${tier}.raw.json`, "utf8"));

  const digits = tier === "110m" ? 2 : 3;

  // Land cover, out of the bundle beside the ocean and for the same reason.
  // `n` is dropped: the Sahara's name would be a label, and labelling cover is
  // a different feature from tinting it. The class is what a theme colours.
  const cover = {
    type: "FeatureCollection",
    features: rawCover.features.map((f) => ({
      type: "Feature",
      properties: { k: f.properties.k },
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates, digits) },
    })),
  };
  const coverPath = `data/cover-${tier}.json`;
  await writeFile(coverPath, JSON.stringify(cover), "utf8");

  /**
   * Disputed and breakaway areas, out of the bundle for the third time and for
   * the same reason — nothing that reads the bundle pays for a layer it did
   * not ask for.
   *
   * **Emitted at both tiers from one 50m source.**
   * `ne_110m_admin_0_breakaway_disputed_areas` does not exist, so the coarse
   * tier is rounded down from the fine one — the same move land cover makes
   * when it borrows its classification from 10m. The areas end up finer than
   * the 110m country outline and can overhang it, which is the price of the
   * coarse tier being able to mark a contested border at all.
   */
  {
    // Vendored at 50m only, because that is the only tier Natural Earth
    // publishes one at. The 110m file is emitted from the same source at the
    // coarse tier's own precision — see the note above.
    const rawDisputed = JSON.parse(await readFile(`vendor/disputed-50m.raw.json`, "utf8"));
    const disputed = {
      type: "FeatureCollection",
      features: rawDisputed.features.map((f) => ({
        type: "Feature",
        properties: { n: f.properties.n, k: f.properties.k, note: f.properties.note },
        geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates, digits) },
      })),
    };
    const disputedPath = `data/disputed-${tier}.json`;
    await writeFile(disputedPath, JSON.stringify(disputed), "utf8");
    const kinds = {};
    for (const f of disputed.features) kinds[f.properties.k] = (kinds[f.properties.k] ?? 0) + 1;
    const { size: disputedSize } = await (await import("node:fs")).promises.stat(disputedPath);
    console.log(
      `  ${disputedPath}  ${(disputedSize / 1024).toFixed(0)} KB` +
        `  (${disputed.features.length} areas: ` +
        Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ") +
        `)`,
    );
  }

  // Written first and separately: nothing in the bundle refers to it, and
  // nothing that reads the bundle pays for it.
  const ocean = waterLayer(sane, "ocean", digits);
  const oceanPath = `data/ocean-${tier}.json`;
  await writeFile(oceanPath, JSON.stringify(ocean), "utf8");

  const bundle = {
    tier,
    countries,
    lakes: waterLayer(sane, "lakes", digits),
    rivers: waterLayer(sane, "rivers", digits),
    places,
    seas,
  };

  const path = `data/${tier}.json`;
  await writeFile(path, JSON.stringify(bundle), "utf8");
  const { size } = await import("node:fs").then((fs) => fs.promises.stat(path));
  const oceanSize = (await import("node:fs")).promises.stat(oceanPath);
  console.log(
    `  ${path}  ${(size / 1024).toFixed(0)} KB` +
      `  (${countries.objects.countries.geometries.length} countries,` +
      ` ${bundle.lakes.features.length} lakes,` +
      ` ${bundle.rivers.features.length} rivers,` +
      ` ${places.length} places,` +
      ` ${seas.length} sea names` +
        (rawSeas.length === seas.length
          ? ""
          : `, ${rawSeas.length - seas.length} dropped for an anchor on land`) +
        `)`,
  );
  console.log(
    `  ${oceanPath}  ${((await oceanSize).size / 1024).toFixed(0)} KB` +
      `  (${ocean.features.length} ocean polygons, loaded only when \`sea\` is on)`,
  );
  const coverSize = (await import("node:fs")).promises.stat(coverPath);
  const kinds = {};
  for (const f of cover.features) kinds[f.properties.k] = (kinds[f.properties.k] ?? 0) + 1;
  console.log(
    `  ${coverPath}  ${((await coverSize).size / 1024).toFixed(0)} KB` +
      `  (${Object.entries(kinds)
        .map(([k, n]) => `${n} ${k}`)
        .join(", ")}, loaded only when \`terrain\` is on)`,
  );
}
console.log("data built");
