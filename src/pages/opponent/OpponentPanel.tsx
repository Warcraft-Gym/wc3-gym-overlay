import type { MouseEvent } from "react";
import { IconButton } from "../../components/IconButton";
import { WINDOW_OPPONENT } from "../../config";
import { host } from "../../host";
import { isValidBattleTag } from "../../opponentWatcher";
import { OPPONENT, SETTINGS, type OpponentState, type Settings } from "../../store/keys";
import { useStoreValue } from "../../store/useStore";
import { CardView, RaceIcon } from "./CardView";

/** What the window says when there is no card to show yet. */
export function emptyMessage(settings: Pick<Settings, "opponentCard" | "myBattleTag">, state: OpponentState): string | null {
  if (!settings.opponentCard) return "The opponent card is off. Turn it on in Settings, W3Champions.";
  if (!settings.myBattleTag || !isValidBattleTag(settings.myBattleTag)) return "Set your BattleTag in Settings, W3Champions.";
  if (state.status === "idle" || (!state.card && !state.live)) return "Waiting for your next W3Champions 1v1.";
  return null;
}

/** Buttons live inside the drag region, so a click on one must not also
 *  start dragging the window. */
function stopDragStart(event: MouseEvent): void {
  event.stopPropagation();
}

/** The opponent window: header (crest, name, known-player badge, close) and
 *  the card, or a one-line state while there is none. */
export function OpponentPanel() {
  const state = useStoreValue(OPPONENT);
  const settings = useStoreValue(SETTINGS);
  const card = state.card;
  const empty = emptyMessage(settings, state);
  const showCard = !empty && card !== null;

  return (
    <div
      data-overlay-root
      style={{ opacity: settings.opacity, transform: `scale(${settings.scale})`, transformOrigin: "top left" }}
    >
      <header data-tauri-drag-region onMouseDown={() => void host.startDragging()} className="overlay-header">
        <div className="overlay-header__title">
          {showCard ? (
            <span className="oc-title">
              <RaceIcon race={card.opponent.race} apiBase={settings.apiBase} size={20} />
              <span className="oc-title__name">{card.opponent.name}</span>
              {card.identity?.aka ? <span className="oc-badge">aka {card.identity.aka}</span> : null}
              {!state.live ? <span className="oc-badge oc-badge--muted">Last game</span> : null}
            </span>
          ) : (
            <span className="oc-kicker">Opponent</span>
          )}
        </div>
        <div className="overlay-header__actions">
          <IconButton aria-label="Hide opponent window" onMouseDown={stopDragStart} onClick={() => void host.hideWindow(WINDOW_OPPONENT)}>
            <span aria-hidden="true">{"✕"}</span>
          </IconButton>
        </div>
      </header>
      <section className="oc-body" aria-label="Opponent">
        {empty ? <p className="oc-note">{empty}</p> : null}
        {!empty && state.status === "loading" ? <p className="oc-note">Looking up your opponent…</p> : null}
        {!empty && state.status === "error" ? (
          <p className="oc-note" role="alert">
            {state.error}
          </p>
        ) : null}
        {!empty && state.status === "ok" && card ? <CardView card={card} apiBase={settings.apiBase} /> : null}
      </section>
    </div>
  );
}
