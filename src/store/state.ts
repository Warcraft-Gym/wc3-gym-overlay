/**
 * Read/write helpers over localStorage, keyed by the `StoreKey` descriptors
 * in `keys.ts`. Reads never throw — garbage in storage falls back to the
 * key's default and logs a warning. Writes notify the host so other windows
 * (and the `useSyncExternalStore` hook) pick up the change immediately.
 */

import { host } from "../host";
import type { StoreKey } from "./keys";

export function readKey<T>(key: StoreKey<T>): T {
  const raw = localStorage.getItem(key.name);
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
