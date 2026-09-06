import {
  countryTable,
  ICON_NAMES,
  masen,
  PALETTE_NAMES,
  PROJECTION_NAMES,
  REGION_PRESET_NAMES,
  THEME_NAMES,
  TYPEFACE_NAMES,
  type CountryName,
  type MapResult,
  type Point,
  type Position,
} from "../../src/index.js";
import { decode, encode, toOptions, type Config, type Vocabulary } from "./config.js";
import { buildForm, type Editing } from "./controls.js";
import { exportSizes, fileName, type ExportSize } from "./export.js";
import { rasterise, save } from "./raster.js";
import { place, readCoordinate, type Mode } from "./marks.js";
import { forget, recall, recallZoom, remember, rememberZoom } from "./memory.js";
import { notesFor, type Notes } from "./notes.js";
import { mountFeedback } from "./feedback.js";

/**
 * The tool: a form over `MapOptions`, and a URL that rebuilds what it made.
 *
 * One state object, one render, one place the URL is written. Every control
 * hands back a patch and nothing else happens until it reaches here — which is
 * what makes "someone changed a dropdown" and "someone opened a shared link"
 * the same code path, and the second one is the path that usually rots.
 *
 * The library is doing the work, and the reason a UI this thin is possible at
 * all is that **no option in `MapOptions` is a callback**. A form can build the
 * entire configuration as data, put it in a query string, and hand it over.
 */

const VOCABULARY: Vocabulary = {
  regions: REGION_PRESET_NAMES,
  projections: PROJECTION_NAMES,
  themes: THEME_NAMES,
  palettes: PALETTE_NAMES,
  typefaces: TYPEFACE_NAMES,
  icons: ICON_NAMES,
};

/**
 * The country list, by tier, because the two tiers do not hold the same
 * countries — 177 at 110m and 241 at 50m.
 *
 * Loaded beside the first render rather than before it, so the map is not
 * waiting on a list only the picker needs. Cached per tier: `countryTable`
 * reads the same file the map does, so the second call is free.
 */
const countryLists = new Map<string, readonly CountryName[]>();

async function loadCountries(detail: string): Promise<void> {
  if (countryLists.has(detail)) return;
  try {
    countryLists.set(detail, await countryTable(detail as "110m" | "50m"));
    // The form was built with an empty list; rebuild it now there is one.
    refreshForm();
  } catch {
    // A picker with no list is a degraded form, not a broken page — and the
    // render's own error message will already be saying what went wrong.
  }
}

function vocabularyFor(current: Config): Vocabulary & { countries: readonly CountryName[] } {
  return { ...VOCABULARY, countries: countryLists.get(current.detail) ?? [] };
}

const mapHost = must<HTMLElement>("#map");
const statusHost = must<HTMLElement>("#status");
const formHost = must<HTMLElement>("#form");
const linkHost = must<HTMLInputElement>("#share");
const svgButton = must<HTMLButtonElement>("#save-svg");
const pngButton = must<HTMLButtonElement>("#save-png");
const scaleHost = must<HTMLSelectElement>("#export-scale");
const zoomHost = must<HTMLSelectElement>("#zoom");
const startOver = must<HTMLButtonElement>("#start-over");
const feedbackButton = must<HTMLButtonElement>("#feedback");
const whereHost = must<HTMLElement>("#where");

function must<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new Error(`masen: the page is missing ${selector}`);
  return found;
}

/**
 * The map to draw first: the one in the address, or the one this browser was
 * last making.
 *
 * A link somebody sent always wins — arriving from a link is a request for
 * *that* map, not for the last one made on this machine — so what was stored is
 * only consulted when the address carries nothing at all.
 */
const opening = recall(window.location.search) ?? window.location.search;
let config: Config = decode(opening, VOCABULARY);

/**
 * The last map that was drawn, kept for one method: `invert()`.
 *
 * It is what turns a click into a coordinate, and it has to be the *current*
 * map — a projection or a region changed under a stale one would put every
 * mark somewhere nobody clicked. So it is replaced by the render that wins,
 * and never by one that arrived late.
 */
let drawn: MapResult | null = null;

/** What a click on the map means. Not in the URL: see {@link Editing}. */
let mode: Mode = "none";
/** An arrow that has a tail and is waiting for its head. */
let arrowTail: Position | null = null;
/** Whether clicks are still adding stops to the last route. */
let openRoute = false;

/**
 * What the last drawn map had to say about the form's own controls.
 *
 * Read off the SVG after every render, so a control that asked for something
 * this frame does not contain can say so where it was asked — rather than the
 * map looking, from the reader's side, exactly as it does when the control
 * worked.
 */
let notes: Notes = {};

/**
 * How long to wait before drawing, in milliseconds.
 *
 * A slider fires on every pixel of travel and a 50m world map is not a
 * per-pixel operation. Short enough that a dropdown feels immediate, long
 * enough that dragging a slider draws once at the end rather than forty times
 * on the way.
 */
const SETTLE = 90;

let pending: number | undefined;
/** Which render is current, so a slow one cannot overwrite a newer fast one. */
let generation = 0;

function say(text: string, state: "" | "busy" | "error" = ""): void {
  statusHost.textContent = text;
  statusHost.classList.toggle("is-error", state === "error");
  statusHost.classList.toggle("is-busy", state === "busy");
}

function editing(): Editing {
  return { mode, openRoute, onMode: setMode, onFinishRoute: finishRoute };
}

function refreshForm(): void {
  buildForm(formHost, config, vocabularyFor(config), apply, editing(), notes);
  // The map only looks clickable while it is: a crosshair over a map nothing
  // responds to is a promise the page does not keep.
  mapHost.classList.toggle("is-picking", mode !== "none");
}

function setMode(next: Mode): void {
  mode = next;
  // A half-drawn arrow belongs to the gesture that started it. Leaving it
  // pending across a mode change is how the next click somewhere else becomes
  // an arrow from wherever the last one was abandoned.
  arrowTail = null;
  if (next !== "route") openRoute = false;
  refreshForm();
}

function finishRoute(): void {
  openRoute = false;
  refreshForm();
}

function apply(patch: Partial<Config>): void {
  config = { ...config, ...patch };
  refreshForm();
  void loadCountries(config.detail);
  writeUrl();
  writeSizes();
  schedule();
}

/**
 * The PNG sizes on offer, rebuilt when the canvas changes.
 *
 * The multiplier is kept across a resize rather than the pixel count: somebody
 * who chose 2× wants twice whatever the canvas is now, not 1920 pixels for ever.
 */
function writeSizes(): void {
  const chosen = Number(scaleHost.value);
  const sizes = exportSizes(config.width, config.height);
  scaleHost.replaceChildren();
  for (const size of sizes) {
    const option = document.createElement("option");
    option.value = String(size.scale);
    option.textContent = size.label;
    scaleHost.append(option);
  }
  const kept = sizes.find((size) => size.scale === chosen) ?? sizes[0];
  if (kept !== undefined) scaleHost.value = String(kept.scale);
}

function chosenSize(): ExportSize {
  const sizes = exportSizes(config.width, config.height);
  const scale = Number(scaleHost.value);
  return (
    sizes.find((size) => size.scale === scale) ??
    sizes[0] ?? { scale: 1, width: config.width, height: config.height, label: "1×" }
  );
}

/**
 * The map as a file.
 *
 * Both formats come from the same `render()`: the flattened document, with
 * every computed value on a presentation attribute. For the SVG that is what
 * makes the file readable by a design tool that ignores stylesheets; for the
 * PNG it is what makes the rasterisation possible at all.
 *
 * **The size applies to the PNG alone.** An SVG has no size of its own — it is
 * the same document at any width, which is the whole advantage of the format —
 * and naming a vector file `1920x1240` would be claiming something about it
 * that is not true.
 */
async function saveMap(format: "svg" | "png"): Promise<void> {
  if (drawn === null) return;
  const size =
    format === "svg"
      ? { scale: 1, width: config.width, height: config.height, label: "1×" }
      : chosenSize();
  const name = fileName(config.region, size, format);
  try {
    say(`Preparing ${name}…`, "busy");
    const flattened = await drawn.render();
    save(
      format === "svg"
        ? new Blob([flattened], { type: "image/svg+xml;charset=utf-8" })
        : await rasterise(flattened, size),
      name,
    );
    say(`Saved ${name}.`);
  } catch (error: unknown) {
    say(`Could not save the map. ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

function writeUrl(): void {
  const query = encode(config);
  remember(query);
  const url = `${window.location.pathname}${query === "" ? "" : `?${query}`}`;
  // `replaceState`, not `pushState`: every keystroke on a slider is not a place
  // in someone's history to go back through.
  window.history.replaceState(null, "", url);
  linkHost.value = `${window.location.origin}${url}`;
}

function schedule(): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => void render(), SETTLE);
}

async function render(): Promise<void> {
  const mine = ++generation;
  say("Drawing…", "busy");
  const started = performance.now();
  try {
    const result = await masen(toOptions(config));
    // An older render finishing after a newer one has started must not win.
    // Switching detail from 110m to 50m and back is exactly how that happens.
    if (mine !== generation) return;
    drawn = result;
    // Only offered once there is something to save. A download button that
    // produces a broken file is worse than one that is not there yet.
    svgButton.disabled = false;
    pngButton.disabled = false;
    // `toString()` rather than `svg`: the stylesheet travels inside the
    // document, which is the whole bargain the library makes. Two maps could
    // share this page safely — ids and stylesheet are both scoped to a hash of
    // the map — but there is only one here.
    mapHost.innerHTML = result.toString();
    mapHost.removeAttribute("aria-busy");
    applyZoom();
    drawCursor();

    // Read off the drawn document rather than predicted from the options, and
    // the form is rebuilt only when the answer changed — a rebuild on every
    // render would be a rebuild in the middle of somebody typing into it.
    const found = notesFor(result.svg, config);
    const keys = new Set([...Object.keys(found), ...Object.keys(notes)]);
    const changed = [...keys].some((key) => found[key] !== notes[key]);
    notes = found;
    if (changed) refreshForm();
    say(`Drawn in ${Math.round(performance.now() - started)} ms.`);
  } catch (error: unknown) {
    if (mine !== generation) return;
    mapHost.removeAttribute("aria-busy");
    const detail = error instanceof Error ? error.message : String(error);
    // The base path is the failure this page was built to catch first: a wrong
    // base does not error, it fetches the 404 page and reports a parse error
    // from three modules down.
    const looksLikeAWrongPath = detail.includes("JSON") || detail.includes("Unexpected token");
    say(
      `Could not draw the map. ${detail}` +
        (looksLikeAWrongPath
          ? " — that usually means the data was requested from the wrong path and a 404 page came back instead."
          : ""),
      "error",
    );
  }
}

/**
 * A click on the page, as a coordinate on the ground.
 *
 * Two conversions, and both of them matter. `getScreenCTM()` undoes everything
 * the browser did to the SVG — the viewBox, and the CSS that scales it to the
 * width of the column — which is why the map can be shown at any size and still
 * be clicked accurately. `invert()` then undoes the projection.
 *
 * It returns `null` for a pixel that is not on the globe at all. That is not a
 * failure to handle quietly: on an orthographic map the canvas corners outside
 * the disc are *nowhere*, and a click there has to be refused out loud rather
 * than dropped.
 */
function coordinateAt(svg: SVGSVGElement, map: MapResult, x: number, y: number): Position | null {
  const screen = svg.getScreenCTM();
  if (screen === null) return null;
  const point = new DOMPoint(x, y).matrixTransform(screen.inverse());
  const at = map.invert([point.x, point.y]);
  // Rounded once, here, so the map draws exactly what the link says.
  return at === null ? null : place(at);
}

/** The other direction: a point in the map's own units, as a pixel on screen. */
function screenAt(svg: SVGSVGElement, [x, y]: Point): { x: number; y: number } | null {
  const screen = svg.getScreenCTM();
  if (screen === null) return null;
  const point = new DOMPoint(x, y).matrixTransform(screen);
  return { x: point.x, y: point.y };
}

/**
 * Which country is under the pointer, found in the document rather than the
 * data.
 *
 * The alternative is a point-in-polygon test over every country, which is the
 * same work the browser has already done to paint them. `elementsFromPoint`
 * asks it for the answer: the list comes back topmost first, so a city dot or a
 * label sitting over a country is stepped past rather than mistaken for it.
 */
function pickCountry(x: number, y: number): void {
  for (const node of document.elementsFromPoint(x, y)) {
    const iso = node.getAttribute("data-iso");
    if (iso === null || iso === "") continue;
    const kind = node.getAttribute("class") ?? "";
    const name = node.getAttribute("data-name") ?? iso;
    if (kind.includes("mp-country")) {
      const on = config.highlight.includes(iso);
      apply({
        highlight: on
          ? config.highlight.filter((code) => code !== iso)
          : [...config.highlight, iso],
      });
      return;
    }
    // Neighbours carry an ISO code and cannot be highlighted — the library
    // draws them as context and context must not compete with the subject. Say
    // so, rather than letting a click do nothing.
    if (kind.includes("mp-neighbour")) {
      say(`${name} is drawn as context. Add it to the region to highlight it.`, "error");
      return;
    }
  }
  say("There is no country there.", "error");
}

/**
 * Everything a pointer can do to the map.
 *
 * Note what is *not* here: nothing tells the map to redraw. Every gesture ends
 * in `apply()`, which is the same path a dropdown takes — so a mark made with a
 * mouse and a mark that arrived in a link are the same state, written the same
 * way, and the URL is right without anything having to remember to update it.
 */
function act(x: number, y: number): void {
  if (mode === "none") return;
  const svg = mapHost.querySelector("svg");
  if (svg === null || drawn === null) return;

  if (mode === "highlight") {
    pickCountry(x, y);
    return;
  }

  const at = coordinateAt(svg, drawn, x, y);
  if (at === null) {
    say("That point is not on the globe. Outside the disc there is no ground to mark.", "error");
    return;
  }

  // Nothing says "done" on the successful paths on purpose: a render is about
  // to overwrite the status line anyway, and the mark appearing on the map is a
  // better confirmation than a sentence under it.
  if (mode === "pin") {
    // The icon is chosen before the click and stored on the pin, not on the
    // map: the next one can be something else.
    const kind = config.pinIcon === "" ? {} : { kind: config.pinIcon };
    apply({ pins: [...config.pins, { at, ...kind }] });
    return;
  }

  if (mode === "arrow") {
    if (arrowTail === null) {
      arrowTail = at;
      // No render follows, so this message survives to be read.
      say("Tail set. Now click where the arrow should point.");
      return;
    }
    const from = arrowTail;
    arrowTail = null;
    apply({ arrows: [...config.arrows, { from, to: at }] });
    return;
  }

  const routes = [...config.routes];
  const last = openRoute ? routes.at(-1) : undefined;
  if (last === undefined) routes.push({ stops: [{ at }] });
  else routes[routes.length - 1] = { ...last, stops: [...last.stops, { at }] };
  openRoute = true;
  apply({ routes });
}

/**
 * Where the pointer is, in the units every mark is stored in.
 *
 * Beside the map rather than on it: a coordinate that follows the cursor covers
 * the thing being pointed at, which is the one place a reader is looking.
 *
 * It runs through `invert()` exactly as a click does, so it says the same thing
 * the click will store — including "not on the globe" outside an orthographic
 * disc, which is a far better way to learn that rule than being refused by it
 * after clicking.
 */
function showWhere(x: number | null, y: number | null): void {
  const svg = mapHost.querySelector("svg");
  if (x === null || y === null || svg === null || drawn === null) {
    whereHost.textContent = "";
    return;
  }
  const at = coordinateAt(svg, drawn, x, y);
  whereHost.textContent = at === null ? "not on the globe" : readCoordinate(at);
}

// Throttled to a frame: a pointer reports far more often than a line of text
// needs rewriting, and each of these inverts a projection.
let tracking = false;
let pointer: { x: number; y: number } | null = null;

mapHost.addEventListener("pointermove", (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  if (tracking) return;
  tracking = true;
  requestAnimationFrame(() => {
    tracking = false;
    showWhere(pointer?.x ?? null, pointer?.y ?? null);
  });
});

mapHost.addEventListener("pointerleave", () => {
  pointer = null;
  // Back to the cross if the keyboard is driving, empty if nothing is.
  showCursorWhere();
});

mapHost.addEventListener("click", (event) => act(event.clientX, event.clientY));

/**
 * The same map, from a keyboard.
 *
 * Since 09d the map is the main input surface of this tool and it was not
 * focusable at all — every mark needed a mouse, which made the whole gesture
 * layer unreachable for anyone who does not use one. Everything else on the
 * page is a native control and reachable by tab, which is the floor rather than
 * the goal.
 *
 * A cross, moved by the arrow keys and placed with Enter. It is kept in the
 * map's **own units** rather than in pixels, for the same reason every mark is
 * kept in lon/lat: those units survive the preview being zoomed, and a pixel
 * offset does not.
 *
 * Ten units a step, one with Shift held. Ten is about a degree on a
 * continental map — coarse enough to cross the frame in a few seconds, and the
 * fine step is there for the cases where that matters.
 */
const STEP = 10;

/** Where the cross is, in the map's own units. Null when it is not shown. */
let cursor: Point | null = null;

const crosshair = document.createElement("div");
crosshair.className = "crosshair";
crosshair.setAttribute("aria-hidden", "true");

/** The readout follows the cross too, so the keyboard is not flying blind. */
function showCursorWhere(): void {
  const svg = mapHost.querySelector("svg");
  if (cursor === null || svg === null) {
    whereHost.textContent = "";
    return;
  }
  const screen = screenAt(svg, cursor);
  showWhere(screen?.x ?? null, screen?.y ?? null);
}

function drawCursor(): void {
  const svg = mapHost.querySelector("svg");
  if (cursor === null || svg === null) {
    crosshair.remove();
    return;
  }
  const screen = screenAt(svg, cursor);
  const frame = mapHost.getBoundingClientRect();
  if (screen === null) return;
  crosshair.style.left = `${screen.x - frame.left + mapHost.scrollLeft}px`;
  crosshair.style.top = `${screen.y - frame.top + mapHost.scrollTop}px`;
  // Re-appended rather than left in place: every render replaces the map's
  // innerHTML, which takes the cross with it.
  mapHost.append(crosshair);
  showCursorWhere();
}

function moveCursor(dx: number, dy: number): void {
  const at = cursor ?? [config.width / 2, config.height / 2];
  cursor = [
    Math.max(0, Math.min(config.width, at[0] + dx)),
    Math.max(0, Math.min(config.height, at[1] + dy)),
  ];
  drawCursor();
}

const ARROWS: Readonly<Record<string, Point>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

mapHost.addEventListener("focus", () => {
  if (mode === "none") {
    say("Choose a gesture under Marks, then use the arrow keys here.");
    return;
  }
  moveCursor(0, 0);
  say("Arrow keys move the cross, Enter places it, Escape puts it away.");
});

mapHost.addEventListener("blur", () => {
  cursor = null;
  drawCursor();
});

mapHost.addEventListener("keydown", (event) => {
  if (mode === "none") return;

  const step = ARROWS[event.key];
  if (step !== undefined) {
    // The page would scroll under the map otherwise, which is the arrow keys'
    // own default and not what somebody aiming a cross is asking for.
    event.preventDefault();
    const size = event.shiftKey ? 1 : STEP;
    moveCursor(step[0] * size, step[1] * size);
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const svg = mapHost.querySelector("svg");
    if (cursor === null || svg === null) return;
    const screen = screenAt(svg, cursor);
    if (screen === null) return;
    // Through the same path a click takes, down to the pixel: highlighting asks
    // the document what is under a point, and it must be asked the same
    // question however the point was chosen.
    act(screen.x, screen.y);
    drawCursor();
  }
});

// The way out of a half-finished gesture, and the only keyboard shortcut here:
// abandoning something is the one action with no control of its own, because a
// button for it would be visible exactly when nobody is looking at the form.
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (arrowTail !== null) {
    arrowTail = null;
    say("Arrow abandoned.");
    return;
  }
  if (openRoute) finishRoute();
});

svgButton.addEventListener("click", () => void saveMap("svg"));
pngButton.addEventListener("click", () => void saveMap("png"));

/**
 * How big the drawn map is shown, which is not how big the drawn map is.
 *
 * The map is a document at whatever size the canvas says, and the page has been
 * squeezing it into the width of the column ever since there was a page — so a
 * 4000-pixel poster and a 600-pixel thumbnail looked identical while they were
 * being made. "Fit" is that behaviour, kept as the default because it is the
 * right one for choosing a region. The rest are multiples of the canvas's own
 * units, so 100% is the size the file will actually be.
 */
const ZOOMS = ["fit", "0.5", "1", "2"] as const;

function applyZoom(): void {
  const svg = mapHost.querySelector("svg");
  if (svg === null) return;
  const zoom = zoomHost.value;
  const fits = zoom === "fit";
  mapHost.classList.toggle("is-zoomed", !fits);
  // Width alone: the document carries its own aspect ratio in the viewBox, and
  // setting both is how a map gets stretched.
  svg.style.width = fits ? "" : `${Math.round(config.width * Number(zoom))}px`;
}

zoomHost.value = recallZoom(ZOOMS) ?? "fit";
zoomHost.addEventListener("change", () => {
  rememberZoom(zoomHost.value);
  applyZoom();
});

/**
 * Back to an empty page.
 *
 * The other half of remembering: once a bare address reopens the last map,
 * there is no way to ask for a blank one, and a convenience with no way out is
 * a trap. This forgets and reloads rather than resetting the config in place,
 * so what comes back is genuinely a fresh page and not a config that happens to
 * equal the defaults.
 */
startOver.addEventListener("click", () => {
  forget();
  window.location.href = window.location.pathname;
});

linkHost.addEventListener("focus", () => linkHost.select());

/**
 * The map's own link is the payload, so the feedback form is handed the same
 * value the share box shows rather than building one of its own — one place
 * writes that URL, and this reads it. Passed as a function because the map
 * changes underneath: opening the dialog, thinking again, moving the region and
 * coming back has to send the map they ended up with.
 */
mountFeedback(
  feedbackButton,
  () => linkHost.value,
  // Repeated on the page's own status line, so the confirmation survives the
  // dialog being closed. Otherwise the only evidence a message went anywhere
  // disappears with the box it was shown in.
  (text) => say(text),
);

refreshForm();
writeUrl();
writeSizes();
void render();
void loadCountries(config.detail);
