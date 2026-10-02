/**
 * F009 (plan-vs-actual-engine) – the browser host's `readReplayFile`: since
 * there is no real filesystem to re-read, it answers from whatever bytes
 * `injectLastReplayForTest` last handed over for that exact path.
 */
import { describe, expect, it } from "vitest";
import { createBrowserHost, injectLastReplayForTest } from "./browser";

describe("browser host – readReplayFile", () => {
  it("resolves the bytes/mtime from the last injected event for that path", async () => {
    const host = createBrowserHost();
    injectLastReplayForTest({ path: "/fake/LastReplay.w3g", mtimeMs: 42, bytes: new Uint8Array([7, 8]) });

    expect(await host.readReplayFile("/fake/LastReplay.w3g")).toEqual({ bytes: new Uint8Array([7, 8]), mtimeMs: 42 });
  });

  it("resolves null for a path that was never injected", async () => {
    const host = createBrowserHost();
    expect(await host.readReplayFile("/never/seen.w3g")).toBeNull();
  });

  it("reflects the most recent injection for a path that was injected twice", async () => {
    const host = createBrowserHost();
    injectLastReplayForTest({ path: "/fake/LastReplay.w3g", mtimeMs: 1, bytes: new Uint8Array([1]) });
    injectLastReplayForTest({ path: "/fake/LastReplay.w3g", mtimeMs: 2, bytes: new Uint8Array([2]) });

    expect(await host.readReplayFile("/fake/LastReplay.w3g")).toEqual({ bytes: new Uint8Array([2]), mtimeMs: 2 });
  });
});
