/**
 * Regression coverage for the shared-tick refactor: before this, every
 * `useStoreValue` call ran its own 250ms interval (plus its own polling
 * watcher) while the timer was running, so N mounted consumers meant N
 * redundant timers. Now there is exactly one module-level interval, shared
 * by every `TIMER` consumer, started on the first mount and stopped on the
 * last unmount (or when the timer itself stops).
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TICK_MS } from "../config";
import { SETTINGS, TIMER } from "./keys";
import { writeKey } from "./state";
import { useStoreValue } from "./useStore";

type SpiedMock = { mock: { calls: unknown[][]; results: { value: unknown }[] } };

// `@testing-library/dom`'s `waitFor` polls via its own `setInterval`, which
// would otherwise pollute a spy on `globalThis.setInterval` with unrelated
// calls — filter to calls using the tick's actual delay to isolate the
// shared tick source's own interval(s) and their returned ids.
function tickIntervalIds(spy: SpiedMock): unknown[] {
  return spy.mock.calls
    .map((call, index) => ({ delay: call[1], id: spy.mock.results[index]?.value }))
    .filter((entry) => entry.delay === TICK_MS)
    .map((entry) => entry.id);
}

describe("useStoreValue — shared timer tick", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("runs exactly one setInterval for two mounted consumers (SETTINGS + TIMER) while the timer runs, and clears it once both unmount", async () => {
    await act(async () => {
      await writeKey(TIMER, { startedAtMs: Date.now(), baseElapsedMs: 0 });
    });

    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const timerHook = renderHook(() => useStoreValue(TIMER));
    const settingsHook = renderHook(() => useStoreValue(SETTINGS));

    await waitFor(() => expect(tickIntervalIds(setIntervalSpy)).toHaveLength(1));
    const [intervalId] = tickIntervalIds(setIntervalSpy);

    timerHook.unmount();
    settingsHook.unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
    expect(tickIntervalIds(setIntervalSpy)).toHaveLength(1);
  });

  it("a SETTINGS-only consumer never starts the shared tick interval", async () => {
    await act(async () => {
      await writeKey(TIMER, { startedAtMs: Date.now(), baseElapsedMs: 0 });
    });

    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const settingsHook = renderHook(() => useStoreValue(SETTINGS));
    // Give any (incorrect) effect a tick to fire before asserting it didn't.
    await act(async () => {
      await Promise.resolve();
    });

    expect(tickIntervalIds(setIntervalSpy)).toHaveLength(0);

    settingsHook.unmount();
  });

  it("stops the shared interval once the timer stops, even with a consumer still mounted", async () => {
    await act(async () => {
      await writeKey(TIMER, { startedAtMs: Date.now(), baseElapsedMs: 0 });
    });

    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const timerHook = renderHook(() => useStoreValue(TIMER));
    await waitFor(() => expect(tickIntervalIds(setIntervalSpy)).toHaveLength(1));
    const [intervalId] = tickIntervalIds(setIntervalSpy);

    await act(async () => {
      await writeKey(TIMER, { startedAtMs: null, baseElapsedMs: 1000 });
    });

    await waitFor(() => expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId));

    timerHook.unmount();
  });
});
