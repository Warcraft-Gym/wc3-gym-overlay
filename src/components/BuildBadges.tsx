import { cn } from "../lib/cn";
import { RACE_LABEL, RaceCrest, raceTextClass, type Race } from "./RaceCrest";

/**
 * Ported from `src/components/builds/BuildBadges.tsx` on the site — same
 * classes. Unlike the picker's crest-only `Matchup` in `components/Matchup.tsx`
 * (used by the compact in-game panel header), this is the site's row/header
 * matchup: bold race, gold serif "vs", then `VsRaces` (one small crest per
 * opponent race, or the "random" crest for "Any") plus the text label.
 *
 * F005: a build's opponent is `vsRaces: BuildRace[]` (empty means "any
 * opponent") — no longer a single value.
 */

export type BuildRace = Exclude<Race, "random">;
export type BuildVsRace = BuildRace | "any";

/** Human-readable opponent list: "Any", "Orc", "Orc / Undead". */
export function vsLabel(vsRaces: BuildRace[]): string {
  if (!vsRaces.length) return "Any";
  return vsRaces.map((r) => RACE_LABEL[r]).join(" / ");
}

/** The opponent side of a matchup: one crest per race, or the "random"
 *  crest and "Any" when the build has no opponent restriction. */
export function VsRaces({
  vsRaces,
  apiBase,
  size = 14,
  className,
}: {
  vsRaces: BuildRace[];
  apiBase: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {vsRaces.length ? (
        vsRaces.map((r) => <RaceCrest key={r} race={r} apiBase={apiBase} size={size} />)
      ) : (
        <RaceCrest race="random" apiBase={apiBase} size={size} />
      )}
      <span className="text-muted">{vsLabel(vsRaces)}</span>
    </span>
  );
}

export function Matchup({
  race,
  vsRaces,
  apiBase,
  className,
}: {
  race: BuildRace;
  vsRaces: BuildRace[];
  apiBase: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-sm", className)}>
      <span className={cn("font-bold", raceTextClass(race))}>{RACE_LABEL[race]}</span>
      <span className="mx-0.5 font-display text-[0.6rem] font-bold uppercase tracking-widest text-gold">vs</span>
      <VsRaces vsRaces={vsRaces} apiBase={apiBase} />
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
