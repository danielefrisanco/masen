import { describe, expect, it } from "vitest";
import {
  ICON_NAMES,
  masen,
  PALETTE_NAMES,
  PROJECTION_NAMES,
  REGION_PRESET_NAMES,
  THEME_NAMES,
  TYPEFACE_NAMES,
} from "../src/index.js";
import { DEFAULTS, decode, encode, toOptions, type Config, type Vocabulary } from "../tool/src/config.js";
import {
  decodeMarks,
  encodeMarks,
  markCount,
  readCoordinate,
  relabelPin,
  repinIcon,
  NO_MARKS,
} from "../tool/src/marks.js";

/**
 * The marks a pointer makes, and the link they have to survive in.
 *
 * These are the first pieces of the tool's state that are *lists*, and lists
 * fail differently from dropdowns. A projection that does not round-trip is one
 * wrong map; a list that does not round-trip is a map missing the two pins
 * somebody spent five minutes placing, with nothing to say they were ever
 * there.
 *
 * The sharpest test here is the highlight one. Every other value in a URL that
 * the library dislikes is ignored — but `highlight` **throws** on a code it
 * does not recognise, and that does not break one control, it breaks the whole
 * render. So the decoder resolves codes against the library's own table, and
 * this is the test that says so.
 */

const VOCABULARY: Vocabulary = {
  regions: REGION_PRESET_NAMES,
  projections: PROJECTION_NAMES,
  themes: THEME_NAMES,
  palettes: PALETTE_NAMES,
  typefaces: TYPEFACE_NAMES,
  icons: ICON_NAMES,
};

const round = (search: string): Config => decode(search, VOCABULARY);

describe("marks in the URL", () => {
  it("carries nothing when nothing was marked", () => {
    expect(encode(DEFAULTS)).toBe("");
    expect(markCount(NO_MARKS)).toBe(0);
  });

  it("rebuilds every kind of mark it was given", () => {
    const marked: Config = {
      ...DEFAULTS,
      highlight: ["FR", "DE"],
      pins: [
        { at: [2.3522, 48.8566], label: "Paris", kind: "airport" },
        { at: [30.5234, 50.4501] },
        { at: [13.405, 52.52], kind: "hospital" },
      ],
      arrows: [{ from: [2.3522, 48.8566], to: [30.5234, 50.4501] }],
      routes: [
        { stops: [{ at: [18.0686, 59.3293] }, { at: [20.2253, 67.8558] }] },
        { stops: [{ at: [-3.7038, 40.4168] }] },
      ],
    };
    expect(round(encode(marked))).toEqual(marked);
  });

  /**
   * The one mark the library refuses. `ZZ` is not a country, and handing it on
   * would throw inside `masen` and lose the map — so it is dropped here,
   * quietly, the way an unknown region already is.
   */
  it("drops a highlight code the library would throw on", async () => {
    const config = round("highlight=ZZ&hl=ZZ,FR,QQ,de");
    expect(config.highlight).toEqual(["FR", "DE"]);
    await expect(masen({ ...toOptions(config), size: [300, 200] })).resolves.toBeTruthy();
  });

  it("takes a numeric code as readily as an alphabetic one", () => {
    // Because `resolveId` does, and the decoder is not the place to have an
    // opinion the library does not have.
    expect(round("hl=250").highlight).toEqual(["FR"]);
  });

  it("keeps the marks that parse and drops the ones that do not", () => {
    // A truncated pin between two good ones: the list survives with a hole in
    // it rather than vanishing.
    expect(round("pin=2.35,48.86;48.86;30.52,50.45").pins).toEqual([
      { at: [2.35, 48.86] },
      { at: [30.52, 50.45] },
    ]);
    // Half an arrow points somewhere nobody asked about.
    expect(round("arrow=2.35,48.86,30.52").arrows).toEqual([]);
    expect(round("pin=east,north").pins).toEqual([]);
    expect(round("pin=200,48.86").pins).toEqual([]);
  });

  it("takes a rounding artefact but not a wrong number", () => {
    expect(round("pin=180.0001,48.86").pins).toEqual([{ at: [180, 48.86] }]);
    expect(round("pin=190,48.86").pins).toEqual([]);
  });

  it("rounds a coordinate to four places, so the link stays readable", () => {
    const params = new URLSearchParams();
    encodeMarks({ ...NO_MARKS, pins: [{ at: [2.352222222, 48.856613333] }] }, params);
    expect(params.get("pin")).toBe("2.3522,48.8566");
  });

  /**
   * Labels share a parameter with the coordinates, so the separators cannot
   * appear in them. The alternative was a second parallel parameter, which is
   * two lists that can fall out of step — a worse failure than a lost comma.
   */
  it("takes the separators out of a label rather than losing the pin", () => {
    const params = new URLSearchParams();
    encodeMarks({ ...NO_MARKS, pins: [{ at: [0, 0], label: "Paris, France; north|ish" }] }, params);
    expect(params.get("pin")).toBe("0,0,Paris France north ish");
    expect(decodeMarks(params).pins).toEqual([{ at: [0, 0], label: "Paris France north ish" }]);
  });

  /**
   * Each pin keeps its own icon, so a map can carry an airport, a hospital and
   * three plain marks. The empty label slot has to survive the round trip: an
   * icon with no name is `lon,lat,,airport`, and losing the comma would read the
   * icon as the label.
   */
  it("gives every pin its own icon, named or not", () => {
    const params = new URLSearchParams();
    encodeMarks(
      { ...NO_MARKS, pins: [{ at: [0, 0], kind: "airport" }, { at: [1, 1], label: "Kyiv", kind: "rail" }] },
      params,
    );
    expect(params.get("pin")).toBe("0,0,,airport;1,1,Kyiv,rail");
    expect(decodeMarks(params).pins).toEqual([
      { at: [0, 0], kind: "airport" },
      { at: [1, 1], label: "Kyiv", kind: "rail" },
    ]);
  });

  it("drops an icon the library has no glyph for", () => {
    // Kept, the map would draw a plain mark while the URL claimed an icon.
    expect(round("pin=0,0,,unicorn").pins).toEqual([{ at: [0, 0] }]);
  });

  it("caps what a crafted link can put on the page", () => {
    const many = Array.from({ length: 400 }, (_, i) => `${i % 90},${i % 45}`).join(";");
    expect(round(`pin=${many}`).pins).toHaveLength(200);
    expect(round(`arrow=${Array.from({ length: 300 }, () => "1,1,2,2").join(";")}`).arrows).toHaveLength(100);
    expect(round(`route=${Array.from({ length: 50 }, () => "1,1").join("|")}`).routes).toHaveLength(20);
    const long = "x".repeat(200);
    expect(round(`pin=0,0,${long}`).pins[0]?.label).toHaveLength(40);
  });

  it("keeps a route of one stop, which is what a route looks like mid-click", () => {
    expect(round("route=2.35,48.86").routes).toEqual([{ stops: [{ at: [2.35, 48.86] }] }]);
    expect(round("route=|").routes).toEqual([]);
  });
});

describe("marks on the map", () => {
  it("draws every mark the URL can express", async () => {
    const config = round(
      "region=west-europe&hl=FR&pin=2.3522,48.8566,Paris&arrow=2.3522,48.8566,13.405,52.52&route=2.3522,48.8566;4.9,52.37;13.405,52.52",
    );
    const map = await masen({ ...toOptions(config), detail: "110m", size: [640, 420] });
    expect(map.svg).toContain("is-highlighted");
    expect(map.svg).toContain("mp-pin");
    expect(map.svg).toContain("mp-arrow");
    expect(map.svg).toContain("mp-route");
    expect(map.svg).toContain("Paris");
  });

  /**
   * The property the whole layer rests on: marks are stored as ground, not as
   * pixels, so reframing the map moves the map and leaves the marks where they
   * were put. If this ever fails, every mark on every shared link has quietly
   * detached.
   */
  it("puts a mark on the same ground however the map is framed", async () => {
    const at: [number, number] = [2.3522, 48.8566];
    const [wide, tall] = await Promise.all(
      [
        { projection: "mercator", size: [800, 400] as [number, number] },
        { projection: "albers", size: [400, 700] as [number, number] },
      ].map(async (framing) =>
        masen({
          ...toOptions({ ...DEFAULTS, region: "west-europe", pins: [{ at }] }),
          detail: "110m",
          ...framing,
          projection: framing.projection as "mercator",
        }),
      ),
    );
    for (const map of [wide, tall]) {
      expect(map).toBeDefined();
      // The pin is drawn where the projection says that coordinate is — which
      // is a different pixel on each of these and the same place on both.
      const drawnAt = map?.project(at);
      expect(drawnAt).not.toBeNull();
      expect(map?.svg).toContain("mp-pin");
    }
    expect(wide?.project(at)).not.toEqual(tall?.project(at));
  });
});

describe("editing a pin", () => {
  const pins = [
    { at: [2.35, 48.86] as [number, number], kind: "airport" },
    { at: [13.4, 52.5] as [number, number], label: "Berlin" },
  ];

  /**
   * The bug this exists for: naming a pin used to rebuild it as `{ at, label }`
   * and drop everything else, so typing "Charles de Gaulle" into a pin dropped
   * with an airport on it turned it back into a plain mark.
   */
  it("keeps the icon when the name changes", () => {
    expect(relabelPin(pins, 0, "Charles de Gaulle")[0]).toEqual({
      at: [2.35, 48.86],
      kind: "airport",
      label: "Charles de Gaulle",
    });
  });

  it("keeps the icon when the name is cleared", () => {
    const cleared = relabelPin([{ at: [0, 0], label: "x", kind: "rail" }], 0, "   ");
    expect(cleared[0]).toEqual({ at: [0, 0], kind: "rail" });
    expect("label" in (cleared[0] ?? {})).toBe(false);
  });

  it("keeps the name when the icon changes, and drops the icon on none", () => {
    expect(repinIcon(pins, 1, "hospital")[1]).toEqual({
      at: [13.4, 52.5],
      label: "Berlin",
      kind: "hospital",
    });
    const plain = repinIcon(pins, 0, "")[0];
    expect(plain).toEqual({ at: [2.35, 48.86] });
    expect("kind" in (plain ?? {})).toBe(false);
  });

  it("leaves every other pin exactly as it was", () => {
    expect(relabelPin(pins, 0, "Roissy")[1]).toBe(pins[1]);
    expect(repinIcon(pins, 1, "rail")[0]).toBe(pins[0]);
  });

  it("caps a name typed into the list, as the URL does", () => {
    expect(relabelPin(pins, 0, "x".repeat(200))[0]?.label).toHaveLength(40);
  });
});

describe("a coordinate as a person reads one", () => {
  it("names the hemisphere rather than signing the number", () => {
    expect(readCoordinate([2.3522, 48.8566])).toBe("48.9°N 2.4°E");
    expect(readCoordinate([-58.38, -34.6])).toBe("34.6°S 58.4°W");
  });
});
