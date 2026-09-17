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
const CAPS_DIR = join(ROOT, "src-tauri/capabilities");
const SCHEMA_PATH = join(ROOT, "src-tauri/gen/schemas/desktop-schema.json");
const DIST_DIR = join(ROOT, "dist");

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
  } else {
    report("overlay window declared", false, "missing");
  }

  const picker = findWindow(conf, "picker");
  if (picker) {
    report("picker.decorations true or absent", picker.decorations === true || picker.decorations === undefined);
    report("picker.visible === true", picker.visible === true);
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

  process.exit(failed ? 1 : 0);
}

main();
