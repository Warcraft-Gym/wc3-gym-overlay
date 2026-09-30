#!/usr/bin/env node
/**
 * Guards against the F005 release failure (0.5.0, run 36781558689): caret
 * ranges in `package.json` let the `@tauri-apps/*` npm packages resolve one
 * minor ahead of the Rust crates pinned in `src-tauri/Cargo.lock`. `tauri
 * build`/`tauri dev` refuse to run when that happens —
 * `check_mismatched_packages` in the Tauri CLI
 * (crates/tauri-cli/src/info/plugins.rs) compares every
 * `tauri`/`tauri-plugin-<name>` crate against its
 * `@tauri-apps/api`/`@tauri-apps/plugin-<name>` npm counterpart and fails
 * unless each pair shares major.minor. This script runs the same
 * comparison from plain Node so CI catches the drift on every PR without
 * compiling Rust.
 *
 * `@tauri-apps/cli` is deliberately NOT part of this check: the Tauri CLI's
 * own mismatch check (linked above) only ever builds its crate/npm name
 * pairs from `tauri` + `tauri-plugin-<name>` — the CLI's own npm package is
 * never compared against any crate version. Inventing that rule here would
 * fail CI over a mismatch `tauri build` itself doesn't care about.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CARGO_LOCK_PATH = join(ROOT, "src-tauri/Cargo.lock");
const NODE_MODULES_DIR = join(ROOT, "node_modules");

/** Crate name <-> npm package name pairs, matching Tauri's own
 *  `check_mismatched_packages`: `tauri` <-> `@tauri-apps/api`, and every
 *  `tauri-plugin-<name>` <-> `@tauri-apps/plugin-<name>`. Discovered from
 *  whatever `tauri-plugin-*` crates are actually present in `Cargo.lock`
 *  and have a matching `@tauri-apps/plugin-*` npm package installed —
 *  Rust-only plugins (no JS API, e.g. `tauri-plugin-single-instance`) are
 *  skipped automatically because they have no npm counterpart to compare. */
function derivePairs(crateVersions) {
  const pairs = [{ crateName: "tauri", npmName: "@tauri-apps/api" }];
  for (const crateName of Object.keys(crateVersions)) {
    const match = crateName.match(/^tauri-plugin-(.+)$/);
    if (!match) continue;
    const npmName = `@tauri-apps/plugin-${match[1]}`;
    if (existsSync(join(NODE_MODULES_DIR, ...npmName.split("/")))) {
      pairs.push({ crateName, npmName });
    }
  }
  return pairs;
}

/** Parses `src-tauri/Cargo.lock`'s `[[package]]` entries into a
 *  `name -> version` map. Cargo.lock is a restricted TOML subset; a small
 *  regex walk avoids pulling in a TOML parser dependency. */
function parseCargoLock(source) {
  const versions = {};
  const packageRe = /\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g;
  let match;
  while ((match = packageRe.exec(source)) !== null) {
    const [, name, version] = match;
    // Cargo.lock can list the same crate name multiple times (different
    // major versions pulled transitively) — keep the first, which is the
    // one `cargo` resolves earliest and matches CLI behavior closely enough
    // for our tauri/tauri-plugin-* crates, which only ever appear once.
    if (!(name in versions)) versions[name] = version;
  }
  return versions;
}

function installedNpmVersion(npmName) {
  const pkgPath = join(NODE_MODULES_DIR, ...npmName.split("/"), "package.json");
  if (!existsSync(pkgPath)) return null;
  return JSON.parse(readFileSync(pkgPath, "utf8")).version;
}

function majorMinor(version) {
  const [major, minor] = version.split(".");
  return `${major}.${minor}`;
}

function main() {
  if (!existsSync(CARGO_LOCK_PATH)) {
    console.log(`FAIL - src-tauri/Cargo.lock not found at ${CARGO_LOCK_PATH}`);
    process.exit(1);
  }
  if (!existsSync(NODE_MODULES_DIR)) {
    console.log("FAIL - node_modules not found — run `pnpm install` first");
    process.exit(1);
  }

  const crateVersions = parseCargoLock(readFileSync(CARGO_LOCK_PATH, "utf8"));
  const pairs = derivePairs(crateVersions);

  const mismatched = [];
  for (const { crateName, npmName } of pairs) {
    const crateVersion = crateVersions[crateName];
    const npmVersion = installedNpmVersion(npmName);
    if (!crateVersion || !npmVersion) {
      console.log(
        `note: skipping ${crateName} <-> ${npmName} — ${!crateVersion ? "crate not in Cargo.lock" : "npm package not installed"}`,
      );
      continue;
    }
    const ok = majorMinor(crateVersion) === majorMinor(npmVersion);
    if (ok) {
      console.log(`ok - ${crateName} (v${crateVersion}) : ${npmName} (v${npmVersion})`);
    } else {
      console.log(`FAIL - ${crateName} (v${crateVersion}) : ${npmName} (v${npmVersion})`);
      mismatched.push({ crateName, crateVersion, npmName, npmVersion });
    }
  }

  if (mismatched.length > 0) {
    console.log(
      "\nFound version mismatched Tauri packages. Make sure the NPM package and Rust crate versions are on the same major/minor releases:",
    );
    for (const { crateName, crateVersion, npmName, npmVersion } of mismatched) {
      console.log(`${crateName} (v${crateVersion}) : ${npmName} (v${npmVersion})`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main();
