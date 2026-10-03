import { Search } from "lucide-react";
import type { BuildRace, BuildVsRace } from "../../components/BuildBadges";
import { cn } from "../../lib/cn";
import type { BuildSort } from "../../lib/filterBuilds";
import { RACE_LABEL, RaceCrest } from "../../components/RaceCrest";

export type SourceFilter = "all" | "local" | "site";

export type Filters = {
  race?: BuildRace;
  vsRace?: BuildVsRace;
  q?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  sort?: BuildSort;
  source?: SourceFilter;
};

const selectClass =
  "h-9 rounded border border-line bg-surface/60 px-3 text-sm text-fg focus:border-gold/60 focus:outline-none";

const SOURCE_OPTIONS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "local", label: "Private" },
  { id: "site", label: "Site" },
];

/** Three-segment "All / Private / Site" toggle — ported loosely from the
 *  site's segmented-toggle pattern, `aria-pressed` per segment so each
 *  choice reads as a distinct on/off button rather than a single control. */
function SourceToggle({ value, onChange }: { value: SourceFilter; onChange: (next: SourceFilter) => void }) {
  return (
    <div role="group" aria-label="Source" className="inline-flex overflow-hidden rounded border border-line">
      {SOURCE_OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "h-9 px-3 font-display text-[0.68rem] font-bold uppercase tracking-[0.1em] transition-colors",
            value === id ? "bg-gold/15 text-gold" : "bg-surface/60 text-muted hover:text-fg",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type RaceChoice = BuildRace | "any";
const RACE_CHOICES: RaceChoice[] = ["any", "human", "orc", "nightelf", "undead"];

/**
 * One side of the matchup as a row of small toggles: a text "Any" (the old
 * Random crest read as an Orc crest) and a crest per race. Picking the active
 * race again clears it, same as "Any".
 */
function RaceToggles({
  label,
  value,
  apiBase,
  onPick,
}: {
  label: string;
  value: RaceChoice;
  apiBase: string;
  onPick: (id: RaceChoice) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {RACE_CHOICES.map((id) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            aria-label={`${label}: ${id === "any" ? "Any" : RACE_LABEL[id]}`}
            title={id === "any" ? "Any race" : RACE_LABEL[id]}
            onClick={() => onPick(id)}
            className={cn(
              "grid h-8 min-w-8 place-items-center rounded-full border px-1 transition-[border-color,background-color,opacity] duration-[var(--wg-dur-fast)]",
              active ? "border-gold bg-gold/15 text-gold" : "border-line bg-surface/60 text-muted opacity-75 hover:border-gold/50 hover:opacity-100",
            )}
          >
            {id === "any" ? (
              <span className="px-1.5 font-display text-[0.62rem] font-bold uppercase tracking-[0.1em]">Any</span>
            ) : (
              <RaceCrest race={id} apiBase={apiBase} size={22} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** True when any filter narrows the list (search, races, difficulty, source). */
export function hasActiveFilters(filters: Filters): boolean {
  return Boolean(filters.q || filters.race || filters.vsRace || filters.difficulty || (filters.source && filters.source !== "all"));
}

/** "41 builds", or "12 of 41" when filters are narrowing the list. */
export function countLabel(matchCount: number, totalCount: number, active: boolean): string {
  if (active && matchCount !== totalCount) return `${matchCount} of ${totalCount}`;
  return `${matchCount} ${matchCount === 1 ? "build" : "builds"}`;
}

/**
 * One compact panel: the matchup as two rows of small crest toggles
 * ("You … vs …"), then search, source, difficulty, sort and the count. It
 * used to take a third of the window with large crests; the list is what
 * matters here.
 */
export function FilterBar({
  apiBase,
  filters,
  onChange,
  matchCount,
  totalCount,
}: {
  apiBase: string;
  filters: Filters;
  onChange: (next: Filters) => void;
  matchCount: number;
  totalCount: number;
}) {
  const active = hasActiveFilters(filters);

  function pickRace(id: RaceChoice) {
    onChange({ ...filters, race: id === "any" || filters.race === id ? undefined : id });
  }

  function pickVsRace(id: RaceChoice) {
    onChange({ ...filters, vsRace: id === "any" || filters.vsRace === id ? undefined : id });
  }

  return (
    <div className="panel flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="kicker">You</span>
        <RaceToggles label="Your race" value={filters.race ?? "any"} apiBase={apiBase} onPick={pickRace} />
        <span className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-foil">vs</span>
        <RaceToggles label="Against" value={(filters.vsRace as RaceChoice | undefined) ?? "any"} apiBase={apiBase} onPick={pickVsRace} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            aria-label="Search builds"
            value={filters.q ?? ""}
            onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
            placeholder="Search builds, tags, authors…"
            className="h-9 w-full rounded border border-line bg-surface/60 pl-9 pr-3 text-sm text-fg placeholder:text-faint focus:border-gold/60 focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SourceToggle value={filters.source ?? "all"} onChange={(source) => onChange({ ...filters, source })} />
          <select
            aria-label="Difficulty"
            value={filters.difficulty ?? ""}
            onChange={(e) =>
              onChange({ ...filters, difficulty: (e.target.value || undefined) as Filters["difficulty"] })
            }
            className={selectClass}
          >
            <option value="">Any difficulty</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <select
            aria-label="Sort"
            value={filters.sort ?? "updated"}
            onChange={(e) => onChange({ ...filters, sort: e.target.value === "title" ? "title" : undefined })}
            className={selectClass}
          >
            <option value="updated">Recently updated</option>
            <option value="title">Title A–Z</option>
          </select>
          <span className="tnum whitespace-nowrap pl-1 text-xs text-faint" aria-live="polite">
            {countLabel(matchCount, totalCount, active)}
          </span>
          {active ? (
            <button
              type="button"
              onClick={() => onChange({ sort: filters.sort })}
              className="text-xs text-gold underline-offset-2 hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
