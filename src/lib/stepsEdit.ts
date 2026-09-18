/**
 * Pure, immutable helpers over the editor's in-progress step list — the raw
 * string-keyed form shape (`EditorStep`), not the parsed `ApiBuildStep` the
 * schema in `buildEditorSchema.ts` produces. Every function returns a new
 * array; the input list (and any step object inside it that wasn't touched)
 * is never mutated, same rule as `lib/localBuilds.ts`.
 */

export type EditorStep = {
  time: string;
  supply: string;
  instruction: string;
  icon: string;
};

export function blankStep(): EditorStep {
  return { time: "", supply: "", instruction: "", icon: "" };
}

/** Inserts a blank step right after `after` (0-based), or appends one to the
 *  end when `after` is omitted. */
export function addStep(steps: EditorStep[], after?: number): EditorStep[] {
  const index = after === undefined ? steps.length : after + 1;
  return [...steps.slice(0, index), blankStep(), ...steps.slice(index)];
}

/** Returns a new list with the step at `index` removed. */
export function removeStep(steps: EditorStep[], index: number): EditorStep[] {
  return steps.filter((_, i) => i !== index);
}

/** Moves the step at `from` to `to`. A no-op (returns the same reference)
 *  when either index is out of range or they're equal. */
export function moveStep(steps: EditorStep[], from: number, to: number): EditorStep[] {
  if (from === to || from < 0 || from >= steps.length || to < 0 || to >= steps.length) {
    return steps;
  }
  const copy = [...steps];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** Returns a new list with the step at `index` merged with `patch`; every
 *  other step keeps its existing reference. */
export function updateStep(steps: EditorStep[], index: number, patch: Partial<EditorStep>): EditorStep[] {
  return steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
}
