/**
 * Regression coverage for the shifted-key matching bug found by the
 * F004-followup-1 user-testing validator: on a real US keyboard, holding
 * Shift while pressing `]` reports `event.key === "}"`, not `"]"`, so the
 * old `event.key`-only matcher never fired `Ctrl+Shift+]`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserHost } from "./browser";
import type { ShortcutAction, ShortcutMap } from "./bridge";
import { DEFAULT_SHORTCUTS } from "../config";

function stubPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

function keydown(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent("keydown", init));
}

function shortcutMap(overrides: Partial<ShortcutMap>): ShortcutMap {
  return { ...DEFAULT_SHORTCUTS, ...overrides };
}

describe("browser host shortcut matching", () => {
  let onAction: (action: ShortcutAction) => void;
  let calls: ShortcutAction[];

  beforeEach(() => {
    calls = [];
    onAction = (action) => calls.push(action);
  });

  afterEach(async () => {
    await createBrowserHost().unregisterAllShortcuts();
    vi.restoreAllMocks();
  });

  it("matches Ctrl+Shift+] from the shifted '}' key a real US keyboard reports (non-mac)", async () => {
    stubPlatform("Win32");
    const host = createBrowserHost();
    await host.registerShortcuts(shortcutMap({ step_next: "CommandOrControl+Shift+]" }), onAction);

    keydown({ key: "}", code: "BracketRight", ctrlKey: true, shiftKey: true });

    expect(calls).toEqual(["step_next"]);
  });

  it("still matches the literal ']' key", async () => {
    stubPlatform("Win32");
    const host = createBrowserHost();
    await host.registerShortcuts(shortcutMap({ step_next: "CommandOrControl+Shift+]" }), onAction);

    keydown({ key: "]", code: "BracketRight", ctrlKey: true, shiftKey: true });

    expect(calls).toEqual(["step_next"]);
  });

  it("matches the meta-key variant on mac", async () => {
    stubPlatform("MacIntel");
    const host = createBrowserHost();
    await host.registerShortcuts(shortcutMap({ step_next: "CommandOrControl+Shift+]" }), onAction);

    keydown({ key: "}", code: "BracketRight", metaKey: true, shiftKey: true });

    expect(calls).toEqual(["step_next"]);
  });

  it("matches a letter combo via event.code", async () => {
    stubPlatform("Win32");
    const host = createBrowserHost();
    await host.registerShortcuts(shortcutMap({ toggle_overlay: "CommandOrControl+Shift+O" }), onAction);

    keydown({ key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });

    expect(calls).toEqual(["toggle_overlay"]);
  });

  it("does not fire when a required modifier is missing", async () => {
    stubPlatform("Win32");
    const host = createBrowserHost();
    await host.registerShortcuts(shortcutMap({ step_next: "CommandOrControl+Shift+]" }), onAction);

    keydown({ key: "}", code: "BracketRight", shiftKey: true });

    expect(calls).toEqual([]);
  });

  it("fires a standalone F9 shortcut with no modifier held", async () => {
    stubPlatform("Win32");
    const host = createBrowserHost();
    await host.registerShortcuts(shortcutMap({ toggle_overlay: "F9" }), onAction);

    keydown({ key: "F9", code: "F9" });

    expect(calls).toEqual(["toggle_overlay"]);
  });

  it("fires a standalone PageUp shortcut", async () => {
    stubPlatform("Win32");
    const host = createBrowserHost();
    await host.registerShortcuts(shortcutMap({ step_prev: "PageUp" }), onAction);

    keydown({ key: "PageUp", code: "PageUp" });

    expect(calls).toEqual(["step_prev"]);
  });

  it("does not fire a standalone F9 shortcut when Ctrl is held", async () => {
    stubPlatform("Win32");
    const host = createBrowserHost();
    await host.registerShortcuts(shortcutMap({ toggle_overlay: "F9" }), onAction);

    keydown({ key: "F9", code: "F9", ctrlKey: true });

    expect(calls).toEqual([]);
  });
});

describe("browser host registerShortcuts failShortcut test hook", () => {
  afterEach(async () => {
    await createBrowserHost().unregisterAllShortcuts();
    window.history.pushState({}, "", "/");
  });

  it("reports the named action as a failed registration with the simulated error", async () => {
    window.history.pushState({}, "", "?failShortcut=timer_reset");
    const host = createBrowserHost();

    const results = await host.registerShortcuts(DEFAULT_SHORTCUTS, () => {});

    const timerReset = results.find((r) => r.action === "timer_reset");
    const others = results.filter((r) => r.action !== "timer_reset");
    expect(timerReset).toEqual({
      action: "timer_reset",
      combo: DEFAULT_SHORTCUTS.timer_reset,
      registered: false,
      error: "already registered by another application",
    });
    expect(others.every((r) => r.registered === true)).toBe(true);
  });

  it("is a no-op when the query param is absent", async () => {
    const host = createBrowserHost();
    const results = await host.registerShortcuts(DEFAULT_SHORTCUTS, () => {});
    expect(results.every((r) => r.registered === true)).toBe(true);
  });
});
