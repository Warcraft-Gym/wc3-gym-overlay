import type { KeyboardEvent } from "react";
import { Button } from "../../components/Button";
import { DifficultyBadge } from "../../components/DifficultyBadge";
import { Matchup } from "../../components/Matchup";
import { raceTextClass } from "../../components/RaceCrest";
import { cn } from "../../lib/cn";
import type { ApiBuildListItem } from "../../api/schema";

const RACE_RAIL: Record<string, string> = {
  human: "before:bg-human",
  orc: "before:bg-orc",
  nightelf: "before:bg-nightelf",
  undead: "before:bg-undead",
};

/** One dense row in the build list: race rail, matchup, title/summary/meta,
 *  and the "Use in game" selection control. Focusable as a whole — Enter
 *  anywhere on the row selects it, same as clicking the button. */
export function BuildRow({
  build,
  apiBase,
  selected,
  onSelect,
}: {
  build: ApiBuildListItem;
  apiBase: string;
  selected: boolean;
  onSelect: () => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.key === "Enter" && event.target === event.currentTarget) {
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <li
      data-build={build.slug}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "panel relative flex items-center gap-3 overflow-hidden py-2.5 pl-4 pr-3 transition-colors duration-[var(--wg-dur-fast)] ease-[var(--ease-out-expo)]",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        RACE_RAIL[build.race],
        selected ? "border-gold/60 bg-gold/5" : "hover:border-line-strong",
      )}
    >
      <Matchup race={build.race} vsRace={build.vsRace} apiBase={apiBase} className="shrink-0" />

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-bold tracking-[0.02em]", raceTextClass(build.race))}>
          {build.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{build.summary}</p>
        <p className="tnum mt-1 text-[0.68rem] text-faint">
          {build.steps.length} steps · by {build.author}
        </p>
      </div>

      <DifficultyBadge level={build.difficulty} className="shrink-0" />

      <Button variant={selected ? "gold" : "ghost"} aria-pressed={selected} onClick={onSelect} className="shrink-0">
        Use in game
      </Button>
    </li>
  );
}
