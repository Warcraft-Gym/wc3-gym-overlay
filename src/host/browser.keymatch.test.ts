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
});
