/**
 * F008: difficulty badges must use the `--wg-difficulty-*` tokens (green ->
 * amber -> red), not the old `win`/`arcane`/`gold` borrow that made
 * beginner and intermediate both read blue. See `src/styles/tokens.css`
 * and the site's `fix(builds): difficulty reads as a scale`.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DifficultyBadge, type Difficulty } from "./BuildBadges";

afterEach(() => {
  cleanup();
});

const EXPECTED_TONE: Record<Difficulty, string> = {
  beginner: "border-difficulty-beginner/50 text-difficulty-beginner",
  intermediate: "border-difficulty-intermediate/50 text-difficulty-intermediate",
  advanced: "border-difficulty-advanced/50 text-difficulty-advanced",
};

const STALE_CLASSES = ["win", "arcane", "gold"];

describe("DifficultyBadge colour tokens", () => {
  for (const level of Object.keys(EXPECTED_TONE) as Difficulty[]) {
    it(`${level} uses the difficulty-${level} token, not win/arcane/gold`, () => {
      const { container } = render(<DifficultyBadge level={level} />);
      const badge = container.querySelector("span");
      expect(badge).toBeTruthy();
      const className = badge!.className;

      for (const token of EXPECTED_TONE[level].split(" ")) {
        expect(className).toContain(token);
      }

      for (const stale of STALE_CLASSES) {
        expect(className).not.toMatch(new RegExp(`(^|[\\s:])(border|text)-${stale}(/|\\s|$)`));
      }
    });
  }
});
