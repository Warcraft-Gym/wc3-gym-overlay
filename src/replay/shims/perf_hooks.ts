/**
 * Browser shim for Node's `perf_hooks`, aliased in `vite.config.ts` for the
 * `build`/`serve` commands only. The browser's global `performance` object
 * already implements the subset (`.now()`) anything in the replay pipeline
 * needs.
 */
export const performance: Performance = globalThis.performance;

export default { performance };
