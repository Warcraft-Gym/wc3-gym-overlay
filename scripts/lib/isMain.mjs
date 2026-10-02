/**
 * Guard for the "only run main() when this file was invoked directly, not
 * imported" idiom. `import.meta.url === \`file://${process.argv[1]}\`` looks
 * equivalent but silently breaks the moment the checkout path contains a
 * space (or any other character that gets percent-encoded in a URL but not
 * in `argv[1]`): the comparison is always false, `main()` never runs, and
 * the script exits 0 having checked nothing, which is the exact failure
 * this repo's release/config guard scripts must never have, since CI and
 * local checkouts both routinely sit under paths with spaces.
 *
 * Comparing `path.resolve(argv[1])` straight against `fileURLToPath(moduleUrl)`
 * (as an earlier version of this guard did) still breaks when the script is
 * invoked through a symlinked entry point: Node's ESM loader resolves
 * `import.meta.url` to the symlink's *real* target, but `argv[1]` stays the
 * symlink path exactly as typed — e.g. on macOS, `/tmp` is itself a symlink
 * to `/private/tmp`, so `node /tmp/scripts/check-config.mjs` reports
 * `import.meta.url` as `file:///private/tmp/scripts/check-config.mjs` while
 * `argv[1]` is still `/tmp/scripts/check-config.mjs`; the two never compare
 * equal, and `main()` is silently skipped again — this also reproduces on
 * Linux with an explicit symlink to the script, not just macOS's `/tmp`
 * alias (see `check-space-path-guard.mjs`'s symlink case).
 *
 * Resolving both sides through `fs.realpathSync` before comparing fixes
 * this: a symlink and its real target resolve to the same canonical path
 * either way. `realpathSync` can itself throw (e.g. a path that doesn't
 * exist, or a permissions error) — fall back to the pre-realpath value
 * rather than letting that throw take the whole guard down, so the
 * comparison degrades to the non-symlink behavior instead of crashing.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolves symlinks in `path`, falling back to `path` itself (already
 *  resolved/normalized by the caller) when `realpathSync` throws. */
function safeRealpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** Pass `import.meta.url` from the call site. Returns `true` only when the
 *  module was run directly (`node path/to/script.mjs ...`), never when it
 *  was imported from another module (e.g. a test file) — and still true
 *  when either side (or both) was reached through a symlink. */
export function isMain(moduleUrl) {
  if (!process.argv[1]) return false;
  const modulePath = safeRealpath(fileURLToPath(moduleUrl));
  const argvPath = safeRealpath(resolve(process.argv[1]));
  return modulePath === argvPath;
}
