import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReplay } from "./parseReplay";
import { describeId, ID_MAP, NO_ICON_IDS } from "./idMap";
import { FOOD_COST } from "./foodCost";

const FIXTURES_DIR = join(__dirname, "__fixtures__");
const FIXTURES = [
  "ced_vs_lyn.w3g",
  "phoenix_vs_changer_concealed_hill.w3g",
  "fortitude_vs_focus_northern_isles.w3g",
];
const TEN_MINUTES_MS = 10 * 60 * 1000;

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}

const iconKeys: { key: string }[] = JSON.parse(readFileSync(join(FIXTURES_DIR, "icon-keys.json"), "utf-8"));
const manifestKeys = new Set(iconKeys.map((entry) => entry.key));

async function collectEarlyIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const fixture of FIXTURES) {
    const summary = await parseReplay(loadFixture(fixture));
    for (const player of summary.players) {
      for (const event of summary.events[player.id] ?? []) {
        if (event.ms <= TEN_MINUTES_MS) ids.add(event.id);
      }
    }
  }
  return ids;
}

describe("idMap", () => {
  // Parses all three fixtures with w3gjs — comfortably under a second alone,
  // but can push past the default 5s timeout when the whole suite runs
  // concurrently (see extractBuild.test.ts/parseReplay.test.ts, which parse
  // fixtures too). A generous explicit timeout avoids that flake.
  it(
    "describes every id the three fixtures emit within the first 10 minutes",
    async () => {
      const ids = await collectEarlyIds();
      expect(ids.size).toBeGreaterThan(0);

      for (const id of ids) {
        const described = describeId(id);
        expect(described.title, `describeId(${id}) should have a real title`).not.toBe(id);

        const needsIcon = described.kind === "unit" || described.kind === "building" || described.kind === "hero";
        if (needsIcon && !NO_ICON_IDS.has(id)) {
          expect(described.iconKey, `describeId(${id}) (${described.kind}) should have a manifest icon key`).toBeDefined();
          expect(
            manifestKeys.has(described.iconKey as string),
            `${described.iconKey} should be a real manifest key`,
          ).toBe(true);
        }
      }
    },
    20_000,
  );

  it("gives unknown ids a title equal to the id and never throws", () => {
    const described = describeId("zzzz");
    expect(described.title).toBe("zzzz");
    expect(described.iconKey).toBeUndefined();
  });

  it("maps 'stwp' to the town portal scroll icon", () => {
    expect(describeId("stwp")).toMatchObject({ iconKey: "nt-scroll-of-town-portal", kind: "item" });
  });

  it("maps upgrade ids ('R...') to the nt-upgrade icon with a real name", () => {
    const described = describeId("Roen");
    expect(described.kind).toBe("upgrade");
    expect(described.iconKey).toBe("nt-upgrade");
    expect(described.title).toBe("Ensnare");
  });
});

describe("FOOD_COST", () => {
  it("has exactly the unit+hero key set of ID_MAP", () => {
    const expectedKeys = Object.entries(ID_MAP)
      .filter(([, entry]) => entry.kind === "unit" || entry.kind === "hero")
      .map(([id]) => id)
      .sort();
    expect(Object.keys(FOOD_COST).sort()).toEqual(expectedKeys);
  });

  it("never has negative costs", () => {
    for (const cost of Object.values(FOOD_COST)) {
      expect(cost).toBeGreaterThanOrEqual(0);
    }
  });
});
