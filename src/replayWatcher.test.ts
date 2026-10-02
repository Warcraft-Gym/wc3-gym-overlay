/**
 * F006 (last-replay-watcher) — the top-level orchestrator: reads
 * `settings.autoImport`/`replayFolder`, starts the host's poll loop, and
 * restarts it (stop + start) only when one of those two values actually
 * changed on a cross-window store notification — never on an unrelated
 * settings change. Also the `onLastReplay` subscription point other
 * features hook into. `host.watchLastReplay`/`host.onStateChanged` are
 * spied/mocked directly — no real filesystem or BroadcastChannel timing
 * involved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SHORTCUTS } from "./config";
import { host } from "./host";
import type { ReplayEvent, ReplayWatcherOptions } from "./host/bridge";
import { SETTINGS } from "./store/keys";
import { onLastReplay, startReplayWatcher } from "./replayWatcher";

function rawSettings(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    apiBase: "https://warcraft-gym.com",
    opacity: 1,
    scale: 1,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    ...overrides,
  };
}

function writeRawSettings(overrides: Partial<Record<string, unknown>> = {}): void {
  localStorage.setItem(SETTINGS.name, JSON.stringify(rawSettings(overrides)));
}

describe("replayWatcher", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("starts the host watcher with the current autoImport/replayFolder", () => {
    writeRawSettings({ autoImport: true, replayFolder: "/custom/replays" });
    const stop = vi.fn();
    const watchSpy = vi.spyOn(host, "watchLastReplay").mockReturnValue(stop);
    vi.spyOn(host, "onStateChanged").mockReturnValue(() => {});

    const teardown = startReplayWatcher();

    expect(watchSpy).toHaveBeenCalledTimes(1);
    const [opts] = watchSpy.mock.calls[0] as [ReplayWatcherOptions, unknown];
    expect(opts).toEqual({ autoImport: true, replayFolder: "/custom/replays" });

    teardown();
  });

  it("restarts the loop when autoImport/replayFolder change, not on an unrelated settings change", () => {
    writeRawSettings({ autoImport: true, replayFolder: null });
    let onStateChangedCb: () => void = () => {};
    vi.spyOn(host, "onStateChanged").mockImplementation((cb) => {
      onStateChangedCb = cb;
      return () => {};
    });
    const stops: ReturnType<typeof vi.fn>[] = [];
    const watchSpy = vi.spyOn(host, "watchLastReplay").mockImplementation(() => {
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    });

    const teardown = startReplayWatcher();
    expect(stops).toHaveLength(1);

    // Unrelated change (apiBase) — must not restart the loop.
    writeRawSettings({ autoImport: true, replayFolder: null, apiBase: "https://other.example" });
    onStateChangedCb();
    expect(watchSpy).toHaveBeenCalledTimes(1);
    expect(stops[0]).not.toHaveBeenCalled();

    // Relevant change (autoImport flips off) — must stop the old loop and
    // start a new one with the new opts.
    writeRawSettings({ autoImport: false, replayFolder: null });
    onStateChangedCb();
    expect(watchSpy).toHaveBeenCalledTimes(2);
    expect(stops[0]).toHaveBeenCalledTimes(1);
    const [secondOpts] = watchSpy.mock.calls[1] as [ReplayWatcherOptions, unknown];
    expect(secondOpts).toEqual({ autoImport: false, replayFolder: null });

    teardown();
    expect(stops[1]).toHaveBeenCalledTimes(1);
  });

  it("onLastReplay relays events from the host's onReplay callback", () => {
    writeRawSettings({ autoImport: true, replayFolder: null });
    let capturedOnReplay: (event: ReplayEvent) => void = () => {};
    vi.spyOn(host, "watchLastReplay").mockImplementation(
      (_opts: ReplayWatcherOptions, onReplay: (event: ReplayEvent) => void) => {
        capturedOnReplay = onReplay;
        return vi.fn();
      },
    );
    vi.spyOn(host, "onStateChanged").mockReturnValue(() => {});

    const received = vi.fn();
    const unsubscribe = onLastReplay(received);
    const teardown = startReplayWatcher();

    const event: ReplayEvent = { path: "/x/LastReplay.w3g", mtimeMs: 1, bytes: new Uint8Array([1]) };
    capturedOnReplay(event);
    expect(received).toHaveBeenCalledWith(event);

    unsubscribe();
    capturedOnReplay({ ...event, mtimeMs: 2 });
    expect(received).toHaveBeenCalledTimes(1);

    teardown();
  });
});
