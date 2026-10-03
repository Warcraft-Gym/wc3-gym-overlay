import { RaceCrest } from "../../../components/RaceCrest";
import { cn } from "../../../lib/cn";
import type { ProfilePick } from "../../../w3c/profile";
import { RACE_LABEL } from "../../opponent/format";

/** Which race the profile shows: one chip per race picked in the lobby,
 *  Random included, with your game count. Races you have not played this
 *  season or last are disabled. */
export function RacePicker({
  races,
  value,
  apiBase,
  onPick,
}: {
  races: { race: ProfilePick; games: number }[];
  value: ProfilePick;
  apiBase: string;
  onPick: (race: ProfilePick) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Show my profile as" className="flex flex-wrap gap-1.5">
      {races.map(({ race, games }) => {
        const checked = race === value;
        const label = `${RACE_LABEL[race]}, ${games} ${games === 1 ? "game" : "games"}`;
        return (
          <button
            key={race}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={games === 0 ? `No ${RACE_LABEL[race]} games in the last two seasons` : label}
            disabled={games === 0}
            onClick={() => onPick(race)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors",
              checked ? "border-gold bg-gold/10 text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg",
              games === 0 && "cursor-not-allowed opacity-35 hover:border-line hover:text-muted",
            )}
          >
            <RaceCrest race={race} apiBase={apiBase} size={22} />
            <span className="tnum">{games}</span>
          </button>
        );
      })}
    </div>
  );
}
