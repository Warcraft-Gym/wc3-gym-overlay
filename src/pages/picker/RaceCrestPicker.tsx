import { useState } from "react";
import { cn } from "../../lib/cn";

export type CrestOption = "human" | "orc" | "nightelf" | "undead" | "any";

export const CREST_OPTIONS: CrestOption[] = ["any", "human", "orc", "nightelf", "undead"];

const RACE_LABEL: Record<CrestOption, string> = {
  any: "Any",
  human: "Human",
  orc: "Orc",
  nightelf: "Night Elf",
  undead: "Undead",
};

const RACE_LETTER: Record<CrestOption, string> = {
  any: "RD",
  human: "HU",
  orc: "OR",
  nightelf: "NE",
  undead: "UD",
};

/**
 * One large labelled race crest disc, ported from the site's
 * `RaceCrest`/`RaceCrestRow` (`src/components/builds/RaceCrestPicker.tsx`) —
 * same classes. Faction art comes from `apiBase` (`factions/large/<race>.webp`,
 * `factions/large/random.webp` for "Any") instead of a bundled Next asset,
 * with a lettered fallback since the overlay ships no bundled art.
 */
export function RaceCrest({
  id,
  apiBase,
  active,
  onClick,
}: {
  id: CrestOption;
  apiBase: string;
  active: boolean;
  onClick: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const src = id === "any" ? `${apiBase}/factions/large/random.webp` : `${apiBase}/factions/large/${id}.webp`;

  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="group flex w-16 flex-col items-center gap-1.5">
      <span
        className={cn(
          "relative grid size-14 place-items-center rounded-full border-2 transition-[border-color,box-shadow,transform,opacity] duration-[var(--wg-dur)] ease-[var(--ease-out-expo)] group-hover:-translate-y-0.5",
          active
            ? "border-gold bg-gold/10 shadow-[0_0_0_4px_rgba(0,0,0,.5),0_0_28px_-4px_var(--wg-gold-glow)]"
            : "border-line-strong/60 bg-surface/70 opacity-80 group-hover:border-gold/50 group-hover:opacity-100",
        )}
      >
        {broken ? (
          <span className="font-display text-[0.6rem] font-bold text-muted">{RACE_LETTER[id]}</span>
        ) : (
          <img
            src={src}
            alt=""
            width={56}
            height={56}
            onError={() => setBroken(true)}
            className="size-11 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,.8)]"
          />
        )}
      </span>
      <span
        className={cn(
          "font-display text-[0.6rem] font-bold uppercase leading-none tracking-[0.12em] transition-colors",
          active ? "text-gold" : "text-muted group-hover:text-fg",
        )}
      >
        {RACE_LABEL[id]}
      </span>
    </button>
  );
}
