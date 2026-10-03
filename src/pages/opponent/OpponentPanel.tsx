import type { MouseEvent } from "react";
import { GameIcon } from "../../components/GameIcon";
import { IconButton } from "../../components/IconButton";
import { RaceCrest } from "../../components/RaceCrest";
import { WINDOW_OPPONENT } from "../../config";
import { host } from "../../host";
import { isValidBattleTag } from "../../opponentWatcher";
import { OPPONENT, SETTINGS, type OpponentState, type Settings } from "../../store/keys";
import { useStoreValue } from "../../store/useStore";
import { heroInfo } from "../../w3c/heroes";
import type { CardRace, OpponentCard as Card, WinLoss } from "../../w3c/opponentCard";

export const RACE_LABEL: Readonly<Record<CardRace, string>> = {
  human: "Human",
  orc: "Orc",
  nightelf: "Night Elf",
  undead: "Undead",
  random: "Random",
};

export function formatRecord(r: WinLoss): string {
  const games = r.wins + r.losses;
  if (games === 0) return "no games";
  return `${r.wins}–${r.losses} (${Math.round((r.wins / games) * 100)}%)`;
}

/** A faction crest in place of the race's name; the name stays for screen
 *  readers. */
function RaceIcon({ race, apiBase, size = 16 }: { race: CardRace; apiBase: string; size?: number }) {
  return (
    <span className="opponent-card__race">
      <RaceCrest race={race} apiBase={apiBase} size={size} />
      <span className="sr-only">{RACE_LABEL[race]}</span>
    </span>
  );
}

function heroIconUrl(apiBase: string, icon: string | undefined): string | undefined {
  return icon ? `${apiBase}/wc3-icons/${icon}.webp` : undefined;
}

function Hero({ name, apiBase }: { name: string; apiBase: string }) {
  const info = heroInfo(name);
  return (
    <span className="opponent-card__hero">
      <GameIcon icon={info.icon} iconUrl={heroIconUrl(apiBase, info.icon)} size={18} />
      {info.title}
    </span>
  );
}

/** Heroes in pick order, "A → B". */
function HeroIcons({ heroes, apiBase }: { heroes: string[]; apiBase: string }) {
  return (
    <span className="opponent-card__heroes">
      {heroes.map((name, index) => (
        <span key={`${name}-${index}`} className="opponent-card__hero">
          {index > 0 ? <span className="opponent-card__faint" aria-hidden="true">→</span> : null}
          <Hero name={name} apiBase={apiBase} />
        </span>
      ))}
    </span>
  );
}

function CardBody({ card, apiBase }: { card: Card; apiBase: string }) {
  const { opponent } = card;
  const meta = [opponent.mmr !== null ? `${opponent.mmr} MMR` : null, opponent.rank !== null ? `rank ${opponent.rank}` : null, opponent.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      {meta ? <p className="opponent-card__meta">{meta}</p> : null}
      {card.sampleSize === 0 ? (
        <p className="opponent-card__note">No ladder games found for this opponent yet.</p>
      ) : (
        <>
          <p className="opponent-card__form" aria-label={`Recent form, newest first: ${card.form.join(" ")}`}>
            {card.form.map((r, i) => (
              <span key={i} className={r === "W" ? "opponent-card__w" : "opponent-card__l"}>
                {r}
              </span>
            ))}
            <span className="opponent-card__faint">{card.sampleSize} games</span>
          </p>
          <dl className="opponent-card__stats">
            {card.vsMyRace ? (
              <>
                <dt>
                  vs <RaceIcon race={card.myRace} apiBase={apiBase} />
                </dt>
                <dd>{formatRecord(card.vsMyRace)}</dd>
              </>
            ) : null}
            <dt>on {card.map}</dt>
            <dd>{formatRecord(card.onMap)}</dd>
          </dl>
          {card.firstHero ? (
            <div className="opponent-card__openers">
              <p className="opponent-card__kicker">
                {card.openersBasis === "vs-your-race" ? (
                  <>
                    Opens vs <RaceIcon race={card.myRace} apiBase={apiBase} size={14} />
                  </>
                ) : (
                  "Opens (all games)"
                )}
              </p>
              <p className="opponent-card__opener">
                <span className="opponent-card__heroes">
                  <Hero name={card.firstHero.hero} apiBase={apiBase} />
                  <span>first</span>
                </span>
                <span className="opponent-card__faint">
                  {card.firstHero.count} of {card.openerGames}
                </span>
              </p>
              {card.openers.map((o) => (
                <p key={o.heroes.join("+")} className="opponent-card__opener">
                  <HeroIcons heroes={o.heroes} apiBase={apiBase} />
                  <span className="opponent-card__faint">
                    {o.count} of {card.openerGames}
                  </span>
                </p>
              ))}
            </div>
          ) : null}
          {card.thinSample ? <p className="opponent-card__note">Few games, take the numbers lightly.</p> : null}
        </>
      )}
    </>
  );
}

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
          <span className="opponent-card__kicker">Opponent</span>
          {showCard ? (
            <span className="opponent-panel__title">
              <RaceIcon race={card.opponent.race} apiBase={settings.apiBase} size={18} />
              {card.opponent.name}
            </span>
          ) : null}
        </div>
        <div className="overlay-header__actions">
          <IconButton
            aria-label="Hide opponent window"
            onMouseDown={stopDragStart}
            onClick={() => void host.hideWindow(WINDOW_OPPONENT)}
          >
            <span aria-hidden="true">{"✕"}</span>
          </IconButton>
        </div>
      </header>
      <section className="opponent-card" aria-label="Opponent">
        <div className="opponent-card__body">
          {empty ? <p className="opponent-card__note">{empty}</p> : null}
          {!empty && state.status === "loading" ? <p className="opponent-card__note">Looking up your opponent…</p> : null}
          {!empty && state.status === "error" ? (
            <p className="opponent-card__note" role="alert">
              {state.error}
            </p>
          ) : null}
          {!empty && state.status === "ok" && card ? (
            <>
              {!state.live ? <p className="opponent-card__kicker">Last game</p> : null}
              <CardBody card={card} apiBase={settings.apiBase} />
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
