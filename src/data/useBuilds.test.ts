import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { ApiBuildListItem } from "../api/schema";
import { BUILDS_CACHE, SETTINGS } from "../store/keys";
import { readKey, writeKey } from "../store/state";

const fetchBuildsMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, fetchBuilds: fetchBuildsMock };
});

// Imported after the mock so the hook picks up the mocked client.
const { useBuilds } = await import("./useBuilds");

function fakeBuild(slug: string): ApiBuildListItem {
  return {
    slug,
    title: slug,
    race: "human",
    vsRace: "any",
    difficulty: "beginner",
    tags: [],
    summary: "s",
    author: "a",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    steps: [],
  };
}

describe("useBuilds", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchBuildsMock.mockReset();
  });

  // Vitest isn't configured with `test.globals`, so @testing-library/react's
  // automatic afterEach-cleanup detection never fires. Without this, every
  // `renderHook` in this file stays mounted (subscriptions, timers and all)
  // for the rest of the run, and a later `writeKey` fans out to every
  // leftover instance at once.
  afterEach(() => {
    cleanup();
  });

  it("starts loading, then reports ready and writes the cache on success", async () => {
    fetchBuildsMock.mockResolvedValueOnce([fakeBuild("a")]);
    const { result } = renderHook(() => useBuilds());

    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.builds.map((b) => b.slug)).toEqual(["a"]);
    expect(readKey(BUILDS_CACHE).builds.map((b) => b.slug)).toEqual(["a"]);
    expect(readKey(BUILDS_CACHE).fetchedAt).not.toBe("");
  });

  it("reports empty when the fetch succeeds with zero builds", async () => {
    fetchBuildsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBuilds());

    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(result.current.error).toBeNull();
  });

  it("reports offline and keeps the cache when the fetch fails but cache has builds", async () => {
    await writeKey(BUILDS_CACHE, { fetchedAt: "2026-01-01T00:00:00.000Z", apiBase: "http://x", builds: [fakeBuild("cached")] });
    fetchBuildsMock.mockRejectedValueOnce(new ApiError("network", "boom"));

    const { result } = renderHook(() => useBuilds());

    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(result.current.builds.map((b) => b.slug)).toEqual(["cached"]);
    expect(result.current.error).not.toBeNull();
  });

  it("reports empty when the fetch fails and the cache is empty", async () => {
    fetchBuildsMock.mockRejectedValueOnce(new ApiError("network", "boom"));
    const { result } = renderHook(() => useBuilds());

    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(result.current.error).not.toBeNull();
  });

  it("retry() re-fetches", async () => {
    fetchBuildsMock.mockRejectedValueOnce(new ApiError("network", "boom"));
    const { result } = renderHook(() => useBuilds());
    await waitFor(() => expect(result.current.status).toBe("empty"));

    fetchBuildsMock.mockResolvedValueOnce([fakeBuild("b")]);
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.builds.map((b) => b.slug)).toEqual(["b"]);
  });

  it("re-fetches when settings.apiBase changes", async () => {
    fetchBuildsMock.mockResolvedValueOnce([fakeBuild("first")]);
    const { result } = renderHook(() => useBuilds());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    fetchBuildsMock.mockResolvedValueOnce([fakeBuild("second")]);
    await act(async () => {
      await writeKey(SETTINGS, { ...readKey(SETTINGS), apiBase: "http://other" });
    });

    await waitFor(() => expect(result.current.builds.map((b) => b.slug)).toEqual(["second"]));
    expect(fetchBuildsMock).toHaveBeenLastCalledWith("http://other");
  });
});
