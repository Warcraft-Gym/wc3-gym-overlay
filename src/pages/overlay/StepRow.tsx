import type { ApiBuildStep } from "../../api/schema";
import { GameIcon } from "../../components/GameIcon";
import { cn } from "../../lib/cn";

export type StepRowState = "past" | "active" | "upcoming";

const ICON_SIZE_FULL = 28;
const ICON_SIZE_COMPACT = 20;

export function StepRow({
  index,
  step,
  compact,
  state,
}: {
  index: number;
  step: ApiBuildStep;
  compact: boolean;
  state: StepRowState;
}) {
  const hasIcon = Boolean(step.iconUrl || step.icon);

  return (
    <li
      data-step
      data-state={state}
      aria-current={state === "active" ? "step" : undefined}
      className={cn("overlay-step", `overlay-step--${state}`, compact && "overlay-step--compact")}
    >
      {!compact && <span className="overlay-step__index">{index + 1}</span>}
      <span className="overlay-step__time tnum">{step.time ?? "–"}</span>
      {!compact && <span className="overlay-step__supply tnum">{step.supply ?? "–"}</span>}
      {hasIcon && (
        <GameIcon iconUrl={step.iconUrl} icon={step.icon} size={compact ? ICON_SIZE_COMPACT : ICON_SIZE_FULL} />
      )}
      <span className="overlay-step__instruction" title={step.instruction}>
        {step.instruction}
      </span>
    </li>
  );
}
