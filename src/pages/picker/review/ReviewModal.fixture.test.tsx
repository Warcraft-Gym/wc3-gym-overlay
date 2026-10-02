/**
 * F010 (review-ui) - renders `ReviewModal` against the *real* comparison of
 * the two committed fixtures (a captured production replay-import response
 * and a real published build), run through the real `compareBuild` - not a
 * hand-crafted comparison like `ReviewModal.test.tsx`'s other cases. Pins
 * the summary line's numbers so a change to `compareBuild`'s matching
 * rules (or this view's summary text) that silently changes what a real
 * build's review looks like gets caught here.
 *
 * F010b: this fixture pair's plan trains Peons throughout (a worker icon),
 * so the numbers below also pin the new not-timed/notTimed behaviour on
 * real data - see `planVsActual.test.ts`'s own hand-check of this exact
 * pair for the row-by-row reasoning.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { compareBuild } from "../../../lib/planVsActual";
import type { ApiBuildListItem } from "../../../api/schema";
import type { ReplayImportResponse } from "../../../api/replayImport";
import type { Review } from "../../../reviews/types";
import { ReviewModal } from "./ReviewModal";
import planFixture from "../../../lib/__fixtures__/build.bm-mi-1-grunt-into-hhs-2-burrow-tech-622e.json";
import replayFixture from "../../../api/__fixtures__/replay-import.production.json";

const plan = planFixture as unknown as ApiBuildListItem;
const replay = replayFixture as unknown as ReplayImportResponse;

describe("ReviewModal - real fixture comparison", () => {
  it("shows 4 on plan, 2 early, 3 late, 6 missed and 6 not-timed for the committed fixture pair", () => {
    // Same race-match rule `pickMe` uses: the plan's own race picks "you"
    // out of the replay's two players.
    const me = replay.players.find((player) => player.race === plan.race);
    if (!me) throw new Error("fixture: no player matches the plan's race");

    const comparison = compareBuild(plan.steps, me.build.steps);
    // F010b: 6 of these 21 rows are or-peon (a worker icon) - "not-timed",
    // excluded from `total`/`onPlan`/`early` (see `planVsActual.test.ts`'s
    // real-pair hand-check for the row-by-row breakdown).
    expect(comparison.summary).toMatchObject({ total: 15, onPlan: 4, early: 2, late: 3, missed: 6, notTimed: 6 });

    const opponent = replay.players.find((player) => player.id !== me.id)!;
    const review: Review = {
      id: "fixture-review",
      createdAt: "2026-01-01T00:00:00.000Z",
      source: { path: "/x/LastReplay.w3g", mtimeMs: 1000 },
      status: "ok",
      map: replay.map,
      duration: replay.duration,
      players: [
        { id: me.id, name: me.name, race: me.race, steps: me.build.steps },
        { id: opponent.id, name: opponent.name, race: opponent.race, steps: opponent.build.steps },
      ],
      meId: me.id,
      meStatus: "resolved",
      plan: { slug: plan.slug, title: plan.title, race: plan.race, steps: plan.steps },
      comparison,
      seen: true,
    };

    render(
      <ReviewModal
        review={review}
        apiBase="https://warcraft-gym.com"
        inProgress={false}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    expect(
      screen.getByText("4/15 on plan · 2 early · 3 late · 6 missed · first slip at 1:05 (workers not timed)"),
    ).toBeTruthy();
  });
});
