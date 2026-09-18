import { describe, expect, it } from "vitest";
import { timerStateSchema, type TimerState } from "./keys";
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

  it("reset returns elapsed to 0, running=false, and not engaged", () => {
    let t = startTimer(resetTimer(), 0);
    t = resetTimer();
    expect(elapsedMs(t, 999)).toBe(0);
    expect(t.startedAtMs).toBeNull();
    expect(t.engaged).toBe(false);
  });
});

describe("jumpToStep", () => {
  it("first +1 from a fresh/reset timer lands on the first timed step, even at 0:00, and engages", () => {
    let t = resetTimer();
    t = jumpToStep(t, steps, 1, 0);
    expect(elapsedMs(t, 0)).toBe(0);
    expect(t.engaged).toBe(true);
    // Gated the same way StepList/useClock gate "active": once engaged,
    // activeStepIndex resolves to the first timed step, index 0.
    expect(activeStepIndex(steps, elapsedMs(t, 0) / 1000)).toBe(0);
  });

  it("second +1 advances to the next timed step", () => {
    let t = resetTimer();
    t = jumpToStep(t, steps, 1, 0);
    t = jumpToStep(t, steps, 1, 0);
    expect(elapsedMs(t, 0)).toBe(30_000);
    expect(activeStepIndex(steps, elapsedMs(t, 0) / 1000)).toBe(2);
  });

  it("-1 from a fresh/reset timer is a no-op: stays reset, not engaged", () => {
    const t = resetTimer();
    const next = jumpToStep(t, steps, -1, 0);
    expect(next).toEqual(t);
    expect(next.engaged).toBe(false);
  });

  it("clamps at the end", () => {
    let t: TimerState = { startedAtMs: null, baseElapsedMs: 75_000, engaged: true };
    t = jumpToStep(t, steps, 1, 0);
    expect(elapsedMs(t, 0)).toBe(75_000); // stays on the last timed step
  });

  it("stepPrev jumps backward and clamps at the start", () => {
    let t: TimerState = { startedAtMs: null, baseElapsedMs: 75_000, engaged: true };
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

  it("the first +1 still lands on the first timed step even after Play has been running a while (C-015 step 5)", () => {
    // startTimer() deliberately leaves `engaged` untouched — only
    // jumpToStep() flips it. Otherwise a player who presses Play and waits
    // before their first step_next would see the very defect this feature
    // fixes, just triggered by wall-clock time instead of boot state.
    let t = startTimer(resetTimer(), 0);
    const elapsedSecAtPress = 1.5; // clock has been running for 1.5s
    t = jumpToStep(t, steps, 1, elapsedSecAtPress * 1000);
    expect(elapsedMs(t, elapsedSecAtPress * 1000)).toBe(0); // snapped back to 0:00
    expect(activeStepIndex(steps, elapsedMs(t, elapsedSecAtPress * 1000) / 1000)).toBe(0);
  });
});

describe("timerStateSchema backward compatibility", () => {
  it("parses the old shape (no `engaged` field), defaulting engaged to false", () => {
    const result = timerStateSchema.parse({ startedAtMs: null, baseElapsedMs: 0 });
    expect(result).toEqual({ startedAtMs: null, baseElapsedMs: 0, engaged: false });
  });
});
