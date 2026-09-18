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
 *
 * The tick itself is a *single* module-level interval shared by every
 * mounted consumer, not one `setInterval` per `useStoreValue` call — with N
 * consumers mounted while the timer runs, the previous per-hook interval
 * meant N redundant 250ms timers ticking away for the lifetime of the run.
 * Design choice: only consumers of the `TIMER` key join the shared tick —
 * everything else already re-renders off plain store writes (`writeKey`
 * fires `host.notifyStateChanged` on every mutation), so a `SETTINGS`-only
 * consumer has no reason to know the tick source exists at all.
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
  useTimerTick(key.name === TIMER.name);
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

// --- Shared timer tick (module-level singleton, not per-hook) -------------

type TickSubscriber = () => void;

const tickSubscribers = new Set<TickSubscriber>();
let tickIntervalId: ReturnType<typeof setInterval> | null = null;
let stopWatchingStateChanges: (() => void) | null = null;

function notifyTickSubscribers(): void {
  tickSubscribers.forEach((subscriber) => subscriber());
}

/** Starts or stops the single shared tick interval to match "is anyone
 *  subscribed, and is the timer running". Idempotent — safe to call as
 *  often as needed. */
function syncTickInterval(): void {
  const shouldTick = tickSubscribers.size > 0 && timerIsRunning();
  if (shouldTick && tickIntervalId === null) {
    tickIntervalId = setInterval(notifyTickSubscribers, TICK_MS);
  } else if (!shouldTick && tickIntervalId !== null) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
}

/** Joins the shared tick subscriber set. While at least one subscriber is
 *  present, a single module-level listener watches the store's normal
 *  change signals (`host.onStateChanged` / `storage` — the same events
 *  `writeKey` already fires on every mutation) to start or stop the ticking
 *  interval the instant the timer starts, pauses, or resets; no polling
 *  needed to detect that. Returns an unsubscribe function. */
function subscribeTick(subscriber: TickSubscriber): () => void {
  tickSubscribers.add(subscriber);

  if (stopWatchingStateChanges === null) {
    const unsubscribeHost = host.onStateChanged(syncTickInterval);
    window.addEventListener("storage", syncTickInterval);
    stopWatchingStateChanges = () => {
      unsubscribeHost();
      window.removeEventListener("storage", syncTickInterval);
    };
  }
  syncTickInterval();

  return () => {
    tickSubscribers.delete(subscriber);
    if (tickSubscribers.size === 0 && stopWatchingStateChanges !== null) {
      stopWatchingStateChanges();
      stopWatchingStateChanges = null;
    }
    syncTickInterval();
  };
}

/** Forces a re-render every `TICK_MS` while the timer is running, via plain
 *  component state — deliberately independent of `useSyncExternalStore`'s
 *  change-detection so ticks are never dropped as "unchanged". Only joins
 *  the shared tick source when `isTimerConsumer` is true, so a component
 *  reading a different key never subscribes (and never causes the shared
 *  interval to start) at all. */
function useTimerTick(isTimerConsumer: boolean): void {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!isTimerConsumer) return undefined;
    return subscribeTick(forceRender);
  }, [isTimerConsumer]);
}
