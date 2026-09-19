import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { IconButton } from "../../../components/IconButton";
import { GameIcon } from "../../../components/GameIcon";
import type { GameIconEntry } from "../../../api/schema";
import type { EditorStepInput } from "../../../lib/buildEditorSchema";
import { IconPicker } from "./IconPicker";

/**
 * One dense row in the steps editor — index, time, food, icon, instruction,
 * plus row actions (move up/down, insert after, remove). Dense/tabular like
 * the in-game overlay's own step list (`pages/overlay/StepRow.tsx`), not a
 * generic stacked form row.
 */
export function StepRowEditor({
  index,
  total,
  step,
  icons,
  errors,
  onChange,
  onMoveUp,
  onMoveDown,
  onInsertAfter,
  onRemove,
}: {
  index: number;
  total: number;
  step: EditorStepInput;
  icons: GameIconEntry[];
  errors?: { time?: string; supply?: string; instruction?: string; icon?: string };
  onChange: (patch: Partial<EditorStepInput>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertAfter: () => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const iconEntry = icons.find((i) => i.key === step.icon);

  return (
    <li className="grid grid-cols-[1.5rem_4.5rem_3.5rem_auto_1fr_auto] items-start gap-2 rounded border border-line bg-surface-2/40 p-2">
      <span className="tnum pt-2 text-center text-xs text-faint">{index + 1}</span>

      <label className="block text-xs">
        <span className="sr-only">{`Step ${index + 1} time`}</span>
        <input
          inputMode="numeric"
          placeholder="m:ss"
          value={step.time}
          onChange={(e) => onChange({ time: e.target.value })}
          aria-invalid={errors?.time ? "true" : undefined}
          aria-describedby={errors?.time ? `step-${index}-time-error` : undefined}
          className="h-9 w-full rounded border border-line bg-surface-2/60 px-2 text-sm text-fg outline-none focus:border-gold/60"
        />
        {errors?.time ? (
          <span id={`step-${index}-time-error`} role="alert" className="mt-0.5 block text-[0.65rem] text-loss">
            {errors.time}
          </span>
        ) : null}
      </label>

      <label className="block text-xs">
        <span className="sr-only">{`Step ${index + 1} food`}</span>
        <input
          type="number"
          min={0}
          max={100}
          placeholder="food"
          value={step.supply}
          onChange={(e) => onChange({ supply: e.target.value })}
          aria-invalid={errors?.supply ? "true" : undefined}
          aria-describedby={errors?.supply ? `step-${index}-supply-error` : undefined}
          className="h-9 w-full rounded border border-line bg-surface-2/60 px-2 text-sm text-fg outline-none focus:border-gold/60"
        />
        {errors?.supply ? (
          <span id={`step-${index}-supply-error`} role="alert" className="mt-0.5 block text-[0.65rem] text-loss">
            {errors.supply}
          </span>
        ) : null}
      </label>

      <button
        type="button"
        aria-label={iconEntry ? `Change icon (${iconEntry.title})` : "Pick an icon"}
        onClick={() => setPickerOpen(true)}
        className="grid size-9 place-items-center rounded border border-line bg-surface-2/60 text-muted hover:border-gold/50 hover:text-gold"
      >
        {iconEntry ? <GameIcon iconUrl={iconEntry.url} icon={iconEntry.key} size={30} /> : <Plus size={16} />}
      </button>

      <label className="block text-xs">
        <span className="sr-only">{`Step ${index + 1} instruction`}</span>
        <input
          maxLength={160}
          placeholder="What to do"
          value={step.instruction}
          onChange={(e) => onChange({ instruction: e.target.value })}
          aria-invalid={errors?.instruction ? "true" : undefined}
          aria-describedby={errors?.instruction ? `step-${index}-instruction-error` : undefined}
          className="h-9 w-full rounded border border-line bg-surface-2/60 px-2.5 text-sm text-fg outline-none focus:border-gold/60"
        />
        {errors?.instruction ? (
          <span id={`step-${index}-instruction-error`} role="alert" className="mt-0.5 block text-[0.65rem] text-loss">
            {errors.instruction}
          </span>
        ) : null}
        {step.importNote ? (
          <span data-import-note className="tnum mt-0.5 block font-mono text-[0.65rem] text-faint">
            {step.importNote}
          </span>
        ) : null}
      </label>

      <div className="flex items-start gap-1">
        <IconButton aria-label={`Move step ${index + 1} up`} onClick={onMoveUp} disabled={index === 0}>
          <ArrowUp size={14} />
        </IconButton>
        <IconButton aria-label={`Move step ${index + 1} down`} onClick={onMoveDown} disabled={index === total - 1}>
          <ArrowDown size={14} />
        </IconButton>
        <IconButton aria-label={`Insert step after ${index + 1}`} onClick={onInsertAfter}>
          <Plus size={14} />
        </IconButton>
        <IconButton aria-label={`Remove step ${index + 1}`} onClick={onRemove}>
          <Trash2 size={14} />
        </IconButton>
      </div>

      {pickerOpen ? (
        <IconPicker
          icons={icons}
          onPick={(key) => {
            onChange({ icon: key });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </li>
  );
}
