/**
 * F006 (last-replay-watcher) — the browser host's no-op `watchLastReplay`
 * and its `injectLastReplayForTest` selftest hook (used by a later feature
 * driving browser mode, e.g. a Playwright suite that can't touch a real
 * filesystem). Same selftest/host-adapter convention as this module's
 * existing `?mockUpdate=`/`?failShortcut=` URL hooks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserHost, injectLastReplayForTest } from "./browser";

describe("browser host — watchLastReplay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never calls onReplay on its own — there is no real filesystem to watch", async () => {
    const host = createBrowserHost();
    const onReplay = vi.fn();
    host.watchLastReplay({ autoImport: true, replayFolder: null }, onReplay);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onReplay).not.toHaveBeenCalled();
    expect(host.getReplayWatcherStatus().watchingFolders).toEqual([]);
  });

  it("injectLastReplayForTest fires the active onReplay subscription", () => {
    const host = createBrowserHost();
    const onReplay = vi.fn();
    host.watchLastReplay({ autoImport: true, replayFolder: null }, onReplay);

    const event = { path: "/fake/LastReplay.w3g", mtimeMs: 123, bytes: new Uint8Array([1]) };
    injectLastReplayForTest(event);

    expect(onReplay).toHaveBeenCalledWith(event);
    expect(host.getReplayWatcherStatus().lastPickedUpAtMs).not.toBeNull();
  });

  it("is reachable as window.__wc3gymInjectLastReplay for a Playwright page.evaluate", () => {
    const injected = (window as unknown as Record<string, unknown>).__wc3gymInjectLastReplay;
    expect(typeof injected).toBe("function");
  });

  it("does nothing when autoImport is false — no active subscription to fire", () => {
    const host = createBrowserHost();
    const onReplay = vi.fn();
    host.watchLastReplay({ autoImport: false, replayFolder: null }, onReplay);

    injectLastReplayForTest({ path: "/fake/LastReplay.w3g", mtimeMs: 1, bytes: new Uint8Array() });

    expect(onReplay).not.toHaveBeenCalled();
  });

  it("stop() detaches the listener — a later injection fires nothing", () => {
    const host = createBrowserHost();
    const onReplay = vi.fn();
    const stop = host.watchLastReplay({ autoImport: true, replayFolder: null }, onReplay);
    stop();

    injectLastReplayForTest({ path: "/fake/LastReplay.w3g", mtimeMs: 1, bytes: new Uint8Array() });

    expect(onReplay).not.toHaveBeenCalled();
  });

  it("openFolder resolves ?mockFolder= off the URL, or null otherwise", async () => {
    const host = createBrowserHost();
    expect(await host.openFolder()).toBeNull();
  });
});

describe("browser host — openFolder with ?mockFolder=", () => {
  beforeEach(() => {
    history.replaceState(null, "", "?mockFolder=/fake/BattleNet");
  });

  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  it("resolves the mocked folder path", async () => {
    const host = createBrowserHost();
    expect(await host.openFolder()).toBe("/fake/BattleNet");
  });
});
