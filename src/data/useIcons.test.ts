import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { GameIconEntry } from "../api/schema";
import type { AnyBuild } from "./useAllBuilds";
import { ICONS_CACHE } from "../store/keys";
import { readKey } from "../store/state";

const fetchIconsMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, fetchIcons: fetchIconsMock };
});

const { useIcons, deriveFallbackIcons } = await import("./useIcons");

function fakeIcon(key: string): GameIconEntry {
  return { key, title: key, race: "orc", kind: "unit", url: `https://x/${key}.webp` };
}

describe("useIcons", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchIconsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("starts loading, then reports ready and writes the cache on success", async () => {
    fetchIconsMock.mockResolvedValueOnce([fakeIcon("or-peon")]);
    const { result } = renderHook(() => useIcons("https://site.test"));

    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.icons.map((i) => i.key)).toEqual(["or-peon"]);
    expect(readKey(ICONS_CACHE).icons.map((i) => i.key)).toEqual(["or-peon"]);
  });

  it("falls back to icons derived from cached builds' steps when the fetch fails and there is no cache", async () => {
    fetchIconsMock.mockRejectedValueOnce(new ApiError("network", "offline"));
    const build: AnyBuild = {
      slug: "local-1",
      title: "My opener",
      race: "orc",
      vsRaces: [],
      difficulty: "beginner",
      tags: [],
      summary: "s",
      author: "a",
      steps: [{ instruction: "Peon to gold", icon: "or-peon" }],
      description: undefined,
      source: "local",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const { result } = renderHook(() => useIcons("https://site.test", [build]));

    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(result.current.icons.map((i) => i.key)).toEqual(["or-peon"]);
  });

  it("deriveFallbackIcons dedupes by key and skips steps with no icon", () => {
    const builds: AnyBuild[] = [
      {
        slug: "local-1",
        title: "A",
        race: "orc",
        vsRaces: [],
        difficulty: "beginner",
        tags: [],
        summary: "s",
        author: "a",
        steps: [{ instruction: "x", icon: "or-peon" }, { instruction: "y" }],
        source: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        slug: "local-2",
        title: "B",
        race: "human",
        vsRaces: [],
        difficulty: "beginner",
        tags: [],
        summary: "s",
        author: "a",
        steps: [{ instruction: "z", icon: "or-peon" }],
        source: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(deriveFallbackIcons(builds, "https://site.test").map((i) => i.key)).toEqual(["or-peon"]);
  });
});
