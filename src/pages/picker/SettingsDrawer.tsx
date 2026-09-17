import { useState, type KeyboardEvent } from "react";
import { IconButton } from "../../components/IconButton";
import { TextField } from "../../components/TextField";
import type { ShortcutRegistrationResult } from "../../host/bridge";
import { SETTINGS, type Settings } from "../../store/keys";
import { updateKey } from "../../store/state";
import { ShortcutEditor } from "./ShortcutEditor";

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 flex items-center justify-between font-mono uppercase tracking-[0.14em] text-faint">
        <span>{label}</span>
        <span className="tnum text-fg">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-gold"
      />
    </label>
  );
}

/** Settings dialog: API base override, overlay opacity/scale and the
 *  shortcut editor. The API base is only written to the store once it
 *  parses as a valid URL — an invalid draft stays local and shows an
 *  inline error instead of clobbering the working value. */
export function SettingsDrawer({
  settings,
  registrations,
  onRegistrations,
  onClose,
}: {
  settings: Settings;
  registrations: ShortcutRegistrationResult[];
  onRegistrations: (results: ShortcutRegistrationResult[]) => void;
  onClose: () => void;
}) {
  const [apiBaseInput, setApiBaseInput] = useState(settings.apiBase);
  const [apiBaseError, setApiBaseError] = useState<string | null>(null);

  function handleApiBaseChange(value: string) {
    setApiBaseInput(value);
    try {
      const url = new URL(value);
      setApiBaseError(null);
      void updateKey(SETTINGS, (s) => ({ ...s, apiBase: url.toString().replace(/\/$/, "") }));
    } catch {
      setApiBaseError("Enter a valid URL, e.g. https://warcraft3.gym");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") onClose();
  }

  return (
    <div
      role="dialog"
      aria-label="Settings"
      onKeyDown={handleKeyDown}
      className="panel fixed inset-y-0 right-0 z-20 w-full max-w-sm overflow-y-auto p-5 sm:w-96"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base">Settings</h2>
        <IconButton aria-label="Close settings" onClick={onClose}>
          ×
        </IconButton>
      </div>

      <div className="mt-5 space-y-5">
        <TextField
          label="API base"
          value={apiBaseInput}
          error={apiBaseError}
          onChange={(e) => handleApiBaseChange(e.target.value)}
        />

        <RangeField
          label="Overlay opacity"
          min={0.5}
          max={1}
          step={0.05}
          value={settings.opacity}
          onChange={(v) => void updateKey(SETTINGS, (s) => ({ ...s, opacity: v }))}
        />
        <RangeField
          label="Overlay scale"
          min={0.8}
          max={1.25}
          step={0.05}
          value={settings.scale}
          onChange={(v) => void updateKey(SETTINGS, (s) => ({ ...s, scale: v }))}
        />

        <div>
          <h3 className="kicker mb-2">Shortcuts</h3>
          <ShortcutEditor
            shortcuts={settings.shortcuts}
            registrations={registrations}
            onRegistrations={onRegistrations}
          />
        </div>

        <p className="text-xs text-faint">
          Warcraft III must run in windowed or borderless mode for the overlay to be visible.
        </p>
      </div>
    </div>
  );
}
