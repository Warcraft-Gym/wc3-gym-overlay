#!/usr/bin/env node
/**
 * Verifies a tagged overlay GitHub release actually shipped a working
 * signed updater manifest (F001, C-901/C-908) – not just that the workflow
 * ran, but that `latest.json` exists, has the shape the updater plugin
 * expects, and every asset it (and the release) points at is actually
 * downloadable. Uses `gh api` (already required by the release workflow)
 * via `child_process`, plus Node's built-in `fetch`. No other deps.
 *
 * F002: a tag whose version has a semver prerelease part (`overlay-vX.Y.Z-*`)
 * publishes a GitHub pre-release instead – never Latest, and without the
 * stable-named installers. That path gets its own, narrower set of checks;
 * see `runPrereleaseChecks` below.
 *
 * All GitHub access goes through the injectable `ghApi`/`fetchFn`
 * parameters on `runChecks` (defaulting to the real `gh api` call and the
 * global `fetch`), so the check logic can be unit-tested with mocked
 * responses – see `check-release.test.mjs`.
 */

import { execFileSync } from "node:child_process";

export const REPO = "Warcraft-Gym/wc3-gym-overlay";

// Version-less "stable name" assets the workflow publishes alongside the
// versioned ones so the site's download links never need updating. Only
// ever uploaded for stable tags – a prerelease tag must NOT carry these.
export const REQUIRED_STABLE_ASSETS = [
  "Warcraft-3-Gym-Overlay-Portable.exe",
  "Warcraft-3-Gym-Overlay-Setup.exe",
];

const USAGE = `Usage: node check-release.mjs <tag>

Verifies a tagged overlay GitHub release (e.g. overlay-v0.4.0) shipped a
valid signed updater manifest (latest.json) plus the stable-name portable
and setup assets, and that every referenced asset URL is downloadable.

A tag whose version has a semver prerelease part (e.g.
overlay-v0.6.0-beta.1) is checked as a pre-release instead: it must not be
marked Latest, must not carry the stable-named installers, and
/releases/latest must still resolve to a stable tag.

Prints "ok - <check>" / "FAIL - <check>" lines and exits 1 if any check
fails, 0 if every check passes.
`;

/** True when `tag`'s version part (after the `overlay-v` prefix) contains
 *  a semver prerelease ("-beta.1", "-rc.2", ...). */
export function isPrereleaseTag(tag) {
  return versionFromTag(tag).includes("-");
}

export function versionFromTag(tag) {
  return tag.replace(/^overlay-v/, "");
}

/** Runs `gh api <path>` and parses the JSON response. Throws on a non-zero
 *  exit (e.g. the tag has no release, or `gh` isn't authenticated) – the
 *  caller decides how to report that without crashing the process. */
function defaultGhApi(path) {
  const out = execFileSync("gh", ["api", path], { encoding: "utf8" });
  return JSON.parse(out);
}

function makeReporter(log) {
  let failed = false;
  function report(name, ok, detail) {
    if (ok) {
      log(`ok - ${name}`);
    } else {
      failed = true;
      log(`FAIL - ${name}${detail ? `: ${detail}` : ""}`);
    }
  }
  return { report, get failed() { return failed; } };
}

// The updater plugin resolves each platform's `url` itself (fetching it with
// `Accept: application/octet-stream`), so a manifest can legitimately point
// at a GitHub API asset URL (`.../releases/assets/<id>`) instead of a
// browser `browser_download_url` – the id, not the filename, is in the URL.
// Match that shape so we can resolve the real asset name for suffix checks.
const API_ASSET_URL_RE =
  /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/releases\/assets\/(\d+)$/;

/** Builds the stable-tag checker's helpers around an injected `ghApi` /
 *  `fetchFn` pair. Each call gets its own asset-name cache. */
function createStableHelpers({ ghApi, fetchFn, report }) {
  const assetNameCache = new Map();

  /** Returns the filename a platform `url` ultimately serves: for a GitHub
   *  API asset URL (`.../releases/assets/<id>`) this resolves the id via
   *  `ghApi` to get the real `name`; for any other URL it's just the last
   *  path segment. Also reports whether resolution itself succeeded. */
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
        const res = await fetchFn(url, {
          method: "GET",
          redirect: "follow",
          headers: { Accept: "application/octet-stream", Range: "bytes=0-0" },
        });
        return res.status === 200 || res.status === 206 || res.status === 302;
      }
      const res = await fetchFn(url, { method: "HEAD", redirect: "manual" });
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
    const expectedVersion = versionFromTag(tag);
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
    // under its own platform key – check it if the manifest has it, but
    // it's not required, so absence isn't a failure.
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
    // "darwin-universal" key depending on the build target – accept both
    // shapes rather than failing on whichever one this run didn't produce.
    if (platforms["darwin-universal"]) {
      console.log(
        "note: release manifest uses a single darwin-universal platform key instead of darwin-aarch64/darwin-x86_64 – accepting that shape",
      );
      checkMacPlatform(platforms, "darwin-universal", urlsToCheck);
    } else {
      checkMacPlatform(platforms, "darwin-aarch64", urlsToCheck);
      checkMacPlatform(platforms, "darwin-x86_64", urlsToCheck);
    }
  }

  return { resolveAssetName, headOk, checkAssetSuffix, checkMacPlatform, checkManifest };
}

/** Today's checks (unchanged): a stable tag's release must carry the
 *  stable-name assets, a valid latest.json, no stray msi/portable assets,
 *  and every referenced asset URL must be downloadable. */
async function runStableChecks(tag, { ghApi, fetchFn, report }) {
  const { headOk, checkManifest } = createStableHelpers({ ghApi, fetchFn, report });

  let release;
  try {
    release = ghApi(`repos/${REPO}/releases/tags/${tag}`);
  } catch (err) {
    report(`release "${tag}" exists`, false, err instanceof Error ? err.message : String(err));
    return;
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

  // Release-asset trim: the MSI and the versioned portable copy are no
  // longer published (the stable-name portable exe stays) – a regression in
  // the workflow's bundle targets or its "Publish portable Windows exe" step
  // would bring either back.
  const versionedPortableRe = /_\d+\.\d+\.\d+_portable\.exe$/;
  const strayAssets = assets.filter(
    (a) => a.name.endsWith(".msi") || versionedPortableRe.test(a.name),
  );
  report(
    "no msi / versioned portable assets",
    strayAssets.length === 0,
    `found: ${JSON.stringify(strayAssets.map((a) => a.name))}`,
  );

  let manifest = null;
  if (latestJsonAsset) {
    try {
      const res = await fetchFn(latestJsonAsset.browser_download_url);
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
}

/** True when `platforms[key].signature` is present and non-empty. Reports
 *  the platform itself missing as a separate failure. */
function checkPlatformSignaturePresent(platforms, key, report) {
  const platform = platforms[key];
  if (!platform) {
    report(`platforms["${key}"] present`, false);
    return;
  }
  report(
    `platforms["${key}"] signature is non-empty`,
    typeof platform.signature === "string" && platform.signature.length > 0,
  );
}

/** Every platform in a prerelease's latest.json must have a signature –
 *  same acceptance of either darwin-universal or the two per-arch darwin
 *  keys as the stable path, but without the stable path's asset-suffix /
 *  downloadability checks (those don't apply here: the prerelease build
 *  never gets stable-named copies, and the versioned asset names/shapes
 *  are exactly what the stable checks already cover elsewhere). */
function checkPrereleaseManifestSignatures(manifest, report) {
  const platforms = manifest.platforms ?? {};
  checkPlatformSignaturePresent(platforms, "windows-x86_64", report);
  if (platforms["darwin-universal"]) {
    checkPlatformSignaturePresent(platforms, "darwin-universal", report);
  } else {
    checkPlatformSignaturePresent(platforms, "darwin-aarch64", report);
    checkPlatformSignaturePresent(platforms, "darwin-x86_64", report);
  }
}

/** F002: a prerelease tag's release must exist, be marked prerelease (and
 *  not draft), never be the release GET /releases/latest returns, ship a
 *  latest.json whose version matches the tag with a signature for every
 *  platform, and /releases/latest itself must still resolve to a stable
 *  overlay-v* tag (not this prerelease, not anything else non-stable). */
async function runPrereleaseChecks(tag, { ghApi, fetchFn, report }) {
  let release;
  try {
    release = ghApi(`repos/${REPO}/releases/tags/${tag}`);
  } catch (err) {
    report(`release "${tag}" exists`, false, err instanceof Error ? err.message : String(err));
    return;
  }
  report(`release "${tag}" exists`, true);

  report("release.prerelease === true", release.prerelease === true, `found: ${release.prerelease}`);
  report("release.draft === false", release.draft === false, `found: ${release.draft}`);

  let latestRelease = null;
  try {
    latestRelease = ghApi(`repos/${REPO}/releases/latest`);
  } catch (err) {
    report(
      "GET /repos/{repo}/releases/latest succeeds",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  if (latestRelease) {
    report(
      "release is not the one returned by GET /releases/latest",
      latestRelease.id !== release.id,
      `latest tag: ${latestRelease.tag_name}`,
    );
    const latestTagName = latestRelease.tag_name;
    const latestIsStableOverlayTag =
      typeof latestTagName === "string" &&
      latestTagName.startsWith("overlay-v") &&
      !isPrereleaseTag(latestTagName);
    report(
      "/releases/latest resolves to a stable overlay-v* tag",
      latestIsStableOverlayTag,
      `found: ${latestTagName}`,
    );
  }

  const assets = release.assets ?? [];
  const assetByName = new Map(assets.map((a) => [a.name, a]));
  const latestJsonAsset = assetByName.get("latest.json");
  report("latest.json asset present on the release", Boolean(latestJsonAsset));

  if (!latestJsonAsset) return;

  let manifest;
  try {
    const res = await fetchFn(latestJsonAsset.browser_download_url);
    manifest = await res.json();
  } catch (err) {
    report(
      "latest.json downloads and parses as JSON",
      false,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  const expectedVersion = versionFromTag(tag);
  report(
    `latest.json version equals "${expectedVersion}"`,
    manifest.version === expectedVersion,
    `found: ${JSON.stringify(manifest.version)}`,
  );

  checkPrereleaseManifestSignatures(manifest, report);
}

/** Runs every check for `tag` against the injected (or real, by default)
 *  GitHub access functions. Returns `true` if any check failed. Exported
 *  so `check-release.test.mjs` can drive it with mocked `ghApi`/`fetchFn`
 *  instead of hitting the network. */
export async function runChecks(tag, { ghApi = defaultGhApi, fetchFn = fetch, log = console.log } = {}) {
  const reporter = makeReporter(log);

  if (isPrereleaseTag(tag)) {
    await runPrereleaseChecks(tag, { ghApi, fetchFn, report: reporter.report });
  } else {
    await runStableChecks(tag, { ghApi, fetchFn, report: reporter.report });
  }

  return reporter.failed;
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

  const failed = await runChecks(tag);
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
