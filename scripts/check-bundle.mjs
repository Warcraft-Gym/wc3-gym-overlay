#!/usr/bin/env node
/**
 * Enforces C-606: the w3gjs replay parser (plus its protobufjs/fflate/Buffer
 * deps and our `src/replay/**`) must stay behind the `import("./replay/
 * parseReplay")` boundary in `ReplayImportModal.tsx` — never eagerly loaded
 * by `picker.html` or `overlay.html`. Run after `build`, against `dist/`.
 *
 * Checks (any failure -> exit 1, prefixed "FAIL - "):
 *   1. No `dist/*.html` references a chunk matching /replay|w3g/i via
 *      `<script src>` or `<link rel="modulepreload">`.
 *   2. No non-replay `dist/assets/*.js` contains a *static* import of a
 *      replay chunk (`import"./replay-`/`from"./replay-`). Dynamic
 *      `import("./replay-...")` — the split point rollup generates for our
 *      dynamic `import()` boundary — is expected and fine.
 *   3. The replay-magic string "Warcraft III recorded game" does not leak
 *      into a non-replay chunk (would mean parseReplay.ts got inlined).
 *   4. Gzip budgets: main <= 135000 bytes, replay <= 260000 bytes.
 *
 * Prints the gzip `{ main, replay, total }` byte counts either way.
 */

import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = join(ROOT, "dist");
const ASSETS_DIR = join(DIST_DIR, "assets");

const MAIN_BUDGET_BYTES = 135_000;
const REPLAY_BUDGET_BYTES = 260_000;

const REPLAY_CHUNK_RE = /replay|w3g/i;
const REPLAY_FILE_RE = /^replay/i;
const STATIC_REPLAY_IMPORT_RE = /(?:^|[;,(])\s*(?:import|from)\s*"\.\/replay-/;
const REPLAY_MAGIC_STRING = "Warcraft III recorded game";

const failures = [];

function fail(message) {
  failures.push(message);
}

function listHtmlEntries() {
  return readdirSync(DIST_DIR).filter((f) => f.endsWith(".html"));
}

function listAssetJsFiles() {
  return readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"));
}

// --- Check 1: no HTML entry references a replay-ish chunk eagerly. ---
function checkHtmlEntries() {
  for (const file of listHtmlEntries()) {
    const html = readFileSync(join(DIST_DIR, file), "utf8");
    const refs = [
      ...html.matchAll(/<script[^>]*\ssrc="\.\/assets\/([^"]+)"/g),
      ...html.matchAll(/<link[^>]*\srel="modulepreload"[^>]*\shref="\.\/assets\/([^"]+)"/g),
    ].map((m) => m[1]);
    for (const ref of refs) {
      if (REPLAY_CHUNK_RE.test(ref)) {
        fail(`${file} eagerly references replay chunk "${ref}" (script src or modulepreload)`);
      }
    }
  }
}

// --- Checks 2 & 3: non-replay chunks must not statically pull in replay
// code or contain the replay-magic string. ---
function checkAssetChunks(assetFiles) {
  for (const file of assetFiles) {
    if (REPLAY_FILE_RE.test(file)) continue; // the replay chunk itself is allowed anything.
    const contents = readFileSync(join(ASSETS_DIR, file), "utf8");
    if (STATIC_REPLAY_IMPORT_RE.test(contents)) {
      fail(`${file} statically imports a replay chunk (should be dynamic import() only)`);
    }
    if (contents.includes(REPLAY_MAGIC_STRING)) {
      fail(`${file} contains the replay-magic string — parseReplay.ts leaked into a non-replay chunk`);
    }
  }
}

// --- Check 4: gzip budgets. ---
function gzipSize(file) {
  return gzipSync(readFileSync(join(ASSETS_DIR, file))).length;
}

function computeGzipTotals(assetFiles) {
  let main = 0;
  let replay = 0;
  for (const file of assetFiles) {
    const size = gzipSize(file);
    if (REPLAY_FILE_RE.test(file)) {
      replay += size;
    } else {
      main += size;
    }
  }
  return { main, replay, total: main + replay };
}

const assetFiles = listAssetJsFiles();
checkHtmlEntries();
checkAssetChunks(assetFiles);
const { main, replay, total } = computeGzipTotals(assetFiles);

if (main > MAIN_BUDGET_BYTES) {
  fail(`main gzip ${main}B exceeds budget ${MAIN_BUDGET_BYTES}B`);
}
if (replay > REPLAY_BUDGET_BYTES) {
  fail(`replay gzip ${replay}B exceeds budget ${REPLAY_BUDGET_BYTES}B`);
}

console.log(`gzip: { main: ${main}, replay: ${replay}, total: ${total} }`);

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`FAIL - ${message}`);
  }
  process.exit(1);
}

console.log("PASS - replay bundle stays behind the dynamic import boundary");
