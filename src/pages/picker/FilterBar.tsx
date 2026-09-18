import { Search } from "lucide-react";
import type { BuildRace, BuildVsRace } from "../../components/BuildBadges";
import type { BuildSort } from "../../lib/filterBuilds";
import { CREST_OPTIONS, RaceCrest } from "./RaceCrestPicker";

export type Filters = {
  race?: BuildRace;
  vsRace?: BuildVsRace;
  q?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  sort?: BuildSort;
};

const selectClass =
  "h-10 rounded border border-line bg-surface/60 px-3 text-sm text-fg focus:border-gold/60 focus:outline-none";

/**
 * Ported from the site's `MatchupPicker` (`src/components/builds/MatchupPicker.tsx`)
 * + `RaceCrestPicker` — two crest groups with a serif "vs" between them, then
 * the search box / difficulty / sort / count row. "Any" on either side means
 * "no filter on this side", matching `filterBuilds`'s semantics for an
 * unset filter.
 */
export function FilterBar({
  apiBase,
  filters,
  onChange,
  matchCount,
}: {
  apiBase: string;
  filters: Filters;
  onChange: (next: Filters) => void;
  matchCount: number;
}) {
  function pickRace(id: BuildRace | "any") {
    onChange({ ...filters, race: id === "any" || filters.race === id ? undefined : id });
  }

  function pickVsRace(id: BuildRace | "any") {
    onChange({ ...filters, vsRace: id === "any" || filters.vsRace === id ? undefined : id });
  }

  return (
    <div className="panel flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
        <div className="flex flex-col items-center gap-2">
          <span className="kicker">Your race</span>
          <div className="flex gap-1.5 sm:gap-2">
            {CREST_OPTIONS.map((id) => (
              <RaceCrest
                key={id}
                id={id}
                apiBase={apiBase}
                active={(filters.race ?? "any") === id}
                onClick={() => pickRace(id)}
              />
            ))}
          </div>
        </div>
        <span className="font-display text-2xl font-extrabold uppercase tracking-[0.2em] text-foil sm:mt-9">
          vs
        </span>
        <div className="flex flex-col items-center gap-2">
          <span className="kicker">Against</span>
          <div className="flex gap-1.5 sm:gap-2">
            {CREST_OPTIONS.map((id) => (
              <RaceCrest
                key={id}
                id={id}
                apiBase={apiBase}
                active={(filters.vsRace ?? "any") === id}
                onClick={() => pickVsRace(id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            aria-label="Search builds"
            value={filters.q ?? ""}
            onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
            placeholder="Search builds, tags, authors…"
            className="h-10 w-full rounded border border-line bg-surface/60 pl-9 pr-3 text-sm text-fg placeholder:text-faint focus:border-gold/60 focus:outline-none"
          />
        </label>
        <div className="flex items-center gap-2">
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
          <span className="tnum whitespace-nowrap pl-2 text-xs text-faint">
            {matchCount} {matchCount === 1 ? "build" : "builds"}
          </span>
        </div>
      </div>
    </div>
  );
}
