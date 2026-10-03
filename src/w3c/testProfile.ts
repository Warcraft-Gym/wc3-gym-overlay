/** d0wi#2726's own profile from real captured W3Champions responses. Test-only. */

import akaD0wi from "./__fixtures__/aka.d0wi.json";
import detailsFixture from "./__fixtures__/match-details.d0wi.vsUndead.json";
import gameModeStats from "./__fixtures__/game-mode-stats.d0wi.json";
import timeline24 from "./__fixtures__/mmr-timeline.d0wi.s24.json";
import timeline25 from "./__fixtures__/mmr-timeline.d0wi.s25.json";
import profileD0wi from "./__fixtures__/player.d0wi.json";
import season24 from "./__fixtures__/search.d0wi.season24.json";
import season25 from "./__fixtures__/search.d0wi.season25.json";
import { matchDetailSchema, w3cMatchSchema } from "./client";
import { buildIdentity } from "./opponentCard";
import { buildProfile, type Profile, type ProfileInputs } from "./profile";

export const D0WI = "d0wi#2726";
/** Noon on 2026-10-03, the morning after the captures. */
export const PROFILE_NOW = Date.parse("2026-10-03T12:00:00Z");

export function profileInputs(): ProfileInputs {
  return {
    tag: D0WI,
    history: [...season25.matches, ...season24.matches].map((m) => w3cMatchSchema.parse(m)),
    stats: gameModeStats,
    mmrHistory: [...timeline24.mmrRpAtDates, ...timeline25.mmrRpAtDates].map((p) => p.mmr),
    identity: buildIdentity({ name: akaD0wi.name ?? null }, profileD0wi),
    details: detailsFixture.map((d) => matchDetailSchema.parse(d)),
    now: PROFILE_NOW,
  };
}

export function realProfile(): Profile {
  const profile = buildProfile(profileInputs());
  if (!profile) throw new Error("d0wi fixture produced no profile");
  return profile;
}
