import { Buffer } from "buffer";

/**
 * F002-followup-1 (C-606): sets `globalThis.Buffer` explicitly instead of
 * relying on `vite-plugin-node-polyfills`'s `globals: { Buffer: true }`
 * option — that option injects its shim as a virtual module imported by
 * *every* entry, so `buffer` (and everything manualChunks buckets with it)
 * loads eagerly on both windows even when nothing but the replay parser
 * needs it. Importing `buffer` here instead means it's only pulled in by
 * this file, which only `parseReplay.ts` imports (for its side effect,
 * before `w3gjs` loads). Guarded like `setImmediate` below: a no-op under
 * Node (vitest), where `globalThis.Buffer` already exists.
 */
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

/**
 * Ensures the Node global `setImmediate` exists before any replay-parsing
 * code runs. w3gjs's `GameDataParser` calls the bare global `setImmediate`
 * directly (not an import — `vite-plugin-node-polyfills`'s module aliases
 * can't cover it) once per game-data block to yield to the event loop; a
 * ~15-minute melee replay has on the order of 10,000+ such blocks. Browsers
 * don't define `setImmediate`, and a naive `setTimeout(cb, 0)` polyfill
 * hits Chromium's well-known "nested timeout" throttle (clamped to a 4ms
 * minimum once a few timeouts have chained), turning that yield loop into
 * a multi-tens-of-seconds stall. A `MessageChannel`-backed queue — the same
 * trick the `setimmediate` npm package uses — schedules the callback as a
 * macrotask without that clamp, keeping replay parsing sub-second like it
 * is under Node.
 *
 * Guarded by a `typeof` check, so importing this for its side effect is a
 * genuine no-op under Node (vitest, and the Tauri/Node target this file
 * doesn't even get aliased into) — safe to import unconditionally from
 * `parseReplay.ts` rather than gating it behind the build/serve-only
 * aliases in `vite.config.ts`.
 */
if (typeof globalThis.setImmediate === "undefined") {
  const queue: (() => void)[] = [];
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    queue.shift()?.();
  };

  // Close enough to Node's shape (callback + trailing args) for w3gjs's
  // one call site, which passes no extra args.
  const polyfill = (callback: (...args: unknown[]) => void, ...args: unknown[]): number => {
    queue.push(() => callback(...args));
    channel.port2.postMessage(null);
    return 0;
  };
  (globalThis as unknown as Record<string, unknown>).setImmediate = polyfill;
}

export {};
