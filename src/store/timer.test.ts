import { describe, expect, it } from "vitest";
import type { TimerState } from "./keys";
import {
  activeStepIndex,
  elapsedMs,
  jumpToStep,
  pauseTimer,
  resetTimer,
  startTimer,
} from "./timer";

const steps = [
  { time: "0:00", instruction: "start" },
  { instruction: "no time — never active" },
  { time: "0:30", instruction: "second" },
  { time: "1:15", instruction: "third" },
];

describe("activeStepIndex", () => {
  it("returns -1 before the first timed step", () => {
    expect(activeStepIndex(steps, -1)).toBe(-1);
  });

  it("returns the last passed timed step", () => {
    expect(activeStepIndex(steps, 45)).toBe(2);
    expect(activeStepIndex(steps, 90)).toBe(3);
  });

  it("ignores untimed steps", () => {
    // Between the 0:00 step and the 0:30 step, index 1 (untimed) is never
    // returned even though it sits between two timed steps.
    expect(activeStepIndex(steps, 10)).toBe(0);
  });
});

describe("timer start/pause/reset", () => {
  it("accumulates elapsed time across a pause", () => {
    let t = resetTimer();
    t = startTimer(t, 0);
    t = pauseTimer(t, 1000); // 1s elapsed
    expect(elapsedMs(t, 1000)).toBe(1000);

    t = startTimer(t, 5000); // resume 4s later
    t = pauseTimer(t, 6000); // 1s more elapsed
    expect(elapsedMs(t, 6000)).toBe(2000);
  });

  it("reset returns elapsed to 0 and running=false", () => {
    let t = startTimer(resetTimer(), 0);
    t = resetTimer();
    expect(elapsedMs(t, 999)).toBe(0);
    expect(t.startedAtMs).toBeNull();
  });
});

describe("jumpToStep", () => {
  it("stepNext jumps the clock to the neighbouring timed step", () => {
    // At a fresh reset (elapsed 0s), the 0:00 step already counts as
    // "current" (same rule as activeStepIndex), so the first "next" moves
    // to the following timed step, 0:30.
    let t = resetTimer();
    t = jumpToStep(t, steps, 1, 0);
    expect(elapsedMs(t, 0)).toBe(30_000);

    t = jumpToStep(t, steps, 1, 0); // -> 1:15
    expect(elapsedMs(t, 0)).toBe(75_000);
  });

  it("clamps at the end", () => {
    let t: TimerState = { startedAtMs: null, baseElapsedMs: 75_000 };
    t = jumpToStep(t, steps, 1, 0);
    expect(elapsedMs(t, 0)).toBe(75_000); // stays on the last timed step
  });

  it("stepPrev jumps backward and clamps at the start", () => {
    let t: TimerState = { startedAtMs: null, baseElapsedMs: 75_000 };
    t = jumpToStep(t, steps, -1, 0);
    expect(elapsedMs(t, 0)).toBe(30_000);

    t = jumpToStep(t, steps, -1, 0);
    expect(elapsedMs(t, 0)).toBe(0);

    t = jumpToStep(t, steps, -1, 0);
    expect(elapsedMs(t, 0)).toBe(0); // clamped at the first timed step
  });

  it("preserves running state across a jump", () => {
    let t = startTimer(resetTimer(), 0);
    t = jumpToStep(t, steps, 1, 0);
    expect(t.startedAtMs).not.toBeNull();
  });
});
