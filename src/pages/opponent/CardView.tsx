import {
  Clock,
  Coins,
  Crosshair,
  Crown,
  Flame,
  HeartCrack,
  Hourglass,
  MapPin,
  Repeat,
  Scale,
  Snowflake,
  Sparkles,
  Swords,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { GameIcon } from "../../components/GameIcon";
import { RaceCrest } from "../../components/RaceCrest";
import { OPPONENT_ARMY_ENABLED } from "../../config";
import { heroInfo } from "../../w3c/heroes";
import type { CardRace, OpponentCard as Card, WinLoss } from "../../w3c/opponentCard";
import { deriveTags, type TagId } from "../../w3c/tags";
import {
  activityNote,
  formatRelative,
  formatWinLoss,
  openerStat,
  perGameLabel,
  RACE_LABEL,
  subtitleLine,
  toneOfTheirRate,
  toneOfWinChance,
  toneOfYourRate,
  winRate,
  type Tone,
} from "./format";

const TAG_ICON: Record<TagId, LucideIcon> = {
  pro: Crown,
  "new-account": Sparkles,
  "hot-streak": Flame,
  "cold-streak": Snowflake,
  grinding: Clock,
  rusher: Zap,
  "strong-early": Zap,
  "strong-late": Hourglass,
  "fades-late": Hourglass,
  "strong-map": MapPin,
  "weak-map": MapPin,
  predictable: Repeat,
  "wins-fights": Swords,
  "loses-fights": Swords,
  "hero-hunter": Crosshair,
  "fragile-heroes": HeartCrack,
  "strong-economy": Coins,
  "weak-economy": Coins,
  upkeep: Scale,
};

/** A faction crest in place of the race's name; the name stays for screen readers. */
export function RaceIcon({ race, apiBase, size = 16 }: { race: CardRace; apiBase: string; size?: number }) {
  return (
    <span className="oc-race">
      <RaceCrest race={race} apiBase={apiBase} size={size} />
      <span className="sr-only">{RACE_LABEL[race]}</span>
    </span>
  );
}

function iconUrl(apiBase: string, icon: string | undefined): string | undefined {
  return icon ? `${apiBase}/wc3-icons/${icon}.webp` : undefined;
}

function Hero({ name, apiBase }: { name: string; apiBase: string }) {
  const info = heroInfo(name);
  return (
    <span className="oc-hero" title={info.title}>
      <GameIcon icon={info.icon} iconUrl={iconUrl(apiBase, info.icon)} size={20} />
      <span className="oc-hero__name">{info.title}</span>
    </span>
  );
}

function Section({ title, icon: Icon, children }: { title: ReactNode; icon?: LucideIcon; children: ReactNode }) {
  return (
    <section className="oc-section">
      <h3 className="oc-kicker">
        {Icon ? <Icon size={12} aria-hidden="true" /> : null}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Tags({ card }: { card: Card }) {
  const tags = deriveTags(card);
  if (tags.length === 0) return null;
  return (
    <ul className="oc-tags" aria-label="What to expect">
      {tags.map((tag) => {
        const Icon = TAG_ICON[tag.id];
        return (
          <li key={tag.id} className={`oc-tag oc-tag--${tag.tone}`} title={tag.evidence} aria-label={`${tag.label}: ${tag.evidence}`}>
            <Icon size={12} aria-hidden="true" />
            <span aria-hidden="true">{tag.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function WinChance({ p }: { p: number }) {
  const percent = Math.round(p * 100);
  return (
    <div className={`oc-chance oc-tone--${toneOfWinChance(p)}`}>
      <span className="oc-chance__label">Your win chance</span>
      <span className="oc-chance__bar" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </span>
      <span className="oc-chance__value" title="Estimated from the MMR gap; most ladder games sit between 40% and 60%">
        {percent}%
      </span>
    </div>
  );
}

function Form({ card }: { card: Card }) {
  const wins = card.form.filter((r) => r === "W").length;
  const note = activityNote(card);
  return (
    <div className="oc-form">
      <span className="oc-form__squares" aria-label={`Recent form, newest first: ${card.form.join(" ")}`}>
        {card.form.map((r, i) => (
          <span key={i} className={r === "W" ? "oc-sq oc-sq--w" : "oc-sq oc-sq--l"} aria-hidden="true" />
        ))}
      </span>
      <span className="oc-faint">
        {wins}–{card.form.length - wins} last {card.form.length}
        {note ? ` · ${note}` : ""}
      </span>
    </div>
  );
}

function Tile({ label, record, tone }: { label: ReactNode; record: WinLoss; tone: Tone }) {
  const rate = winRate(record);
  return (
    <div className={`oc-tile oc-tone--${tone}`}>
      <span className="oc-tile__label">{label}</span>
      <span className="oc-tile__value">
        {record.wins + record.losses === 0 ? "–" : formatWinLoss(record)}
        {rate !== null ? <span className="oc-tile__rate"> {Math.round(rate * 100)}%</span> : null}
      </span>
    </div>
  );
}

function Records({ card, apiBase }: { card: Card; apiBase: string }) {
  const games = (r: WinLoss) => r.wins + r.losses;
  return (
    <Section title="Records">
      <div className="oc-tiles">
        {card.vsMyRace ? (
          <Tile
            label={<>Them vs <RaceIcon race={card.myRace} apiBase={apiBase} size={14} /></>}
            record={card.vsMyRace}
            tone={toneOfTheirRate(winRate(card.vsMyRace), games(card.vsMyRace))}
          />
        ) : null}
        <Tile label={<>Them on {card.map}</>} record={card.onMap} tone={toneOfTheirRate(winRate(card.onMap), games(card.onMap))} />
        {card.myRecord ? (
          <>
            <Tile
              label={<>You vs <RaceIcon race={card.opponent.race} apiBase={apiBase} size={14} /></>}
              record={card.myRecord.vsRace}
              tone={toneOfYourRate(winRate(card.myRecord.vsRace), games(card.myRecord.vsRace))}
            />
            <Tile
              label={<>You on {card.map}</>}
              record={card.myRecord.onMap}
              tone={toneOfYourRate(winRate(card.myRecord.onMap), games(card.myRecord.onMap))}
            />
          </>
        ) : null}
        {card.headToHead ? (
          <Tile label="You vs them" record={card.headToHead} tone={toneOfYourRate(winRate(card.headToHead), games(card.headToHead), 3)} />
        ) : null}
      </div>
    </Section>
  );
}

function GameLength({ card }: { card: Card }) {
  const phases = card.phases;
  if (!phases) return null;
  const columns: { icon: LucideIcon; label: string; record: WinLoss }[] = [
    { icon: Zap, label: "Under 10 min", record: phases.early },
    { icon: Swords, label: "10–20 min", record: phases.mid },
    { icon: Hourglass, label: "20+ min", record: phases.late },
  ];
  return (
    <Section title="Their record by game length" icon={Clock}>
      <div className="oc-phases">
        {columns.map(({ icon: Icon, label, record }) => {
          const games = record.wins + record.losses;
          return (
            <div key={label} className={`oc-phase oc-tone--${toneOfTheirRate(winRate(record), games, 3)}`}>
              <Icon size={13} aria-hidden="true" />
              <span className="oc-phase__label">{label}</span>
              <span className="oc-phase__value">{games === 0 ? "–" : formatWinLoss(record)}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Openers({ card, apiBase }: { card: Card; apiBase: string }) {
  if (!card.firstHero) return null;
  const title =
    card.openersBasis === "vs-your-race" ? (
      <>
        Heroes vs <RaceIcon race={card.myRace} apiBase={apiBase} size={13} />
      </>
    ) : (
      "Heroes (all games)"
    );
  return (
    <Section title={title}>
      <ul className="oc-rows">
        <li className="oc-row">
          <span className="oc-row__main">
            <Hero name={card.firstHero.hero} apiBase={apiBase} />
            <span className="oc-faint">first</span>
          </span>
          <span className="oc-row__stat">{openerStat(card.firstHero.count, card.openerGames, card.firstHero)}</span>
        </li>
        {card.openers.map((o) => (
          <li key={o.heroes.join("+")} className="oc-row">
            <span className="oc-row__main">
              {o.heroes.map((h, i) => (
                <span key={`${h}-${i}`} className="oc-chain">
                  {i > 0 ? <span className="oc-faint" aria-hidden="true">→</span> : null}
                  <Hero name={h} apiBase={apiBase} />
                </span>
              ))}
            </span>
            <span className="oc-row__stat">{openerStat(o.count, card.openerGames, o)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Their usual army. Off unless OPPONENT_ARMY_ENABLED (a premium candidate):
 *  even a card stored by a build that had it on shows nothing while off. */
export function ArmySection({ card, apiBase, enabled = OPPONENT_ARMY_ENABLED }: { card: Card; apiBase: string; enabled?: boolean }) {
  if (!enabled) return null;
  if (card.armyStatus === "loading") return <p className="oc-note">Loading army…</p>;
  const army = card.composition;
  if (!army || army.units.length === 0) return null;
  return (
    <Section title={`Army · last ${army.games}`}>
      <ul className="oc-rows">
        {army.units.map((unit) => (
          <li key={unit.name} className="oc-row">
            <span className="oc-row__main">
              <span className="oc-hero">
                <GameIcon icon={unit.icon ?? undefined} iconUrl={iconUrl(apiBase, unit.icon ?? undefined)} size={20} />
                <span className="oc-hero__name">{unit.name}</span>
              </span>
            </span>
            <span className="oc-row__stat">
              {perGameLabel(unit.perGame)} · {unit.inGames}/{army.games}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="oc-stat">
      <Icon size={14} aria-hidden="true" />
      <span className="oc-stat__value">{value}</span>
      <span className="oc-stat__label">{label}</span>
    </div>
  );
}

function PlayStyle({ card }: { card: Card }) {
  if (card.extrasStatus === "loading") return <p className="oc-note">Loading play style…</p>;
  const style = card.style;
  if (!style) return null;
  return (
    <Section title={`Play style · last ${style.games} games`}>
      <div className="oc-stats">
        <Stat
          icon={Coins}
          value={`${style.goldPerMinute}/min`}
          label={style.goldVsOpponents !== null ? `gold, ${formatRelative(style.goldVsOpponents)} vs opponents` : "gold"}
        />
        {style.killsVsOpponents !== null ? <Stat icon={Swords} value={formatRelative(style.killsVsOpponents)} label="kills vs opponents" /> : null}
        {typeof style.heroKillsPerGame === "number" ? <Stat icon={Crosshair} value={String(style.heroKillsPerGame)} label="heroes killed / game" /> : null}
        {typeof style.opponentHeroKillsPerGame === "number" ? (
          <Stat icon={HeartCrack} value={String(style.opponentHeroKillsPerGame)} label="heroes lost / game" />
        ) : null}
      </div>
      <p className="oc-faint">
        Upkeep in {style.upkeepGames}/{style.games} games · {style.mercsPerGame} mercs / game
      </p>
    </Section>
  );
}

export function CardView({ card, apiBase }: { card: Card; apiBase: string }) {
  return (
    <div className="oc">
      <p className="oc-sub">{subtitleLine(card)}</p>
      {card.sampleSize === 0 ? (
        <p className="oc-note">No ladder games found for this opponent yet.</p>
      ) : (
        <>
          <Tags card={card} />
          {typeof card.winChance === "number" ? <WinChance p={card.winChance} /> : null}
          <Form card={card} />
          <Records card={card} apiBase={apiBase} />
          <GameLength card={card} />
          <Openers card={card} apiBase={apiBase} />
          <ArmySection card={card} apiBase={apiBase} />
          <PlayStyle card={card} />
          {card.thinSample ? <p className="oc-note">Few games, take the numbers lightly.</p> : null}
        </>
      )}
    </div>
  );
}
