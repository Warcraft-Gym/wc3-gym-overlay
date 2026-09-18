import { useState } from "react";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { Modal } from "../../components/Modal";
import { TextField } from "../../components/TextField";
import { host } from "../../host";
import type { ShortcutRegistrationResult } from "../../host/bridge";
import { readLocalBuilds, writeLocalBuilds } from "../../data/localBuildsStore";
import { exportAll, importBuilds, parseImport } from "../../lib/buildExchange";
import { LOCAL_BUILDS, SETTINGS, type Settings } from "../../store/keys";
import { updateKey } from "../../store/state";
import { useStoreValue } from "../../store/useStore";
import { ShortcutEditor } from "./ShortcutEditor";

/** F004: backs up every private build in one file — `wc3gym-builds.wc3gym.json`. */
async function exportAllPrivateBuilds(): Promise<void> {
  const payload = exportAll(readLocalBuilds());
  await host.saveTextFile("wc3gym-builds.wc3gym.json", JSON.stringify(payload, null, 2));
}

/** F004: opens a file, parses it (tolerating both export formats and a
 *  bare build), and merges whatever validated into the local builds store
 *  — skipping anything whose fingerprint already exists. Returns `null`
 *  when the user cancelled the dialog (nothing to report). */
async function importPrivateBuilds(): Promise<string | null> {
  const text = await host.openTextFile();
  if (text === null) return null;

  const { builds, errors } = parseImport(text);
  const { next, added, skipped } = await importBuilds(readLocalBuilds(), builds);
  await writeLocalBuilds(next);

  const base = `Imported ${added}, skipped ${skipped}`;
  return errors.length > 0 ? `${base} · ${errors.length} invalid` : base;
}

/** F002: quits the whole process. Closing the picker window already does
 *  this (native `CloseRequested` handling in Rust), but a frozen shortcut
 *  registration or a stray hidden overlay window is otherwise invisible —
 *  this button gives the user an explicit way out without reaching for
 *  Task Manager / Activity Monitor. No-op outside Tauri (browser preview
 *  has no process to quit). */
async function quitApp(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("quit_app");
}

export const SETTINGS_DIALOG_ID = "settings-dialog";

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
 *  inline error instead of clobbering the working value.
 *
 *  Renders as a centred modal (see `Modal`) portalled onto `document.body`,
 *  so it stays correctly positioned regardless of any containing block
 *  (transform/filter/backdrop-filter) an ancestor in the page tree forms. */
export function SettingsModal({
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
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const localBuildCount = useStoreValue(LOCAL_BUILDS).length;

  async function handleImportClick() {
    const message = await importPrivateBuilds();
    if (message !== null) setImportStatus(message);
  }

  function handleApiBaseChange(value: string) {
    setApiBaseInput(value);
    try {
      const url = new URL(value);
      setApiBaseError(null);
      void updateKey(SETTINGS, (s) => ({ ...s, apiBase: url.toString().replace(/\/$/, "") }));
    } catch {
      setApiBaseError("Enter a valid URL, e.g. https://wc3-gnl-website.vercel.app");
    }
  }

  return (
    <Modal label="Settings" id={SETTINGS_DIALOG_ID} onClose={onClose}>
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

        <div>
          <h3 className="kicker mb-2">Private builds</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              disabled={localBuildCount === 0}
              onClick={() => void exportAllPrivateBuilds()}
            >
              Export all private builds
            </Button>
            <Button variant="ghost" onClick={() => void handleImportClick()}>
              Import builds…
            </Button>
          </div>
          {importStatus ? (
            <p role="status" className="mt-2 text-xs text-muted">
              {importStatus}
            </p>
          ) : null}
        </div>

        <p className="text-xs text-faint">
          Warcraft III must run in windowed or borderless mode for the overlay to be visible.
        </p>

        {host.kind === "tauri" && (
          <Button variant="ghost" aria-label="Quit app" onClick={() => void quitApp()}>
            Quit app
          </Button>
        )}
      </div>
    </Modal>
  );
}
