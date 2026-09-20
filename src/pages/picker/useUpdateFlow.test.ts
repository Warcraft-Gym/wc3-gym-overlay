/**
 * F002 — `useUpdateFlow`'s state machine: idle → available → installing
 * (with progress) → relaunching, plus "Later" (hides, stays idle) and
 * "Skip this version" (persists `skippedVersion`, stays idle). Spies on
 * `host` directly, same pattern as `SettingsModal.exportImport.test.tsx`.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { host } from "../../host";
import type { UpdateInfo } from "../../host/bridge";
import { SETTINGS } from "../../store/keys";
import { readKey } from "../../store/state";
import { useUpdateFlow } from "./useUpdateFlow";

const AVAILABLE: UpdateInfo = {
  version: "9.9.9",
  currentVersion: "0.3.2",
  notes: "Mock release notes",
  portable: false,
};

describe("useUpdateFlow", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts idle and moves to available after a successful checkAuto()", async () => {
    vi.spyOn(host, "checkForUpdate").mockResolvedValue(AVAILABLE);
    const { result } = renderHook(() => useUpdateFlow(null));

    expect(result.current.state).toEqual({ kind: "idle" });

    await act(async () => {
      await result.current.checkAuto();
    });

    expect(result.current.state).toEqual({ kind: "available", info: AVAILABLE });
  });

  it("checkAuto() stays idle when there is no update", async () => {
    vi.spyOn(host, "checkForUpdate").mockResolvedValue(null);
    const { result } = renderHook(() => useUpdateFlow(null));

    await act(async () => {
      await result.current.checkAuto();
    });

    expect(result.current.state).toEqual({ kind: "idle" });
  });

  it("checkAuto() stays idle and warns, never throwing, when the check fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(host, "checkForUpdate").mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useUpdateFlow(null));

    await act(async () => {
      await result.current.checkAuto();
    });

    expect(result.current.state).toEqual({ kind: "idle" });
    expect(warn).toHaveBeenCalledWith("[wc3gym] update check failed", expect.any(Error));
  });

  it("checkAuto() is silent when the found version matches skippedVersion", async () => {
    vi.spyOn(host, "checkForUpdate").mockResolvedValue(AVAILABLE);
    const { result } = renderHook(() => useUpdateFlow("9.9.9"));

    await act(async () => {
      await result.current.checkAuto();
    });

    expect(result.current.state).toEqual({ kind: "idle" });
  });

  it("checkAuto() shows the banner when the found version differs from skippedVersion", async () => {
    vi.spyOn(host, "checkForUpdate").mockResolvedValue(AVAILABLE);
    const { result } = renderHook(() => useUpdateFlow("9.9.8"));

    await act(async () => {
      await result.current.checkAuto();
    });

    expect(result.current.state).toEqual({ kind: "available", info: AVAILABLE });
  });

  it("open() shows the banner regardless of skippedVersion", () => {
    const { result } = renderHook(() => useUpdateFlow("9.9.9"));

    act(() => {
      result.current.open(AVAILABLE);
    });

    expect(result.current.state).toEqual({ kind: "available", info: AVAILABLE });
  });

  it("later() hides the banner (back to idle) without persisting anything", async () => {
    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(AVAILABLE));

    act(() => result.current.later());

    expect(result.current.state).toEqual({ kind: "idle" });
    expect(readKey(SETTINGS).skippedVersion).toBeNull();
  });

  it("skip() persists skippedVersion and hides the banner", async () => {
    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(AVAILABLE));

    act(() => result.current.skip());

    expect(result.current.state).toEqual({ kind: "idle" });
    await waitFor(() => expect(readKey(SETTINGS).skippedVersion).toBe("9.9.9"));
  });

  it("install() goes available → installing(progress) → relaunching, then calls host.relaunch()", async () => {
    let onProgress: ((p: { downloaded: number; contentLength: number | null }) => void) | null = null;
    vi.spyOn(host, "installUpdate").mockImplementation(async (cb) => {
      onProgress = cb;
      cb({ downloaded: 50, contentLength: 100 });
    });
    const relaunch = vi.spyOn(host, "relaunch").mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(AVAILABLE));

    let installPromise!: Promise<void>;
    act(() => {
      installPromise = result.current.install();
    });

    expect(result.current.state.kind).toBe("installing");
    await act(async () => {
      await installPromise;
    });

    expect(onProgress).not.toBeNull();
    expect(result.current.state).toEqual({ kind: "relaunching", info: AVAILABLE });
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it("install() moves to the error state when installUpdate() rejects", async () => {
    vi.spyOn(host, "installUpdate").mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(AVAILABLE));

    await act(async () => {
      await result.current.install();
    });

    expect(result.current.state).toEqual({
      kind: "error",
      info: AVAILABLE,
      message: "Update failed — try again or download from the releases page",
    });
  });
});
