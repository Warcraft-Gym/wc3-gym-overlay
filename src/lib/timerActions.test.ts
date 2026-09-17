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
    expect(readKey(TIMER)).toEqual({ startedAtMs: 0, baseElapsedMs: 0 });

    await togglePlayPause(1000);
    expect(readKey(TIMER)).toEqual({ startedAtMs: null, baseElapsedMs: 1000 });
  });

  it("reset returns elapsed to 0 and running=false", async () => {
    await writeKey(TIMER, { startedAtMs: 0, baseElapsedMs: 5000 });
    await reset();
    expect(readKey(TIMER)).toEqual({ startedAtMs: null, baseElapsedMs: 0 });
  });

  it("stepNext/stepPrev jump the clock to the neighbouring timed step, clamped", async () => {
    await writeKey(TIMER, { startedAtMs: null, baseElapsedMs: 0 });

    await stepNext(steps, 0);
    expect(readKey(TIMER).baseElapsedMs).toBe(30_000);

    await stepNext(steps, 0);
    expect(readKey(TIMER).baseElapsedMs).toBe(75_000);

    await stepNext(steps, 0); // clamped at the last timed step
    expect(readKey(TIMER).baseElapsedMs).toBe(75_000);

    await stepPrev(steps, 0);
    expect(readKey(TIMER).baseElapsedMs).toBe(30_000);
  });
});
