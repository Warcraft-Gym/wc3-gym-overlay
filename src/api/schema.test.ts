import { describe, expect, it, vi } from "vitest";
import { buildsListResponseSchema, gameIconEntrySchema, iconsResponseSchema, parseIconsResponse } from "./schema";
import liveFixture from "./__fixtures__/builds.live.json";
import iconsProductionFixture from "./__fixtures__/icons.production.json";

const fixtureListResponse = {
  builds: [
    {
      slug: "human-fast-expand",
      title: "Human Fast Expand",
      race: "human",
      vsRaces: ["orc"],
      difficulty: "beginner",
      tags: ["fast-expand"],
      summary: "A safe fast expand into the mid game.",
      author: "coach",
      featured: true,
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      steps: [
        { time: "0:00", supply: 5, instruction: "Train peasant" },
        { instruction: "Scout when able" },
      ],
    },
  ],
};

describe("apiBuildListItemSchema (via buildsListResponseSchema)", () => {
  it("accepts a fixture list response", () => {
    const result = buildsListResponseSchema.safeParse(fixtureListResponse);
    expect(result.success).toBe(true);
  });

  it("rejects a build without a slug", () => {
    const broken = {
      builds: [
        {
          ...fixtureListResponse.builds[0],
          slug: undefined,
        },
      ],
    };
    const result = buildsListResponseSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("accepts null for patch/authorDiscord/maintainer/sourceUrl (the live API's shape for an unset optional field)", () => {
    const withNulls = {
      builds: [
        {
          ...fixtureListResponse.builds[0],
          patch: null,
          authorDiscord: null,
          maintainer: null,
          sourceUrl: null,
        },
      ],
    };
    const result = buildsListResponseSchema.safeParse(withNulls);
    expect(result.success).toBe(true);
  });

  it("defaults vsRaces to [] when the key is absent", () => {
    const withoutVsRaces: Record<string, unknown> = { ...fixtureListResponse.builds[0] };
    delete withoutVsRaces.vsRaces;
    const result = buildsListResponseSchema.safeParse({ builds: [withoutVsRaces] });
    expect(result.success).toBe(true);
    expect(result.success && result.data.builds[0].vsRaces).toEqual([]);
  });

  it("accepts a build listing several opponent races", () => {
    const result = buildsListResponseSchema.safeParse({
      builds: [{ ...fixtureListResponse.builds[0], vsRaces: ["orc", "undead"] }],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.builds[0].vsRaces).toEqual(["orc", "undead"]);
  });

  it("tolerates a legacy vsRace key alongside/instead of vsRaces (F005, site migration)", () => {
    const rest: Record<string, unknown> = { ...fixtureListResponse.builds[0] };
    delete rest.vsRaces;
    const legacy = { ...rest, vsRace: "orc" };
    const result = buildsListResponseSchema.safeParse({ builds: [legacy] });
    expect(result.success).toBe(true);
    // Unknown keys are stripped, not merged — `vsRaces` falls back to its
    // default. Cache migration (store/keys.ts) is what actually recovers
    // the opponent from a legacy `vsRace`.
    expect(result.success && result.data.builds[0].vsRaces).toEqual([]);
    expect(result.success && "vsRace" in result.data.builds[0]).toBe(false);
  });

  it("parses the live fixture captured from /api/builds, with every item having an array vsRaces", () => {
    const result = buildsListResponseSchema.safeParse(liveFixture);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.builds.length).toBeGreaterThan(0);
    for (const item of result.data.builds) {
      expect(Array.isArray(item.vsRaces)).toBe(true);
    }
    expect(result.data.builds.some((b) => b.vsRaces.length === 0)).toBe(true);
    expect(result.data.builds.some((b) => b.vsRaces.length >= 2)).toBe(true);
  });
});

/**
 * F004d: `/tmp/f004d/icons.production.json` → committed here as
 * `__fixtures__/icons.production.json`. Captured live from
 * `GET https://warcraft-gym.com/api/icons` on 2026-09-30: 832 entries,
 * `{ icons: [{ key, title, race, kind, url }] }`, kinds
 * `{ unit: 49, hero: 25, building: 74, misc: 457, upgrade: 77, ability: 150 }`,
 * races `{ human: 101, orc: 89, nightelf: 82, undead: 68, neutral: 492 }`.
 *
 * Before this fix, `iconsResponseSchema.safeParse` against this exact
 * fixture on `main` (commit 03a1c36f) failed with 150 issues, one per
 * `kind: "ability"` entry, each:
 * `"Invalid option: expected one of \"hero\"|\"unit\"|\"building\"|\"upgrade\"|\"misc\""`
 * at `icons.<index>.kind` — one unrecognised enum value invalidated the
 * *entire* 832-entry response (`result.success === false`, zero icons
 * usable), which is the defect this feature fixes.
 */
describe("gameIconEntrySchema / iconsResponseSchema (F004d: kind: \"ability\")", () => {
  it("iconKindSchema now includes ability, so the strict schema accepts the live fixture wholesale", () => {
    // This is the same strict `.safeParse` call that failed with 150
    // issues on `main` before `iconKindSchema` gained "ability" — it now
    // passes because the schema, not the fixture, changed.
    const result = iconsResponseSchema.safeParse(iconsProductionFixture);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.icons).toHaveLength(832);
    const abilityIcons = result.data.icons.filter((icon) => icon.kind === "ability");
    expect(abilityIcons).toHaveLength(150);
    expect(abilityIcons.some((icon) => icon.key === "avatar")).toBe(true);
  });

  it("every field of every fixture entry matches its schema type (key/title/race/kind/url)", () => {
    for (const icon of (iconsProductionFixture as { icons: unknown[] }).icons) {
      const result = gameIconEntrySchema.safeParse(icon);
      expect(result.success).toBe(true);
    }
  });

  it("the fixture's actual race values are exactly the ones iconRaceSchema accepts", () => {
    const races = new Set((iconsProductionFixture as { icons: { race: string }[] }).icons.map((i) => i.race));
    expect([...races].sort()).toEqual(["human", "neutral", "nightelf", "orc", "undead"]);
  });
});

/**
 * F004d tolerance decision: an entry whose `kind`/`race` this build doesn't
 * recognise is *kept*, with `kind` falling back to `"misc"` and `race` to
 * `"neutral"`, rather than being dropped or failing the whole response —
 * every other entry in the response is unaffected either way, and the
 * caller (`fetchIcons`) is told which unrecognised values were seen so it
 * can log a single warning instead of failing the whole catalogue again
 * the next time the site adds a kind/race this build predates.
 */
describe("parseIconsResponse (F004d: tolerate an unknown kind/race)", () => {
  const validEntry = {
    key: "hu-peasant",
    title: "Peasant",
    race: "human",
    kind: "unit",
    url: "https://warcraft-gym.com/wc3-icons/hu-peasant.webp",
  };

  it("parses the live fixture with zero unknown kinds/races now that ability is known", () => {
    const result = parseIconsResponse(iconsProductionFixture);
    expect(result.icons).toHaveLength(832);
    expect(result.unknownKinds).toEqual([]);
    expect(result.unknownRaces).toEqual([]);
  });

  it("maps a kind this build doesn't know about to \"misc\" instead of dropping the response", () => {
    const result = parseIconsResponse({
      icons: [validEntry, { ...validEntry, key: "future-spell", kind: "consumable" }],
    });
    expect(result.icons).toHaveLength(2);
    expect(result.icons[0].kind).toBe("unit");
    expect(result.icons[1].kind).toBe("misc");
    expect(result.unknownKinds).toEqual(["consumable"]);
  });

  it("maps a race this build doesn't know about to \"neutral\" instead of dropping the response", () => {
    const result = parseIconsResponse({
      icons: [validEntry, { ...validEntry, key: "goblin-unit", race: "goblin" }],
    });
    expect(result.icons).toHaveLength(2);
    expect(result.icons[1].race).toBe("neutral");
    expect(result.unknownRaces).toEqual(["goblin"]);
  });

  it("reports each distinct unknown kind once even when many entries share it", () => {
    const result = parseIconsResponse({
      icons: [
        { ...validEntry, key: "a", kind: "consumable" },
        { ...validEntry, key: "b", kind: "consumable" },
        { ...validEntry, key: "c", kind: "consumable" },
      ],
    });
    expect(result.unknownKinds).toEqual(["consumable"]);
  });

  it("still throws for a response that isn't shaped like an icon manifest at all", () => {
    expect(() => parseIconsResponse({ icons: [{ key: "x" }] })).toThrow();
  });
});

describe("fetchIcons tolerance (F004d, via client.ts)", () => {
  it("does not crash and warns once when the live API's fetch client sees an unknown kind", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchIcons } = await import("./client");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        icons: [
          {
            key: "hu-peasant",
            title: "Peasant",
            race: "human",
            kind: "unit",
            url: "https://warcraft-gym.com/wc3-icons/hu-peasant.webp",
          },
          {
            key: "future-spell",
            title: "Future Spell",
            race: "human",
            kind: "consumable",
            url: "https://warcraft-gym.com/wc3-icons/future-spell.webp",
          },
        ],
      }),
    } as unknown as Response);

    const icons = await fetchIcons("https://warcraft-gym.com");

    expect(icons).toHaveLength(2);
    expect(icons.find((i) => i.key === "future-spell")?.kind).toBe("misc");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0].join(" ")).toContain("consumable");

    globalThis.fetch = originalFetch;
    warnSpy.mockRestore();
  });
});
