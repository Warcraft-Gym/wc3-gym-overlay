/**
 * Regression coverage for the `step_next`/`step_prev` global shortcuts
 * against a *private* build: before this fix, `currentSteps()` only ever
 * read `BUILDS_CACHE`, so a `local-<uuid>` selection resolved to `[]` and
 * the shortcut dispatch (`jumpToStep`) was a silent no-op. Exercised end to
 * end through the browser host's real `keydown` listener, the same path a
 * physical key press takes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { host } from "./host";
import { createLocalBuild } from "./lib/localBuilds";
import { writeLocalBuilds } from "./data/localBuildsStore";
import { applyShortcuts } from "./shortcuts";
import { SELECTED_BUILD_SLUG, TIMER } from "./store/keys";
import { readKey, writeKey } from "./store/state";

function pressStepNext(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "]", code: "BracketRight", ctrlKey: true, shiftKey: true }),
  );
}

function pressStepPrev(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "[", code: "BracketLeft", ctrlKey: true, shiftKey: true }),
  );
}

describe("step_next/step_prev shortcuts on a private build", () => {
  beforeEach(async () => {
    localStorage.clear();
    await writeKey(TIMER, { startedAtMs: null, baseElapsedMs: 0, engaged: false });
  });

  afterEach(async () => {
    await host.unregisterAllShortcuts();
  });

  it("moves the clock to the first timed step, then back to reset", async () => {
    const local = createLocalBuild({
      title: "Private opener",
      race: "orc",
      vsRaces: [],
      difficulty: "beginner",
      tags: [],
      summary: "s",
      author: "a",
      steps: [
        { instruction: "start", time: "0:00" },
        { instruction: "second", time: "0:05" },
        { instruction: "third", time: "0:20" },
      ],
    });
    await writeLocalBuilds([local]);
    await writeKey(SELECTED_BUILD_SLUG, local.slug);

    await applyShortcuts();

    pressStepNext();
    expect(readKey(TIMER).baseElapsedMs).toBe(0);
    expect(readKey(TIMER).engaged).toBe(true);

    pressStepNext();
    expect(readKey(TIMER).baseElapsedMs).toBe(5000);

    pressStepPrev();
    expect(readKey(TIMER).baseElapsedMs).toBe(0);
  });
});
