import { cn } from "../lib/cn";
import { RACE_LABEL, raceTextClass, type Race } from "./RaceCrest";

/**
 * Ported from `src/components/builds/BuildBadges.tsx` on the site — same
 * classes. Unlike the picker's crest-based `Matchup` in `RaceCrest.tsx`
 * (used by the header/panel), this is the site's *text-form* matchup used
 * inline in row meta lines: bold race, gold serif "vs", muted opponent.
 */

export type BuildRace = Exclude<Race, "random">;
export type BuildVsRace = BuildRace | "any";

const VS_LABEL: Record<BuildVsRace, string> = {
  human: "Human",
  orc: "Orc",
  nightelf: "Night Elf",
  undead: "Undead",
  any: "Any",
};

export function Matchup({
  race,
  vsRace,
  className,
}: {
  race: BuildRace;
  vsRace: BuildVsRace;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-sm", className)}>
      <span className={cn("font-bold", raceTextClass(race))}>{RACE_LABEL[race]}</span>
      <span className="mx-0.5 font-display text-[0.6rem] font-bold uppercase tracking-widest text-gold">vs</span>
      <span className="text-muted">{VS_LABEL[vsRace]}</span>
    </span>
  );
}

export type Difficulty = "beginner" | "intermediate" | "advanced";

const DIFF_TONE: Record<Difficulty, string> = {
  beginner: "border-win/50 text-win",
  intermediate: "border-arcane/50 text-arcane",
  advanced: "border-gold/50 text-gold",
};

export function DifficultyBadge({ level, className }: { level: Difficulty; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em]",
        DIFF_TONE[level],
        className,
      )}
    >
      {level}
    </span>
  );
}

export function TagChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-line bg-surface/60 px-2 py-0.5 text-[0.7rem] text-muted">
      {children}
    </span>
  );
}
