import { afterEach, describe, expect, it, vi } from "vitest";
import { dataUrl, loadOcean, readData } from "../src/topology.js";

/**
 * The one thing in the runtime path that could not work in a browser.
 *
 * `loadWorld`, `loadOcean` and `loadCover` each built a URL and read it through
 * `node:fs/promises`, which is fine on disk and fatal in a page. They now share
 * one `readData` that asks the URL what it is: a `file:` URL is read, anything
 * else is fetched.
 *
 * **Asking rather than trying is the whole design, and the order is the reason.**
 * Node has had a global `fetch` since 18, so "try fetch, fall back to the
 * filesystem" would make every Node caller pay a failed request for a `file:`
 * URL before getting the answer. Branching on the protocol costs nothing and
 * cannot be wrong: a package on disk resolves `import.meta.url` to `file:`, and
 * a bundle served over HTTP resolves it to wherever it was served from.
 *
 * The other half of the claim — that the shipped bundle contains no live
 * `node:` import — is checked in `scripts/verify-exports.mjs`, because it is a
 * fact about `dist/` rather than about `src/`, and `dist/` is what a bundler
 * sees. It is also where the plan turned out to be wrong: a bundler does *not*
 * silently drop a lazy dynamic import.
 */

const REAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  vi.restoreAllMocks();
});

describe("reading the bundled data", () => {
  it("reads a file: URL from disk", async () => {
    const bundle = (await readData(dataUrl("110m"))) as { tier: string };
    expect(bundle.tier).toBe("110m");
  });

  it("fetches anything that is not a file, and never touches the filesystem", async () => {
    // The browser path, exercised in Node. If `readData` reached for `readFile`
    // here it would be reading a URL no filesystem has.
    const payload = { tier: "made-up" };
    const asked: string[] = [];
    globalThis.fetch = (async (url: URL) => {
      asked.push(String(url));
      return new Response(JSON.stringify(payload), { status: 200 });
    }) as unknown as typeof fetch;

    const got = await readData(new URL("https://example.invalid/masen/data/110m.json"));
    expect(got).toEqual(payload);
    expect(asked).toEqual(["https://example.invalid/masen/data/110m.json"]);
  });

  it("does not fetch a file: URL", async () => {
    // The cost this branch exists to avoid: a failed request on every load for
    // every Node caller, because Node has had a global `fetch` since 18.
    const fetched = vi.fn();
    globalThis.fetch = fetched as unknown as typeof fetch;
    await readData(dataUrl("110m"));
    expect(fetched).not.toHaveBeenCalled();
  });

  it("says what the server said when a fetch fails", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 404, statusText: "Not Found" })) as unknown as typeof fetch;
    await expect(readData(new URL("https://example.invalid/nope.json"))).rejects.toThrow(
      /404/,
    );
  });

  /**
   * The advice has to match where the reader is standing.
   *
   * On disk, "run `npm run build:data`" is the fix and always was. In a browser
   * it is not — telling someone who opened a web page to run a build script
   * sends them somewhere they cannot go. What they need is the URL that was
   * actually asked for, because the answer is nearly always that `data/` was
   * not deployed beside the bundle.
   */
  it("tells a Node caller to rebuild the data", async () => {
    // 10m is a real `Detail` with no file behind it, so this is the honest
    // shape of the failure rather than a contrived one.
    await expect(loadOcean("10m")).rejects.toThrow(/npm run build:data/);
  });

  it("keeps the cause of the failure attached", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("network is unreachable");
    }) as unknown as typeof fetch;
    const failed = await readData(new URL("https://example.invalid/nope.json")).catch(
      (error: unknown) => error,
    );
    expect(failed).toBeInstanceOf(TypeError);
  });

  it("resolves every data file to the same directory", () => {
    // A one-line guard on the thing 09b is about to get wrong: a project Pages
    // site is served from /masen/, not /, so every one of these has to move
    // together or none of them does.
    const names = ["110m", "50m", "ocean-110m", "cover-110m"];
    const directories = new Set(
      names.map((name) => dataUrl(name).href.replace(/[^/]+$/, "")),
    );
    expect(directories.size).toBe(1);
  });
});
