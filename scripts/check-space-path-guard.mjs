#!/usr/bin/env node
/**
 * Regression check for the "silent-skip main guard" bug (F002a review of
 * F002): `check-config.mjs` and `check-release.mjs` used to gate `main()`
 * behind `import.meta.url === \`file://${process.argv[1]}\``. The moment the
 * checkout path contains a space (or any other character that gets
 * percent-encoded in a URL but not in `argv[1]`), that comparison is always
 * false, `main()` never runs, and the process exits 0 having checked
 * nothing: `pnpm check:config` would print nothing and exit 0 even with a
 * deliberately wrong `tauri.conf.json` version, and `node
 * scripts/check-release.mjs` with no tag would exit 0 instead of printing
 * usage and failing.
 *
 * This copies the repo into a sibling directory whose name contains a
 * space, breaks `tauri.conf.json`'s version there, and asserts both scripts
 * exit non-zero when actually invoked (`node scripts/check-*.mjs`, not
 * imported) from inside that path. No network access; copies only the
 * tracked-looking source tree (skips `.git`, `node_modules`, `dist`), so
 * it stays fast.
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const EXCLUDED_TOP_LEVEL = new Set([".git", "node_modules", "dist", "src-tauri"]);
// src-tauri is large (target/, gen/) but check-config.mjs only needs a
// handful of files from it; copy those explicitly instead of the whole
// tree, which also carries any local Rust build output.
const SRC_TAURI_FILES = [
  "tauri.conf.json",
  "Cargo.toml",
  "src/lib.rs",
  "capabilities/default.json",
];

/** Runs `node <script>` (with no extra args) from `cwd` and returns its
 *  exit code without throwing. */
function runNode(scriptRelPath, cwd) {
  try {
    execFileSync(process.execPath, [scriptRelPath], { cwd, stdio: "pipe" });
    return 0;
  } catch (err) {
    return typeof err.status === "number" ? err.status : 1;
  }
}

function copyRepoInto(spacedDir) {
  cpSync(ROOT, spacedDir, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(ROOT.length).replace(/^[\\/]/, "");
      if (rel === "") return true;
      const topLevel = rel.split(/[\\/]/)[0];
      return !EXCLUDED_TOP_LEVEL.has(topLevel);
    },
  });

  for (const relFile of SRC_TAURI_FILES) {
    cpSync(join(ROOT, "src-tauri", relFile), join(spacedDir, "src-tauri", relFile));
  }

  // capabilities/*.json beyond default.json, if any: check-config.mjs
  // reads the whole directory, not a fixed filename list.
  cpSync(join(ROOT, "src-tauri/capabilities"), join(spacedDir, "src-tauri/capabilities"), {
    recursive: true,
  });
}

/** Writes an invalid `version` into `repoDir`'s `tauri.conf.json` — the
 *  "bad input" every case below expects `check-config.mjs` to actually
 *  notice and fail on, proving `main()` ran instead of being silently
 *  skipped by the guard. */
function breakVersion(repoDir) {
  const confPath = join(repoDir, "src-tauri/tauri.conf.json");
  const conf = JSON.parse(readFileSync(confPath, "utf8"));
  conf.version = "not-a-valid-semver";
  writeFileSync(confPath, JSON.stringify(conf, null, 2));
}

/**
 * Regression check for the second "silent-skip main guard" bug (this
 * mission's housekeeping item): the space-path fix above compares
 * `fileURLToPath(moduleUrl)` against `path.resolve(argv[1])` directly, which
 * still breaks when the *entry point itself* is reached through a symlink —
 * Node's ESM loader resolves `import.meta.url` to the symlink's real target,
 * but `argv[1]` stays exactly the symlink path, so the two never compare
 * equal. This reproduces on every platform (not just macOS's `/tmp` →
 * `/private/tmp` alias — see `scripts/lib/isMain.mjs`'s doc comment): create
 * an explicit symlink to `check-config.mjs` and invoke *that*.
 *
 * To actually demonstrate the regression (not just assert the current
 * behavior), this also runs two tiny standalone harnesses through symlinks
 * of their own: one hardcodes the *old* pre-realpath comparison this guard
 * used to ship, the other imports the real, current `lib/isMain.mjs`. The
 * old one is expected to report "main skipped" (the bug); the current one
 * is expected to report "main ran" (the fix).
 */
function checkSymlinkGuard() {
  const parent = mkdtempSync(join(tmpdir(), "wc3-symlink-guard-"));
  const realDir = join(parent, "real");

  try {
    copyRepoInto(realDir);
    breakVersion(realDir);

    // Case 1: the real check-config.mjs, invoked through a symlink pointing
    // at it, must still run main() and fail on the bad version above.
    const configLink = join(parent, "check-config-link.mjs");
    symlinkSync(join(realDir, "scripts/check-config.mjs"), configLink);
    const configExit = runNode(configLink, parent);
    console.log(
      `node <symlink to check-config.mjs> exit code with a bad version: ${configExit} (expect non-zero)`,
    );

    // Case 2 + 3: isolate just the guard comparison itself, old vs new, each
    // invoked through its own symlink, so the regression and the fix are
    // both visible side by side rather than inferred from case 1 alone.
    const oldHarnessPath = join(realDir, "scripts/harness-old-ismain.mjs");
    writeFileSync(
      oldHarnessPath,
      [
        'import { fileURLToPath } from "node:url";',
        'import { resolve } from "node:path";',
        "// The guard this repo shipped before this mission's fix — compares",
        "// fileURLToPath(import.meta.url) straight against resolve(argv[1]),",
        "// with no realpath on either side.",
        "function isMainOld(moduleUrl) {",
        "  if (!process.argv[1]) return false;",
        "  return fileURLToPath(moduleUrl) === resolve(process.argv[1]);",
        "}",
        'process.stdout.write(isMainOld(import.meta.url) ? "MAIN-RAN\\n" : "MAIN-SKIPPED\\n");',
        "process.exit(isMainOld(import.meta.url) ? 0 : 1);",
        "",
      ].join("\n"),
    );
    const newHarnessPath = join(realDir, "scripts/harness-new-ismain.mjs");
    writeFileSync(
      newHarnessPath,
      [
        '// The fixed guard, imported from the real lib/isMain.mjs this mission ships.',
        'import { isMain } from "./lib/isMain.mjs";',
        'process.stdout.write(isMain(import.meta.url) ? "MAIN-RAN\\n" : "MAIN-SKIPPED\\n");',
        "process.exit(isMain(import.meta.url) ? 0 : 1);",
        "",
      ].join("\n"),
    );

    const oldLink = join(parent, "harness-old-link.mjs");
    const newLink = join(parent, "harness-new-link.mjs");
    symlinkSync(oldHarnessPath, oldLink);
    symlinkSync(newHarnessPath, newLink);

    const oldExit = runNode(oldLink, parent);
    const newExit = runNode(newLink, parent);
    console.log(
      `node <symlink to a harness using the OLD pre-realpath isMain> exit code: ${oldExit} (expect 1 — demonstrates the symlink bug: main() is silently skipped)`,
    );
    console.log(
      `node <symlink to a harness using the FIXED lib/isMain.mjs> exit code: ${newExit} (expect 0 — confirms the fix: main() still runs through the symlink)`,
    );

    if (configExit === 0) {
      console.log(
        "FAIL - check-config.mjs's main() was silently skipped when invoked through a symlink",
      );
      return false;
    }
    if (oldExit !== 1) {
      console.log("FAIL - expected the OLD isMain harness to demonstrate the symlink bug (exit 1) but it didn't");
      return false;
    }
    if (newExit !== 0) {
      console.log("FAIL - the FIXED isMain (lib/isMain.mjs) did not detect main() through a symlink");
      return false;
    }

    console.log("ok - check-config.mjs and the fixed isMain.mjs both run main() through a symlinked entry point");
    return true;
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

function checkSpacePathGuard() {
  const parent = mkdtempSync(join(tmpdir(), "wc3-space-guard-"));
  const spacedDir = join(parent, "has a space");

  try {
    copyRepoInto(spacedDir);
    breakVersion(spacedDir);

    const configExit = runNode("scripts/check-config.mjs", spacedDir);
    const releaseExit = runNode("scripts/check-release.mjs", spacedDir);

    console.log(`node scripts/check-config.mjs exit code under a spaced path: ${configExit} (expect non-zero)`);
    console.log(
      `node scripts/check-release.mjs (no tag) exit code under a spaced path: ${releaseExit} (expect non-zero)`,
    );

    if (configExit === 0 || releaseExit === 0) {
      console.log(
        "FAIL - main() was silently skipped under a path containing a space (the old import.meta.url === `file://${process.argv[1]}` guard regression)",
      );
      return false;
    }

    console.log("ok - both scripts exit non-zero when invoked from a path containing a space");
    return true;
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

function main() {
  const spaceOk = checkSpacePathGuard();
  const symlinkOk = checkSymlinkGuard();
  process.exitCode = spaceOk && symlinkOk ? 0 : 1;
}

main();
