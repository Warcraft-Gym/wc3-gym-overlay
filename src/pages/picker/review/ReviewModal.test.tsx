/**
 * F010 (review-ui) - the post-game review view itself: purely presentational
 * (every pipeline call comes in as a prop), so these tests never touch the
 * store or `reviews/pipeline.ts` - the wiring between this view and the
 * real pipeline is covered by `ReviewLauncher.test.tsx`.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComparisonResultDto, Review } from "../../../reviews/types";
import { ReviewModal } from "./ReviewModal";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function baseReview(overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: { path: "/x/LastReplay.w3g", mtimeMs: 1000 },
    status: "ok",
    map: "lastrefuge.anon",
    duration: "11:03",
    players: [
      { id: 1, name: "Me#1111", race: "orc", steps: [] },
      { id: 2, name: "Foe#2222", race: "undead", steps: [] },
    ],
    meId: 1,
    meStatus: "resolved",
    plan: { slug: "plan-a", title: "Plan A", race: "orc", steps: [] },
    comparison: null,
    seen: true,
    ...overrides,
  };
}

const SMALL_COMPARISON: ComparisonResultDto = {
  rows: [
    {
      index: 0,
      // or-altar, not or-peon - a worker icon's row would be "not-timed"
      // (F010b), not "on-plan"; see WORKER_COMPARISON below for that case.
      plan: { time: "0:00", supply: 5, instruction: "Build Altar of Storms", icon: "or-altar" },
      actual: { time: "0:02", supply: 5 },
      supplyDelta: 0,
      timeDelta: 2,
      status: "on-plan",
    },
    {
      index: 1,
      plan: { time: "0:30", supply: 7, instruction: "Build Barracks", icon: "or-barracks" },
      actual: { time: "0:12", supply: 6 },
      supplyDelta: -1,
      timeDelta: -18,
      status: "early",
    },
    {
      index: 2,
      plan: { time: "1:00", supply: 9, instruction: "Build Burrow", icon: "or-burrow" },
      actual: null,
      supplyDelta: null,
      timeDelta: null,
      status: "missed",
    },
  ],
  extras: [{ icon: "or-grunt", count: 2, firstTime: "2:10", firstSupply: 14, instruction: "Train 2× Grunt" }],
  summary: { total: 3, onPlan: 1, early: 1, late: 0, missed: 1, notTimed: 0, firstSlip: { index: 1, supply: 7, time: "0:30" } },
};

// F010b: a worker row ("not-timed"), including one that fell short of its
// own plan step's "N×" count (`shortBy`) - exercises the "Not timed" chip,
// the "N of M" actual suffix, and the summary's "(workers not timed)" tail.
const WORKER_COMPARISON: ComparisonResultDto = {
  rows: [
    {
      index: 0,
      plan: { time: "0:02", supply: 5, instruction: "Train 2× Peasant", icon: "hu-peasant" },
      actual: { time: "0:01", supply: 5 },
      supplyDelta: 0,
      timeDelta: -1,
      status: "not-timed",
      count: 2,
      shortBy: 1,
    },
    {
      index: 1,
      plan: { time: "0:30", supply: 7, instruction: "Build Barracks", icon: "hu-barracks" },
      actual: { time: "0:41", supply: 8 },
      supplyDelta: 1,
      timeDelta: 11,
      status: "late",
    },
  ],
  extras: [],
  summary: { total: 1, onPlan: 0, early: 0, late: 1, missed: 0, notTimed: 1, firstSlip: { index: 1, supply: 7, time: "0:30" } },
};

describe("ReviewModal", () => {
  it("renders 'reviewing' while an import is in flight, regardless of any stored review", () => {
    render(
      <ReviewModal
        review={baseReview({ status: "error", error: "boom" })}
        apiBase="https://warcraft-gym.com"
        inProgress
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Reviewing your last game…");
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("renders the 'finish a game' message when there is no review", () => {
    render(
      <ReviewModal
        review={null}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByText("Finish a game to see your review here.")).toBeTruthy();
  });

  it("status: error renders the server's message and Retry calls onRetry", () => {
    const onRetry = vi.fn();
    render(
      <ReviewModal
        review={baseReview({ status: "error", error: "Replay couldn't be parsed.", comparison: null })}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={onRetry}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Replay couldn't be parsed.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("meStatus: unresolved renders the 'which one are you' chooser and calls onResolve with the remembered name", () => {
    const onResolve = vi.fn();
    render(
      <ReviewModal
        review={baseReview({ meStatus: "unresolved", meId: null })}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={onResolve}
      />,
    );
    expect(screen.getByText("Which one are you?")).toBeTruthy();
    const group = screen.getByRole("radiogroup", { name: "Which one are you?" });
    fireEvent.click(within(group).getByRole("radio", { name: "Foe#2222 · Undead" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onResolve).toHaveBeenCalledWith(2, "Foe#2222");
  });

  it("unchecking 'Remember me' calls onResolve with no battle tag to remember", () => {
    const onResolve = vi.fn();
    render(
      <ReviewModal
        review={baseReview({ meStatus: "unresolved", meId: null })}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={onResolve}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Remember me/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onResolve).toHaveBeenCalledWith(1, undefined);
  });

  it("meStatus: not-1v1 renders a clear message", () => {
    render(
      <ReviewModal
        review={baseReview({ meStatus: "not-1v1", meId: null })}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByText("Reviews only cover 1v1 games.")).toBeTruthy();
  });

  it("plan: null lists what you actually did instead of a comparison", () => {
    render(
      <ReviewModal
        review={baseReview({
          plan: null,
          comparison: null,
          players: [
            {
              id: 1,
              name: "Me#1111",
              race: "orc",
              steps: [{ time: "0:00", supply: 5, instruction: "Train Peon", icon: "or-peon" }],
            },
            { id: 2, name: "Foe#2222", race: "undead", steps: [] },
          ],
        })}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByText("No build was selected for this game.")).toBeTruthy();
    expect(screen.getByText("Train Peon")).toBeTruthy();
  });

  it("an ok review with a comparison renders the header, summary, one row per plan step and extras", () => {
    render(
      <ReviewModal
        review={baseReview({ comparison: SMALL_COMPARISON })}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    // Header.
    expect(screen.getByText(/lastrefuge\.anon/)).toBeTruthy();
    expect(screen.getByText(/11:03/)).toBeTruthy();
    expect(screen.getByText("Me#1111")).toBeTruthy();
    expect(screen.getByText("Foe#2222")).toBeTruthy();
    expect(screen.getByText("Plan A")).toBeTruthy();

    // Summary line.
    expect(screen.getByText("1/3 on plan · 1 early · 0 late · 1 missed · first slip at 0:30")).toBeTruthy();

    // One row per plan step, with the right status labels.
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("On plan")).toBeTruthy();
    expect(within(rows[1]).getByText("Early")).toBeTruthy();
    expect(within(rows[2]).getByText("Missed")).toBeTruthy();
    expect(within(rows[2]).getAllByText("Not done")).toHaveLength(2); // actual column + delta column

    // Extras.
    expect(screen.getByText("Also did")).toBeTruthy();
    expect(screen.getByText("Train 2× Grunt")).toBeTruthy();
  });

  // F010b: worker rows.
  it("renders a 'Not timed' chip for a worker row, '–' in its delta cell, '1 of 2' next to its actual, and the summary's worker suffix", () => {
    render(
      <ReviewModal
        review={baseReview({ comparison: WORKER_COMPARISON })}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    // Summary line - the worker suffix only appears because notTimed > 0.
    expect(screen.getByText("0/1 on plan · 0 early · 1 late · 0 missed · first slip at 0:30 (workers not timed)")).toBeTruthy();

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Not timed")).toBeTruthy();
    expect(within(rows[0]).getByText("–")).toBeTruthy(); // delta cell, en dash
    expect(within(rows[0]).getByText(/1 of 2/)).toBeTruthy(); // shortBy: found 1 of the requested 2
    expect(within(rows[1]).getByText("Late")).toBeTruthy(); // not a worker row - judged as usual
  });

  it("omits the worker suffix from the summary line when every row is timed (notTimed: 0)", () => {
    render(
      <ReviewModal
        review={baseReview({ comparison: SMALL_COMPARISON })}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.queryByText(/workers not timed/)).toBeNull();
  });

  it("collapses 'Also did' behind a toggle when there are more than 6 extras", () => {
    const manyExtras: ComparisonResultDto = {
      ...SMALL_COMPARISON,
      extras: Array.from({ length: 8 }, (_, i) => ({
        icon: `icon-${i}`,
        count: 1,
        firstTime: "0:00",
        firstSupply: 5,
        instruction: `Extra ${i}`,
      })),
    };
    render(
      <ReviewModal
        review={baseReview({ comparison: manyExtras })}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.queryByText("Extra 6")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 8" }));
    expect(screen.getByText("Extra 6")).toBeTruthy();
  });

  it("closing calls onClose", () => {
    const onClose = vi.fn();
    render(
      <ReviewModal
        review={baseReview()}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={onClose}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close last game review" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
