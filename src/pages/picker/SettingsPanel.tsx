import { useState } from "react";
import { Button } from "../../components/Button";
import type { ReactNode } from "react";
import { host } from "../../host";
import type { ShortcutRegistrationResult, UpdateInfo } from "../../host/bridge";
import { readLocalBuilds, writeLocalBuilds } from "../../data/localBuildsStore";
import { exportAll, importBuilds, parseImport } from "../../lib/buildExchange";
import { LOCAL_BUILDS, SETTINGS, type Settings } from "../../store/keys";
import { updateKey } from "../../store/state";
import { useStoreValue } from "../../store/useStore";
import { APP_VERSION } from "../../version";
import { ShortcutEditor } from "./ShortcutEditor";
import { W3ChampionsSettings } from "./W3ChampionsSettings";
import { W3C_SCOUTING_ENABLED } from "../../config";

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

function Group({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`panel space-y-4 p-5 ${className ?? ""}`}>
      <h3 className="kicker">{title}</h3>
      {children}
    </section>
  );
}

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

/** The Settings tab: overlay look, W3Champions, shortcuts, updates and
 *  private-build backup, as panels on the page. The site address is not a
 *  setting: developers point the app elsewhere with the `?api=` override
 *  (see `applyApiBaseOverride.ts`). */
export function SettingsPanel({
  settings,
  registrations,
  onRegistrations,
  onOpenUpdate,
}: {
  settings: Settings;
  registrations: ShortcutRegistrationResult[];
  onRegistrations: (results: ShortcutRegistrationResult[]) => void;
  /** F002: "Update" / "Update anyway" below — (re)opens the shared update
   *  banner for whatever this panel's own check found. Optional so call
   *  sites with no banner to open (none in this app, but keeps the prop
   *  from being a hard requirement for every test render) can omit it. */
  onOpenUpdate?: (info: UpdateInfo) => void;
}) {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({ kind: "idle" });
  const localBuildCount = useStoreValue(LOCAL_BUILDS).length;

  async function handleImportClick() {
    const message = await importPrivateBuilds();
    if (message !== null) setImportStatus(message);
  }

  async function handleCheckForUpdates() {
    setUpdateCheck({ kind: "checking" });
    setUpdateCheck(await runUpdateCheck(settings.skippedVersion));
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Group title="Overlay">
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
          <p className="text-xs text-faint">
            Warcraft III must run in windowed or borderless mode for the overlay to be visible.
          </p>
        </Group>

        {W3C_SCOUTING_ENABLED ? (
          <Group title="W3Champions">
            <W3ChampionsSettings settings={settings} />
          </Group>
        ) : null}

        <Group title="Private builds">
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={localBuildCount === 0} onClick={() => void exportAllPrivateBuilds()}>
              Export all private builds
            </Button>
            <Button variant="ghost" onClick={() => void handleImportClick()}>
              Import builds…
            </Button>
          </div>
          {importStatus ? (
            <p role="status" className="text-xs text-muted">
              {importStatus}
            </p>
          ) : null}
        </Group>
      </div>

      <div className="space-y-4">
        <Group title="Shortcuts">
          <ShortcutEditor shortcuts={settings.shortcuts} registrations={registrations} onRegistrations={onRegistrations} />
        </Group>

        <Group title="Updates">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.autoUpdate}
              onChange={(e) => void updateKey(SETTINGS, (s) => ({ ...s, autoUpdate: e.target.checked }))}
            />
            Auto-update on launch
          </label>
          <div className="flex flex-wrap items-center gap-2">
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
            <p role="status" className="text-xs text-muted">
              {updateCheck.kind === "checking" && "Checking…"}
              {updateCheck.kind === "up-to-date" && `You're on the latest version (${APP_VERSION})`}
              {updateCheck.kind === "available" &&
                `Version ${updateCheck.info.version} available${updateCheck.skipped ? " (skipped)" : ""}`}
              {updateCheck.kind === "failed" && "Couldn't check for updates"}
            </p>
          ) : null}
        </Group>

        <Group title="App">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-faint">Version {APP_VERSION}</p>
            {host.kind === "tauri" && (
              <Button variant="ghost" aria-label="Quit app" onClick={() => void quitApp()}>
                Quit app
              </Button>
            )}
          </div>
        </Group>
      </div>
    </div>
  );
}
