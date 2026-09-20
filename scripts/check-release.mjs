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

// The updater plugin resolves each platform's `url` itself (fetching it with
// `Accept: application/octet-stream`), so a manifest can legitimately point
// at a GitHub API asset URL (`.../releases/assets/<id>`) instead of a
// browser `browser_download_url` — the id, not the filename, is in the URL.
// Match that shape so we can resolve the real asset name for suffix checks.
const API_ASSET_URL_RE =
  /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/releases\/assets\/(\d+)$/;

const assetNameCache = new Map();

/** Returns the filename a platform `url` ultimately serves: for a GitHub API
 *  asset URL (`.../releases/assets/<id>`) this resolves the id via `gh api`
 *  to get the real `name`; for any other URL it's just the last path
 *  segment. Also reports whether resolution itself succeeded. */
function resolveAssetName(url) {
  if (typeof url !== "string") return { name: null, isApiUrl: false, resolved: false };

  const match = url.match(API_ASSET_URL_RE);
  if (!match) {
    const name = url.split("/").pop() ?? "";
    return { name, isApiUrl: false, resolved: true };
  }

  if (assetNameCache.has(url)) {
    return { name: assetNameCache.get(url), isApiUrl: true, resolved: true };
  }

  const [, owner, repo, id] = match;
  try {
    const asset = ghApi(`repos/${owner}/${repo}/releases/assets/${id}`);
    assetNameCache.set(url, asset.name);
    return { name: asset.name, isApiUrl: true, resolved: true };
  } catch (err) {
    console.log(
      `note: failed to resolve asset name for ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { name: null, isApiUrl: true, resolved: false };
  }
}

/** True when `url` responds with a downloadable-looking status. GitHub API
 *  asset URLs (`.../releases/assets/<id>`) require `Accept:
 *  application/octet-stream` to serve the binary (per the updater plugin's
 *  own request shape) and redirect to the actual storage backend, so those
 *  are checked with a ranged GET, following redirects, expecting 200/206.
 *  Plain browser download URLs keep the cheaper HEAD check (200/302,
 *  redirect left unfollowed). Never throws: a network failure just reports
 *  as "not ok". */
async function headOk(url, isApiUrl) {
  try {
    if (isApiUrl) {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { Accept: "application/octet-stream", Range: "bytes=0-0" },
      });
      return res.status === 200 || res.status === 206 || res.status === 302;
    }
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    return res.status === 200 || res.status === 302;
  } catch {
    return false;
  }
}

function checkAssetSuffix(key, url, expectedSuffixes, urlsToCheck) {
  const { name, isApiUrl, resolved } = resolveAssetName(url);
  if (!resolved) {
    report(`platforms["${key}"] asset name resolves`, false, `url: ${url}`);
    return;
  }
  console.log(`note: platforms["${key}"] resolves to asset "${name}"`);
  report(
    `platforms["${key}"] asset name ends with ${expectedSuffixes.join(" or ")}`,
    typeof name === "string" && expectedSuffixes.some((suffix) => name.endsWith(suffix)),
    `found: ${name}`,
  );
  urlsToCheck.push({ url, isApiUrl });
}

function checkMacPlatform(platforms, key, urlsToCheck) {
  const mac = platforms[key];
  if (!mac) {
    report(`platforms["${key}"] present`, false);
    return;
  }
  if (typeof mac.url === "string") {
    checkAssetSuffix(key, mac.url, [".app.tar.gz"], urlsToCheck);
  } else {
    report(`platforms["${key}"] url ends with .app.tar.gz`, false, `found: ${mac.url}`);
  }
  report(
    `platforms["${key}"] signature is non-empty`,
    typeof mac.signature === "string" && mac.signature.length > 0,
  );
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
    if (typeof windows.url === "string") {
      checkAssetSuffix(
        "windows-x86_64",
        windows.url,
        ["-setup.exe", ".nsis.zip"],
        urlsToCheck,
      );
    } else {
      report(
        'platforms["windows-x86_64"] url ends with -setup.exe or .nsis.zip',
        false,
        `found: ${windows.url}`,
      );
    }
    report(
      'platforms["windows-x86_64"] signature is non-empty',
      typeof windows.signature === "string" && windows.signature.length > 0,
    );
  } else {
    report('platforms["windows-x86_64"] present', false);
  }

  // Some workflow runs also publish an MSI alongside the NSIS installer
  // under its own platform key — check it if the manifest has it, but it's
  // not required, so absence isn't a failure.
  const windowsMsi = platforms["windows-x86_64-msi"];
  if (windowsMsi) {
    if (typeof windowsMsi.url === "string") {
      checkAssetSuffix("windows-x86_64-msi", windowsMsi.url, [".msi"], urlsToCheck);
    } else {
      report(
        'platforms["windows-x86_64-msi"] url ends with .msi',
        false,
        `found: ${windowsMsi.url}`,
      );
    }
    report(
      'platforms["windows-x86_64-msi"] signature is non-empty',
      typeof windowsMsi.signature === "string" && windowsMsi.signature.length > 0,
    );
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
    if (asset) urlsToCheck.push({ url: asset.browser_download_url, isApiUrl: false });
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

  for (const { url, isApiUrl } of urlsToCheck) {
    const ok = await headOk(url, isApiUrl);
    report(`${isApiUrl ? "GET" : "HEAD"} ${url}`, ok);
  }

  process.exit(failed ? 1 : 0);
}

main();
