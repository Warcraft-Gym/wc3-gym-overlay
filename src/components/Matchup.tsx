import { cn } from "../lib/cn";
import { RACE_LABEL, RaceCrest, type Race } from "./RaceCrest";

export type BuildRace = Exclude<Race, "random">;
export type BuildVsRace = BuildRace | "any";

/** "Race vs Opponent" with faction crests; "any" renders a "vs any" chip
 *  instead of a second crest, since there's no faction art for "any". */
export function Matchup({
  race,
  vsRace,
  apiBase,
  size = 22,
  className,
}: {
  race: BuildRace;
  vsRace: BuildVsRace;
  apiBase: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <RaceCrest race={race} apiBase={apiBase} size={size} />
      <span className="font-display text-[0.55rem] font-bold uppercase tracking-widest text-gold">vs</span>
      {vsRace === "any" ? (
        <span className="inline-flex items-center rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-widest text-muted">
          Any
        </span>
      ) : (
        <>
          <RaceCrest race={vsRace} apiBase={apiBase} size={size} />
          <span className="sr-only">{RACE_LABEL[vsRace]}</span>
        </>
      )}
    </span>
  );
}
