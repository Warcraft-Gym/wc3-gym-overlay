import { afterEach, describe, expect, it, vi } from "vitest";
import fullResponse from "./__fixtures__/replay-import.match.d0wi.json";
import unitsFixture from "./__fixtures__/replay-units.d0wi.vsUndead.json";
import { buildComposition, fetchMatchSteps } from "./composition";

afterEach(() => vi.unstubAllGlobals());

describe("buildComposition on d0wi's real replays against Undead (5 games)", () => {
  // Expected values computed independently (python) from the same fixture.
  it("averages trained units per game, workers excluded, most first", () => {
    expect(buildComposition(unitsFixture.map((g) => g.steps))).toEqual({
      games: 5,
      units: [
        { name: "Dryad", icon: "ne-dryad", perGame: 7, inGames: 5 },
        { name: "Archer", icon: "ne-archer", perGame: 4.2, inGames: 5 },
        { name: "Druid of the Claw", icon: "ne-druid-of-the-claw", perGame: 3.2, inGames: 3 },
        { name: "Hippogryph", icon: "ne-hippogryph", perGame: 1.4, inGames: 1 },
        { name: "Forest Troll Shadow Priest", icon: "foresttrollshadowpriest", perGame: 0.4, inGames: 1 },
      ],
    });
  });

  it("counts '3× Unit' as three and ignores non-train steps", () => {
    const c = buildComposition([[{ instruction: "Train 3× Grunt", icon: "or-grunt" }, { instruction: "Build Barracks", icon: "or-barracks" }, { instruction: "Train Peon", icon: "or-peon" }]]);
    expect(c).toEqual({ games: 1, units: [{ name: "Grunt", icon: "or-grunt", perGame: 3, inGames: 1 }] });
  });

  it("is null with no games", () => {
    expect(buildComposition([])).toBeNull();
  });
});

describe("fetchMatchSteps", () => {
  it("posts the match id to our replay importer and picks the player's steps (real reply)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fullResponse), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const steps = await fetchMatchSteps("https://warcraft-gym.com", "6a11d8dfe406684e942f9465", "D0WI#2726");
    expect(steps?.length).toBeGreaterThan(5);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://warcraft-gym.com/api/replay-import");
    expect(JSON.parse(String(init.body))).toEqual({ match: "6a11d8dfe406684e942f9465", cutoffSeconds: 3600, includeUpgrades: false, includeItems: false });
  });

  it("is null when the player is not in the game, and throws on an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fullResponse), { status: 200 })));
    expect(await fetchMatchSteps("https://warcraft-gym.com", "x", "Nobody#1")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    await expect(fetchMatchSteps("https://warcraft-gym.com", "x", "d0wi#2726")).rejects.toThrow("429");
  });
});
