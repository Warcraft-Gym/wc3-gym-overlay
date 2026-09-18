import { beforeEach, describe, expect, it } from "vitest";
import { TIMER } from "../store/keys";
import { readKey, writeKey } from "../store/state";
import { reset, stepNext, stepPrev, togglePlayPause } from "./timerActions";

const steps = [{ time: "0:00" }, { time: "0:30" }, { time: "1:15" }];

describe("timerActions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("togglePlayPause starts the timer, then pauses it accumulating elapsed", async () => {
    await togglePlayPause(0);
    expect(readKey(TIMER)).toEqual({ startedAtMs: 0, baseElapsedMs: 0, engaged: false });

    await togglePlayPause(1000);
    expect(readKey(TIMER)).toEqual({ startedAtMs: null, baseElapsedMs: 1000, engaged: false });
  });

  it("a stepNext press after Play has already been running for a while still lands on the first timed step, not the second (C-015 step 5 regression)", async () => {
    // Play is clicked, the clock runs for 1.5s (elapsed > the first step's
    // own 0:00 timestamp) — this is exactly the sequence a real player
    // follows, and exactly the sequence the original defect reproduced
    // (C-015 step 5), even though the pure `jumpToStep` unit tests only
    // ever start from a freshly-reset timer.
    await togglePlayPause(0);

    await stepNext(steps, 1500);
    expect(readKey(TIMER).baseElapsedMs).toBe(0);
    expect(readKey(TIMER).engaged).toBe(true);

    await stepNext(steps, 1500);
    expect(readKey(TIMER).baseElapsedMs).toBe(30_000);
  });

  it("reset returns elapsed to 0, running=false, and not engaged", async () => {
    await writeKey(TIMER, { startedAtMs: 0, baseElapsedMs: 5000, engaged: true });
    await reset();
    expect(readKey(TIMER)).toEqual({ startedAtMs: null, baseElapsedMs: 0, engaged: false });
  });

  it("stepNext/stepPrev jump the clock to the neighbouring timed step, clamped", async () => {
    await writeKey(TIMER, { startedAtMs: null, baseElapsedMs: 0, engaged: false });

    // First press from a fresh timer lands on the first timed step itself
    // (0:00 here), not the one after it.
    await stepNext(steps, 0);
    expect(readKey(TIMER).baseElapsedMs).toBe(0);
    expect(readKey(TIMER).engaged).toBe(true);

    await stepNext(steps, 0);
    expect(readKey(TIMER).baseElapsedMs).toBe(30_000);

    await stepNext(steps, 0);
    expect(readKey(TIMER).baseElapsedMs).toBe(75_000);

    await stepNext(steps, 0); // clamped at the last timed step
    expect(readKey(TIMER).baseElapsedMs).toBe(75_000);

    await stepPrev(steps, 0);
    expect(readKey(TIMER).baseElapsedMs).toBe(30_000);
  });

  it("stepPrev from a fresh/reset timer is a no-op (stays reset)", async () => {
    await writeKey(TIMER, { startedAtMs: null, baseElapsedMs: 0, engaged: false });
    await stepPrev(steps, 0);
    expect(readKey(TIMER)).toEqual({ startedAtMs: null, baseElapsedMs: 0, engaged: false });
  });
});
