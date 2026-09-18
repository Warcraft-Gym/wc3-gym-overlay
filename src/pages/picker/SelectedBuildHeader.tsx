import { Button } from "../../components/Button";
import { DifficultyBadge } from "../../components/DifficultyBadge";
import { Matchup } from "../../components/Matchup";
import { relativeTime } from "../../lib/relativeTime";
import { WINDOW_OVERLAY } from "../../config";
import { host } from "../../host";
import type { ApiBuildListItem } from "../../api/schema";

/** The visually dominant panel at the top of the picker: nothing to look at
 *  until a build is selected, then it becomes the launch point for the
 *  overlay and the site. */
export function SelectedBuildHeader({ build, apiBase }: { build: ApiBuildListItem | null; apiBase: string }) {
  if (!build) {
    return (
      <header className="panel flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Pick a build below, then show the overlay in game.</p>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button variant="gold" disabled title="Pick a build first">
            Show overlay
          </Button>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">Pick a build first</p>
        </div>
      </header>
    );
  }

  return (
    <header className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <Matchup race={build.race} vsRace={build.vsRace} apiBase={apiBase} size={40} />
        <div className="min-w-0">
          <h2 className="truncate text-[clamp(1.1rem,1rem+0.6vw,1.5rem)] tracking-[0.03em] text-fg">
            {build.title}
          </h2>
          <div className="tnum mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <DifficultyBadge level={build.difficulty} />
            <span>
              {build.steps.length} steps · updated {relativeTime(build.updatedAt, Date.now())}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button variant="gold" onClick={() => void host.showWindow(WINDOW_OVERLAY)}>
          Show overlay
        </Button>
        <Button variant="ghost" onClick={() => void host.openExternal(`${apiBase}/learn/builds/${build.slug}`)}>
          Open on site
        </Button>
      </div>
    </header>
  );
}
