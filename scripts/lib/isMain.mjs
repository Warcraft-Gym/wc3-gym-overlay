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
 * Comparing resolved filesystem paths instead (as
 * `scripts/check-tauri-versions.mjs` already does for its own `ROOT`
 * constant) is robust to that: `fileURLToPath` decodes the URL back to a
 * real path, and `path.resolve` normalizes `argv[1]` the same way.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Pass `import.meta.url` from the call site. Returns `true` only when the
 *  module was run directly (`node path/to/script.mjs ...`), never when it
 *  was imported from another module (e.g. a test file). */
export function isMain(moduleUrl) {
  if (!process.argv[1]) return false;
  return fileURLToPath(moduleUrl) === resolve(process.argv[1]);
}
