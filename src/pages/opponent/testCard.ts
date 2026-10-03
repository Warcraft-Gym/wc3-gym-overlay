/**
 * The card tests render: d0wi#2726 (Night Elf) as your opponent on
 * Hammerfall, you NecroDoom#11385 (Undead), built from real captured
 * W3Champions responses (history, score sheets, profile). Test-only.
 */

import detailsFixture from "../../w3c/__fixtures__/match-details.d0wi.vsUndead.json";
import profileD0wi from "../../w3c/__fixtures__/player.d0wi.json";
import season24 from "../../w3c/__fixtures__/search.d0wi.season24.json";
import season25 from "../../w3c/__fixtures__/search.d0wi.season25.json";
import { matchDetailSchema, w3cMatchSchema } from "../../w3c/client";
import { buildIdentity, buildOpponentCard, buildStyle, type LiveMatch, type OpponentCard } from "../../w3c/opponentCard";

export const testHistory = [...season25.matches, ...season24.matches].map((m) => w3cMatchSchema.parse(m));

export const testLive: LiveMatch = {
  matchId: "live-1",
  map: "Hammerfall",
  startTime: "2026-10-02T23:03:50.342+00:00",
  me: { battleTag: "NecroDoom#11385", race: 8, rndRace: null, oldMmr: 1760 },
  opponent: { battleTag: "d0wi#2726", name: "d0wi", race: 4, rndRace: null, oldMmr: 1858, location: "FR", ranking: { rank: 19 } },
};

/** The full card, extras included (your record is illustrative: 9–7 and 2–3). */
export function realCard(): OpponentCard {
  return {
    ...buildOpponentCard(testLive, testHistory),
    extrasStatus: "ok",
    identity: buildIdentity({ name: null }, profileD0wi),
    style: buildStyle(detailsFixture.map((d) => matchDetailSchema.parse(d)), "d0wi#2726"),
    myRecord: { vsRace: { wins: 9, losses: 7 }, onMap: { wins: 2, losses: 3 } },
  };
}
