import { useState, type KeyboardEvent } from "react";
import { Copy, Download, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { DifficultyBadge, PrivateBadge, TagChip, vsLabel, type Difficulty } from "../../components/BuildBadges";
import { RaceCrest as SmallRaceCrest, RACE_LABEL, raceTextClass, type Race } from "../../components/RaceCrest";
import { cn } from "../../lib/cn";
import { host } from "../../host";
import { exportBuild, slugifyForFilename } from "../../lib/buildExchange";
import { isLocalBuild, type AnyBuild } from "../../data/useAllBuilds";

const DIFFICULTY_RAIL: Record<Difficulty, string> = {
  beginner: "before:bg-win",
  intermediate: "before:bg-arcane",
  advanced: "before:bg-gold",
};

const RACE_LETTER: Record<string, string> = {
  human: "HU",
  orc: "OR",
  nightelf: "NE",
  undead: "UD",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));
}

/** The big race crest on the left of the row, ported from the site's
 *  `BuildRow` (`src/components/builds/BuildRow.tsx`) — `factions/large/`
 *  art from `apiBase`, with a lettered fallback since the overlay ships no
 *  bundled art. */
function LargeCrest({ race, apiBase }: { race: Race; apiBase: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span
        className={cn(
          "grid size-14 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 font-display font-bold",
          raceTextClass(race),
        )}
      >
        {RACE_LETTER[race] ?? "??"}
      </span>
    );
  }
  return (
    <img
      src={`${apiBase}/factions/large/${race}.webp`}
      alt={RACE_LABEL[race]}
      width={56}
      height={56}
      onError={() => setBroken(true)}
      className="size-14 shrink-0 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,.8)]"
    />
  );
}

/**
 * One dense row in the build list, ported from the site's `BuildRow`
 * (`src/components/builds/BuildRow.tsx`) — same grid/rail/type classes,
 * with a "Use in game" toggle in place of the site's link-to-detail-page
 * behaviour. Focusable as a whole — Enter anywhere on the row selects it,
 * same as clicking the button.
 */
export function BuildRow({
  build,
  apiBase,
  selected,
  onSelect,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  build: AnyBuild;
  apiBase: string;
  selected: boolean;
  onSelect: () => void;
  /** F003: opens the editor pre-filled from this build, for any row (site
   *  or private). */
  onDuplicate: () => void;
  /** F003: local rows only — opens the editor in place. */
  onEdit?: () => void;
  /** F003: local rows only — deletes after an inline confirm. */
  onDelete?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.key === "Enter" && event.target === event.currentTarget) {
      event.preventDefault();
      onSelect();
    }
  }

  /** F004: a single private build → `<slug-or-title>.wc3gym.json`, ready to
   *  hand to a friend or back up — see `buildExchange.ts` for the format. */
  async function handleExport() {
    if (!isLocalBuild(build)) return;
    const payload = exportBuild(build);
    await host.saveTextFile(`${slugifyForFilename(build.title)}.wc3gym.json`, JSON.stringify(payload, null, 2));
  }

  function handleSubmit() {
    void host.openExternal(`${apiBase}/learn/builds/submit`);
  }

  return (
    <li
      data-build={build.slug}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "panel relative grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-5 overflow-hidden py-3 pl-5 pr-4",
        "transition-[border-color,transform] duration-[var(--wg-dur)] ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:border-gold/50",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:opacity-80",
        DIFFICULTY_RAIL[build.difficulty],
        selected ? "border-gold/60 bg-gold/5" : undefined,
      )}
    >
      <LargeCrest race={build.race} apiBase={apiBase} />

      <div className="min-w-0">
        <p className="truncate font-display text-[0.98rem] font-bold uppercase leading-snug tracking-[0.05em] text-fg transition-colors hover:text-gold">
          {build.title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-sm text-muted">{build.summary}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="text-faint">vs</span>
            {build.vsRaces.length ? (
              build.vsRaces.map((r) => <SmallRaceCrest key={r} race={r} apiBase={apiBase} size={14} />)
            ) : (
              <SmallRaceCrest race="random" apiBase={apiBase} size={14} />
            )}
            <span>{vsLabel(build.vsRaces)}</span>
          </span>
          <span className="text-faint">·</span>
          <span>by {build.author}</span>
          {build.tags.slice(0, 3).map((tag) => (
            <TagChip key={tag}>{tag}</TagChip>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          {build.source === "local" ? <PrivateBadge /> : null}
          <DifficultyBadge level={build.difficulty} />
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-loss">Delete?</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button variant="danger" size="sm" onClick={() => onDelete?.()}>
              Delete
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <IconButton aria-label={`Duplicate ${build.title}`} onClick={onDuplicate}>
              <Copy size={13} />
            </IconButton>
            {onEdit ? (
              <IconButton aria-label={`Edit ${build.title}`} onClick={onEdit}>
                <Pencil size={13} />
              </IconButton>
            ) : null}
            {onDelete ? (
              <IconButton aria-label={`Delete ${build.title}`} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} />
              </IconButton>
            ) : null}
            {isLocalBuild(build) ? (
              <>
                <IconButton aria-label={`Export ${build.title}`} onClick={() => void handleExport()}>
                  <Download size={13} />
                </IconButton>
                <IconButton aria-label={`Submit ${build.title} to site`} onClick={handleSubmit}>
                  <Send size={13} />
                </IconButton>
              </>
            ) : null}
          </div>
        )}

        <span className="tnum text-xs text-faint">
          {build.steps.length} steps{build.patch ? ` · ${build.patch}` : ""} · {formatDate(build.updatedAt)}
        </span>
        <Button
          variant={selected ? "ghost" : "gold"}
          className={selected ? "border-gold/60 text-gold hover:border-gold" : undefined}
          aria-pressed={selected}
          onClick={onSelect}
        >
          {selected ? "In game" : "Use in game"}
        </Button>
      </div>
    </li>
  );
}
