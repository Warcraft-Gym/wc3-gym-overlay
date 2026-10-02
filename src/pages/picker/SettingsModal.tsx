import { useState, useSyncExternalStore } from "react";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { Modal } from "../../components/Modal";
import { TextField } from "../../components/TextField";
import { host } from "../../host";
import type { ReplayWatcherStatus, ShortcutRegistrationResult, UpdateInfo } from "../../host/bridge";
import { readLocalBuilds, writeLocalBuilds } from "../../data/localBuildsStore";
import { exportAll, importBuilds, parseImport } from "../../lib/buildExchange";
import { getReplayWatcherStatus, onReplayWatcherStatusChanged } from "../../replayWatcher";
import { LOCAL_BUILDS, SETTINGS, type Settings } from "../../store/keys";
import { updateKey } from "../../store/state";
import { useStoreValue } from "../../store/useStore";
import { APP_VERSION } from "../../version";
import { ShortcutEditor } from "./ShortcutEditor";

/** F002: Settings' own "Check for updates" state — independent of the
 *  banner's `useUpdateFlow` (see that module's doc comment): this always
 *  surfaces the result, including a version the user already skipped, so
 *  a manual check is never silent the way the launch check is. */
type UpdateCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; info: UpdateInfo; skipped: boolean }
  | { kind: "failed" };

/** F002: runs `host.checkForUpdate()` and classifies the result against
 *  `skippedVersion` — pulled out of the component so the click handler
 *  below stays a one-liner. */
async function runUpdateCheck(skippedVersion: string | null): Promise<UpdateCheckState> {
  try {
    const info = await host.checkForUpdate();
    if (!info) return { kind: "up-to-date" };
    return { kind: "available", info, skipped: info.version === skippedVersion };
  } catch (err) {
    console.warn("[wc3gym] update check failed", err);
    return { kind: "failed" };
  }
}

/** F006: subscribes to the last-replay watcher's status for the line below
 *  the Replays section — same `useSyncExternalStore` shape as
 *  `store/useStore.ts`'s `useStoreValue`, but over the host's in-memory
 *  watcher state rather than a localStorage-backed store key (there's
 *  nothing to persist or share across windows here). */
function useReplayWatcherStatus(): ReplayWatcherStatus {
  return useSyncExternalStore(onReplayWatcherStatusChanged, getReplayWatcherStatus);
}

/** Renders the Replays section's one-line status — "Watching N folders ·
 *  last game picked up HH:MM", the last error instead when there is one,
 *  or a quiet "Auto-import is off" when the user disabled it (`watching`
 *  is empty and there's no error in that case, so it needs its own branch
 *  rather than falling out of the other two). */
function formatReplayWatcherStatus(status: ReplayWatcherStatus, autoImport: boolean): string {
  if (status.lastError) return status.lastError;
  if (!autoImport) return "Auto-import is off";
  const folders = `Watching ${status.watchingFolders.length} folder${status.watchingFolders.length === 1 ? "" : "s"}`;
  if (status.lastPickedUpAtMs === null) return folders;
  const time = new Date(status.lastPickedUpAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${folders} · last game picked up ${time}`;
}

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
  onOpenUpdate,
}: {
  settings: Settings;
  registrations: ShortcutRegistrationResult[];
  onRegistrations: (results: ShortcutRegistrationResult[]) => void;
  onClose: () => void;
  /** F002: "Update" / "Update anyway" below — (re)opens the shared update
   *  banner for whatever this modal's own check found. Optional so call
   *  sites with no banner to open (none in this app, but keeps the prop
   *  from being a hard requirement for every test render) can omit it. */
  onOpenUpdate?: (info: UpdateInfo) => void;
}) {
  const [apiBaseInput, setApiBaseInput] = useState(settings.apiBase);
  const [apiBaseError, setApiBaseError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({ kind: "idle" });
  const [battleTagInput, setBattleTagInput] = useState(settings.myBattleTag ?? "");
  const localBuildCount = useStoreValue(LOCAL_BUILDS).length;
  const replayWatcherStatus = useReplayWatcherStatus();

  async function handleImportClick() {
    const message = await importPrivateBuilds();
    if (message !== null) setImportStatus(message);
  }

  async function handleChooseReplayFolder() {
    const folder = await host.openFolder();
    if (folder !== null) await updateKey(SETTINGS, (s) => ({ ...s, replayFolder: folder }));
  }

  async function handleResetReplayFolder() {
    await updateKey(SETTINGS, (s) => ({ ...s, replayFolder: null }));
  }

  function handleBattleTagChange(value: string) {
    setBattleTagInput(value);
    void updateKey(SETTINGS, (s) => ({ ...s, myBattleTag: value.trim() === "" ? null : value }));
  }

  async function handleCheckForUpdates() {
    setUpdateCheck({ kind: "checking" });
    setUpdateCheck(await runUpdateCheck(settings.skippedVersion));
  }

  function handleApiBaseChange(value: string) {
    setApiBaseInput(value);
    try {
      const url = new URL(value);
      setApiBaseError(null);
      void updateKey(SETTINGS, (s) => ({ ...s, apiBase: url.toString().replace(/\/$/, "") }));
    } catch {
      setApiBaseError("Enter a valid URL, e.g. https://warcraft-gym.com");
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
          <h3 className="kicker mb-2">Updates</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.autoUpdate}
              onChange={(e) => void updateKey(SETTINGS, (s) => ({ ...s, autoUpdate: e.target.checked }))}
            />
            Auto-update on launch
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => void handleCheckForUpdates()}>
              Check for updates
            </Button>
            {updateCheck.kind === "available" ? (
              <Button variant="ghost" onClick={() => onOpenUpdate?.(updateCheck.info)}>
                {updateCheck.skipped ? "Update anyway" : "Update"}
              </Button>
            ) : null}
          </div>
          {updateCheck.kind !== "idle" ? (
            <p role="status" className="mt-2 text-xs text-muted">
              {updateCheck.kind === "checking" && "Checking…"}
              {updateCheck.kind === "up-to-date" && `You're on the latest version (${APP_VERSION})`}
              {updateCheck.kind === "available" &&
                `Version ${updateCheck.info.version} available${updateCheck.skipped ? " (skipped)" : ""}`}
              {updateCheck.kind === "failed" && "Couldn't check for updates"}
            </p>
          ) : null}
        </div>

        <div>
          <h3 className="kicker mb-2">Replays</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.autoImport}
              onChange={(e) => void updateKey(SETTINGS, (s) => ({ ...s, autoImport: e.target.checked }))}
            />
            Auto-detect a finished game
          </label>

          <div className="mt-3">
            <span className="mb-1 block font-mono text-xs uppercase tracking-[0.14em] text-faint">
              Replay folder
            </span>
            <p className="text-xs text-muted">
              {settings.replayFolder ?? "Auto-detected — searches the usual Warcraft III BattleNet folders"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => void handleChooseReplayFolder()}>
                Choose…
              </Button>
              {settings.replayFolder !== null ? (
                <Button variant="ghost" onClick={() => void handleResetReplayFolder()}>
                  Reset
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-faint">
              Pick either the folder that directly contains LastReplay.w3g, or the BattleNet folder itself
              (the one with a numbered folder per account). A folder outside Downloads, Documents, Desktop, or
              the default Warcraft III data folder can't actually be read — the status line below will show an
              error if so.
            </p>
          </div>

          <div className="mt-3">
            <TextField
              label="My BattleTag"
              placeholder="Name#1234"
              value={battleTagInput}
              onChange={(e) => handleBattleTagChange(e.target.value)}
            />
          </div>

          <p data-testid="replay-watcher-status" className="mt-3 text-xs text-muted">
            {formatReplayWatcherStatus(replayWatcherStatus, settings.autoImport)}
          </p>
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
