import { Plus } from "lucide-react";
import { Button } from "../../../components/Button";
import type { GameIconEntry } from "../../../api/schema";
import type { EditorFieldErrors, EditorStepInput } from "../../../lib/buildEditorSchema";
import { addStep, moveStep, removeStep, updateStep } from "../../../lib/stepsEdit";
import { StepRowEditor } from "./StepRowEditor";

/** Field-level errors for one step, pulled out of the flat `steps.N.field`
 *  error map `flattenEditorErrors` produces. */
function stepErrors(errors: EditorFieldErrors, index: number) {
  return {
    time: errors[`steps.${index}.time`],
    supply: errors[`steps.${index}.supply`],
    instruction: errors[`steps.${index}.instruction`],
    icon: errors[`steps.${index}.icon`],
  };
}

/**
 * The "Steps" section: an `<ol>` of dense rows plus a trailing "Add step"
 * button. All mutation goes through the pure helpers in `lib/stepsEdit.ts`
 * so this component only ever wires events to `onChange(nextSteps)`.
 */
export function StepsEditor({
  steps,
  icons,
  errors,
  onChange,
}: {
  steps: EditorStepInput[];
  icons: GameIconEntry[];
  errors: EditorFieldErrors;
  onChange: (steps: EditorStepInput[]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="kicker">Steps</p>
        {errors.steps ? (
          <span role="alert" className="text-[0.7rem] text-loss">
            {errors.steps}
          </span>
        ) : null}
      </div>
      <ol className="mt-2 flex flex-col gap-2">
        {steps.map((step, index) => (
          <StepRowEditor
            key={index}
            index={index}
            total={steps.length}
            step={step}
            icons={icons}
            errors={stepErrors(errors, index)}
            onChange={(patch) => onChange(updateStep(steps, index, patch))}
            onMoveUp={() => onChange(moveStep(steps, index, index - 1))}
            onMoveDown={() => onChange(moveStep(steps, index, index + 1))}
            onInsertAfter={() => onChange(addStep(steps, index))}
            onRemove={() => onChange(removeStep(steps, index))}
          />
        ))}
      </ol>
      <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange(addStep(steps))}>
        <Plus size={14} /> Add step
      </Button>
    </div>
  );
}
