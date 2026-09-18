import { Button } from "../../components/Button";
import { DifficultyBadge, Matchup } from "../../components/BuildBadges";
import { relativeTime } from "../../lib/relativeTime";
import { WINDOW_OVERLAY } from "../../config";
import { host } from "../../host";
import { SETTINGS } from "../../store/keys";
import { useStoreValue } from "../../store/useStore";
import { formatCombo } from "../../shortcuts";
import type { ApiBuildListItem } from "../../api/schema";

/**
 * The visually dominant panel at the top of the picker, ported from the
 * site's `FeaturedBuild` (`src/components/builds/BuildRow.tsx`) — same wide
 * art-backed card, adapted into two states (nothing selected / a build
 * selected) instead of a single link to `/learn/builds/[slug]`.
 *
 * The toggle-shortcut hint reads live off `useStoreValue(SETTINGS)` (C-104)
 * so it updates the instant the user rebinds the combo in Settings, in
 * both states — there's a hint even before anything is selected, since the
 * shortcut works either way once the app has a selected build in storage.
 */
export function SelectedBuildHeader({ build, apiBase }: { build: ApiBuildListItem | null; apiBase: string }) {
  const settings = useStoreValue(SETTINGS);
  const hint = (
    <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">
      or press <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5">{formatCombo(settings.shortcuts.toggle_overlay)}</kbd>
    </p>
  );

  if (!build) {
    return (
      <header className="panel relative overflow-hidden">
        <img
          src={`${apiBase}/graphics/build-orders-2.webp`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.85)_0%,rgba(0,0,0,.6)_45%,rgba(0,0,0,.15)_100%)]"
        />
        <div className="relative flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="kicker">Build picker</p>
            <h2 className="mt-2 font-display text-[1.6rem] uppercase tracking-[0.06em] text-fg">Pick a build</h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              Choose a build below, then show the overlay in game.
            </p>
          </div>
          <div className="flex flex-col items-start gap-1.5 rounded-lg bg-black/50 p-3 sm:items-end">
            <Button variant="gold" disabled title="Pick a build first">
              Show overlay
            </Button>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">Pick a build first</p>
            {hint}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="panel relative overflow-hidden">
      <img
        src={`${apiBase}/factions/headers/${build.race}.webp`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.85)_0%,rgba(0,0,0,.6)_45%,rgba(0,0,0,.15)_100%)]"
      />
      <div className="relative grid gap-5 p-6 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-7">
        <img
          src={`${apiBase}/factions/large/${build.race}.webp`}
          alt=""
          className="size-20 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,.9)] sm:size-24"
        />
        <div className="min-w-0">
          <p className="kicker">Selected build</p>
          <h2 className="mt-2 truncate font-display text-[1.6rem] uppercase tracking-[0.06em] text-fg">
            {build.title}
          </h2>
          <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-muted">{build.summary}</p>
          <div className="tnum mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            <Matchup race={build.race} vsRace={build.vsRace} />
            <DifficultyBadge level={build.difficulty} />
            <span>
              by {build.author} · updated {relativeTime(build.updatedAt, Date.now())}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 rounded-lg bg-black/50 p-3 sm:items-end">
          <div className="flex gap-2">
            <Button variant="gold" onClick={() => void host.showWindow(WINDOW_OVERLAY)}>
              Show overlay
            </Button>
            <Button variant="ghost" onClick={() => void host.openExternal(`${apiBase}/learn/builds/${build.slug}`)}>
              Open on site
            </Button>
          </div>
          {hint}
        </div>
      </div>
    </header>
  );
}
