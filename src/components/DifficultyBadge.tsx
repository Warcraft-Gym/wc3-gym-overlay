import { cn } from "../lib/cn";

export type Difficulty = "beginner" | "intermediate" | "advanced";

const TONE: Record<Difficulty, string> = {
  beginner: "border-win/50 text-win",
  intermediate: "border-arcane/50 text-arcane",
  advanced: "border-gold/50 text-gold",
};

export function DifficultyBadge({ level, className }: { level: Difficulty; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.14em]",
        TONE[level],
        className,
      )}
    >
      {level}
    </span>
  );
}
