/**
 * Browser shim for Node's `fs`/`node:fs`, aliased in `vite.config.ts` for
 * the `build`/`serve` commands only. w3gjs's Node build imports `fs`
 * transitively, but the browser bundle never calls any of its
 * file-reading functions — replay bytes always arrive already-read via
 * `parseReplay(bytes: Uint8Array)`, never a filesystem path. Every export
 * throws so a stray call fails loudly instead of doing nothing.
 */
function unsupported(name: string): never {
  throw new Error(`fs.${name}() is not available in the browser build — pass bytes to parseReplay() instead.`);
}

export function readFileSync(): never {
  return unsupported("readFileSync");
}

export function readFile(): never {
  return unsupported("readFile");
}

export function existsSync(): never {
  return unsupported("existsSync");
}

export function writeFileSync(): never {
  return unsupported("writeFileSync");
}

export default { readFileSync, readFile, existsSync, writeFileSync };
