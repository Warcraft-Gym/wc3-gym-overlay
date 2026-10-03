import type { MouseEvent } from "react";
import { GameIcon } from "../../components/GameIcon";
import { IconButton } from "../../components/IconButton";
import { RaceCrest } from "../../components/RaceCrest";
import { OPPONENT_ARMY_ENABLED, WINDOW_OPPONENT } from "../../config";
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

/** " · 6–5" when the opener's record is known. */
export function winLossSuffix(o: { wins?: number; losses?: number }): string {
  return typeof o.wins === "number" && typeof o.losses === "number" ? ` · ${o.wins}–${o.losses}` : "";
}

/** "Under 10 min 3–1 · 10–20 min 6–2 · 20+ min 3–3", skipping empty buckets. */
export function phasesLine(phases: Card["phases"]): string | null {
  if (!phases) return null;
  const buckets: { label: string; record: WinLoss }[] = [
    { label: "Under 10 min", record: phases.early },
    { label: "10–20 min", record: phases.mid },
    { label: "20+ min", record: phases.late },
  ];
  const parts = buckets
    .filter(({ record }) => record.wins + record.losses > 0)
    .map(({ label, record }) => `${label} ${record.wins}–${record.losses}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 1.06 → "+6%", 0.8 → "-20%". */
export function formatRelative(ratio: number): string {
  const pct = Math.round((ratio - 1) * 100);
  return `${pct >= 0 ? "+" : "-"}${Math.abs(pct)}%`;
}

/** "aka Life · CN · 19 seasons", "19 seasons", "First season". */
export function identityLine(identity: Card["identity"]): string | null {
  if (!identity) return null;
  const seasons = identity.seasons <= 1 ? "first season" : `${identity.seasons} seasons`;
  if (!identity.aka) return seasons.charAt(0).toUpperCase() + seasons.slice(1);
  return [`aka ${identity.aka}`, identity.country, seasons].filter(Boolean).join(" · ");
}

/** "3 wins in a row · 8 games in 24 h"; a single result is not a streak. */
export function momentumLine(card: Card): string | null {
  const parts: string[] = [];
  if (card.streak && card.streak.length >= 2) {
    parts.push(card.streak.result === "W" ? `${card.streak.length} wins in a row` : `${card.streak.length} losses in a row`);
  }
  if (card.gamesLast24h) parts.push(`${card.gamesLast24h} game${card.gamesLast24h === 1 ? "" : "s"} in 24 h`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "7 per game", "0.4 per game". */
export function perGameLabel(perGame: number): string {
  return `${Number.isInteger(perGame) ? perGame : perGame.toFixed(1)} per game`;
}

/** Their usual army. Off unless OPPONENT_ARMY_ENABLED (a premium candidate):
 *  even a card stored by a build that had it on shows nothing while off. */
export function ArmySection({ card, apiBase, enabled = OPPONENT_ARMY_ENABLED }: { card: Card; apiBase: string; enabled?: boolean }) {
  if (!enabled) return null;
  if (card.armyStatus === "loading") return <p className="opponent-card__note">Loading army…</p>;
  const army = card.composition;
  if (!army || army.units.length === 0) return null;
  return (
    <div className="opponent-card__openers">
      <p className="opponent-card__kicker">
        Army · last {army.games}
        {card.openersBasis === "vs-your-race" ? (
          <>
            {" "}
            vs <RaceIcon race={card.myRace} apiBase={apiBase} size={14} />
          </>
        ) : null}
      </p>
      {army.units.map((unit) => (
        <p key={unit.name} className="opponent-card__opener">
          <span className="opponent-card__hero">
            <GameIcon icon={unit.icon ?? undefined} iconUrl={heroIconUrl(apiBase, unit.icon ?? undefined)} size={18} />
            {unit.name}
          </span>
          <span className="opponent-card__faint">
            {perGameLabel(unit.perGame)} · {unit.inGames} of {army.games}
          </span>
        </p>
      ))}
    </div>
  );
}

function StyleSection({ card, apiBase }: { card: Card; apiBase: string }) {
  if (card.extrasStatus === "loading") return <p className="opponent-card__note">Loading play style…</p>;
  const style = card.style;
  if (!style) return null;
  return (
    <div className="opponent-card__openers">
      <p className="opponent-card__kicker">
        Play style · last {style.games}
        {card.openersBasis === "vs-your-race" ? (
          <>
            {" "}
            vs <RaceIcon race={card.myRace} apiBase={apiBase} size={14} />
          </>
        ) : null}
      </p>
      <p>
        {style.goldPerMinute} gold/min
        {style.goldVsOpponents !== null ? ` · ${formatRelative(style.goldVsOpponents)} gold vs his opponents` : ""}
      </p>
      {style.killsVsOpponents !== null ? <p>{formatRelative(style.killsVsOpponents)} kills vs his opponents</p> : null}
      {typeof style.heroKillsPerGame === "number" ? (
        <p>
          Hero kills {style.heroKillsPerGame} per game · loses {style.opponentHeroKillsPerGame ?? 0}
        </p>
      ) : null}
      <p className="opponent-card__faint">
        Into upkeep in {style.upkeepGames} of {style.games} · {style.mercsPerGame} mercs per game
      </p>
    </div>
  );
}

function CardBody({ card, apiBase }: { card: Card; apiBase: string }) {
  const { opponent } = card;
  const meta = [opponent.mmr !== null ? `${opponent.mmr} MMR` : null, opponent.rank !== null ? `rank ${opponent.rank}` : null, opponent.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      {identityLine(card.identity) ? <p className="opponent-card__identity">{identityLine(card.identity)}</p> : null}
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
          {momentumLine(card) ? <p className="opponent-card__meta">{momentumLine(card)}</p> : null}
          {phasesLine(card.phases) ? <p className="opponent-card__meta">{phasesLine(card.phases)}</p> : null}
          <dl className="opponent-card__stats">
            {typeof card.winChance === "number" ? (
              <>
                <dt>Your win chance</dt>
                <dd>{Math.round(card.winChance * 100)}% (MMR)</dd>
              </>
            ) : null}
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
            {card.headToHead ? (
              <>
                <dt>You vs them</dt>
                <dd>{formatRecord(card.headToHead)}</dd>
              </>
            ) : null}
            {card.myRecord ? (
              <>
                <dt>
                  Your games vs <RaceIcon race={card.opponent.race} apiBase={apiBase} />
                </dt>
                <dd>{formatRecord(card.myRecord.vsRace)}</dd>
                <dt>Your games on {card.map}</dt>
                <dd>{formatRecord(card.myRecord.onMap)}</dd>
              </>
            ) : null}
            {card.earlyWins && card.earlyWins.of > 0 ? (
              <>
                <dt>Wins before 10 min</dt>
                <dd>
                  {card.earlyWins.count} of {card.earlyWins.of}
                </dd>
              </>
            ) : null}
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
                  {card.firstHero.count} of {card.openerGames}{winLossSuffix(card.firstHero)}
                </span>
              </p>
              {card.openers.map((o) => (
                <p key={o.heroes.join("+")} className="opponent-card__opener">
                  <HeroIcons heroes={o.heroes} apiBase={apiBase} />
                  <span className="opponent-card__faint">
                    {o.count} of {card.openerGames}{winLossSuffix(o)}
                  </span>
                </p>
              ))}
            </div>
          ) : null}
          <ArmySection card={card} apiBase={apiBase} />
          <StyleSection card={card} apiBase={apiBase} />
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
