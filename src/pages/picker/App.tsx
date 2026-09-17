import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/Button";
import type { BuildRace, BuildVsRace } from "../../components/Matchup";
import { useBuilds } from "../../data/useBuilds";
import type { ShortcutRegistrationResult } from "../../host/bridge";
import { filterBuilds } from "../../lib/filterBuilds";
import { runSelftest } from "../../selftest";
import { applyShortcuts } from "../../shortcuts";
import { SELECTED_BUILD_SLUG, SETTINGS } from "../../store/keys";
import { writeKey } from "../../store/state";
import { useStoreValue } from "../../store/useStore";
import { BuildList } from "./BuildList";
import { EmptyState } from "./EmptyState";
import { FilterBar, type Filters } from "./FilterBar";
import { OfflineBanner } from "./OfflineBanner";
import { SelectedBuildHeader } from "./SelectedBuildHeader";
import { SettingsDrawer } from "./SettingsDrawer";

const RACE_VALUES: readonly BuildRace[] = ["human", "orc", "nightelf", "undead"];

function parseHashFilters(hash: string): Filters {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const race = params.get("race");
  const vs = params.get("vs");
  return {
    race: race && (RACE_VALUES as readonly string[]).includes(race) ? (race as BuildRace) : undefined,
    vsRace:
      vs && (vs === "any" || (RACE_VALUES as readonly string[]).includes(vs)) ? (vs as BuildVsRace) : undefined,
    q: params.get("q") ?? undefined,
  };
}

function writeHashFilters(filters: Filters): void {
  const params = new URLSearchParams();
  if (filters.race) params.set("race", filters.race);
  if (filters.vsRace) params.set("vs", filters.vsRace);
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  history.replaceState(null, "", qs ? `#${qs}` : location.pathname + location.search);
}

/**
 * The real build picker: browse published builds, filter by matchup/search,
 * pick one to show in game, and tune settings — all backed by the offline
 * cache in `useBuilds` so the page never blanks.
 *
 * The `?api=` dev override (see `applyApiBaseOverride.ts`) is applied by
 * `main.tsx` before this component ever mounts, not here — doing it in an
 * effect would lose `useBuilds`'s first fetch to the stale default apiBase,
 * since that hook's initial render snapshot is taken before any effect runs.
 */
export function App() {
  const settings = useStoreValue(SETTINGS);
  const selectedSlug = useStoreValue(SELECTED_BUILD_SLUG);
  const { status, builds, fetchedAt, error, retry } = useBuilds();

  const [registrations, setRegistrations] = useState<ShortcutRegistrationResult[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => parseHashFilters(location.hash));

  useEffect(() => {
    applyShortcuts().then((results) => {
      setRegistrations(results);
      void runSelftest("picker", results);
    });
  }, []);

  function updateFilters(next: Filters): void {
    setFilters(next);
    writeHashFilters(next);
  }

  const filtered = useMemo(() => filterBuilds(builds, filters), [builds, filters]);
  const selectedBuild = builds.find((b) => b.slug === selectedSlug) ?? null;

  function selectBuild(slug: string): void {
    void writeKey(SELECTED_BUILD_SLUG, slug);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl">Warcraft 3 Gym — Build picker</h1>
        <Button variant="ghost" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
          Settings
        </Button>
      </div>

      <div className="flex flex-col gap-5">
        <SelectedBuildHeader build={selectedBuild} apiBase={settings.apiBase} />

        <FilterBar
          apiBase={settings.apiBase}
          filters={filters}
          onChange={updateFilters}
          matchCount={filtered.length}
          totalCount={builds.length}
        />

        {status === "offline" ? <OfflineBanner fetchedAt={fetchedAt} onRetry={retry} /> : null}

        {status === "empty" ? (
          <EmptyState error={error} onRetry={retry} />
        ) : (
          <BuildList
            builds={filtered}
            apiBase={settings.apiBase}
            selectedSlug={selectedSlug}
            onSelect={selectBuild}
            loading={status === "loading"}
          />
        )}
      </div>

      {settingsOpen ? (
        <SettingsDrawer
          settings={settings}
          registrations={registrations}
          onRegistrations={setRegistrations}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </main>
  );
}
