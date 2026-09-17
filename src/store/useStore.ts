/**
 * `useSyncExternalStore`-based hook over a store key. Re-renders on:
 *  - the browser `storage` event (another tab/window wrote the key)
 *  - `host.onStateChanged` (same-origin, cross-window notification)
 *  - a `TICK_MS` interval, but only while the timer key is running — so the
 *    clock keeps advancing without every consumer polling all the time.
 */

import { useSyncExternalStore } from "react";
import { host } from "../host";
import { TICK_MS } from "../config";
import { readKey } from "./state";
import { TIMER, type StoreKey } from "./keys";
import { isRunning } from "./timer";

function timerIsRunning(): boolean {
  return isRunning(readKey(TIMER));
}

export function useStoreValue<T>(key: StoreKey<T>): T {
  return useSyncExternalStore(
    (onStoreChange) => subscribe(key, onStoreChange),
    () => readKey(key),
    () => key.defaultValue(),
  );
}

function subscribe<T>(key: StoreKey<T>, onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key.name) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);

  const unsubscribeHost = host.onStateChanged(onStoreChange);

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const syncInterval = () => {
    const shouldTick = timerIsRunning();
    if (shouldTick && intervalId === null) {
      intervalId = setInterval(onStoreChange, TICK_MS);
    } else if (!shouldTick && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
  syncInterval();
  const watcherId = setInterval(syncInterval, TICK_MS);

  return () => {
    window.removeEventListener("storage", handleStorage);
    unsubscribeHost();
    if (intervalId !== null) clearInterval(intervalId);
    clearInterval(watcherId);
  };
}
