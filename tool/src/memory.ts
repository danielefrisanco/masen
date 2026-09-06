/**
 * What the browser remembers between visits.
 *
 * The URL is the whole of a map's state and that is right for sharing and
 * wrong for coming back: a reader who closes the tab loses whatever they were
 * making. So the last query string is kept, and a bare address reopens it.
 *
 * **A shared link always wins.** Someone opening a link you sent them is asking
 * for your map, not for the last one they made themselves — so the stored state
 * is only consulted when the address carries nothing at all. That single rule is
 * what keeps "arriving from a link" and "coming back tomorrow" from fighting
 * over the same page.
 *
 * And because a bare address then stops meaning "a blank map", there has to be
 * a way back to one. That is what `forget()` and the *Start over* button are:
 * restoring silently with no way out is a trap, not a convenience.
 *
 * Everything here is wrapped, and not defensively for its own sake. Reading
 * `localStorage` *throws* — not returns null, throws — in a browser set to
 * block site data, and it is empty in a private window. Neither is an error
 * worth showing anyone: the answer to both is a default map, drawn immediately.
 */

/**
 * Versioned, so a stored query written by an older tool can be abandoned rather
 * than decoded. The decoder is total and would survive it, but a key that can
 * be retired costs nothing to have and something to add later.
 */
const KEY = "masen:v1:last";
const ZOOM = "masen:v1:zoom";

/** Longer than any map the encoder makes, short enough that nothing runs away. */
const LIMIT = 8000;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A browser that will not store this is not a browser that cannot draw a
    // map, so there is nothing to say and nowhere useful to say it.
  }
}

/** Keep the map somebody is making, as the query string that rebuilds it. */
export function remember(query: string): void {
  if (query.length > LIMIT) return;
  write(KEY, query);
}

/**
 * The stored map, or nothing.
 *
 * Answers nothing when the address already carries a map, which is the rule
 * that lets a shared link win.
 */
export function recall(search: string): string | null {
  if (search.replace(/^\?/, "") !== "") return null;
  const stored = read(KEY);
  if (stored === null || stored === "") return null;
  return stored.length > LIMIT ? null : stored;
}

/** Throw away the remembered map, so a bare address means a bare map again. */
export function forget(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}

/**
 * How big the preview is drawn, which is a preference rather than a map.
 *
 * Kept apart from the map's own state on purpose: it belongs to this screen and
 * this person, so it must not travel in a shared link and must survive being
 * given a different map.
 */
export function rememberZoom(value: string): void {
  write(ZOOM, value);
}

export function recallZoom(allowed: readonly string[]): string | null {
  const stored = read(ZOOM);
  return stored !== null && allowed.includes(stored) ? stored : null;
}
