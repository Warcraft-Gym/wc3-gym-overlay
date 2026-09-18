import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "../../components/Button";
import { DEFAULT_SHORTCUTS } from "../../config";
import type { ShortcutAction, ShortcutMap, ShortcutRegistrationResult } from "../../host/bridge";
import { comboFromKeyboardEvent, explainRefusal } from "../../lib/combo";
import { applyShortcuts, formatCombo } from "../../shortcuts";
import { SETTINGS } from "../../store/keys";
import { updateKey } from "../../store/state";

const ACTION_LABEL: Record<ShortcutAction, string> = {
  toggle_overlay: "Toggle overlay",
  timer_play_pause: "Play / pause timer",
  timer_reset: "Reset timer",
  step_next: "Next step",
  step_prev: "Previous step",
};

const ACTIONS = Object.keys(ACTION_LABEL) as ShortcutAction[];

/**
 * Five shortcut rows. "Change" captures the next keydown as the new combo
 * (Escape cancels, without letting the keypress bubble to the Settings
 * dialog's own Escape-to-close handler); any change re-registers every
 * shortcut immediately, so a row whose combo is already owned by another
 * app shows its warning right away rather than only on the next launch. A
 * refused press (a plain letter/digit with no modifier, and not a
 * standalone key like F9) explains why inline instead of silently doing
 * nothing.
 */
export function ShortcutEditor({
  shortcuts,
  registrations,
  onRegistrations,
}: {
  shortcuts: ShortcutMap;
  registrations: ShortcutRegistrationResult[];
  onRegistrations: (results: ShortcutRegistrationResult[]) => void;
}) {
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const resultByAction = new Map(registrations.map((r) => [r.action, r]));
  const hasFailure = registrations.some((r) => !r.registered);

  async function commit(next: ShortcutMap) {
    await updateKey(SETTINGS, (s) => ({ ...s, shortcuts: next }));
    onRegistrations(await applyShortcuts());
  }

  function startCapturing(action: ShortcutAction) {
    setCapturing(action);
    setRefusal(null);
  }

  function handleCaptureKeyDown(action: ShortcutAction, event: ReactKeyboardEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (event.key === "Escape") {
      // Stop the native event here so the Settings Modal's own
      // document-level Escape handler never sees it — otherwise cancelling
      // a capture also closes the whole dialog.
      event.nativeEvent.stopPropagation();
      setCapturing(null);
      setRefusal(null);
      return;
    }
    const combo = comboFromKeyboardEvent(event.nativeEvent);
    if (!combo) {
      setRefusal(explainRefusal(event.nativeEvent));
      return;
    }
    setCapturing(null);
    setRefusal(null);
    void commit({ ...shortcuts, [action]: combo });
  }

  function resetToDefaults() {
    setCapturing(null);
    setRefusal(null);
    void commit({ ...DEFAULT_SHORTCUTS });
  }

  async function reregister() {
    onRegistrations(await applyShortcuts());
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {ACTIONS.map((action) => {
          const result = resultByAction.get(action);
          const isCapturing = capturing === action;
          return (
            <li key={action} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-fg">{ACTION_LABEL[action]}</span>
                <div className="flex items-center gap-2">
                  <kbd className="tnum rounded border border-line bg-surface-2 px-2 py-1 text-xs text-muted">
                    {isCapturing ? "Press keys… (Esc to cancel)" : formatCombo(shortcuts[action])}
                  </kbd>
                  <Button
                    variant="ghost"
                    onClick={() => startCapturing(action)}
                    onKeyDown={isCapturing ? (e) => handleCaptureKeyDown(action, e) : undefined}
                  >
                    {isCapturing ? "Waiting…" : "Change"}
                  </Button>
                </div>
              </div>
              {isCapturing && refusal ? (
                <p role="status" className="mt-1 text-[0.7rem] text-loss">
                  {refusal}
                </p>
              ) : null}
              {result && !result.registered ? (
                <p role="alert" className="mt-1 text-[0.7rem] text-loss">
                  {result.error ? `Not registered: ${result.error}` : "Not registered — another app may own this combo"}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" onClick={resetToDefaults}>
          Reset to defaults
        </Button>
        {hasFailure ? (
          <Button variant="ghost" onClick={() => void reregister()}>
            Re-register
          </Button>
        ) : null}
      </div>
    </div>
  );
}
