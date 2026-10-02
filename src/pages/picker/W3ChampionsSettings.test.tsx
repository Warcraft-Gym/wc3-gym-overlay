import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OPPONENT, SETTINGS, type OpponentState } from "../../store/keys";
import { readKey } from "../../store/state";
import { opponentStatusText, W3ChampionsSettings } from "./W3ChampionsSettings";

const idle: OpponentState = { status: "idle", matchId: null, live: false, error: null, card: null, updatedAt: null };

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("opponentStatusText", () => {
  const on = { myBattleTag: "d0wi#2726", opponentCard: true };
  it("explains each state in one line", () => {
    expect(opponentStatusText({ ...on, opponentCard: false }, idle)).toBe("The opponent card is off.");
    expect(opponentStatusText({ ...on, myBattleTag: null }, idle)).toBe("Enter your BattleTag to get the opponent card.");
    expect(opponentStatusText(on, idle)).toBe("Waiting for your next W3Champions 1v1.");
    expect(opponentStatusText(on, { ...idle, status: "loading", live: true, matchId: "m" })).toBe("In a game, looking up your opponent…");
    expect(opponentStatusText(on, { ...idle, status: "error", live: true, matchId: "m", error: "boom" })).toBe("boom");
  });
});

describe("W3ChampionsSettings", () => {
  it("saves a valid BattleTag and rejects a malformed one", () => {
    render(<W3ChampionsSettings settings={readKey(SETTINGS)} />);
    const field = screen.getByLabelText("Your BattleTag");
    fireEvent.change(field, { target: { value: "d0wi" } });
    expect(screen.getByRole("alert").textContent).toContain("Name#1234");
    expect(readKey(SETTINGS).myBattleTag).toBeNull();
    fireEvent.change(field, { target: { value: " d0wi#2726 " } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(readKey(SETTINGS).myBattleTag).toBe("d0wi#2726");
    fireEvent.change(field, { target: { value: "" } });
    expect(readKey(SETTINGS).myBattleTag).toBeNull();
  });

  it("toggles the feature", () => {
    render(<W3ChampionsSettings settings={readKey(SETTINGS)} />);
    fireEvent.click(screen.getByLabelText("Show the opponent card when a 1v1 starts"));
    expect(readKey(SETTINGS).opponentCard).toBe(false);
  });

  it("starts on, with nothing polled until a tag is set", () => {
    expect(readKey(SETTINGS).opponentCard).toBe(true);
    expect(readKey(SETTINGS).myBattleTag).toBeNull();
    expect(readKey(OPPONENT).status).toBe("idle");
  });
});
