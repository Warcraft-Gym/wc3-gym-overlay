/**
 * F002 — `UpdateBanner` renders each `useUpdateFlow` state: nothing for
 * `idle`, the available/portable variants, the installing progress bar, and
 * the error state's "Releases" opener link.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { host } from "../../host";
import type { UpdateInfo } from "../../host/bridge";
import { UpdateBanner } from "./UpdateBanner";
import { useUpdateFlow } from "./useUpdateFlow";

const AVAILABLE: UpdateInfo = {
  version: "9.9.9",
  currentVersion: "0.3.2",
  notes: "A".repeat(250),
  portable: false,
};

const PORTABLE_AVAILABLE: UpdateInfo = {
  version: "9.9.9",
  currentVersion: "0.3.2",
  portable: true,
  downloadUrl: "https://github.com/Warcraft-Gym/wc3-gnl-website/releases/latest/download/Warcraft-3-Gym-Overlay-Portable.exe",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UpdateBanner", () => {
  it("renders nothing when idle", () => {
    const { result } = renderHook(() => useUpdateFlow(null));
    render(<UpdateBanner flow={result.current} />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the available state: version, truncated notes, and the three buttons", () => {
    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(AVAILABLE));
    render(<UpdateBanner flow={result.current} />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Version 9.9.9 available");
    expect(status.textContent).toContain("A".repeat(200));
    expect(status.textContent).not.toContain("A".repeat(201));
    screen.getByRole("button", { name: "Update & restart" });
    screen.getByRole("button", { name: "Later" });
    screen.getByRole("button", { name: "Skip this version" });
  });

  it("shows the portable variant: Download + Later, no Update button", () => {
    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(PORTABLE_AVAILABLE));
    render(<UpdateBanner flow={result.current} />);

    screen.getByText(/download the portable build/);
    screen.getByRole("button", { name: "Download" });
    screen.getByRole("button", { name: "Later" });
    expect(screen.queryByRole("button", { name: "Update & restart" })).toBeNull();
  });

  it("Download opens the stable portable URL via host.openExternal", () => {
    const openExternal = vi.spyOn(host, "openExternal").mockResolvedValue(undefined);
    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(PORTABLE_AVAILABLE));
    render(<UpdateBanner flow={result.current} />);

    screen.getByRole("button", { name: "Download" }).click();

    expect(openExternal).toHaveBeenCalledWith(PORTABLE_AVAILABLE.downloadUrl);
  });

  it("shows a progressbar with aria-valuenow while installing", () => {
    vi.spyOn(host, "installUpdate").mockImplementation(async (cb) => {
      cb({ downloaded: 40, contentLength: 100 });
      return new Promise(() => {}); // never resolves — freeze on "installing"
    });

    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(AVAILABLE));
    const { rerender } = render(<UpdateBanner flow={result.current} />);

    act(() => {
      void result.current.install();
    });
    rerender(<UpdateBanner flow={result.current} />);

    const progress = screen.getByRole("progressbar");
    expect(progress.getAttribute("aria-valuenow")).toBe("40");
    screen.getByText("Installing…");
  });

  it("shows the error state with a Releases opener link", async () => {
    const openExternal = vi.spyOn(host, "openExternal").mockResolvedValue(undefined);
    vi.spyOn(host, "installUpdate").mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(AVAILABLE));

    const { rerender } = render(<UpdateBanner flow={result.current} />);
    await act(async () => {
      await result.current.install();
    });
    rerender(<UpdateBanner flow={result.current} />);

    screen.getByText(/Update failed/);
    screen.getByRole("button", { name: "Releases" }).click();
    expect(openExternal).toHaveBeenCalledWith("https://github.com/Warcraft-Gym/wc3-gnl-website/releases");
  });

  it("F002-followup-1: shows an opener-failure message when Releases is rejected by the native opener ACL", async () => {
    vi.spyOn(host, "openExternal").mockRejectedValue(new Error("opener scope rejected the URL"));
    vi.spyOn(host, "installUpdate").mockRejectedValue(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(AVAILABLE));

    const { rerender } = render(<UpdateBanner flow={result.current} />);
    await act(async () => {
      await result.current.install();
    });
    rerender(<UpdateBanner flow={result.current} />);

    await act(async () => {
      screen.getByRole("button", { name: "Releases" }).click();
    });
    rerender(<UpdateBanner flow={result.current} />);

    screen.getByText("Couldn't open the download page");
    expect(warn).toHaveBeenCalled();
  });

  it("F002-followup-1: shows an opener-failure message when Download is rejected by the native opener ACL", async () => {
    vi.spyOn(host, "openExternal").mockRejectedValue(new Error("opener scope rejected the URL"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useUpdateFlow(null));
    act(() => result.current.open(PORTABLE_AVAILABLE));
    const { rerender } = render(<UpdateBanner flow={result.current} />);

    await act(async () => {
      screen.getByRole("button", { name: "Download" }).click();
    });
    rerender(<UpdateBanner flow={result.current} />);

    screen.getByText("Couldn't open the download page");
    expect(warn).toHaveBeenCalled();
  });
});
