import { useState } from "react";
import { Button } from "../../../components/Button";
import { GameIcon } from "../../../components/GameIcon";
import { IconButton } from "../../../components/IconButton";
import { Modal } from "../../../components/Modal";
import { RACE_LABEL, RaceCrest, type Race } from "../../../components/RaceCrest";
import { cn } from "../../../lib/cn";
import {
  formatActual,
  formatComparisonSummary,
  formatDelta,
  formatPlanTarget,
  STATUS_CLASS,
  STATUS_LABEL,
} from "../../../lib/reviewSummary";
import type { ComparisonRow, ExtraGroup } from "../../../lib/planVsActual";
import type { Review, ReviewPlayer } from "../../../reviews/types";

export const REVIEW_DIALOG_ID = "review-dialog";

/** Collapse "Also did" behind a toggle once it's longer than this. */
const EXTRAS_COLLAPSE_THRESHOLD = 6;

function isKnownRace(race: string): race is Race {
  return race in RACE_LABEL;
}

function iconUrlFor(apiBase: string, icon: string | undefined): string | undefined {
  return icon ? `${apiBase}/wc3-icons/${icon}.webp` : undefined;
}

function playerRaceLabel(player: ReviewPlayer): { race: Race; label: string } {
  if (isKnownRace(player.race)) return { race: player.race, label: RACE_LABEL[player.race] };
  return { race: "random", label: player.race };
}

function StatusChip({ status }: { status: ComparisonRow["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em]",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Map/duration/race-vs-race/plan header shared by both "ok" view states
 *  (a full comparison and a plan-less "what you did" list) - only ever
 *  rendered once `meStatus: "resolved"` (so `meId` and exactly two
 *  `players` are guaranteed, see `pickMe`'s doc comment). */
function ReviewHeader({ review, apiBase }: { review: Review; apiBase: string }) {
  const me = review.players.find((player) => player.id === review.meId) ?? null;
  const opponent = review.players.find((player) => player.id !== review.meId) ?? null;
  if (!me || !opponent) return null;
  const meRace = playerRaceLabel(me);
  const opponentRace = playerRaceLabel(opponent);

  return (
    <div className="flex flex-col gap-2">
      <p className="tnum text-xs text-muted">
        {review.map} · {review.duration}
      </p>
      <div className="flex items-center gap-2 text-sm">
        <RaceCrest race={meRace.race} apiBase={apiBase} size={22} />
        <span className="font-bold text-fg">{me.name}</span>
        <span className="font-display text-[0.6rem] font-bold uppercase tracking-widest text-gold">vs</span>
        <RaceCrest race={opponentRace.race} apiBase={apiBase} size={22} />
        <span className="text-muted">{opponent.name}</span>
      </div>
      <p className="text-sm text-muted">{review.plan ? review.plan.title : "No build selected"}</p>
    </div>
  );
}

function ExtrasSection({ extras, apiBase }: { extras: ExtraGroup[]; apiBase: string }) {
  const [expanded, setExpanded] = useState(false);
  if (extras.length === 0) return null;

  const collapsible = extras.length > EXTRAS_COLLAPSE_THRESHOLD;
  const visible = collapsible && !expanded ? extras.slice(0, EXTRAS_COLLAPSE_THRESHOLD) : extras;

  return (
    <div>
      <h3 className="kicker mb-2">Also did</h3>
      <ul className="flex flex-col gap-1.5">
        {visible.map((extra) => (
          // F010a: an icon-less extra is grouped (and keyed) by
          // `instruction` upstream (`compareBuild`), same fallback as the
          // de-dup key there – see `planVsActual.ts`.
          <li key={extra.icon ?? extra.instruction} className="flex items-center gap-2 text-sm">
            <GameIcon iconUrl={iconUrlFor(apiBase, extra.icon)} icon={extra.icon} size={20} />
            <span className="flex-1 text-fg">{extra.instruction}</span>
            <span className="tnum text-xs text-muted">
              {extra.count > 1 ? `${extra.count}× · ` : ""}
              {extra.firstTime} · {extra.firstSupply} supply
            </span>
          </li>
        ))}
      </ul>
      {collapsible ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${extras.length}`}
        </Button>
      ) : null}
    </div>
  );
}

/** The step table: one row per plan step, in plan order. */
function StepTable({ rows, apiBase }: { rows: ComparisonRow[]; apiBase: string }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">Plan steps compared against what you actually did</caption>
      <thead>
        <tr className="border-b border-line text-[0.65rem] uppercase tracking-[0.12em] text-faint">
          <th scope="col" className="py-1.5 pr-2 font-normal">
            Step
          </th>
          <th scope="col" className="py-1.5 pr-2 font-normal">
            Plan
          </th>
          <th scope="col" className="py-1.5 pr-2 font-normal">
            Actual
          </th>
          <th scope="col" className="py-1.5 pr-2 font-normal">
            Delta
          </th>
          <th scope="col" className="py-1.5 font-normal">
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.index}
            className={cn("border-b border-line/40", row.status === "missed" && "bg-loss/5 opacity-80")}
          >
            <td className="py-1.5 pr-2">
              <span className="flex items-center gap-2">
                {row.plan.icon ? (
                  <GameIcon iconUrl={row.plan.iconUrl ?? iconUrlFor(apiBase, row.plan.icon)} icon={row.plan.icon} size={20} />
                ) : null}
                <span className="text-fg">{row.plan.instruction}</span>
              </span>
            </td>
            <td className="tnum py-1.5 pr-2 text-muted">{formatPlanTarget(row)}</td>
            <td className={cn("tnum py-1.5 pr-2", row.status === "missed" ? "italic text-faint" : "text-muted")}>
              {formatActual(row)}
            </td>
            <td className="tnum py-1.5 pr-2 text-muted">{formatDelta(row)}</td>
            <td className="py-1.5">
              <StatusChip status={row.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `plan: null` state - lists what "you" actually did instead of a
 *  comparison (there is nothing to compare against). */
function NoPlanSteps({ review, apiBase }: { review: Review; apiBase: string }) {
  const me = review.players.find((player) => player.id === review.meId) ?? null;
  if (!me) return null;

  return (
    <div>
      <h3 className="kicker mb-2">What you did</h3>
      <ul className="flex flex-col gap-1.5">
        {me.steps.map((step, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            <GameIcon iconUrl={iconUrlFor(apiBase, step.icon)} icon={step.icon} size={20} />
            <span className="tnum w-20 shrink-0 text-muted">{step.time}</span>
            <span className="tnum w-16 shrink-0 text-muted">{step.supply} supply</span>
            <span className="flex-1 text-fg">{step.instruction}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** `meStatus: "unresolved"` state - "Which one are you?" chooser. Only
 *  rendered when the replay is a 1v1 (see `pickMe`'s doc comment: this
 *  status only ever occurs for exactly two players), so always exactly two
 *  radio choices. */
function WhichOneAreYou({
  review,
  apiBase,
  onResolve,
}: {
  review: Review;
  apiBase: string;
  onResolve: (meId: number, rememberBattleTag?: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<number>(review.players[0]?.id ?? 0);
  const [remember, setRemember] = useState(true);
  const selected = review.players.find((player) => player.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg">Which one are you?</p>
      <div role="radiogroup" aria-label="Which one are you?" className="flex flex-col gap-2">
        {review.players.map((player) => {
          const { race, label } = playerRaceLabel(player);
          const name = `${player.name} · ${label}`;
          const checked = selectedId === player.id;
          return (
            <label
              key={player.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded border p-2 text-sm",
                checked ? "border-gold/60 bg-gold/5" : "border-line",
              )}
            >
              <input
                type="radio"
                name="review-which-one-are-you"
                aria-label={name}
                checked={checked}
                onChange={() => setSelectedId(player.id)}
              />
              <RaceCrest race={race} apiBase={apiBase} size={20} />
              <span className="flex-1">{name}</span>
            </label>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember me {selected ? `(${selected.name})` : ""}
      </label>
      <div>
        <Button variant="gold" onClick={() => onResolve(selectedId, remember ? selected?.name : undefined)}>
          Continue
        </Button>
      </div>
    </div>
  );
}

export function ReviewModal({
  review,
  apiBase,
  inProgress,
  onClose,
  onRetry,
  onResolve,
}: {
  review: Review | null;
  apiBase: string;
  inProgress: boolean;
  onClose: () => void;
  onRetry: () => void;
  onResolve: (meId: number, rememberBattleTag?: string) => void;
}) {
  return (
    <Modal label="Last game" id={REVIEW_DIALOG_ID} onClose={onClose} widthClassName="w-[min(40rem,calc(100vw-2rem))]">
      <div className="flex items-center justify-between">
        <h2 className="text-base">Last game</h2>
        <IconButton aria-label="Close last game review" onClick={onClose}>
          ×
        </IconButton>
      </div>

      <div className="mt-4">
        {inProgress ? (
          <p role="status" className="text-sm text-muted">
            Reviewing your last game…
          </p>
        ) : review === null ? (
          <p className="text-sm text-muted">Finish a game to see your review here.</p>
        ) : review.status === "error" ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="rounded border border-loss/50 bg-loss/10 p-3 text-sm text-loss">
              {review.error}
            </p>
            <div>
              <Button variant="gold" onClick={onRetry}>
                Retry
              </Button>
            </div>
          </div>
        ) : review.meStatus === "unresolved" ? (
          <WhichOneAreYou review={review} apiBase={apiBase} onResolve={onResolve} />
        ) : review.meStatus === "not-1v1" ? (
          <p className="text-sm text-muted">Reviews only cover 1v1 games.</p>
        ) : review.plan === null ? (
          <div className="flex flex-col gap-4">
            <ReviewHeader review={review} apiBase={apiBase} />
            <p className="text-sm text-muted">No build was selected for this game.</p>
            <NoPlanSteps review={review} apiBase={apiBase} />
          </div>
        ) : review.comparison === null ? (
          // Defensive only - `plan` and `comparison` are set together by
          // the pipeline (see `storeOkReview`); this branch should be
          // unreachable in practice.
          <p className="text-sm text-muted">No comparison is available for this game.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <ReviewHeader review={review} apiBase={apiBase} />
            <p className="text-sm text-fg">{formatComparisonSummary(review.comparison.summary)}</p>
            <div className="max-h-[50vh] overflow-y-auto">
              <StepTable rows={review.comparison.rows} apiBase={apiBase} />
            </div>
            <ExtrasSection extras={review.comparison.extras} apiBase={apiBase} />
          </div>
        )}
      </div>
    </Modal>
  );
}
