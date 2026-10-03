import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import unitsFixture from "../../w3c/__fixtures__/replay-units.d0wi.vsUndead.json";
import { buildComposition } from "../../w3c/composition";
import { ArmySection, CardView } from "./CardView";
import { realCard } from "./testCard";

const API = "https://warcraft-gym.com";
afterEach(() => cleanup());

describe("CardView on d0wi's real card", () => {
  it("leads with the tags, each with its evidence", () => {
    render(<CardView card={realCard()} apiBase={API} />);
    const tags = within(screen.getByRole("list", { name: "What to expect" })).getAllByRole("listitem");
    expect(tags.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Wins fights: 22% more kills than his opponents",
      "Weak on Hammerfall: 36% here vs 52% overall",
      "Fragile heroes: Loses 2.1 heroes per game",
      "Floats into upkeep: Lost gold to upkeep in 4 of 8 games",
      "Always Demon Hunter: Demon Hunter first in 15 of 18 games",
    ]);
    expect(tags[0].className).toContain("oc-tag--threat");
    expect(tags[1].className).toContain("oc-tag--opening");
  });

  it("the subtitle, win chance and form", () => {
    render(<CardView card={realCard()} apiBase={API} />);
    expect(screen.getByText("1858 MMR · #19 · FR · 19 seasons")).toBeTruthy();
    expect(screen.getByText("Your win chance")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy(); // 1760 vs 1858, scale 675
    expect(screen.getByLabelText("Recent form, newest first: W L W W W L L W L L")).toBeTruthy();
    expect(screen.getByText("5–5 last 10 · 8 games in 24 h")).toBeTruthy();
  });

  it("records are tiles labelled Them / You", () => {
    render(<CardView card={realCard()} apiBase={API} />);
    expect(screen.getByText(/Them on Hammerfall/)).toBeTruthy();
    expect(screen.getByText(/You on Hammerfall/)).toBeTruthy();
    expect(screen.getByText("12–6")).toBeTruthy();
    expect(screen.getByText("5–9")).toBeTruthy();
    expect(screen.getByText("9–7")).toBeTruthy();
    expect(screen.getByText("2–3")).toBeTruthy();
  });

  it("game length, heroes and play style", () => {
    render(<CardView card={realCard()} apiBase={API} />);
    expect(screen.getByText("Their record by game length")).toBeTruthy();
    expect(screen.getByText("3–1")).toBeTruthy();
    expect(screen.getByText("6–2")).toBeTruthy();
    expect(screen.getByText("3–3")).toBeTruthy();
    expect(screen.getByText("15/18 · 9–6")).toBeTruthy();
    expect(screen.getByText("11/18 · 6–5")).toBeTruthy();
    expect(screen.getByText("2/18 · 2–0")).toBeTruthy();
    expect(screen.getByText("560/min")).toBeTruthy();
    expect(screen.getByText("gold, +6% vs opponents")).toBeTruthy();
    expect(screen.getByText("+22%")).toBeTruthy();
    expect(screen.getByText("2.1")).toBeTruthy();
    expect(screen.getByText("Upkeep in 4/8 games · 1.4 mercs / game")).toBeTruthy();
  });

  it("says when the play style is still loading", () => {
    render(<CardView card={{ ...realCard(), extrasStatus: "loading", style: undefined }} apiBase={API} />);
    expect(screen.getByText("Loading play style…")).toBeTruthy();
  });

  it("shows no army while the feature is off (the shipped default)", () => {
    const card = { ...realCard(), armyStatus: "ok" as const, composition: buildComposition(unitsFixture.map((g) => g.steps)) };
    render(<CardView card={card} apiBase={API} />);
    expect(screen.queryByText(/^Army/)).toBeNull();
    expect(screen.queryByText("Dryad")).toBeNull();
  });
});

describe("ArmySection (premium candidate, off by default)", () => {
  const card = { ...realCard(), armyStatus: "ok" as const, composition: buildComposition(unitsFixture.map((g) => g.steps)) };

  it("lists the usual units when enabled", () => {
    render(<ArmySection card={card} apiBase={API} enabled />);
    expect(screen.getByText("Army · last 5")).toBeTruthy();
    expect(screen.getByText("Dryad")).toBeTruthy();
    expect(screen.getByText("7 per game · 5/5")).toBeTruthy();
    expect(screen.getByText("3.2 per game · 3/5")).toBeTruthy();
  });

  it("says it is loading when enabled", () => {
    render(<ArmySection card={{ ...realCard(), armyStatus: "loading" }} apiBase={API} enabled />);
    expect(screen.getByText("Loading army…")).toBeTruthy();
  });

  it("renders nothing when disabled", () => {
    const { container } = render(<ArmySection card={card} apiBase={API} enabled={false} />);
    expect(container.textContent).toBe("");
  });
});
