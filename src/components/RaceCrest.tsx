import { useState } from "react";
import { cn } from "../lib/cn";

export type Race = "human" | "orc" | "nightelf" | "undead" | "random";

export const RACE_LABEL: Record<Race, string> = {
  human: "Human",
  orc: "Orc",
  nightelf: "Night Elf",
  undead: "Undead",
  random: "Random",
};

const RACE_LETTERS: Record<Race, string> = {
  human: "HU",
  orc: "OR",
  nightelf: "NE",
  undead: "UD",
  random: "RD",
};

const RACE_TEXT_CLASS: Record<Race, string> = {
  human: "text-human",
  orc: "text-orc",
  nightelf: "text-nightelf",
  undead: "text-undead",
  random: "text-random",
};

/** Semantic text-color utility class for a race, shared by anything that
 *  labels a build's race or opponent races outside of a crest (matchup
 *  text, rails). */
export function raceTextClass(race: Race): string {
  return RACE_TEXT_CLASS[race];
}

/**
 * Faction crest image, `${apiBase}/factions/<race>.png`, with a lettered
 * fallback (HU/OR/NE/UD/RD) when the image fails to load — the overlay has
 * no bundled art, so a slow/offline site origin must degrade gracefully.
 */
export function RaceCrest({
  race,
  apiBase,
  size = 24,
  className,
}: {
  race: Race;
  apiBase: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.32 }}
        className={cn(
          "grid shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 font-display font-bold",
          RACE_TEXT_CLASS[race],
          className,
        )}
      >
        {RACE_LETTERS[race]}
      </span>
    );
  }

  return (
    <img
      src={`${apiBase}/factions/${race}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
