/**
 * Record the tool being used, by driving it.
 *
 * **The recording is a deliverable that regenerates.** Every product GIF ever
 * made goes out of date the week after the interface moves, because it was made
 * by a person with a screen recorder and remaking it costs an afternoon. This
 * one is a script: the same input produces the same recording, which is the
 * argument the library itself makes, applied to the library's own marketing.
 *
 * It drives the real page over the Chrome DevTools Protocol — the same
 * protocol every visual check in this project has used — captures a screencast,
 * and hands ffmpeg the frames.
 *
 * **Two things about it are deliberately fake, and both are fake because the
 * truth is invisible.**
 *
 * 1. **The cursor is drawn.** A headless screencast contains no pointer, so a
 *    click would land as an effect with no cause: the map simply acquires a
 *    pin. The dot is a div this script injects, moved by a CSS transition to
 *    the middle of a control a beat before the event is dispatched at that
 *    exact pixel. It follows the input; it does not stand in for it.
 * 2. **A select is changed through its value, not through its popup.** A native
 *    dropdown is drawn by the operating system, above the page, and does not
 *    appear in a screencast at all — so clicking one honestly would produce a
 *    second and a half of nothing followed by a changed word. The cursor still
 *    travels to the control and rests on it. The click on the *map* is a real
 *    dispatched mouse event at real coordinates, because that one is the whole
 *    point of the film.
 *
 * Everything else is the shipped page doing its own work: the map is computed
 * by the library in that browser, the link updates because the tool updates it,
 * and the pin lands where the pointer was.
 *
 * **It films the deployed site, not a local preview.** That is not fussiness:
 * the frame this whole film exists for is the one where the link under the map
 * changes as the pin lands, and a link reading `localhost:4173` is a link
 * nobody watching can use. Point `DEMO_URL` at a local preview to work on the
 * script offline — it starts `vite preview` for you when you do — but the
 * recording that ships is of the page a viewer can open.
 */
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";
const PORT = 9444;
const URL_BASE = process.env.DEMO_URL ?? "https://danielefrisanco.github.io/masen/";
/**
 * Which film. `full` is the twenty-six second one the README embeds; `social`
 * is a five-second loop for a feed, where the whole tour is unwatchable and the
 * only beat worth keeping is the one where a click becomes a mark and the link
 * underneath changes with it.
 */
const CUT = process.env.DEMO_CUT ?? "full";
/**
 * The social cut opens on a finished map rather than building one.
 *
 * Five seconds cannot afford the settings, so they arrive in the address bar —
 * which is honest, because that is exactly what the tool does with them. Two
 * beats are left on camera, and they are the two a stopped scroll can read
 * without a caption: **the colour changes, and a click becomes a mark.**
 *
 * So the palette is deliberately *not* here. The map opens in the theme's own
 * colours and the film puts `patina` on it, which recolours the sea from pale
 * blue to deep teal in one frame — the largest visible change this tool can
 * make, and the one that says the style is a stylesheet without saying it.
 * `pinIcon` is here for the opposite reason: choosing the icon is a second trip
 * to the form, and there is only room for one.
 */
const SOCIAL_QUERY =
  "?region=IT&theme=atlas&detail=50m&neighbours=1" +
  "&placeRank=1&borderWidth=1.4&landEdgeWidth=1.8&labelSize=23&scaleBar=1&pinIcon=mountain";
/**
 * Where the click lands, as a fraction of the drawn map.
 *
 * Not eyeballed: the map at SOCIAL_QUERY plus `pin=11.2843,46.275` puts its
 * mark at 421.9, 68.3 in a 960x620 frame, so these are that point divided by
 * the frame. Trentino, which is land in this projection and under a mountain.
 */
const SOCIAL_PIN = { across: 421.9 / 960, down: 68.3 / 620 };
const OUT = "media";
const FRAMES = ".demo-frames";
// 16:10, which is the shape the map wants and the shape a social card crops
// least badly. Tall enough that the link field and the download buttons are on
// screen at the same time as the map — the film has to show that a map you made
// is a link and a file, and neither is visible if the page has to scroll.
const WIDTH = 1280;
const HEIGHT = 860;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ CDP --- */

/** A CCP client small enough to read: request/response by id, events by name. */
async function connect(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = tabs.find((tab) => tab.type === "page");
      if (page === undefined) throw new Error("no page");
      const socket = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
      });
      let next = 0;
      const pending = new Map();
      const listeners = new Map();
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== undefined) {
          const settle = pending.get(message.id);
          if (settle !== undefined) {
            pending.delete(message.id);
            if (message.error) settle.reject(new Error(message.error.message));
            else settle.resolve(message.result);
          }
          return;
        }
        listeners.get(message.method)?.(message.params);
      };
      return {
        send(method, params = {}) {
          const id = (next += 1);
          return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        on(method, handler) {
          listeners.set(method, handler);
        },
        close: () => socket.close(),
      };
    } catch {
      await wait(250);
    }
  }
  throw new Error("masen: Chrome never answered on the debugging port");
}

/* --------------------------------------------------------------- staging --- */

/**
 * The pointer, the caption, and the two lookups every step needs.
 *
 * Injected rather than imported: this runs inside the built page, which knows
 * nothing about this script. Controls are found by the words next to them, not
 * by id — `controls.ts` generates ids (`f1`, `f2`…) in build order, so an id
 * here would be a demo that breaks when a field is inserted above another one.
 */
const STAGE = `
(() => {
  if (document.getElementById("demo-cursor") !== null) return;
  const style = document.createElement("style");
  style.textContent = \`
    #demo-cursor {
      position: fixed; left: 0; top: 0; width: 22px; height: 22px;
      margin: -11px 0 0 -11px; border-radius: 50%;
      background: rgb(249 115 22 / .28); border: 2px solid #f97316;
      pointer-events: none; z-index: 99999;
      transition: transform .55s cubic-bezier(.33,.1,.25,1), background .12s, width .12s, height .12s;
      transform: translate(-100px, -100px);
    }
    #demo-cursor.is-down { background: rgb(249 115 22 / .75); width: 14px; height: 14px; margin: -7px 0 0 -7px; }
    #demo-caption {
      position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
      background: rgb(28 27 25 / .92); color: #fbfaf8; z-index: 99999;
      font: 500 15px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: .01em;
      padding: .6rem 1rem; border-radius: 999px; pointer-events: none;
      opacity: 0; transition: opacity .3s;
    }
    #demo-caption.is-on { opacity: 1; }
  \`;
  document.head.append(style);
  const cursor = document.createElement("div");
  cursor.id = "demo-cursor";
  const caption = document.createElement("div");
  caption.id = "demo-caption";
  document.body.append(style, cursor, caption);

  const text = (node) => (node === null ? "" : (node.textContent ?? "").trim());

  window.demo = {
    move(x, y) { cursor.style.transform = "translate(" + x + "px," + y + "px)"; },
    press(down) { cursor.classList.toggle("is-down", down); },
    say(words) {
      caption.textContent = words;
      caption.classList.toggle("is-on", words !== "");
    },
    /** The control inside the .field whose label reads exactly this. */
    field(label) {
      for (const field of document.querySelectorAll(".field")) {
        if (text(field.querySelector(".field-label")) === label) {
          return field.querySelector("select, input");
        }
      }
      return null;
    },
    /** The box inside the checkbox row whose words read exactly this. */
    check(label) {
      for (const row of document.querySelectorAll("label.check")) {
        if (text(row.querySelector("span")) === label) return row.querySelector("input");
      }
      return null;
    },
    /**
     * Centre of an element in viewport pixels, leaving the page where it is.
     *
     * The social cut points at the link field a beat after dropping a pin near
     * the top of the map, and scrolling the field into view would push the pin
     * off the frame — losing the mark at the exact moment the film is meant to
     * be showing what it did.
     */
    spot(node) {
      if (node === null) return null;
      const box = node.getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    },
    /** Centre of an element in viewport pixels, after scrolling it into view. */
    centre(node) {
      if (node === null) return null;
      node.scrollIntoView({ block: "center", behavior: "instant" });
      const box = node.getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    },
  };
})()
`;

/* ------------------------------------------------------------------ film --- */

async function main() {
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });
  await mkdir(OUT, { recursive: true });

  // Only when the target is local. Against the deployed site there is nothing
  // to serve, and starting a server would just fail on a port somebody else has.
  const server = URL_BASE.includes("localhost")
    ? spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort"], { stdio: "ignore" })
    : null;
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      "--no-sandbox",
      "--hide-scrollbars",
      "--disable-gpu",
      "--force-color-profile=srgb",
      "--font-render-hinting=none",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const done = () => {
    chrome.kill();
    server?.kill();
  };
  process.on("exit", done);

  const cdp = await connect(PORT);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Light, and said out loud. The page follows the viewer's system otherwise,
  // and a recording that comes out light on one machine and dark on the next is
  // not a recording that regenerates.
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails !== undefined) {
      throw new Error(`masen: the page threw — ${exceptionDetails.text}`);
    }
    return result.value;
  };

  await cdp.send("Page.navigate", {
    url: CUT === "social" ? URL_BASE + SOCIAL_QUERY : URL_BASE,
  });
  await wait(4000);
  await evaluate(STAGE);

  /* ---- frames ---- */

  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
    frames.push({ data, at: Date.now() });
    await cdp.send("Page.screencastFrameAck", { sessionId });
  });

  /** Move the drawn pointer, and give the transition time to run. */
  const point = async (spot) => {
    if (spot === null) throw new Error("masen: nothing to point at");
    await evaluate(`demo.move(${spot.x}, ${spot.y})`);
    await wait(600);
  };

  /** A caption, held long enough to be read at the pace someone watches. */
  const say = async (words, hold = 900) => {
    await evaluate(`demo.say(${JSON.stringify(words)})`);
    await wait(hold);
  };

  /** Point at a control, then change it the way its own listener expects. */
  const setField = async (label, value) => {
    await point(await evaluate(`demo.centre(demo.field(${JSON.stringify(label)}))`));
    await evaluate(`demo.press(true)`);
    await wait(160);
    await evaluate(`
      (() => {
        const control = demo.field(${JSON.stringify(label)});
        control.value = ${JSON.stringify(value)};
        control.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `);
    await evaluate(`demo.press(false)`);
    await wait(780);
  };

  const setCheck = async (label, on) => {
    await point(await evaluate(`demo.centre(demo.check(${JSON.stringify(label)}))`));
    await evaluate(`demo.press(true)`);
    await wait(160);
    await evaluate(`
      (() => {
        const box = demo.check(${JSON.stringify(label)});
        box.checked = ${on ? "true" : "false"};
        box.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `);
    await evaluate(`demo.press(false)`);
    await wait(780);
  };

  /**
   * A real click, at a real pixel, on the map.
   *
   * The one event in the film that is dispatched rather than simulated, because
   * it is the one the film exists to show: a click on the picture becomes a
   * mark on the ground, and the link underneath changes with it.
   */
  /** A pixel on the drawn map, given as a fraction of it. */
  const mapPixel = async (fraction, downFraction) => {
    const box = await evaluate(`
      (() => {
        const svg = document.querySelector("#map svg");
        const rect = svg.getBoundingClientRect();
        return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
      })()
    `);
    return {
      x: Math.round(box.x + box.w * fraction),
      y: Math.round(box.y + box.h * downFraction),
    };
  };

  const clickMap = async (fraction, downFraction) => {
    const { x, y } = await mapPixel(fraction, downFraction);
    await point({ x, y });
    await evaluate(`demo.press(true)`);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await cdp.send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        clickCount: 1,
        buttons: type === "mousePressed" ? 1 : 0,
      });
    }
    await wait(200);
    await evaluate(`demo.press(false)`);
    await wait(1100);
  };

  if (CUT === "social") {
    // Set off camera, not faked: the gesture is the one setting the tool does
    // not keep in the URL, so a film that opens ready to click has to reach in
    // and choose it. Filming the choice would cost a third of the running time
    // to show a dropdown changing.
    await evaluate(`
      (() => {
        const control = demo.field("Clicking the map");
        control.value = "pin";
        control.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `);
    await wait(400);
  }

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    everyNthFrame: 1,
  });

  if (CUT === "social") {
    /*
     * Five seconds, and one of them is the click.
     *
     * The map is already finished when the film starts, so nothing here is a
     * tour: choose the gesture, click the map, look at the link. A feed loops
     * this, which is the argument for ending on the link rather than on a
     * caption — the second time round, the viewer reads the URL.
     */
    await evaluate(`demo.say("The style is a stylesheet.")`);
    await setField("Palette", "patina");
    await wait(400);
    await evaluate(`demo.say("")`);
    await clickMap(SOCIAL_PIN.across, SOCIAL_PIN.down);
    // Get out of the way. The pointer is a prop, and leaving it parked on the
    // mark it just made means the last frame — the one a paused loop shows —
    // is a map with a fake cursor sitting on the only thing worth looking at.
    // Down over the open sea: far from the pin, and not on a control, which
    // would read as pointing at one.
    await point(await mapPixel(0.16, 0.86));
  } else {
    await say("A region, a projection, a stylesheet.", 1400);
    await setField("Region", "europe");
    // Twenty-eight, counted off REGION_PRESET_NAMES rather than remembered.
    // A caption is a claim, and this is the one a viewer could check in ten
    // seconds by opening the dropdown the cursor is resting on.
    await say("Twenty-eight regions, or your own list of countries.", 650);

    await setField("Detail", "50m");
    await say("Two levels of detail, both offline.", 900);

    await setCheck("Neighbours", true);
    await say("Neighbours fill the margin with the land that is really there.", 1500);

    await setField("Theme", "atlas");
    await say("The style is a stylesheet, so it swaps.", 1400);

    await setField("Clicking the map", "pin");
    await say("Now the map is something you click.", 900);
    // Northern Italy, which is land in every projection this demo could pick and
    // far enough from the frame that a pin cannot land in the sea.
    await clickMap(0.54, 0.66);
    await say("The mark is a longitude and a latitude, not a pixel.", 1600);

    // The proof, and the reason the viewport is 860 tall: the link updated, and
    // it is on screen at the same time as the map it rebuilds.
    await point(await evaluate(`demo.centre(document.querySelector("#share"))`));
    await say("Everything is in the link. Send it, and it rebuilds exactly.", 1800);

    await point(await evaluate(`demo.centre(document.querySelector("#map"))`));
    await say("No account, no server, nothing sent anywhere.", 2000);
    await say("", 700);
  }

  await cdp.send("Page.stopScreencast");

  // The poster belongs to the long film; the social cut is a loop, not a card.
  if (CUT === "full") {
    /* ---- the still, which matters more than the film ---- */

    /*
     * The still is composed, not grabbed.
     *
     * The film ends with the form scrolled down to Marks, which is where the
     * last gesture was — and a poster is the one frame most people will ever see
     * of this tool, so it should open on the top of the form rather than on a
     * pin-size slider. The pointer and the caption go; the pin and the link stay,
     * because those are the two things the still has to say.
     */
    await evaluate(`
      (() => {
        document.getElementById("demo-cursor").remove();
        document.getElementById("demo-caption").remove();
        document.querySelector(".panel").scrollTo({ top: 0, behavior: "instant" });
      })()
    `);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await wait(600);
    const still = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(OUT, "poster.png"), Buffer.from(still.data, "base64"));
  }

  cdp.close();
  done();

  /* ---- encode ---- */

  if (frames.length < 10) throw new Error(`masen: only ${frames.length} frames captured`);

  const list = [];
  for (const [index, frame] of frames.entries()) {
    const name = `f${String(index).padStart(5, "0")}.jpg`;
    await writeFile(join(FRAMES, name), Buffer.from(frame.data, "base64"));
    // Chrome emits a frame when the page changes, not on a clock, so the gaps
    // between them are the timing of the demo. Handing ffmpeg those gaps is
    // what keeps the film at the speed it was performed at.
    const next = frames[index + 1];
    const tail = CUT === "social" ? 0.8 : 1.6;
    const seconds = next === undefined ? tail : Math.min((next.at - frame.at) / 1000, 2);
    list.push(`file '${name}'`, `duration ${seconds.toFixed(3)}`);
  }
  // The concat demuxer ignores the last duration unless the file is named twice.
  list.push(`file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'`);
  await writeFile(join(FRAMES, "list.txt"), `${list.join("\n")}\n`);

  const run = (args) =>
    new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
        stdio: "inherit",
      });
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
      );
    });

  const input = ["-f", "concat", "-safe", "0", "-i", join(FRAMES, "list.txt")];

  const made = [];

  if (CUT === "social") {
    /*
     * A GIF and nothing else, because the place this is going plays a GIF in
     * the feed and makes a linked video a click. Fifteen frames a second
     * rather than twelve: the whole film is five seconds, so the frames are
     * cheap and the cursor's travel is the only motion there is.
     */
    await run([...input, "-vf",
      "fps=15,scale=800:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
      join(OUT, "social.gif")]);
    made.push("social.gif");
  } else {
    // MP4 and WebM rather than a GIF, because a GIF of a map is enormous and
    // dithered, which is a poor advertisement for a tool whose whole argument is
    // that it emits vector. `yuv420p` and the even-dimension scale are what make
    // the file play in Safari and in the places that embed rather than link.
    await run([...input, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
      "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-movflags", "+faststart",
      join(OUT, "demo.mp4")]);

    await run([...input, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1",
      join(OUT, "demo.webm")]);

    // The one place a GIF is still the only thing that plays. Half size, twelve
    // frames a second, and its own palette so the map's flat colours survive.
    await run([...input, "-vf",
      "fps=12,scale=720:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
      join(OUT, "demo.gif")]);
    made.push("demo.mp4", "demo.webm", "demo.gif", "poster.png");
  }

  await rm(FRAMES, { recursive: true, force: true });

  const { statSync } = await import("node:fs");
  for (const name of made) {
    const kb = statSync(join(OUT, name)).size / 1024;
    console.log(`  ${OUT}/${name}  ${kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`}`);
  }
  console.log(`  from ${frames.length} frames`);
  process.exit(0);
}

await main();
