/**
 * F008: the row's difficulty stripe (`before:bg-…`) must use the
 * `--wg-difficulty-*` tokens, not the old `win`/`arcane`/`gold` borrow. See
 * `src/components/BuildBadges.test.tsx` for the badge's own guard.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AnyBuild } from "../../data/useAllBuilds";
import type { Difficulty } from "../../components/BuildBadges";
import { BuildRow } from "./BuildRow";

afterEach(() => {
  cleanup();
});

function buildFor(difficulty: Difficulty): AnyBuild {
  return {
    slug: `human-fast-expand-${difficulty}`,
    title: "Human Fast Expand",
    race: "human",
    vsRaces: [],
    difficulty,
    tags: [],
    summary: "Safe opener",
    author: "Coach",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    steps: [],
    source: "site",
  };
}

const EXPECTED_RAIL: Record<Difficulty, string> = {
  beginner: "before:bg-difficulty-beginner",
  intermediate: "before:bg-difficulty-intermediate",
  advanced: "before:bg-difficulty-advanced",
};

const STALE_RAILS = ["before:bg-win", "before:bg-arcane", "before:bg-gold"];

describe("BuildRow difficulty stripe colour tokens", () => {
  for (const level of Object.keys(EXPECTED_RAIL) as Difficulty[]) {
    it(`${level} row stripe uses the difficulty-${level} token, not win/arcane/gold`, () => {
      const { container } = render(
        <ul>
          <BuildRow
            build={buildFor(level)}
            apiBase="https://wc3-gnl-website.vercel.app"
            selected={false}
            onSelect={() => {}}
            onDuplicate={() => {}}
          />
        </ul>,
      );
      const row = container.querySelector("li");
      expect(row).toBeTruthy();
      const className = row!.className;

      expect(className).toContain(EXPECTED_RAIL[level]);
      for (const stale of STALE_RAILS) {
        expect(className).not.toContain(stale);
      }
    });
  }
});

describe("BuildRow compact actions", () => {
  it("one ghost 'Use' button; the selected row says 'In game' and is marked current", async () => {
    const { fireEvent, screen } = await import("@testing-library/react");
    let selected = false;
    const onSelect = () => {
      selected = true;
    };
    const { rerender } = render(
      <ul>
        <BuildRow build={buildFor("beginner")} apiBase="https://warcraft-gym.com" selected={false} onSelect={onSelect} onDuplicate={() => {}} />
      </ul>,
    );
    const use = screen.getByRole("button", { name: "Use in game" });
    expect(use.getAttribute("aria-pressed")).toBe("false");
    expect(use.className).not.toContain("btn-gold");
    fireEvent.click(use);
    expect(selected).toBe(true);
    rerender(
      <ul>
        <BuildRow build={buildFor("beginner")} apiBase="https://warcraft-gym.com" selected onSelect={onSelect} onDuplicate={() => {}} />
      </ul>,
    );
    expect(screen.getByRole("button", { name: "In game" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("li")!.getAttribute("aria-current")).toBe("true");
  });
});
