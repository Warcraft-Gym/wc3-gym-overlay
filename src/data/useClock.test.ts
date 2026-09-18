import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TIMER } from "../store/keys";
import { writeKey } from "../store/state";
import { activeStepIndex } from "../store/timer";
import { stepNext, reset as resetTimer } from "../lib/timerActions";
import { useClock } from "./useClock";

const stepsWithFirstAt0 = [{ time: "0:00" }, { time: "0:30" }];

describe("useClock", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Vitest isn't configured with `test.globals`, so @testing-library/react's
  // automatic afterEach-cleanup detection never fires (see F003's
  // useBuilds.test.ts for the full explanation).
  afterEach(() => {
    cleanup();
  });

  it("reports elapsed 0, not running, not active before any play", async () => {
    const { result } = renderHook(() => useClock());
    await waitFor(() => expect(result.current.elapsedSec).toBe(0));
    expect(result.current.running).toBe(false);
    expect(result.current.active).toBe(false);
  });

  it("reports running=true and active=true once the timer has started", async () => {
    await act(async () => {
      await writeKey(TIMER, { startedAtMs: Date.now(), baseElapsedMs: 0 });
    });
    const { result } = renderHook(() => useClock());
    await waitFor(() => expect(result.current.running).toBe(true));
    expect(result.current.active).toBe(true);
  });

  it("stays active after pausing with nonzero elapsed", async () => {
    await act(async () => {
      await writeKey(TIMER, { startedAtMs: null, baseElapsedMs: 5000 });
    });
    const { result } = renderHook(() => useClock());
    await waitFor(() => expect(result.current.elapsedSec).toBe(5));
    expect(result.current.running).toBe(false);
    expect(result.current.active).toBe(true);
  });

  it("is inactive again after a reset back to baseElapsedMs 0", async () => {
    await act(async () => {
      await writeKey(TIMER, { startedAtMs: null, baseElapsedMs: 0 });
    });
    const { result } = renderHook(() => useClock());
    await waitFor(() => expect(result.current.active).toBe(false));
  });

  it("first stepNext() from a fresh timer with a 0:00 first step activates and highlights index 0, then reset deactivates again", async () => {
    const { result } = renderHook(() => useClock());
    await waitFor(() => expect(result.current.active).toBe(false));

    await act(async () => {
      await stepNext(stepsWithFirstAt0, 0);
    });
    await waitFor(() => expect(result.current.active).toBe(true));
    const activeIndex = result.current.active
      ? activeStepIndex(stepsWithFirstAt0, result.current.elapsedSec)
      : -1;
    expect(activeIndex).toBe(0);

    await act(async () => {
      await resetTimer();
    });
    await waitFor(() => expect(result.current.active).toBe(false));
  });
});
