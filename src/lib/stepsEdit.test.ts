import { describe, expect, it } from "vitest";
import { addStep, moveStep, removeStep, updateStep, type EditorStep } from "./stepsEdit";

function step(instruction: string): EditorStep {
  return { time: "", supply: "", instruction, icon: "" };
}

describe("stepsEdit — pure, immutable step-list helpers", () => {
  it("addStep appends a blank step when no index is given", () => {
    const steps = [step("a"), step("b")];
    const next = addStep(steps);
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ time: "", supply: "", instruction: "", icon: "" });
    expect(steps).toHaveLength(2); // input untouched
  });

  it("addStep inserts a blank step right after the given index", () => {
    const steps = [step("a"), step("b"), step("c")];
    const next = addStep(steps, 0);
    expect(next.map((s) => s.instruction)).toEqual(["a", "", "b", "c"]);
    expect(steps.map((s) => s.instruction)).toEqual(["a", "b", "c"]);
  });

  it("removeStep drops the step at the given index", () => {
    const steps = [step("a"), step("b"), step("c")];
    const next = removeStep(steps, 1);
    expect(next.map((s) => s.instruction)).toEqual(["a", "c"]);
    expect(steps).toHaveLength(3);
  });

  it("moveStep reorders a step from one index to another", () => {
    const steps = [step("a"), step("b"), step("c")];
    const next = moveStep(steps, 2, 0);
    expect(next.map((s) => s.instruction)).toEqual(["c", "a", "b"]);
    expect(steps.map((s) => s.instruction)).toEqual(["a", "b", "c"]);
  });

  it("moveStep is a no-op for an out-of-range index", () => {
    const steps = [step("a"), step("b")];
    expect(moveStep(steps, -1, 0)).toBe(steps);
    expect(moveStep(steps, 0, 5)).toBe(steps);
    expect(moveStep(steps, 1, 1)).toBe(steps);
  });

  it("updateStep merges a patch into the step at the given index only", () => {
    const steps = [step("a"), step("b")];
    const next = updateStep(steps, 1, { time: "1:00" });
    expect(next[1]).toEqual({ time: "1:00", supply: "", instruction: "b", icon: "" });
    expect(next[0]).toBe(steps[0]);
    expect(steps[1]).toEqual({ time: "", supply: "", instruction: "b", icon: "" });
  });
});
