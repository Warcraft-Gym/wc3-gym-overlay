import type { MouseEvent } from "react";
import type { ApiBuildListItem } from "../../api/schema";
import { IconButton } from "../../components/IconButton";
import { Matchup } from "../../components/Matchup";
import { WINDOW_OVERLAY } from "../../config";
import type { ClockState } from "../../data/useClock";
import { host } from "../../host";
import { reset, togglePlayPause } from "../../lib/timerActions";
import { Clock } from "./Clock";

/** Buttons live inside the drag region, so a click on one must not also
 *  start dragging the (transparent, always-on-top) window. */
function stopDragStart(event: MouseEvent): void {
  event.stopPropagation();
}

export function PanelHeader({
  build,
  apiBase,
  clock,
  compact,
  onToggleCompact,
}: {
  build: ApiBuildListItem | null;
  apiBase: string;
  clock: ClockState;
  compact: boolean;
  onToggleCompact: () => void;
}) {
  return (
    <header
      data-tauri-drag-region
      onMouseDown={() => void host.startDragging()}
      className="overlay-header"
    >
      <div className="overlay-header__title">
        {build ? (
          <>
            <Matchup race={build.race} vsRaces={build.vsRaces} apiBase={apiBase} size={16} />
            <span className="overlay-header__build-title" title={build.title}>
              {build.title}
            </span>
          </>
        ) : (
          <span className="overlay-header__build-title overlay-header__build-title--empty">
            No build selected
          </span>
        )}
      </div>

      <div className="overlay-header__actions">
        <Clock elapsedSec={clock.elapsedSec} />

        <IconButton
          aria-label={clock.running ? "Pause" : "Play"}
          onMouseDown={stopDragStart}
          onClick={() => void togglePlayPause()}
        >
          <span aria-hidden="true">{clock.running ? "⏸" : "▶"}</span>
        </IconButton>

        <IconButton aria-label="Reset" onMouseDown={stopDragStart} onClick={() => void reset()}>
          <span aria-hidden="true">{"↺"}</span>
        </IconButton>

        <IconButton
          aria-label={compact ? "Full view" : "Compact view"}
          aria-pressed={compact}
          onMouseDown={stopDragStart}
          onClick={onToggleCompact}
        >
          <span aria-hidden="true">{compact ? "⤡" : "⤢"}</span>
        </IconButton>

        <IconButton
          aria-label="Hide overlay"
          onMouseDown={stopDragStart}
          onClick={() => void host.hideWindow(WINDOW_OVERLAY)}
        >
          <span aria-hidden="true">{"✕"}</span>
        </IconButton>
      </div>
    </header>
  );
}
