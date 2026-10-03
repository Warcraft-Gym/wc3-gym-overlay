import { describe, expect, it } from "vitest";
import {
  activityNote,
  formatRecord,
  formatRelative,
  formatWinLoss,
  openerStat,
  perGameLabel,
  subtitleLine,
  toneOfTheirRate,
  toneOfWinChance,
  toneOfYourRate,
  winRate,
} from "./format";
import { realCard } from "./testCard";

describe("format", () => {
  it("records", () => {
    expect(formatRecord({ wins: 12, losses: 6 })).toBe("12–6 (67%)");
    expect(formatRecord({ wins: 0, losses: 0 })).toBe("no games");
    expect(formatWinLoss({ wins: 12, losses: 6 })).toBe("12–6");
    expect(winRate({ wins: 0, losses: 0 })).toBeNull();
    expect(winRate({ wins: 3, losses: 1 })).toBe(0.75);
  });

  it("relative and per-game numbers", () => {
    expect(formatRelative(1.06)).toBe("+6%");
    expect(formatRelative(0.8)).toBe("-20%");
    expect(perGameLabel(7)).toBe("7 per game");
    expect(perGameLabel(4.2)).toBe("4.2 per game");
    expect(openerStat(15, 18, { wins: 9, losses: 6 })).toBe("15/18 · 9–6");
    expect(openerStat(15, 18)).toBe("15/18");
  });

  it("subtitle and activity from the real card", () => {
    const card = realCard();
    expect(subtitleLine(card)).toBe("1858 MMR · #19 · FR · 19 seasons");
    expect(subtitleLine({ ...card, identity: { aka: "Life", country: "CN", seasons: 1 } })).toBe("1858 MMR · #19 · CN · first season");
    expect(activityNote(card)).toBe("8 games in 24 h");
    expect(activityNote({ ...card, gamesLast24h: 1 })).toBe("1 game in 24 h");
    expect(activityNote({ ...card, gamesLast24h: 0 })).toBeNull();
  });

  it("tones are from your point of view", () => {
    expect(toneOfTheirRate(0.7, 10)).toBe("threat");
    expect(toneOfTheirRate(0.3, 10)).toBe("opening");
    expect(toneOfTheirRate(0.7, 3)).toBe("neutral"); // too few games to say
    expect(toneOfYourRate(0.7, 10)).toBe("opening");
    expect(toneOfWinChance(0.37)).toBe("threat");
    expect(toneOfWinChance(0.5)).toBe("neutral");
    expect(toneOfWinChance(0.6)).toBe("opening");
  });
});
