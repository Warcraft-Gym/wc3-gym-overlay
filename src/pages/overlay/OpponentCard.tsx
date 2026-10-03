import { useEffect, useState } from "react";
import { GameIcon } from "../../components/GameIcon";
import { OPPONENT, SETTINGS, type OpponentState } from "../../store/keys";
import { useStoreValue } from "../../store/useStore";
import { heroInfo } from "../../w3c/heroes";
import type { CardRace, OpponentCard as Card, WinLoss } from "../../w3c/opponentCard";

/** The full card stays open this long after it appears, then collapses to
 *  one line so it never covers the build steps for the whole game. */
export const CARD_EXPANDED_MS = 60_000;

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
      <p className="opponent-card__meta">
        {RACE_LABEL[opponent.race]}
        {meta ? ` · ${meta}` : ""}
      </p>
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
                <dt>vs {RACE_LABEL[card.myRace]}</dt>
                <dd>{formatRecord(card.vsMyRace)}</dd>
              </>
            ) : null}
            <dt>on {card.map}</dt>
            <dd>{formatRecord(card.onMap)}</dd>
          </dl>
          {card.firstHero ? (
            <div className="opponent-card__openers">
              <p className="opponent-card__kicker">
                Opens {card.openersBasis === "vs-your-race" ? `vs ${RACE_LABEL[card.myRace]}` : "(all games)"}
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

/** Whether the overlay should show anything for this state at all. */
export function cardVisible(state: OpponentState, dismissedMatchId: string | null, enabled = true): boolean {
  return enabled && state.live && state.status !== "idle" && state.matchId !== null && state.matchId !== dismissedMatchId;
}

export function OpponentCard() {
  const state = useStoreValue(OPPONENT);
  const { apiBase, opponentCard: enabled } = useStoreValue(SETTINGS);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  // Every new match opens the full card, then it folds away after a minute.
  useEffect(() => {
    if (!state.matchId) return;
    setExpanded(true);
    const timer = setTimeout(() => setExpanded(false), CARD_EXPANDED_MS);
    return () => clearTimeout(timer);
  }, [state.matchId]);

  if (!cardVisible(state, dismissed, enabled)) return null;
  const card = state.card;
  const title = card ? `${card.opponent.name} · ${RACE_LABEL[card.opponent.race]}` : "Your opponent";

  return (
    <section className="opponent-card" aria-label="Opponent">
      <div className="opponent-card__header">
        <button
          type="button"
          className="opponent-card__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="opponent-card__kicker">Opponent</span> {title}
          {card?.opponent.mmr !== undefined && card?.opponent.mmr !== null && !expanded ? ` · ${card.opponent.mmr}` : ""}
        </button>
        <button
          type="button"
          className="opponent-card__close"
          aria-label="Hide opponent card"
          onClick={() => setDismissed(state.matchId)}
        >
          ×
        </button>
      </div>
      {expanded ? (
        <div className="opponent-card__body">
          {state.status === "loading" ? <p className="opponent-card__note">Looking up your opponent…</p> : null}
          {state.status === "error" ? <p className="opponent-card__note" role="alert">{state.error}</p> : null}
          {state.status === "ok" && card ? <CardBody card={card} apiBase={apiBase} /> : null}
        </div>
      ) : null}
    </section>
  );
}
