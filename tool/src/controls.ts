import type { CountryName } from "../../src/index.js";
import type { Config } from "./config.js";
import type { Notes } from "./notes.js";
import { helpFor } from "./help.js";
import { markCount, MODES, readCoordinate, relabelPin, repinIcon, type Mode } from "./marks.js";
import { buildPicker } from "./picker.js";

/**
 * The form, built from the library's own name lists.
 *
 * Nothing here knows what a theme is. `THEME_NAMES`, `PALETTE_NAMES`,
 * `PROJECTION_NAMES` and the rest are exported precisely so a caller can put
 * them in a dropdown without keeping a second copy that goes stale — so a
 * palette added to the library appears here on the next build with no change to
 * this file.
 *
 * Every control writes one key of the config and then hands the whole thing
 * back. No control knows about rendering, the URL, or any other control; that
 * wiring lives in one place, which is what keeps "changing a theme" and
 * "arriving from a shared link" the same code path.
 */

type Change = (patch: Partial<Config>) => void;

let nextId = 0;

/**
 * A labelled control — and the label is a sibling, never a parent.
 *
 * This wrapped the control in a `<label>` at first, which reads well and is
 * wrong for a `<select>`. A label containing a form control forwards clicks to
 * it, so a click that lands *on* the select fires twice: once natively, opening
 * the menu, and once from the label, closing it again. The symptom is a
 * dropdown that only stays open while the mouse button is held down, which is
 * exactly what it looked like.
 *
 * So the label points at the control by `for` instead. Checkboxes keep their
 * wrapping label, where the pattern is idiomatic and the double-click is
 * harmless — a checkbox has no menu to close.
 */
/** What the map had to say about this control, if anything. */
function noteLine(text: string): HTMLElement {
  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent = text;
  return note;
}

function field(
  label: string,
  control: HTMLElement,
  hint?: string,
  topic?: string,
  note?: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "field";

  // `slider()` hands back a span around its input, so the thing to point at is
  // not always the element passed in.
  const target =
    control instanceof HTMLSelectElement || control instanceof HTMLInputElement
      ? control
      : control.querySelector<HTMLElement>("select, input");
  const name = document.createElement("label");
  name.className = "field-label";
  name.textContent = label;
  if (target !== null) {
    if (target.id === "") target.id = `f${(nextId += 1)}`;
    name.htmlFor = target.id;
  }

  const help = topic === undefined ? null : helpFor(topic);
  if (help === null) {
    wrap.append(name);
  } else {
    // The label and its `?` share a line, so the explanation sits beside the
    // thing it explains rather than under it.
    const row = document.createElement("div");
    row.className = "field-head";
    row.append(name, help);
    wrap.append(row);
  }
  wrap.append(control);
  if (hint !== undefined) {
    const text = document.createElement("span");
    text.className = "field-hint";
    text.textContent = hint;
    wrap.append(text);
  }
  if (note !== undefined) wrap.append(noteLine(note));
  return wrap;
}

function select(
  options: readonly { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const element = document.createElement("select");
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    element.append(node);
  }
  element.value = value;
  element.addEventListener("change", () => onChange(element.value));
  return element;
}

const named = (names: readonly string[]): { value: string; label: string }[] =>
  names.map((name) => ({ value: name, label: name }));

function checkbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  note?: string,
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "check";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.addEventListener("change", () => onChange(box.checked));
  const text = document.createElement("span");
  text.textContent = label;
  wrap.append(box, text);
  if (note === undefined) return wrap;

  // Wrapped, because the note goes *under* the box and its label rather than
  // beside them — and a label element laying out two lines of its own would put
  // the checkbox in the middle of them.
  const stack = document.createElement("div");
  stack.className = "check-stack";
  stack.append(wrap, noteLine(note));
  return stack;
}

function slider(
  value: number,
  [low, high, step]: readonly [number, number, number],
  onChange: (value: number) => void,
): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "slider";
  const range = document.createElement("input");
  range.type = "range";
  range.min = String(low);
  range.max = String(high);
  range.step = String(step);
  range.value = String(value);
  const readout = document.createElement("output");
  readout.textContent = String(value);
  range.addEventListener("input", () => {
    readout.textContent = range.value;
    onChange(Number(range.value));
  });
  wrap.append(range, readout);
  return wrap;
}

export interface Vocabularies {
  readonly regions: readonly string[];
  readonly projections: readonly string[];
  readonly themes: readonly string[];
  readonly palettes: readonly string[];
  readonly typefaces: readonly string[];
  /** Maki icon names, which double as a pin's `kind`. */
  readonly icons: readonly string[];
  /**
   * Every country the current detail can draw. Empty until the first render
   * has loaded the data — the form is built before that, and a picker with
   * nothing in it yet is better than a form that waits.
   */
  readonly countries: readonly CountryName[];
}

const COVERS = ["desert", "mountain", "glacier"] as const;
const WATERS = ["lake", "river"] as const;

/** The settlement ranking, with a way out of it at the top. */
const RANKS = (none: string): { value: string; label: string }[] => [
  { value: "0", label: none },
  { value: "1", label: "1 — capitals and the largest" },
  { value: "2", label: "2 — and over a million" },
  { value: "3", label: "3 — everything" },
];

/**
 * The pointer's state, which is the one thing on this form that is not in the
 * URL.
 *
 * A mode is a thing someone is doing, not a thing they made — and a shared link
 * that drops the reader into arrow-drawing mode would be sharing the tool
 * rather than the map. The marks themselves are in the URL; the gesture that
 * placed them is not.
 */
export interface Editing {
  readonly mode: Mode;
  /** Whether the last route is still being extended by clicks. */
  readonly openRoute: boolean;
  readonly onMode: (mode: Mode) => void;
  readonly onFinishRoute: () => void;
}

const MODE_LABELS: Readonly<Record<Mode, string>> = {
  none: "off — the map is only a map",
  highlight: "highlight a country",
  pin: "drop a pin",
  arrow: "draw an arrow",
  route: "trace a route",
};

/**
 * Every one of these names the keyboard as well as the pointer.
 *
 * The cross was reachable and undocumented — tab to the map, arrows, Enter —
 * which is a feature only somebody who already knew about it would find. This
 * is the line a person is reading at the moment they are about to click.
 */
const MODE_HINTS: Readonly<Record<Mode, string>> = {
  none: "Choose a gesture and the map becomes something you click.",
  highlight: "Click a country to highlight it, and again to let it go. Or tab to the map and use the arrows and Enter.",
  pin: "Click anywhere on the ground, or tab to the map and use the arrows and Enter. Name the pin in the list below.",
  arrow: "Click where the arrow starts, then where it points. The arrows and Enter do the same from the keyboard.",
  route: "Click each stop in order, then finish the line. The arrows and Enter do the same from the keyboard.",
};

/**
 * Rebuild the whole form from the config it is given.
 *
 * Torn down and rebuilt on every change rather than patched in place. That is
 * the cheap and correct choice at this size — a few dozen nodes against a map
 * that takes tens of milliseconds to compute — and it removes a whole class of
 * bug where a control and the state disagree after arriving from a link.
 */
export function buildForm(
  host: HTMLElement,
  config: Config,
  vocabulary: Vocabularies,
  onChange: Change,
  editing: Editing,
  /**
   * What the last drawn map had to say about these controls — read off the SVG
   * rather than predicted. Empty before the first render, which is correct:
   * there is nothing to report about a map that does not exist yet.
   */
  notes: Notes = {},
): void {
  host.replaceChildren();

  // A group's `?` belongs beside its name, not alone on the line below it: a
  // bare question mark floating above a stack of checkboxes reads as a control
  // rather than as an annotation on the heading.
  const group = (title: string, children: readonly HTMLElement[], topic?: string): HTMLElement => {
    const section = document.createElement("section");
    section.className = "group";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const help = topic === undefined ? null : helpFor(topic);
    if (help === null) {
      section.append(heading, ...children);
      return section;
    }
    const head = document.createElement("div");
    head.className = "group-head";
    head.append(heading, help);
    section.append(head, ...children);
    return section;
  };

  const isPreset = vocabulary.regions.includes(config.region);
  const regions = document.createElement("div");
  regions.className = "stack";
  regions.append(
    select(
      [...named(vocabulary.regions), { value: "__pick", label: "pick countries…" }],
      isPreset ? config.region : "__pick",
      (value) => onChange({ region: value === "__pick" ? "FR,DE,IT" : value }),
    ),
  );
  if (!isPreset) {
    regions.append(
      buildPicker({
        countries: vocabulary.countries,
        chosen: config.region.split(",").map((code) => code.trim().toUpperCase()),
        // An empty selection would be a map of nothing, which the library
        // refuses — so the last country cannot be removed into a broken state.
        onChange: (codes) => onChange({ region: codes.length === 0 ? config.region : codes.join(",") }),
      }),
    );
  }

  host.append(
    group("Subject", [
      field("Region", regions, "A preset, or a list of ISO codes", "region"),
      field(
        "Detail",
        select(
          [
            { value: "110m", label: "110m — coarse, fast" },
            { value: "50m", label: "50m — fine" },
          ],
          config.detail,
          (value) => onChange({ detail: value as Config["detail"] }),
        ),
        // Contested areas are drawn at both tiers, but the coarse one gets them
        // from the fine one — Natural Earth publishes no 110m breakaway file —
        // so the hatch is finer than the coastline under it and can overhang.
        config.detail === "110m"
          ? "Contested areas are drawn from finer data and may overhang this outline"
          : undefined,
        "detail",
      ),
    ]),

    // How much of the subject, and in what shape. The projection and the canvas
    // decide the same thing between them — what is in the picture — and they
    // sat in different groups for no reason except the order they were built.
    group("Frame", [
      field(
        "Projection",
        select(named(vocabulary.projections), config.projection, (value) =>
          onChange({ projection: value }),
        ),
        undefined,
        "projection",
      ),
      field("Width", numberBox(config.width, (value) => onChange({ width: value }))),
      field("Height", numberBox(config.height, (value) => onChange({ height: value }))),
      // Asking for a bar is not the same as getting one: the library measures
      // the frame's distortion and refuses when the scale varies too much
      // across the canvas. The note is where that answer is reported.
      checkbox(
        "Scale bar",
        config.scaleBar,
        (on) => onChange({ scaleBar: on }),
        notes["scaleBar"],
      ),
      checkbox(
        "Neighbours",
        config.neighbours,
        (on) => onChange({ neighbours: on }),
        notes["neighbours"],
      ),
    ], "frame"),

    group("What it shows", [
      checkbox("Sea as a shape", config.sea, (on) => onChange({ sea: on })),
      checkbox(
        "Name the seas",
        config.seaNames,
        (on) => onChange({ seaNames: on }),
        notes["seaNames"],
      ),
      checkbox("Graticule", config.graticule, (on) => onChange({ graticule: on })),
      // Only offered with the grid it annotates. A checkbox that does nothing
      // until another one is ticked is a control that has to be discovered
      // twice.
      ...(config.graticule
        ? [
            checkbox(
              "Degree labels",
              config.gridLabels,
              (on) => onChange({ gridLabels: on }),
              notes["gridLabels"],
            ),
          ]
        : []),
      ...COVERS.map((kind) =>
        checkbox(
          kind === "mountain" ? "Mountains" : kind === "desert" ? "Desert" : "Glaciers",
          config.terrain.includes(kind),
          (on) =>
            onChange({
              terrain: on
                ? [...config.terrain, kind]
                : config.terrain.filter((other) => other !== kind),
            }),
          notes[kind],
        ),
      ),
      // Water is opt-*out*, unlike the cover kinds above it: a map has lakes and
      // rivers unless you say otherwise. Rivers are the one anyone actually
      // wants to drop — at small scale a river and a border are both thin
      // lines, and a reader who cannot tell them apart is worse off than one
      // who sees neither.
      ...WATERS.map((kind) =>
        checkbox(
          kind === "lake" ? "Lakes" : "Rivers",
          config.water.includes(kind),
          (on) =>
            onChange({
              water: on
                ? [...config.water, kind]
                : config.water.filter((other) => other !== kind),
            }),
          notes[kind],
        ),
      ),
      // Offered rather than hidden. The library has always had this switch, and
      // one you cannot see is obscurity rather than an editorial position; the
      // note under it says what the map does once it is off.
      checkbox(
        "Mark contested borders",
        config.disputed,
        (on) => onChange({ disputed: on }),
        notes["disputed"],
      ),
      field(
        "Cities shown",
        select(RANKS("none — no city dots"), String(config.placeRank), (value) =>
          onChange({ placeRank: Number(value) as Config["placeRank"] }),
        ),
        undefined,
        undefined,
        notes["placeRank"],
      ),
      // Offered only when there is something to name. With no dots on the map
      // this control has nothing to act on — a name is given to a settlement
      // that was drawn, so the ranking below the one above it is silent.
      ...(config.placeRank === 0
        ? []
        : [
            field(
              "Cities named",
              select(RANKS("none — dots without names"), String(config.labelRank), (value) =>
                onChange({ labelRank: Number(value) as Config["labelRank"] }),
              ),
              "Lower than the dots on purpose: words collide where dots merely crowd",
            ),
          ]),
    ], "shows"),

    group("Marks", [
      field(
        "Clicking the map",
        select(
          MODES.map((mode) => ({ value: mode, label: MODE_LABELS[mode] })),
          editing.mode,
          (value) => editing.onMode(value as Mode),
        ),
        MODE_HINTS[editing.mode],
      ),
      ...(editing.openRoute
        ? [button("Finish this route", editing.onFinishRoute)]
        : []),
      // Shown only while pins are being dropped. It sets what the *next* click
      // makes, so outside that gesture it is a control with nothing to act on —
      // and an existing pin's icon is changed in its own row below.
      ...(editing.mode === "pin"
        ? [
            field(
              "Icon for the next pin",
              iconSelect(vocabulary.icons, config.pinIcon, (value) =>
                onChange({ pinIcon: value }),
              ),
              "Each pin keeps the icon it was dropped with",
            ),
          ]
        : []),
      // The size is one number for the whole map — it arrives as a token the
      // geometry reads — so it stays as long as there is a pin to size.
      ...(config.pins.length > 0 || editing.mode === "pin"
        ? [
            field(
              "Pin size",
              slider(config.pinSize, [3, 20, 0.5], (value) => onChange({ pinSize: value })),
              "The mark and the icon inside it grow together",
            ),
          ]
        : []),
      markList(config, onChange, vocabulary.icons, notes),
    ], "marks"),

    // Last, because it is the only group whose answers do not change what is on
    // the map. Everything above decides what the reader is being shown; this
    // decides how it looks once that is settled.
    group("Look", [
      field(
        "Theme",
        select(named(vocabulary.themes), config.theme, (value) => onChange({ theme: value })),
        undefined,
        "theme",
      ),
      field(
        "Palette",
        select(
          [{ value: "", label: "none — the theme's own" }, ...named(vocabulary.palettes)],
          config.palette,
          (value) => onChange({ palette: value }),
        ),
      ),
      field(
        "Typeface",
        select(
          [{ value: "", label: "none — the theme's own" }, ...named(vocabulary.typefaces)],
          config.typeface,
          (value) => onChange({ typeface: value }),
        ),
      ),
      field(
        "Border width",
        slider(config.borderWidth, [0, 4, 0.1], (value) => onChange({ borderWidth: value })),
        "The boundary between two countries, drawn once",
        "lines",
      ),
      field(
        "Country outline",
        slider(config.landEdgeWidth, [-1, 3, 0.1], (value) =>
          onChange({ landEdgeWidth: value }),
        ),
        "The edge of each country, including its coast. Below zero leaves it to the theme",
      ),
      field("Label size", slider(config.labelSize, [6, 28, 1], (value) =>
        onChange({ labelSize: value }),
      )),
      field("Credit", textBox(config.credit, (value) => onChange({ credit: value }))),
    ]),
  );
}

function button(label: string, onClick: () => void): HTMLElement {
  const element = document.createElement("button");
  // A form's default button type is "submit", which reloads the page.
  element.type = "button";
  element.className = "action";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

/**
 * Everything on the map that was put there by pointing at it.
 *
 * A list rather than an undo stack, because the marks are not a history: they
 * are the map's contents, and the thing someone wants to change is usually not
 * the last one they made. It is also the only place a pin can be named — the
 * gesture puts it somewhere, and the word belongs to a keyboard.
 */
/** The icon list, with the plain mark at the top of it. */
function iconSelect(
  icons: readonly string[],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  return select(
    [{ value: "", label: "none — a plain mark" }, ...named(icons)],
    value,
    onChange,
  );
}

function markList(
  config: Config,
  onChange: Change,
  icons: readonly string[],
  notes: Notes,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "marks";

  if (markCount(config) === 0) {
    const empty = document.createElement("p");
    empty.className = "marks-empty";
    empty.textContent = "Nothing marked yet.";
    wrap.append(empty);
    return wrap;
  }

  if (config.highlight.length > 0) {
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const code of config.highlight) {
      chips.append(
        chip(`${code} ×`, `Stop highlighting ${code}`, () =>
          onChange({ highlight: config.highlight.filter((other) => other !== code) }),
        ),
      );
    }
    wrap.append(row("Highlighted", chips));
    // A code the region does not contain is the quietest failure on the form:
    // nothing happens and the chip sits there looking as though it did.
    const missing = notes["highlight"];
    if (missing !== undefined) wrap.append(noteLine(missing));
  }

  for (const [index, pin] of config.pins.entries()) {
    const line = document.createElement("div");
    line.className = "mark";
    const at = document.createElement("span");
    at.className = "mark-at";
    at.textContent = readCoordinate(pin.at);
    const label = document.createElement("input");
    label.type = "text";
    label.className = "mark-label";
    label.value = pin.label ?? "";
    label.placeholder = "Label";
    label.setAttribute("aria-label", `Label for the pin at ${readCoordinate(pin.at)}`);
    label.addEventListener("change", () => {
      onChange({ pins: relabelPin(config.pins, index, label.value) });
    });
    const icon = iconSelect(icons, pin.kind ?? "", (value) => {
      onChange({ pins: repinIcon(config.pins, index, value) });
    });
    icon.className = "mark-icon";
    icon.setAttribute("aria-label", `Icon for the pin at ${readCoordinate(pin.at)}`);
    line.append(at, label, icon, remove("Remove this pin", () =>
      onChange({ pins: config.pins.filter((_, i) => i !== index) }),
    ));
    wrap.append(line);
  }

  for (const [index, arrow] of config.arrows.entries()) {
    const line = document.createElement("div");
    line.className = "mark";
    const at = document.createElement("span");
    at.className = "mark-note";
    at.textContent = `${readCoordinate(arrow.from)} → ${readCoordinate(arrow.to)}`;
    line.append(at, remove("Remove this arrow", () =>
      onChange({ arrows: config.arrows.filter((_, i) => i !== index) }),
    ));
    wrap.append(line);
  }

  for (const [index, route] of config.routes.entries()) {
    const line = document.createElement("div");
    line.className = "mark";
    const at = document.createElement("span");
    at.className = "mark-note";
    at.textContent = `Route · ${route.stops.length} ${route.stops.length === 1 ? "stop" : "stops"}`;
    line.append(at, remove("Remove this route", () =>
      onChange({ routes: config.routes.filter((_, i) => i !== index) }),
    ));
    wrap.append(line);
  }

  wrap.append(
    button("Clear every mark", () =>
      onChange({ highlight: [], pins: [], arrows: [], routes: [] }),
    ),
  );
  return wrap;
}

function row(title: string, body: HTMLElement): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "mark-group";
  const name = document.createElement("span");
  name.className = "field-hint";
  name.textContent = title;
  wrap.append(name, body);
  return wrap;
}

function chip(text: string, title: string, onClick: () => void): HTMLElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "chip";
  element.title = title;
  element.setAttribute("aria-label", title);
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

function remove(title: string, onClick: () => void): HTMLElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "chip mark-remove";
  element.title = title;
  element.setAttribute("aria-label", title);
  element.textContent = "×";
  element.addEventListener("click", onClick);
  return element;
}

function numberBox(value: number, onChange: (value: number) => void): HTMLElement {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "200";
  input.max = "4000";
  input.step = "10";
  input.value = String(value);
  input.addEventListener("change", () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(Math.min(4000, Math.max(200, Math.round(next))));
  });
  return input;
}

function textBox(value: string, onChange: (value: string) => void): HTMLElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  return input;
}
