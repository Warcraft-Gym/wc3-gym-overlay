import {
  Coins,
  Crosshair,
  Hourglass,
  MapPin,
  Scale,
  Shield,
  Swords,
  ThumbsDown,
  ThumbsUp,
  Zap,
  HeartCrack,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { GameIcon } from "../../../components/GameIcon";
import { RaceCrest } from "../../../components/RaceCrest";
import { cn } from "../../../lib/cn";
import { heroInfo } from "../../../w3c/heroes";
import { EARLY_GAME_MINUTES, LATE_GAME_MINUTES, type WinLoss } from "../../../w3c/opponentCard";
import { deriveProfileTags, type Profile, type ProfileTag } from "../../../w3c/profile";
import { formatRelative, formatWinLoss, RACE_LABEL, toneOfYourRate, winRate, type Tone } from "../../opponent/format";
import { Sparkline } from "./Sparkline";

function tagIcon(id: string): LucideIcon {
  if (id.startsWith("vs-")) return Shield;
  if (id.endsWith("map")) return MapPin;
  if (id === "strong-early") return Zap;
  if (id.endsWith("-early") || id.endsWith("-late")) return Hourglass;
  if (id.endsWith("fights")) return Swords;
  if (id === "economy") return Coins;
  if (id === "hero-hunter") return Crosshair;
  if (id === "fragile-heroes") return HeartCrack;
  if (id === "upkeep") return Scale;
  return Shield;
}

const TONE_TEXT: Record<Tone, string> = { opening: "text-win", threat: "text-loss", neutral: "text-fg" };

function rateTone(r: WinLoss): Tone {
  return toneOfYourRate(winRate(r), r.wins + r.losses);
}

function pct(r: WinLoss): string {
  const rate = winRate(r);
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

/** One line in the header: "1830 MMR · #84 · FR · 19 seasons". */
export function profileSubtitle(p: Profile): string {
  const parts: string[] = [];
  if (p.mmr !== null) parts.push(`${p.mmr} MMR`);
  if (p.rank !== null) parts.push(`#${p.rank}`);
  if (p.identity?.country) parts.push(p.identity.country);
  if (p.identity) parts.push(p.identity.seasons <= 1 ? "first season" : `${p.identity.seasons} seasons`);
  return parts.join(" · ");
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("panel p-4", className)}>
      <h3 className="kicker mb-3">{title}</h3>
      {children}
    </section>
  );
}

function TagList({ title, tags, tone }: { title: string; tags: ProfileTag[]; tone: "strength" | "weakness" }) {
  const Lead = tone === "strength" ? ThumbsUp : ThumbsDown;
  return (
    <div>
      <p className={cn("mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]", tone === "strength" ? "text-win" : "text-loss")}>
        <Lead size={14} aria-hidden /> {title}
      </p>
      {tags.length === 0 ? (
        <p className="text-sm text-faint">Nothing stands out yet.</p>
      ) : (
        <ul aria-label={title} className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const Icon = tagIcon(tag.id);
            return (
              <li
                key={tag.id}
                aria-label={`${tag.label}: ${tag.evidence}`}
                title={tag.evidence}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                  tone === "strength" ? "border-win/40 bg-win/10 text-fg" : "border-loss/40 bg-loss/10 text-fg",
                )}
              >
                <Icon size={14} aria-hidden className={tone === "strength" ? "text-win" : "text-loss"} />
                <span>{tag.label}</span>
                <span className="text-xs text-muted">{tag.evidence}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RecordTile({ label, icon, record }: { label: string; icon?: ReactNode; record: WinLoss }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
      {icon}
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">{label}</p>
        <p className="tnum text-sm">
          <span className={cn("font-semibold", TONE_TEXT[rateTone(record)])}>{formatWinLoss(record)}</span>
          <span className="ml-1.5 text-faint">{pct(record)}</span>
        </p>
      </div>
    </div>
  );
}

function Form({ p }: { p: Profile }) {
  return (
    <Section title="Form">
      <div aria-label={`Recent form, newest first: ${p.form.join(" ")}`} className="flex gap-1">
        {p.form.map((r, i) => (
          <span
            key={i}
            aria-hidden
            className={cn("grid h-6 w-6 place-items-center rounded text-xs font-bold", r === "W" ? "bg-win/25 text-win" : "bg-loss/25 text-loss")}
          >
            {r}
          </span>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">
        {p.streak && p.streak.length >= 2 ? `${p.streak.length} ${p.streak.result === "W" ? "wins" : "losses"} in a row · ` : ""}
        {p.gamesToday === 1 ? "1 game in 24 h" : `${p.gamesToday} games in 24 h`}
      </p>
    </Section>
  );
}

function Style({ s }: { s: NonNullable<Profile["style"]> }) {
  const rows: [string, string][] = [
    ["Gold", `${s.goldPerMinute}/min${s.goldVsOpponents !== null ? `, ${formatRelative(s.goldVsOpponents)} vs opponents` : ""}`],
    ["Kills", s.killsVsOpponents !== null ? `${formatRelative(s.killsVsOpponents)} vs opponents` : "–"],
    ["Heroes killed", `${s.heroKillsPerGame ?? 0} per game`],
    ["Heroes lost", `${s.opponentHeroKillsPerGame ?? 0} per game`],
    ["Upkeep", `${s.upkeepGames}/${s.games} games · ${s.mercsPerGame} mercs / game`],
  ];
  return (
    <Section title={`Play style · last ${s.games}`}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="tnum">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** Your W3Champions profile: who you are on the ladder, then what to keep
 *  and what to work on, then the numbers behind it. */
export function ProfileView({ profile: p, apiBase, actions }: { profile: Profile; apiBase: string; actions?: ReactNode }) {
  const { strengths, weaknesses } = deriveProfileTags(p);
  const iconUrl = (icon: string | undefined) => (icon ? `${apiBase}/wc3-icons/${icon}.webp` : undefined);
  const first = p.mmrHistory[0];
  const last = p.mmrHistory.at(-1);

  return (
    <div className="flex flex-col gap-4">
      <header className="panel flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <RaceCrest race={p.race} apiBase={apiBase} size={48} />
        <div className="min-w-0 flex-1">
          <p className="kicker">Your profile · {RACE_LABEL[p.race]}</p>
          <h2 className="mt-1 flex items-center gap-2 font-display text-[1.4rem] tracking-[0.03em] text-fg">
            <span>{p.name}</span>
            {p.identity?.aka ? <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs normal-case tracking-normal text-gold">aka {p.identity.aka}</span> : null}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {profileSubtitle(p)}
            <span className="ml-2 tnum">· {formatWinLoss(p.overall)} ({pct(p.overall)})</span>
          </p>
        </div>
        {p.mmrHistory.length >= 2 && first !== undefined && last !== undefined ? (
          <div className="flex flex-col items-end gap-1">
            <Sparkline values={p.mmrHistory} label={`MMR from ${first} to ${last}, peak ${p.peakMmr}`} />
            <p className="tnum text-xs text-faint">
              MMR {first} → {last} · peak {p.peakMmr}
            </p>
          </div>
        ) : null}
        {actions}
      </header>

      <section aria-label="Strengths and weaknesses" className="panel grid gap-4 p-4 md:grid-cols-2">
        <TagList title="Strengths" tags={strengths} tone="strength" />
        <TagList title="Work on" tags={weaknesses} tone="weakness" />
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Matchups">
          <div className="grid grid-cols-2 gap-2">
            {p.matchups.map((m) => (
              <RecordTile
                key={m.race}
                label={`vs ${RACE_LABEL[m.race]}`}
                icon={<RaceCrest race={m.race} apiBase={apiBase} size={24} />}
                record={m.record}
              />
            ))}
          </div>
        </Section>

        <Section title="Maps · 5+ games">
          <div className="grid grid-cols-2 gap-2">
            {[...p.bestMaps, ...p.worstMaps].map((m) => (
              <RecordTile key={m.map} label={m.map} record={m.record} />
            ))}
          </div>
          {p.bestMaps.length + p.worstMaps.length === 0 ? <p className="text-sm text-faint">Not enough games on one map yet.</p> : null}
        </Section>

        <Form p={p} />

        <Section title="By game length">
          <div className="grid grid-cols-3 gap-2">
            <RecordTile label={`< ${EARLY_GAME_MINUTES} min`} record={p.phases.early} />
            <RecordTile label={`${EARLY_GAME_MINUTES}–${LATE_GAME_MINUTES}`} record={p.phases.mid} />
            <RecordTile label={`${LATE_GAME_MINUTES}+ min`} record={p.phases.late} />
          </div>
        </Section>

        <Section title="Your first hero">
          <ul className="flex flex-col gap-2">
            {p.heroes.map((h) => {
              const info = heroInfo(h.hero);
              return (
                <li key={h.hero} className="flex items-center gap-3 text-sm">
                  <GameIcon icon={info.icon} iconUrl={iconUrl(info.icon)} size={24} />
                  <span className="flex-1">{info.title}</span>
                  <span className="tnum text-muted">
                    {h.count}/{p.overall.wins + p.overall.losses} ·{" "}
                    <span className={TONE_TEXT[rateTone(h)]}>{formatWinLoss(h)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        {p.style ? <Style s={p.style} /> : null}
      </div>
    </div>
  );
}
