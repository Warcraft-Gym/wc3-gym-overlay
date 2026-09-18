import { beforeEach, describe, expect, it, vi } from "vitest";
import { readKey } from "./state";
import { BUILDS_CACHE, SELECTED_BUILD_SLUG, SETTINGS, TIMER } from "./keys";
import { DEFAULT_API_BASE, DEFAULT_SHORTCUTS, LEGACY_API_BASES } from "../config";

describe("readKey", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns the default when the key is absent", () => {
    expect(readKey(SELECTED_BUILD_SLUG)).toBe(SELECTED_BUILD_SLUG.defaultValue());
  });

  it("falls back to the default on unparsable JSON, logging a warning", () => {
    localStorage.setItem(TIMER.name, "{not json");
    expect(readKey(TIMER)).toEqual(TIMER.defaultValue());
    expect(console.warn).toHaveBeenCalled();
  });

  it("falls back to the default when the shape fails schema validation", () => {
    localStorage.setItem(TIMER.name, JSON.stringify({ startedAtMs: "nope" }));
    expect(readKey(TIMER)).toEqual(TIMER.defaultValue());
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns valid stored values unchanged", () => {
    const value = { startedAtMs: 123, baseElapsedMs: 456, engaged: true };
    localStorage.setItem(TIMER.name, JSON.stringify(value));
    expect(readKey(TIMER)).toEqual(value);
  });

  it("defaults the `engaged` field to false for values persisted before it existed", () => {
    localStorage.setItem(TIMER.name, JSON.stringify({ startedAtMs: 123, baseElapsedMs: 456 }));
    expect(readKey(TIMER)).toEqual({ startedAtMs: 123, baseElapsedMs: 456, engaged: false });
  });
});

/** F005: builds cached before the site's `vsRaces` model shipped carry a
 *  single `vsRace` field and no `vsRaces` array — the cache schema must
 *  migrate both an "any" and a concrete legacy `vsRace` on read. */
describe("readKey — BUILDS_CACHE vsRaces migration", () => {
  const base = {
    slug: "slug",
    title: "Title",
    race: "human",
    difficulty: "beginner",
    tags: [],
    summary: "Summary",
    author: "Author",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    steps: [],
  };

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("migrates a legacy vsRace: 'any' item to an empty vsRaces array", () => {
    localStorage.setItem(
      BUILDS_CACHE.name,
      JSON.stringify({
        fetchedAt: "2026-01-01T00:00:00.000Z",
        apiBase: "https://wc3-gnl-website.vercel.app",
        builds: [{ ...base, vsRace: "any" }],
      }),
    );
    expect(readKey(BUILDS_CACHE).builds).toEqual([{ ...base, vsRaces: [] }]);
  });

  it("migrates a legacy concrete vsRace item to a single-element vsRaces array", () => {
    localStorage.setItem(
      BUILDS_CACHE.name,
      JSON.stringify({
        fetchedAt: "2026-01-01T00:00:00.000Z",
        apiBase: "https://wc3-gnl-website.vercel.app",
        builds: [{ ...base, vsRace: "orc" }],
      }),
    );
    expect(readKey(BUILDS_CACHE).builds).toEqual([{ ...base, vsRaces: ["orc"] }]);
  });

  it("parses a current-shape cached item (vsRaces array) unchanged", () => {
    localStorage.setItem(
      BUILDS_CACHE.name,
      JSON.stringify({
        fetchedAt: "2026-01-01T00:00:00.000Z",
        apiBase: "https://wc3-gnl-website.vercel.app",
        builds: [{ ...base, vsRaces: ["nightelf", "undead"] }],
      }),
    );
    expect(readKey(BUILDS_CACHE).builds).toEqual([{ ...base, vsRaces: ["nightelf", "undead"] }]);
  });
});

/** F004: a fresh install's SETTINGS default must point at the live site, and
 *  settings persisted while a dead legacy host (`config.ts`'s
 *  `LEGACY_API_BASES`) was the default must migrate to it on read —
 *  without touching a user's real custom `apiBase`. */
describe("readKey — SETTINGS apiBase migration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("defaults a fresh install's apiBase to the live site", () => {
    expect(SETTINGS.defaultValue().apiBase).toBe(DEFAULT_API_BASE);
  });

  it("migrates a stored settings value with the old default apiBase to the new one", () => {
    localStorage.setItem(
      SETTINGS.name,
      JSON.stringify({
        apiBase: LEGACY_API_BASES[0],
        opacity: 0.8,
        scale: 1.2,
        shortcuts: { ...DEFAULT_SHORTCUTS },
      }),
    );
    expect(readKey(SETTINGS).apiBase).toBe(DEFAULT_API_BASE);
  });

  it("leaves a custom apiBase untouched", () => {
    localStorage.setItem(
      SETTINGS.name,
      JSON.stringify({
        apiBase: "http://localhost:3111",
        opacity: 1,
        scale: 1,
        shortcuts: { ...DEFAULT_SHORTCUTS },
      }),
    );
    expect(readKey(SETTINGS).apiBase).toBe("http://localhost:3111");
  });
});
