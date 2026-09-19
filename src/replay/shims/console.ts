/**
 * Browser shim for Node's `node:console`, aliased in `vite.config.ts` for
 * the `build`/`serve` commands only. The global `console` in a browser
 * already implements the subset of Node's Console API anything in the
 * replay pipeline could reach for.
 */
const globalConsole = globalThis.console;

export default globalConsole;
export const log = globalConsole.log.bind(globalConsole);
export const error = globalConsole.error.bind(globalConsole);
export const warn = globalConsole.warn.bind(globalConsole);
export const info = globalConsole.info.bind(globalConsole);
export const debug = globalConsole.debug.bind(globalConsole);
