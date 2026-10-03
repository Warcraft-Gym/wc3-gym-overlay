import { describe, expect, it } from "vitest";
import type { TimerState } from "../store/keys";
import { resetTimer } from "../store/timer";
import { applyGameClock, DRIFT_MS, holdLimitMs } from "./gameClock";

const NOW = 1_000_000;
const fresh: TimerState = { startedAtMs: null, baseElapsedMs: 0, engaged: false };
const inGame = (clockMs: number) => ({ inGame: true, clockMs, refreshMs: 250 });

describe("applyGameClock", () => {
  it("starts the timer at now - clockMs for a running in-game sample", () => {
    expect(applyGameClock(fresh, inGame(8550), 0, false, NOW)).toEqual({
      startedAtMs: NOW - 8550,
      baseElapsedMs: 0,
      engaged: true,
    });
  });

  it("returns the same object when the clock stays within DRIFT_MS", () => {
    const running = applyGameClock(fresh, inGame(8550), 0, false, NOW);
    const later = NOW + 250;
    const sample = inGame(8550 + 250 + DRIFT_MS - 50);
    expect(applyGameClock(running, sample, 0, true, later)).toBe(running);
  });

  it("pauses the timer at clockMs when the clock holds longer than the hold limit", () => {
    const running = applyGameClock(fresh, inGame(8550), 0, false, NOW);
    const held = holdLimitMs(250) + 1;
    expect(applyGameClock(running, inGame(8550), held, true, NOW + held)).toEqual({
      startedAtMs: null,
      baseElapsedMs: 8550,
      engaged: true,
    });
  });

  it("resets on a null sample after a game, and keeps t when never in game", () => {
    const running = applyGameClock(fresh, inGame(8550), 0, false, NOW);
    expect(applyGameClock(running, null, 0, true, NOW)).toEqual(resetTimer());
    expect(applyGameClock(running, null, 0, false, NOW)).toBe(running);
  });

  it("keeps a running timer whose elapsed time came from a step jump", () => {
    // jumpTo in store/timer.ts keeps the target in baseElapsedMs.
    const jumped: TimerState = { startedAtMs: NOW - 50, baseElapsedMs: 8500, engaged: true };
    expect(applyGameClock(jumped, inGame(8550), 0, true, NOW)).toBe(jumped);
  });

  it("resyncs startedAtMs when the drift is above DRIFT_MS", () => {
    const running = applyGameClock(fresh, inGame(8550), 0, false, NOW);
    const sample = inGame(8550 + DRIFT_MS + 100);
    expect(applyGameClock(running, sample, 0, true, NOW)).toEqual({
      startedAtMs: NOW - (8550 + DRIFT_MS + 100),
      baseElapsedMs: 0,
      engaged: true,
    });
  });
});
