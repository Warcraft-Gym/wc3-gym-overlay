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
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function main() {
  const parent = mkdtempSync(join(tmpdir(), "wc3-space-guard-"));
  const spacedDir = join(parent, "has a space");

  try {
    copyRepoInto(spacedDir);

    const confPath = join(spacedDir, "src-tauri/tauri.conf.json");
    const conf = JSON.parse(readFileSync(confPath, "utf8"));
    conf.version = "not-a-valid-semver";
    writeFileSync(confPath, JSON.stringify(conf, null, 2));

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
      process.exitCode = 1;
      return;
    }

    console.log("ok - both scripts exit non-zero when invoked from a path containing a space");
    process.exitCode = 0;
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

main();
