/**
 * The overlay's own version, read straight from `package.json` instead of
 * being hand-duplicated into a constant — Tauri's `tauri.conf.json` and
 * `Cargo.toml` versions are kept in lockstep with this one by convention
 * (see `docs/overlay.md`), but this file only needs the JS-visible value.
 *
 * F002: used as `currentVersion` in the browser host's mock update payload
 * (`host/browser.ts`) and as the version shown by Settings' "You're on the
 * latest version (x.y.z)" line when a check finds nothing newer.
 */
import pkg from "../package.json";

export const APP_VERSION: string = pkg.version;
