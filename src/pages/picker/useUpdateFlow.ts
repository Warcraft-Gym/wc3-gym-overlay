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

export function useUpdateFlow(skippedVersion: string | null): UpdateFlow {
  const [state, setState] = useState<UpdateFlowState>({ kind: "idle" });

  const checkAuto = useCallback(async () => {
    try {
      const info = await host.checkForUpdate();
      if (!info) return;
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
