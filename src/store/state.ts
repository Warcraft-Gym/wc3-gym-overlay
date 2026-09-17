/**
 * Read/write helpers over localStorage, keyed by the `StoreKey` descriptors
 * in `keys.ts`. Reads never throw — garbage in storage falls back to the
 * key's default and logs a warning. Writes notify the host so other windows
 * (and the `useSyncExternalStore` hook) pick up the change immediately.
 *
 * `readKey` memoizes its result per key by the raw localStorage string: as
 * long as the underlying value hasn't changed, repeated calls return the
 * *same* object reference instead of re-parsing JSON into a fresh one every
 * time. This isn't just a perf nicety — `useStore.ts`'s `useStoreValue` feeds
 * `readKey` straight into `useSyncExternalStore` as `getSnapshot`. Without a
 * stable reference, every render's post-commit consistency check sees "a
 * different snapshot" (new object, `Object.is` fails) and force-rerenders,
 * forever — an infinite render loop that trips React's nested-update guard.
 * Any component calling `useStoreValue` failed with "Maximum update depth
 * exceeded" before this fix (see F003 handoff for the repro).
 */

import { host } from "../host";
import type { StoreKey } from "./keys";

const parsedCache = new Map<string, { raw: string | null; value: unknown }>();

function parseRaw<T>(key: StoreKey<T>, raw: string | null): T {
  if (raw === null) return key.defaultValue();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    console.warn(`[wc3gym] ${key.name}: invalid JSON, using default`, err);
    return key.defaultValue();
  }

  const result = key.schema.safeParse(parsedJson);
  if (!result.success) {
    console.warn(`[wc3gym] ${key.name}: failed validation, using default`, result.error);
    return key.defaultValue();
  }
  return result.data;
}

export function readKey<T>(key: StoreKey<T>): T {
  const raw = localStorage.getItem(key.name);
  const cached = parsedCache.get(key.name);
  if (cached && cached.raw === raw) return cached.value as T;

  const value = parseRaw(key, raw);
  parsedCache.set(key.name, { raw, value });
  return value;
}

export async function writeKey<T>(key: StoreKey<T>, value: T): Promise<void> {
  localStorage.setItem(key.name, JSON.stringify(value));
  await host.notifyStateChanged();
}

/** Immutable update: `fn` receives the current value and returns a new one. */
export async function updateKey<T>(key: StoreKey<T>, fn: (current: T) => T): Promise<T> {
  const next = fn(readKey(key));
  await writeKey(key, next);
  return next;
}
