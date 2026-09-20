import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/Button";
import type { BuildRace, BuildVsRace } from "../../components/BuildBadges";
import { readLocalBuilds, writeLocalBuilds } from "../../data/localBuildsStore";
import { isLocalBuild, useAllBuilds, type AnyBuild } from "../../data/useAllBuilds";
import { host } from "../../host";
import type { ShortcutRegistrationResult } from "../../host/bridge";
import type { EditorFormInput } from "../../lib/buildEditorSchema";
import type { ReplayImportSource } from "./replay/ReplayImportModal";
import { deleteLocalBuild } from "../../lib/localBuilds";
import { filterBuilds, sortBuilds } from "../../lib/filterBuilds";
import { applySelftestShortcutOverride, runSelftest } from "../../selftest";
import { applyShortcuts } from "../../shortcuts";
import { UPDATE_CHECK_DELAY_MS } from "../../config";
import { SELECTED_BUILD_SLUG, SETTINGS } from "../../store/keys";
import { writeKey } from "../../store/state";
import { useStoreValue } from "../../store/useStore";
import { BuildList } from "./BuildList";
import type { BuildEditorMode } from "./editor/BuildEditorModal";
import { EmptyState } from "./EmptyState";
import { FilterBar, type Filters, type SourceFilter } from "./FilterBar";
import { OfflineBanner } from "./OfflineBanner";
import { SelectedBuildHeader } from "./SelectedBuildHeader";
import { SETTINGS_DIALOG_ID, SettingsModal } from "./SettingsModal";
import { UpdateBanner } from "./UpdateBanner";
import { useUpdateFlow } from "./useUpdateFlow";

// F003: the editor (schema, icon picker, steps editor) is only ever needed
// once the user actually opens it — code-split so "New private build" /
// "Duplicate" / "Edit" don't add to the picker's initial bundle.
const BuildEditorModal = lazy(() => import("./editor/BuildEditorModal").then((m) => ({ default: m.BuildEditorModal })));
// F002/F004: the replay-import dialog (and, transitively, `w3gjs`) is only
// ever needed once "Import replay"/"From W3Champions" is clicked.
const ReplayImportModal = lazy(() =>
  import("./replay/ReplayImportModal").then((m) => ({ default: m.ReplayImportModal })),
);

const REPLAY_FILE_FILTERS = [{ name: "Warcraft III replay", extensions: ["w3g"] }];

type EditorState = {
  mode: BuildEditorMode;
  sourceBuild: AnyBuild | null;
  /** F002: seeds the editor form when opened from a replay import. */
  initialValues?: EditorFormInput;
};

const RACE_VALUES: readonly BuildRace[] = ["human", "orc", "nightelf", "undead"];
const DIFFICULTY_VALUES = ["beginner", "intermediate", "advanced"] as const;
const SOURCE_VALUES: readonly SourceFilter[] = ["all", "local", "site"];

function parseHashFilters(hash: string): Filters {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const race = params.get("race");
  const vs = params.get("vs");
  const difficulty = params.get("difficulty");
  const sort = params.get("sort");
  const source = params.get("source");
  return {
    race: race && (RACE_VALUES as readonly string[]).includes(race) ? (race as BuildRace) : undefined,
    vsRace:
      vs && (vs === "any" || (RACE_VALUES as readonly string[]).includes(vs)) ? (vs as BuildVsRace) : undefined,
    q: params.get("q") ?? undefined,
    difficulty:
      difficulty && (DIFFICULTY_VALUES as readonly string[]).includes(difficulty)
        ? (difficulty as Filters["difficulty"])
        : undefined,
    sort: sort === "title" ? "title" : undefined,
    source: source && (SOURCE_VALUES as readonly string[]).includes(source) ? (source as SourceFilter) : undefined,
  };
}

function writeHashFilters(filters: Filters): void {
  const params = new URLSearchParams();
  if (filters.race) params.set("race", filters.race);
  if (filters.vsRace) params.set("vs", filters.vsRace);
  if (filters.q) params.set("q", filters.q);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.source && filters.source !== "all") params.set("source", filters.source);
  const qs = params.toString();
  history.replaceState(null, "", qs ? `#${qs}` : location.pathname + location.search);
}

/**
 * The real build picker: browse published builds, filter by matchup/search,
 * pick one to show in game, and tune settings — all backed by the offline
 * cache in `useBuilds` so the page never blanks.
 *
 * Page frame ported from the site's `/learn/builds` layout: a slim
 * `border-b` top bar (not a `panel`) over a `max-w-6xl` content column, so
 * the picker reads as a page of that site rather than a floating dialog.
 *
 * The `?api=` dev override (see `applyApiBaseOverride.ts`) is applied by
 * `main.tsx` before this component ever mounts, not here — doing it in an
 * effect would lose `useBuilds`'s first fetch to the stale default apiBase,
 * since that hook's initial render snapshot is taken before any effect runs.
 *
 * F002: `builds` comes from `useAllBuilds` — private local builds merged
 * ahead of the published site list, tagged `source`. `status`/`fetchedAt`/
 * `error` still describe the site fetch only (local builds never touch the
 * network), so the offline banner and the "truly nothing to show" empty
 * state below account for local builds explicitly rather than trusting
 * `status` alone.
 */
export function App() {
  const settings = useStoreValue(SETTINGS);
  const selectedSlug = useStoreValue(SELECTED_BUILD_SLUG);
  const { status, builds, fetchedAt, error, retry } = useAllBuilds();

  const [registrations, setRegistrations] = useState<ShortcutRegistrationResult[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => parseHashFilters(location.hash));
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [replayImport, setReplayImport] = useState<ReplayImportSource | null>(null);
  const updateFlow = useUpdateFlow(settings.skippedVersion);

  // F002: once per mount, wait a few seconds (so the check never delays the
  // picker's own first paint) then check for an update — only when
  // "Auto-update on launch" was on at the moment this component mounted.
  // Deliberately reads `settings.autoUpdate`/`updateFlow.checkAuto` once via
  // closure rather than reacting to later changes: "once after mount" per
  // spec, not "whenever the setting flips". Never runs in the overlay
  // window; this component only ever mounts as the picker.
  useEffect(() => {
    if (!settings.autoUpdate) return;
    const timer = setTimeout(() => void updateFlow.checkAuto(), UPDATE_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleImportReplay(): Promise<void> {
    const picked = await host.openBinaryFile(REPLAY_FILE_FILTERS);
    if (picked) setReplayImport({ kind: "file", bytes: picked.bytes });
  }

  function handleImportFromW3Champions(): void {
    setReplayImport({ kind: "link" });
  }

  function handleOpenReplayInEditor(initialValues: EditorFormInput): void {
    setReplayImport(null);
    setEditor({ mode: "new", sourceBuild: null, initialValues });
  }

  useEffect(() => {
    applySelftestShortcutOverride()
      .then(() => applyShortcuts())
      .then((results) => {
        setRegistrations(results);
        void runSelftest("picker", results);
      });
  }, []);

  function updateFilters(next: Filters): void {
    setFilters(next);
    writeHashFilters(next);
  }

  // Private builds always render ahead of site builds, regardless of the
  // chosen sort — the sort only orders *within* each group. Otherwise a
  // site build with a more recent `updatedAt` than every private build
  // would bump private builds off the top under "Recently updated", which
  // defeats the point of a dedicated Source filter for finding them.
  const filtered = useMemo(() => {
    const matched = filterBuilds(builds, filters);
    const sort = filters.sort ?? "updated";
    const local = sortBuilds(
      matched.filter((build) => build.source === "local"),
      sort,
    );
    const site = sortBuilds(
      matched.filter((build) => build.source !== "local"),
      sort,
    );
    return [...local, ...site];
  }, [builds, filters]);
  const selectedBuild = builds.find((b) => b.slug === selectedSlug) ?? null;
  // The site fetch can report "empty" while private builds still exist —
  // those always render regardless of network status, so only fall back to
  // the EmptyState when there is truly nothing (site or local) to show.
  const nothingToShow = status === "empty" && builds.length === 0;

  function selectBuild(slug: string): void {
    void writeKey(SELECTED_BUILD_SLUG, slug);
  }

  function handleDeleteRow(build: AnyBuild): void {
    void writeLocalBuilds(deleteLocalBuild(readLocalBuilds(), build.slug));
  }

  return (
    <>
      <UpdateBanner flow={updateFlow} />

      <header className="flex items-center justify-between gap-3 border-b border-line/60 px-6 py-4">
        <div>
          <h1 className="font-display text-sm font-extrabold uppercase tracking-[0.12em] text-gold">
            Warcraft 3 Gym
          </h1>
          <p className="text-xs text-muted">Build picker</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="gold" onClick={() => setEditor({ mode: "new", sourceBuild: null })}>
            New private build
          </Button>
          <Button variant="ghost" onClick={() => void handleImportReplay()}>
            Import replay
          </Button>
          <Button variant="ghost" onClick={handleImportFromW3Champions}>
            From W3Champions
          </Button>
          <Button
            variant="ghost"
            aria-expanded={settingsOpen}
            aria-controls={SETTINGS_DIALOG_ID}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            Settings
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-5">
          <SelectedBuildHeader
            build={selectedBuild}
            apiBase={settings.apiBase}
            onEdit={
              selectedBuild && isLocalBuild(selectedBuild)
                ? () => setEditor({ mode: "edit", sourceBuild: selectedBuild })
                : undefined
            }
          />

          <FilterBar apiBase={settings.apiBase} filters={filters} onChange={updateFilters} matchCount={filtered.length} />

          {status === "offline" ? <OfflineBanner fetchedAt={fetchedAt} onRetry={retry} /> : null}

          {nothingToShow ? (
            <EmptyState error={error} onRetry={retry} />
          ) : (
            <BuildList
              builds={filtered}
              apiBase={settings.apiBase}
              selectedSlug={selectedSlug}
              onSelect={selectBuild}
              onDuplicate={(build) => setEditor({ mode: "duplicate", sourceBuild: build })}
              onEdit={(build) => setEditor({ mode: "edit", sourceBuild: build })}
              onDelete={handleDeleteRow}
              loading={status === "loading"}
            />
          )}
        </div>

        {settingsOpen ? (
          <SettingsModal
            settings={settings}
            registrations={registrations}
            onRegistrations={setRegistrations}
            onClose={() => setSettingsOpen(false)}
            onOpenUpdate={updateFlow.open}
          />
        ) : null}

        {editor ? (
          <Suspense fallback={null}>
            <BuildEditorModal
              mode={editor.mode}
              sourceBuild={editor.sourceBuild}
              apiBase={settings.apiBase}
              allBuilds={builds}
              onClose={() => setEditor(null)}
              initialValues={editor.initialValues}
            />
          </Suspense>
        ) : null}

        {replayImport ? (
          <Suspense fallback={null}>
            <ReplayImportModal
              source={replayImport}
              apiBase={settings.apiBase}
              onClose={() => setReplayImport(null)}
              onOpenInEditor={handleOpenReplayInEditor}
            />
          </Suspense>
        ) : null}
      </main>
    </>
  );
}
