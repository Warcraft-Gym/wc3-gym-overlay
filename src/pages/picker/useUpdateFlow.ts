/**
 * F002: the picker's update state machine — `idle` → `available` →
 * `installing` (with progress) → `relaunching`, plus an `error` state when
 * the install itself fails. Pure in the sense that every host effect
 * (`checkForUpdate`/`installUpdate`/`relaunch`) is a `Host` call injected
 * through `../../host`, not baked into the reducer, so tests can spy on
 * `host` directly (same pattern as `SettingsModal.exportImport.test.tsx`).
 *
 * Two flows feed this one piece of state:
 * - The launch check (`checkAuto`, called once from `App` after a delay)
 *   is silent: a failure logs `console.warn` and never surfaces UI, and a
 *   result matching `settings.skippedVersion` never opens the banner.
 * - Settings' manual "Check for updates" button runs its own check (see
 *   `SettingsModal.tsx`) and calls `open(info)` — via "Update" / "Update
 *   anyway" — to (re)open the banner for whatever it found, bypassing both
 *   "Later" and a skipped version, since manual intent overrides both.
 */
import { useCallback, useState } from "react";
import { host } from "../../host";
import type { UpdateInfo, UpdateProgress } from "../../host/bridge";
import { SETTINGS } from "../../store/keys";
import { updateKey } from "../../store/state";

export type UpdateFlowState =
  | { kind: "idle" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "installing"; info: UpdateInfo; progress: UpdateProgress }
  | { kind: "relaunching"; info: UpdateInfo }
  | { kind: "error"; info: UpdateInfo; message: string };

export type UpdateFlow = {
  state: UpdateFlowState;
  checkAuto: () => Promise<void>;
  open: (info: UpdateInfo) => void;
  later: () => void;
  skip: () => void;
  install: () => Promise<void>;
};

/** How long the banner sits on "installing, 100%" before actually calling
 *  `host.relaunch()` — see the comment at that call site. */
const RELAUNCH_HOLD_MS = 400;

/** Every non-`idle` state carries the `UpdateInfo` it's about — pulled out
 *  once so `skip`/`install` don't repeat the same `switch`. */
function infoOf(state: UpdateFlowState): UpdateInfo | null {
  return state.kind === "idle" ? null : state.info;
}

/** Numeric dotted-version compare (`"0.4.0"` vs `"0.3.2"`), no pre-release
 *  tags — every version this app ever compares comes from its own
 *  `package.json`/updater feed, both plain `major.minor.patch`. */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** F003: a stored `skippedVersion` goes stale once the running app has
 *  caught up to (or past) it — e.g. the user updated some other way, or the
 *  release that was skipped got superseded. Clearing it here means a later
 *  check for a *different* newer version shows the banner again instead of
 *  silently comparing against a version that no longer means anything. */
function clearStaleSkip(skippedVersion: string | null): void {
  if (skippedVersion === null) return;
  void updateKey(SETTINGS, (s) => ({ ...s, skippedVersion: null }));
}

export function useUpdateFlow(skippedVersion: string | null): UpdateFlow {
  const [state, setState] = useState<UpdateFlowState>({ kind: "idle" });

  const checkAuto = useCallback(async () => {
    try {
      const info = await host.checkForUpdate();
      if (!info) {
        clearStaleSkip(skippedVersion); // no update — current is already latest
        return;
      }
      if (skippedVersion !== null && compareVersions(info.currentVersion, skippedVersion) >= 0) {
        clearStaleSkip(skippedVersion);
      }
      if (info.version === skippedVersion) return; // silent — see module doc
      setState({ kind: "available", info });
    } catch (err) {
      console.warn("[wc3gym] update check failed", err);
    }
  }, [skippedVersion]);

  const open = useCallback((info: UpdateInfo) => {
    setState({ kind: "available", info });
  }, []);

  const later = useCallback(() => {
    setState({ kind: "idle" });
  }, []);

  const skip = useCallback(() => {
    const info = infoOf(state);
    if (!info) return;
    void updateKey(SETTINGS, (s) => ({ ...s, skippedVersion: info.version }));
    setState({ kind: "idle" });
  }, [state]);

  const install = useCallback(async () => {
    const info = infoOf(state);
    if (!info) return;
    setState({ kind: "installing", info, progress: { downloaded: 0, contentLength: null } });
    try {
      await host.installUpdate((progress) => {
        setState((current) => (current.kind === "installing" ? { ...current, progress } : current));
      });
      // Install succeeded — whatever version was previously skipped is now
      // moot; clear it before relaunching so a future check never compares
      // against a stale skip.
      await updateKey(SETTINGS, (s) => ({ ...s, skippedVersion: null }));
      setState({ kind: "relaunching", info });
      // Briefly hold on the completed 100% state before restarting — purely
      // cosmetic (lets the user actually see "Installing…" finish rather
      // than a same-frame jump to the reload/relaunch), not a functional
      // requirement.
      await new Promise((resolve) => setTimeout(resolve, RELAUNCH_HOLD_MS));
      await host.relaunch();
    } catch (err) {
      setState({
        kind: "error",
        info,
        message: "Update failed — try again or download from the releases page",
      });
      console.warn("[wc3gym] update install failed", err);
    }
  }, [state]);

  return { state, checkAuto, open, later, skip, install };
}
