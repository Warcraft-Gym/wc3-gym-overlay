/**
 * `useSyncExternalStore`-based hook over a store key. Re-renders on:
 *  - the browser `storage` event (another tab/window wrote the key)
 *  - `host.onStateChanged` (same-origin, cross-window notification)
 *  - a `TICK_MS` interval, but only while the timer key is running — so the
 *    clock keeps advancing without every consumer polling all the time.
 *
 * The periodic tick is driven by ordinary component state (`useReducer`),
 * not by calling the external-store's `onStoreChange`: React's
 * `useSyncExternalStore` compares `getSnapshot()` by `Object.is` before
 * committing a re-render, and the `TIMER` record itself never changes
 * between ticks (only `Date.now()` does when a consumer derives elapsed
 * time from it) — so driving the tick through `onStoreChange` gets
 * silently dropped after the very first call. See F004's handoff for the
 * repro (a play-along clock that updates once, then freezes forever).
 */

import { useEffect, useReducer, useSyncExternalStore } from "react";
import { host } from "../host";
import { TICK_MS } from "../config";
import { readKey } from "./state";
import { TIMER, type StoreKey } from "./keys";
import { isRunning } from "./timer";

function timerIsRunning(): boolean {
  return isRunning(readKey(TIMER));
}

export function useStoreValue<T>(key: StoreKey<T>): T {
  const value = useSyncExternalStore(
    (onStoreChange) => subscribeToChanges(key, onStoreChange),
    () => readKey(key),
    () => key.defaultValue(),
  );
  useTimerTick();
  return value;
}

function subscribeToChanges<T>(key: StoreKey<T>, onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key.name) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);

  const unsubscribeHost = host.onStateChanged(onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    unsubscribeHost();
  };
}

/** Forces a re-render every `TICK_MS` while the timer is running, via plain
 *  component state — deliberately independent of `useSyncExternalStore`'s
 *  change-detection so ticks are never dropped as "unchanged". */
function useTimerTick(): void {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let tickId: ReturnType<typeof setInterval> | null = null;

    const sync = () => {
      const shouldTick = timerIsRunning();
      if (shouldTick && tickId === null) {
        tickId = setInterval(forceRender, TICK_MS);
      } else if (!shouldTick && tickId !== null) {
        clearInterval(tickId);
        tickId = null;
      }
    };

    sync();
    const watcherId = setInterval(sync, TICK_MS);

    return () => {
      if (tickId !== null) clearInterval(tickId);
      clearInterval(watcherId);
    };
  }, []);
}
