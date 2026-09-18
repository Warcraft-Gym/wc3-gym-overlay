import { cn } from "../lib/cn";
import { RACE_LABEL, RaceCrest, type Race } from "./RaceCrest";

export type BuildRace = Exclude<Race, "random">;

/**
 * "Race vs Opponent(s)" — crests only, no text label. Used by the always-
 * on-top in-game panel header, which stays compact; the picker's fuller
 * `Matchup`/`VsRaces` (`components/BuildBadges.tsx`) also render the text
 * label.
 *
 * F005: a build's opponent is `vsRaces: BuildRace[]` (empty means "any
 * opponent") — one crest per race, or the "random" crest when empty.
 */
export function Matchup({
  race,
  vsRaces,
  apiBase,
  size = 22,
  className,
}: {
  race: BuildRace;
  vsRaces: BuildRace[];
  apiBase: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <RaceCrest race={race} apiBase={apiBase} size={size} />
      <span className="font-display text-[0.55rem] font-bold uppercase tracking-widest text-gold">vs</span>
      {vsRaces.length ? (
        vsRaces.map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <RaceCrest race={r} apiBase={apiBase} size={size} />
            <span className="sr-only">{RACE_LABEL[r]}</span>
          </span>
        ))
      ) : (
        <>
          <RaceCrest race="random" apiBase={apiBase} size={size} />
          <span className="sr-only">Any</span>
        </>
      )}
    </span>
  );
}
