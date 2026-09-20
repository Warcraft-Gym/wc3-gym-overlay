#!/usr/bin/env node
/**
 * Verifies a tagged overlay GitHub release actually shipped a working
 * signed updater manifest (F001, C-901/C-908) — not just that the workflow
 * ran, but that `latest.json` exists, has the shape the updater plugin
 * expects, and every asset it (and the release) points at is actually
 * downloadable. Uses `gh api` (already required by the release workflow)
 * via `child_process`, plus Node's built-in `fetch`. No other deps.
 */

import { execFileSync } from "node:child_process";

const REPO = "Warcraft-Gym/wc3-gnl-website";

// Version-less "stable name" assets the workflow publishes alongside the
// versioned ones so the site's download links never need updating.
const REQUIRED_STABLE_ASSETS = [
  "Warcraft-3-Gym-Overlay-Portable.exe",
  "Warcraft-3-Gym-Overlay-Setup.exe",
];

const USAGE = `Usage: node check-release.mjs <tag>

Verifies a tagged overlay GitHub release (e.g. overlay-v0.4.0) shipped a
valid signed updater manifest (latest.json) plus the stable-name portable
and setup assets, and that every referenced asset URL is downloadable.

Prints "ok - <check>" / "FAIL - <check>" lines and exits 1 if any check
fails, 0 if every check passes.
`;

let failed = false;

function report(name, ok, detail) {
  if (ok) {
    console.log(`ok - ${name}`);
  } else {
    failed = true;
    console.log(`FAIL - ${name}${detail ? `: ${detail}` : ""}`);
  }
}

/** Runs `gh api <path>` and parses the JSON response. Throws on a non-zero
 *  exit (e.g. the tag has no release, or `gh` isn't authenticated) — the
 *  caller decides how to report that without crashing the process. */
function ghApi(path) {
  const out = execFileSync("gh", ["api", path], { encoding: "utf8" });
  return JSON.parse(out);
}

/** True when `url` responds 200 (direct) or 302 (redirect, e.g. to S3) to
 *  a HEAD request — the shape a GitHub release asset download URL takes.
 *  Never throws: a network failure just reports as "not ok". */
async function headOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    return res.status === 200 || res.status === 302;
  } catch {
    return false;
  }
}

function checkMacPlatform(platforms, key, urlsToCheck) {
  const mac = platforms[key];
  if (!mac) {
    report(`platforms["${key}"] present`, false);
    return;
  }
  report(
    `platforms["${key}"] url ends with .app.tar.gz`,
    typeof mac.url === "string" && mac.url.endsWith(".app.tar.gz"),
    `found: ${mac.url}`,
  );
  report(
    `platforms["${key}"] signature is non-empty`,
    typeof mac.signature === "string" && mac.signature.length > 0,
  );
  if (typeof mac.url === "string") urlsToCheck.push(mac.url);
}

function checkManifest(manifest, tag, urlsToCheck) {
  const expectedVersion = tag.replace(/^overlay-v/, "");
  report(
    `latest.json version equals "${expectedVersion}"`,
    manifest.version === expectedVersion,
    `found: ${JSON.stringify(manifest.version)}`,
  );

  const platforms = manifest.platforms ?? {};

  const windows = platforms["windows-x86_64"];
  if (windows) {
    report(
      'platforms["windows-x86_64"] url ends with -setup.exe or .nsis.zip',
      typeof windows.url === "string" &&
        (windows.url.endsWith("-setup.exe") || windows.url.endsWith(".nsis.zip")),
      `found: ${windows.url}`,
    );
    report(
      'platforms["windows-x86_64"] signature is non-empty',
      typeof windows.signature === "string" && windows.signature.length > 0,
    );
    if (typeof windows.url === "string") urlsToCheck.push(windows.url);
  } else {
    report('platforms["windows-x86_64"] present', false);
  }

  // tauri-action can emit either two per-arch macOS keys or a single
  // "darwin-universal" key depending on the build target — accept both
  // shapes rather than failing on whichever one this run didn't produce.
  if (platforms["darwin-universal"]) {
    console.log(
      "note: release manifest uses a single darwin-universal platform key instead of darwin-aarch64/darwin-x86_64 — accepting that shape",
    );
    checkMacPlatform(platforms, "darwin-universal", urlsToCheck);
  } else {
    checkMacPlatform(platforms, "darwin-aarch64", urlsToCheck);
    checkMacPlatform(platforms, "darwin-x86_64", urlsToCheck);
  }
}

async function main() {
  const tag = process.argv[2];

  if (tag === "--help" || tag === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  if (!tag) {
    console.error(USAGE);
    process.exit(1);
  }

  let release;
  try {
    release = ghApi(`repos/${REPO}/releases/tags/${tag}`);
  } catch (err) {
    report(`release "${tag}" exists`, false, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const assets = release.assets ?? [];
  const assetByName = new Map(assets.map((a) => [a.name, a]));
  const urlsToCheck = [];

  for (const name of REQUIRED_STABLE_ASSETS) {
    const asset = assetByName.get(name);
    report(`release asset "${name}" exists`, Boolean(asset));
    if (asset) urlsToCheck.push(asset.browser_download_url);
  }

  const latestJsonAsset = assetByName.get("latest.json");
  report("latest.json asset present on the release", Boolean(latestJsonAsset));

  let manifest = null;
  if (latestJsonAsset) {
    try {
      const res = await fetch(latestJsonAsset.browser_download_url);
      manifest = await res.json();
    } catch (err) {
      report(
        "latest.json downloads and parses as JSON",
        false,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (manifest) {
    checkManifest(manifest, tag, urlsToCheck);
  }

  for (const url of urlsToCheck) {
    const ok = await headOk(url);
    report(`HEAD ${url}`, ok);
  }

  process.exit(failed ? 1 : 0);
}

main();
