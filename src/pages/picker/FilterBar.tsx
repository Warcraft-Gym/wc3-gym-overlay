import { IconButton } from "../../components/IconButton";
import { RACE_LABEL, RaceCrest, type Race } from "../../components/RaceCrest";
import type { BuildRace, BuildVsRace } from "../../components/Matchup";

const RACES: BuildRace[] = ["human", "orc", "nightelf", "undead"];

export type Filters = {
  race?: BuildRace;
  vsRace?: BuildVsRace;
  q?: string;
};

/** My-race / vs-race crest toggles, search box and the match-count caption.
 *  "Random" (my race) and "Any" (vs race) both mean "no filter on this
 *  side" — clicking either always clears, matching `filterBuilds`'s
 *  semantics for an unset filter. */
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
  function pickRace(id: BuildRace | "random") {
    if (id === "random" || filters.race === id) onChange({ ...filters, race: undefined });
    else onChange({ ...filters, race: id });
  }

  function pickVsRace(id: BuildRace | "any") {
    if (id === "any" || filters.vsRace === id) onChange({ ...filters, vsRace: undefined });
    else onChange({ ...filters, vsRace: id });
  }

  return (
    <div className="panel flex flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
        <CrestGroup
          label="Your race"
          apiBase={apiBase}
          options={[...RACES, "random"] as const}
          active={filters.race ?? "random"}
          onPick={pickRace}
        />
        <CrestGroup
          label="Against"
          apiBase={apiBase}
          options={[...RACES, "any"] as const}
          active={filters.vsRace ?? "any"}
          onPick={pickVsRace}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label="Search builds"
          value={filters.q ?? ""}
          onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
          placeholder="Search builds, tags, authors…"
          className="h-9 flex-1 rounded border border-line bg-surface-2/60 px-3 text-sm text-fg placeholder:text-faint focus:border-gold/60 focus:outline-none"
        />
        <span className="tnum shrink-0 whitespace-nowrap text-xs text-faint">
          {matchCount} of {totalCount} builds
        </span>
      </div>
    </div>
  );
}

function CrestGroup<T extends string>({
  label,
  apiBase,
  options,
  active,
  onPick,
}: {
  label: string;
  apiBase: string;
  options: readonly T[];
  active: T;
  onPick: (id: T) => void;
}) {
  return (
    <div>
      <p className="kicker mb-1.5">{label}</p>
      <div className="flex gap-1.5">
        {options.map((id) => {
          const race = (id === "any" ? "random" : id) as Race;
          const isActive = active === id;
          return (
            <IconButton
              key={id}
              active={isActive}
              aria-pressed={isActive}
              aria-label={id === "any" ? "Any race" : RACE_LABEL[race]}
              onClick={() => onPick(id)}
            >
              <RaceCrest race={race} apiBase={apiBase} size={18} />
            </IconButton>
          );
        })}
      </div>
    </div>
  );
}
