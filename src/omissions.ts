/**
 * What the map was asked for and did not draw.
 *
 * **A refusal the caller cannot inspect is a bug report waiting to happen.**
 * That sentence is already in this codebase, above `distortion()`, and it was
 * written about a scale bar that declines to appear. It applies with more force
 * here, because a missing country does not announce itself the way a missing
 * ruler does: a map of Europe drawn without Monaco, Andorra and the Vatican
 * looks exactly like a map of Europe.
 *
 * A reader cannot tell the difference between *"this country is not in your
 * region"* and *"this country is in your region and the map could not draw
 * it"*, and neither can the person who built the map. That is the defect this
 * type exists to close — not any individual omission.
 *
 * **It reports; it does not refuse.** Nothing here throws, and nothing changes
 * what is drawn. A caller who ignores it gets exactly the map they got before.
 * A caller on a deadline gets a list of what to say in a footnote.
 */
export interface Omissions {
  /**
   * Codes that were asked for and are not in this detail tier at all.
   *
   * The blunt one, and the largest. Natural Earth's 110m tier carries 177
   * countries and its 50m tier carries 241, so `europe` at 110m draws 39 of the
   * 45 it names — Andorra, Liechtenstein, Malta, Monaco, San Marino and the
   * Vatican are simply not in the file. `south-asia` names eight and draws
   * seven for the same reason: the Maldives.
   *
   * The cure is usually one word — `detail: "50m"` — which is why this is
   * worth saying out loud rather than leaving for someone to notice.
   */
  readonly absent: readonly string[];
  /**
   * Codes that were drawn and are too small to be read on this canvas.
   *
   * The other half of the same defect, and the half that cannot be fixed by
   * changing an option: Vatican is 0.2 x 0.1 user units on a 960x620 map of
   * Europe and 0.5 x 0.5 at 4000x2000. There is no canvas size at which it
   * appears. Monaco is the same story one order of magnitude up.
   *
   * Measured against the dot the map itself draws on the country — see
   * `UNSEEN_EXTENT` — so it is a fact about this map rather than a judgement:
   * these are the countries hidden underneath their own capitals.
   *
   * Every one of them also carries `data-unseen` in the markup, which is what
   * lets a theme give them a stroke heavy enough to read as a dot without the
   * library inventing any geometry.
   */
  readonly unseen: readonly string[];
}

/**
 * Compare what was asked for against what came back.
 *
 * Exact, and deliberately so: this is a set difference over ISO codes, with no
 * threshold in it and nothing to tune. The parts of this problem that need a
 * measured threshold — how small is too small to see — are a separate question
 * and belong in their own field, arrived at by rendering and looking rather
 * than by rounding.
 *
 * `requested` is empty for a world map, a bounding box or caller-supplied
 * GeoJSON, because none of those names a country: there is no list to fall
 * short of, so there is nothing here to report.
 */
export function omissionsOf(
  requested: readonly string[],
  drawn: readonly string[],
  unseen: readonly string[] = [],
): Omissions {
  const present = new Set(drawn);
  // Ordered as the caller wrote them, not sorted: a list that comes back in the
  // order it went in is a list someone can scan against their own source.
  const absent: string[] = [];
  const seen = new Set<string>();
  for (const code of requested) {
    if (present.has(code) || seen.has(code)) continue;
    seen.add(code);
    absent.push(code);
  }
  // Deduplicated for the same reason `absent` is: a country arrives here once
  // per drawn feature, and a MultiPolygon is still one country.
  return { absent, unseen: [...new Set(unseen)] };
}
