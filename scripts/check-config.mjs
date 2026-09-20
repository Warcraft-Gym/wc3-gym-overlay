#!/usr/bin/env node
/**
 * Validates `src-tauri/tauri.conf.json` and `src-tauri/capabilities/*.json`
 * against the mission's window/permission requirements (C-011). No deps —
 * plain Node + fs. Prints one line per rule and exits 1 on any failure.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONF_PATH = join(ROOT, "src-tauri/tauri.conf.json");
const PKG_PATH = join(ROOT, "package.json");
const CONFIG_TS_PATH = join(ROOT, "src/config.ts");
const CAPS_DIR = join(ROOT, "src-tauri/capabilities");
const SCHEMA_PATH = join(ROOT, "src-tauri/gen/schemas/desktop-schema.json");
const DIST_DIR = join(ROOT, "dist");
const CARGO_TOML_PATH = join(ROOT, "src-tauri/Cargo.toml");
const LIB_RS_PATH = join(ROOT, "src-tauri/src/lib.rs");

const REQUIRED_CAPABILITY_IDENTIFIERS = [
  "core:window:allow-start-dragging",
  "core:window:allow-show",
  "core:window:allow-hide",
  "core:window:allow-set-always-on-top",
  "core:event:default",
  "global-shortcut:allow-register",
  "global-shortcut:allow-unregister",
  "global-shortcut:allow-is-registered",
  "opener:allow-open-url",
  // F004: export/import private builds via the native dialog + fs plugins.
  "dialog:allow-save",
  "dialog:allow-open",
  "fs:allow-write-text-file",
  "fs:allow-read-text-file",
  // F002: import a `.w3g` replay via the native dialog + scoped binary read.
  "fs:allow-read-file",
];

// F004/F002: identifiers that would grant unscoped filesystem access — a
// single match anywhere in the capability set fails the "no wildcard-all fs
// write/read permission" rule below, regardless of which capability file
// declares it.
const FORBIDDEN_FS_IDENTIFIERS = [
  "fs:default",
  "fs:allow-write-file",
  "fs:allow-write",
  "fs:allow-read",
  "fs:scope",
];

let failed = false;

function report(name, ok, detail) {
  if (ok) {
    console.log(`ok - ${name}`);
  } else {
    failed = true;
    console.log(`FAIL - ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findWindow(conf, label) {
  return (conf.app?.windows ?? []).find((w) => w.label === label);
}

function permissionIdentifiers(caps) {
  return caps.flatMap((cap) =>
    (cap.permissions ?? []).map((p) => (typeof p === "string" ? p : p.identifier)),
  );
}

function openerAllowScopes(caps) {
  return caps.flatMap((cap) =>
    (cap.permissions ?? [])
      .filter((p) => typeof p === "object" && p.identifier === "opener:allow-open-url")
      .flatMap((p) => p.allow ?? []),
  );
}

/** F002-followup-1: turns a Tauri opener/fs scope glob (`*` = any chars,
 *  everything else literal) into a RegExp anchored to the whole string. */
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** F002-followup-1: pulls the literal string value of `export const NAME =
 *  "...";` out of `src/config.ts` via regex — no TS import, since this
 *  script runs under plain Node. */
function configStringLiteral(source, name) {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*"([^"]+)"`));
  return match?.[1];
}

/** F004: the `allow` path list for a given fs permission identifier (e.g.
 *  `fs:allow-write-text-file`), across every capability file. */
function fsAllowScopes(caps, identifier) {
  return caps.flatMap((cap) =>
    (cap.permissions ?? [])
      .filter((p) => typeof p === "object" && p.identifier === identifier)
      .flatMap((p) => p.allow ?? []),
  );
}

function knownSchemaIdentifiers() {
  if (!existsSync(SCHEMA_PATH)) return null; // unknown — skip the "exists in schema" check
  const schema = readJson(SCHEMA_PATH);
  // Tauri's generated ACL schema lists every valid identifier as a `const`
  // entry inside `definitions.Identifier.oneOf`.
  const oneOf = schema?.definitions?.Identifier?.oneOf;
  if (!Array.isArray(oneOf)) return null;
  const identifiers = oneOf.map((entry) => entry.const).filter((v) => typeof v === "string");
  return identifiers.length > 0 ? identifiers : null;
}

function main() {
  const conf = readJson(CONF_PATH);
  const pkg = readJson(PKG_PATH);
  const capFiles = readdirSync(CAPS_DIR).filter((f) => f.endsWith(".json"));
  const caps = capFiles.map((f) => readJson(join(CAPS_DIR, f)));

  const windows = conf.app?.windows ?? [];
  const labels = windows.map((w) => w.label).sort();
  report(
    "windows are exactly picker and overlay",
    labels.length === 2 && labels[0] === "overlay" && labels[1] === "picker",
    `found: ${JSON.stringify(labels)}`,
  );

  const overlay = findWindow(conf, "overlay");
  if (overlay) {
    report("overlay.transparent === true", overlay.transparent === true);
    report("overlay.decorations === false", overlay.decorations === false);
    report("overlay.alwaysOnTop === true", overlay.alwaysOnTop === true);
    report("overlay.skipTaskbar === true", overlay.skipTaskbar === true);
    report("overlay.resizable === true", overlay.resizable === true);
    report("overlay.visible === false", overlay.visible === false);
    report("overlay.minWidth >= 280", (overlay.minWidth ?? 0) >= 280);
    report("overlay.minHeight >= 240", (overlay.minHeight ?? 0) >= 240);
    // F001: the overlay must never take keyboard focus — an activated
    // overlay steals focus from Warcraft III and pauses the game.
    report("overlay.focusable === false", overlay.focusable === false);
    report("overlay.focus === false", overlay.focus === false);
    report("overlay.acceptFirstMouse === true", overlay.acceptFirstMouse === true);
  } else {
    report("overlay window declared", false, "missing");
  }

  const picker = findWindow(conf, "picker");
  if (picker) {
    report("picker.decorations true or absent", picker.decorations === true || picker.decorations === undefined);
    report("picker.visible === true", picker.visible === true);
    report("picker.focusable !== false", picker.focusable !== false);
  } else {
    report("picker window declared", false, "missing");
  }

  report("app.macOSPrivateApi === true", conf.app?.macOSPrivateApi === true);
  report("identifier === gym.warcraft3.overlay", conf.identifier === "gym.warcraft3.overlay");
  report(
    "version matches package.json",
    conf.version === pkg.version,
    `conf=${conf.version} pkg=${pkg.version}`,
  );

  if (existsSync(DIST_DIR)) {
    for (const w of windows) {
      const distFile = join(DIST_DIR, w.url ?? "");
      report(`app.windows[].url "${w.url}" exists in dist/`, existsSync(distFile));
    }
  } else {
    console.log("note: dist/ absent — skipping the windows[].url-exists-in-dist rule (run after build)");
  }

  const knownIdentifiers = knownSchemaIdentifiers();
  const declaredIdentifiers = permissionIdentifiers(caps);
  for (const required of REQUIRED_CAPABILITY_IDENTIFIERS) {
    if (knownIdentifiers && !knownIdentifiers.includes(required)) {
      console.log(`note: "${required}" not present in generated schema — skipping (would fail to build)`);
      continue;
    }
    report(`capabilities include "${required}"`, declaredIdentifiers.includes(required));
  }

  const openerScopes = openerAllowScopes(caps);
  const openerAllowsAll = openerScopes.some((s) => s.url === "*" || s.url === undefined);
  report("opener scope is an explicit allow-list (no wildcard-all)", openerScopes.length > 0 && !openerAllowsAll);

  // F002-followup-1: the update banner's Download (portable) and Releases
  // buttons open these `src/config.ts` URLs directly — the opener ACL must
  // actually cover them, or the native app rejects the call (unit tests mock
  // the opener and can't catch this).
  const configSource = readFileSync(CONFIG_TS_PATH, "utf8");
  const openedUrlNames = ["PORTABLE_DOWNLOAD_URL", "RELEASES_PAGE_URL"];
  const openedUrls = openedUrlNames.map((name) => ({ name, url: configStringLiteral(configSource, name) }));
  const uncoveredUrls = openedUrls.filter(
    ({ url }) => url == null || !openerScopes.some((s) => globToRegExp(s.url).test(url)),
  );
  report(
    "opener scope covers the URLs the app opens",
    uncoveredUrls.length === 0,
    `uncovered: ${JSON.stringify(uncoveredUrls)}`,
  );

  // F004: the fs plugin's write/read-text-file grants must be scoped to the
  // dialog-chosen directories only — never a bare `fs:default` or an
  // unscoped/wildcard write permission that would let the webview touch
  // arbitrary paths on disk.
  const hasForbiddenFsIdentifier = FORBIDDEN_FS_IDENTIFIERS.some((id) => declaredIdentifiers.includes(id));
  report("no fs:default / unscoped wildcard-all fs write permission", !hasForbiddenFsIdentifier);

  for (const identifier of ["fs:allow-write-text-file", "fs:allow-read-text-file", "fs:allow-read-file"]) {
    if (knownIdentifiers && !knownIdentifiers.includes(identifier)) continue;
    const scopes = fsAllowScopes(caps, identifier);
    const isWildcard = scopes.some((s) => s.path === "**" || s.path === "*" || s.path === undefined);
    report(
      `${identifier} scope is a path allow-list (no wildcard-all)`,
      scopes.length > 0 && !isWildcard,
    );
  }

  // F002: `fs:allow-read-file` backs the replay-import dialog — scoped even
  // tighter than the sibling text-file permissions (no `$HOME/**`, which
  // would let the webview read anything under the user's home directory).
  if (!knownIdentifiers || knownIdentifiers.includes("fs:allow-read-file")) {
    const readFileScopes = fsAllowScopes(caps, "fs:allow-read-file");
    const hasHomeWildcard = readFileScopes.some((s) => s.path === "$HOME/**" || s.path === "**");
    report("fs:allow-read-file scope excludes $HOME/** and **", !hasHomeWildcard);
    // F003: macOS stores replays under ~/Library/Application Support/Blizzard,
    // which is Tauri's $DATA — required alongside $DOCUMENT/** (Windows) so the
    // native dialog can actually read a picked replay on both platforms.
    const readFilePaths = readFileScopes.map((s) => s.path);
    report(
      "fs:allow-read-file scope includes $DOCUMENT/** and $DATA/Blizzard/**",
      readFilePaths.includes("$DOCUMENT/**") && readFilePaths.includes("$DATA/Blizzard/**"),
      `found: ${JSON.stringify(readFilePaths)}`,
    );
  }

  // F002: a duplicate process (a second launch alongside a still-running
  // one) is what caused every global shortcut to silently fail to
  // register — the single-instance guard must actually be wired in, not
  // just installed.
  const cargoToml = readFileSync(CARGO_TOML_PATH, "utf8");
  const libRs = readFileSync(LIB_RS_PATH, "utf8");
  report("Cargo.toml lists tauri-plugin-single-instance", /tauri-plugin-single-instance/.test(cargoToml));
  report("lib.rs calls tauri_plugin_single_instance::init", /tauri_plugin_single_instance::init/.test(libRs));

  // F001: releases must ship a signed updater manifest — the updater plugin
  // only produces `latest.json` + signatures when this bundle flag is on.
  report("bundle.createUpdaterArtifacts === true", conf.bundle?.createUpdaterArtifacts === true);

  const updaterEndpoints = conf.plugins?.updater?.endpoints;
  report(
    "exactly one updater endpoint, pointing at the stable /releases/latest/download/latest.json URL",
    Array.isArray(updaterEndpoints) &&
      updaterEndpoints.length === 1 &&
      updaterEndpoints[0] ===
        "https://github.com/Warcraft-Gym/wc3-gnl-website/releases/latest/download/latest.json",
    `found: ${JSON.stringify(updaterEndpoints)}`,
  );

  const updaterPubkey = conf.plugins?.updater?.pubkey;
  report(
    "updater pubkey is a non-empty base64 string",
    typeof updaterPubkey === "string" && /^[A-Za-z0-9+/=\s]{40,}$/.test(updaterPubkey),
  );

  // Release-asset trim: the MSI is dropped from the release (docs/overlay.md
  // "Trim release assets") — a stray "all" or a re-added "msi" target would
  // silently bring it back, so pin the exact target list.
  report(
    "bundle.targets is exactly [\"nsis\",\"app\",\"dmg\"]",
    Array.isArray(conf.bundle?.targets) &&
      JSON.stringify([...conf.bundle.targets].sort()) === JSON.stringify(["app", "dmg", "nsis"]),
    `found: ${JSON.stringify(conf.bundle?.targets)}`,
  );

  report(
    "capabilities include updater:default + process:allow-restart, and not process:default",
    declaredIdentifiers.includes("updater:default") &&
      declaredIdentifiers.includes("process:allow-restart") &&
      !declaredIdentifiers.includes("process:default"),
    `found: ${JSON.stringify(declaredIdentifiers.filter((id) => id.startsWith("updater:") || id.startsWith("process:")))}`,
  );

  process.exit(failed ? 1 : 0);
}

main();
