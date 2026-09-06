import type { Config } from "./config.js";

/**
 * What you asked for and did not get, said next to the control you asked with.
 *
 * The status line under the map was the right place for the only failure the
 * tool had when it was written: a missing data file, which is the deploy's
 * fault and nobody's decision. It is the wrong place for these, which are
 * neither failures nor the deploy's: ticking *Glaciers* over Spain, turning on
 * sea names where none fit, numbering a graticule on a globe whose lines end on
 * the limb. Nothing is broken. The control simply had nothing to do, and it
 * still looks exactly like a control that worked.
 *
 * **Read back off the drawn map, never predicted.** Every one of these is
 * answered by looking at the SVG that was actually produced — did a glacier
 * path get emitted, did a sea name survive the label solver — rather than by a
 * second copy of the library's rules living in the tool. A prediction is a
 * thing that can disagree with the map, and a note that disagrees with the map
 * is worse than no note. The gallery took the same bargain in Phase 2, for the
 * same reason.
 *
 * A hidden label counts as absent, deliberately. `data-fit="0"` means the
 * solver kept the name in the document and declined to show it — which from the
 * reader's side is precisely "I turned this on and cannot see it".
 */

/** Keyed by the control they belong under. */
export type Notes = Readonly<Record<string, string>>;

/** Present *and* visible: a label the solver hid is one nobody can read. */
function drawn(svg: string, pattern: RegExp): boolean {
  for (const match of svg.matchAll(pattern)) {
    if (!(match[0] ?? "").includes('data-fit="0"')) return true;
  }
  return false;
}

const COVER_NAMES: Readonly<Record<string, string>> = {
  desert: "desert",
  mountain: "mountains",
  glacier: "glaciers",
};

export function notesFor(svg: string, config: Config): Notes {
  const notes: Record<string, string> = {};

  for (const kind of config.terrain) {
    if (!svg.includes(`<path class="mp-cover" data-kind="${kind}"`)) {
      notes[kind] = `No ${COVER_NAMES[kind] ?? kind} in this frame.`;
    }
  }

  if (config.seaNames && !drawn(svg, /<text class="mp-label" data-kind="sea"[^>]*>/g)) {
    notes["seaNames"] = "No sea name fits this frame.";
  }

  if (
    config.graticule &&
    config.gridLabels &&
    !drawn(svg, /<text class="mp-label" data-kind="grid"[^>]*>/g)
  ) {
    // The honest sentence rather than "none": on a globe the grid ends on the
    // limb, in the middle of the picture, and there is no frame for a number to
    // sit against.
    notes["gridLabels"] = "No grid line reaches the frame to be numbered.";
  }

  if (config.neighbours && !svg.includes('class="mp-neighbour"')) {
    notes["neighbours"] = "Nothing else falls inside this frame.";
  }

  /**
   * The one note here that reports a *decision* rather than an absence.
   *
   * A scale bar is refused when the frame's local scale varies too much across
   * the canvas for one length to be true of all of it — equal-earth on a world
   * frame is the obvious case. That is the library being careful, but from this
   * side it looks identical to a broken checkbox, and a refusal nobody can
   * inspect is a bug report waiting to happen.
   */
  if (config.scaleBar && !svg.includes('class="mp-scale"')) {
    notes["scaleBar"] =
      "Not drawn — the scale changes too much across this frame for one bar to be true of all of it.";
  }

  if (config.placeRank > 0 && !svg.includes('<circle class="mp-place"')) {
    notes["placeRank"] = "No city of this rank is in the frame.";
  }

  // A highlight code the region does not contain is the quietest of these: the
  // country is not on the map, so nothing at all happens and the chip sits
  // there looking as though it did.
  if (config.highlight.length > 0) {
    const lit = new Set(
      [...svg.matchAll(/<path class="mp-country is-highlighted" data-iso="([^"]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    const missing = config.highlight.filter((code) => !lit.has(code));
    if (missing.length > 0) {
      notes["highlight"] =
        missing.length === 1
          ? `${missing[0]} is not in the region, so nothing is highlighted.`
          : `${missing.join(", ")} are not in the region, so they are not highlighted.`;
    }
  }

  return notes;
}
