import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { IconButton } from "../../../components/IconButton";
import { cn } from "../../../lib/cn";
import type { GameIconEntry, IconRace } from "../../../api/schema";

const RACE_GROUP_ORDER: IconRace[] = ["human", "orc", "nightelf", "undead", "neutral"];

const RACE_GROUP_LABEL: Record<IconRace, string> = {
  human: "Human",
  orc: "Orc",
  nightelf: "Night Elf",
  undead: "Undead",
  neutral: "Neutral",
};

/**
 * The step icon picker: a nested dialog (portalled the same way as the
 * outer `Modal`, focus-trapped and Escape-closable independently) listing
 * every icon in `icons`, grouped by race heading and filterable by title.
 * 36px thumbnails with `title` as the native tooltip; each icon is its own
 * focusable button so Tab alone is enough to reach any icon.
 */
export function IconPicker({
  icons,
  onPick,
  onClose,
}: {
  icons: GameIconEntry[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? icons.filter((icon) => icon.title.toLowerCase().includes(q)) : icons;
    const groups = new Map<IconRace, GameIconEntry[]>();
    for (const icon of filtered) {
      const list = groups.get(icon.race) ?? [];
      list.push(icon);
      groups.set(icon.race, list);
    }
    return RACE_GROUP_ORDER.map((race) => ({ race, icons: groups.get(race) ?? [] })).filter(
      (group) => group.icons.length > 0,
    );
  }, [icons, query]);

  return (
    <Modal label="Pick an icon" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-base">Pick an icon</h2>
        <IconButton aria-label="Close icon picker" onClick={onClose}>
          ×
        </IconButton>
      </div>

      <label className="relative mt-4 block">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="search"
          aria-label="Search icons"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons by name…"
          className="h-9 w-full rounded border border-line bg-surface-2/60 pl-9 pr-3 text-sm text-fg placeholder:text-faint focus:border-gold/60 focus:outline-none"
        />
      </label>

      <div className="mt-4 max-h-[24rem] space-y-4 overflow-y-auto">
        {grouped.length === 0 ? (
          <p className="text-sm text-muted">No icons match "{query}".</p>
        ) : (
          grouped.map((group) => (
            <div key={group.race}>
              <p className="kicker text-[0.62rem]">{RACE_GROUP_LABEL[group.race]}</p>
              <div role="group" aria-label={RACE_GROUP_LABEL[group.race]} className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-8">
                {group.icons.map((icon) => (
                  <button
                    key={icon.key}
                    type="button"
                    title={icon.title}
                    aria-label={icon.title}
                    onClick={() => onPick(icon.key)}
                    className={cn(
                      "grid size-9 place-items-center rounded border border-line bg-surface-2/60 transition-colors",
                      "hover:border-gold/60 focus-visible:border-gold",
                    )}
                  >
                    <img src={icon.url} alt="" width={36} height={36} loading="lazy" className="size-full rounded object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
