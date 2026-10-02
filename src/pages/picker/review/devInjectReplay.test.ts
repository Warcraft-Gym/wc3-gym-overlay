/**
 * F010a – follow-up of F010 (review-ui): `installDevInjectReplay`'s
 * "already injected" guard (see that module's doc comment). The module is
 * re-imported fresh (`vi.resetModules()`) before every test so each test
 * gets its own `alreadyInjected` latch, matching a real page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const injectLastReplayForTestMock = vi.hoisted(() => vi.fn());

vi.mock("../../../host/browser", () => ({
  injectLastReplayForTest: injectLastReplayForTestMock,
}));

async function freshInstallDevInjectReplay(): Promise<() => void> {
  vi.resetModules();
  const mod = await import("./devInjectReplay");
  return mod.installDevInjectReplay;
}

describe("installDevInjectReplay", () => {
  beforeEach(() => {
    injectLastReplayForTestMock.mockClear();
  });

  afterEach(() => {
    history.replaceState(null, "", location.pathname);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing when ?injectReplay= is absent", async () => {
    history.replaceState(null, "", location.pathname);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const installDevInjectReplay = await freshInstallDevInjectReplay();
    installDevInjectReplay();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(injectLastReplayForTestMock).not.toHaveBeenCalled();
  });

  it("fetches the url and injects exactly once for a single call", async () => {
    history.replaceState(null, "", "?injectReplay=http://localhost:5173/fixture.w3g");
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(bytes.buffer) });
    vi.stubGlobal("fetch", fetchMock);

    const installDevInjectReplay = await freshInstallDevInjectReplay();
    installDevInjectReplay();
    await vi.waitFor(() => expect(injectLastReplayForTestMock).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5173/fixture.w3g");
  });

  // F010a: the bug this guards against – `ReviewLauncher`'s
  // `useEffect(() => installDevInjectReplay(), [])` runs twice under
  // `<StrictMode>` (mount → cleanup → remount), which used to fire the
  // `fetch`/inject twice for one `?injectReplay=` page load. The pipeline's
  // own "newest replay wins" in-flight tracking then aborted the first
  // import and kept only the second – a visible aborted POST immediately
  // followed by a successful one.
  it("a second call for the same page load (StrictMode's double-invoke) fetches and injects only once", async () => {
    history.replaceState(null, "", "?injectReplay=http://localhost:5173/fixture.w3g");
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(bytes.buffer) });
    vi.stubGlobal("fetch", fetchMock);

    const installDevInjectReplay = await freshInstallDevInjectReplay();
    installDevInjectReplay();
    installDevInjectReplay();
    await vi.waitFor(() => expect(injectLastReplayForTestMock).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(injectLastReplayForTestMock).toHaveBeenCalledTimes(1);
  });
});
