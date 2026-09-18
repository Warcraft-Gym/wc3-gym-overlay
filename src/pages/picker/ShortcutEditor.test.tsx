/**
 * F001 capture-and-diagnostics: honest registration errors (C-402) and
 * Escape-while-capturing not bubbling out to a parent dialog's own Escape
 * handler (C-401 step 3).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../../components/Modal";
import { DEFAULT_SHORTCUTS } from "../../config";
import type { ShortcutRegistrationResult } from "../../host/bridge";
import { ShortcutEditor } from "./ShortcutEditor";

const applyShortcutsMock = vi.fn<() => Promise<ShortcutRegistrationResult[]>>();

vi.mock("../../shortcuts", () => ({
  applyShortcuts: () => applyShortcutsMock(),
  formatCombo: (combo: string) => combo,
}));

function registered(overrides: Partial<Record<string, ShortcutRegistrationResult>> = {}) {
  return Object.keys(DEFAULT_SHORTCUTS).map(
    (action) => overrides[action] ?? { action, combo: DEFAULT_SHORTCUTS[action as keyof typeof DEFAULT_SHORTCUTS], registered: true },
  ) as ShortcutRegistrationResult[];
}

describe("ShortcutEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    applyShortcutsMock.mockReset();
    applyShortcutsMock.mockResolvedValue(registered());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the real registration error verbatim when present", () => {
    const registrations = registered({
      timer_reset: {
        action: "timer_reset",
        combo: "CommandOrControl+Shift+R",
        registered: false,
        error: "already registered by another application",
      },
    });

    render(
      <ShortcutEditor shortcuts={DEFAULT_SHORTCUTS} registrations={registrations} onRegistrations={() => {}} />,
    );

    expect(screen.getByText("Not registered: already registered by another application")).not.toBeNull();
  });

  it("falls back to the generic text only when error is absent", () => {
    const registrations = registered({
      timer_reset: { action: "timer_reset", combo: "CommandOrControl+Shift+R", registered: false },
    });

    render(
      <ShortcutEditor shortcuts={DEFAULT_SHORTCUTS} registrations={registrations} onRegistrations={() => {}} />,
    );

    expect(screen.getByText("Not registered — another app may own this combo")).not.toBeNull();
  });

  it("shows no Re-register button when every row is registered", () => {
    render(
      <ShortcutEditor shortcuts={DEFAULT_SHORTCUTS} registrations={registered()} onRegistrations={() => {}} />,
    );

    expect(screen.queryByRole("button", { name: "Re-register" })).toBeNull();
  });

  it("Re-register calls applyShortcuts again and refreshes the rows", async () => {
    const failing = registered({
      timer_reset: {
        action: "timer_reset",
        combo: "CommandOrControl+Shift+R",
        registered: false,
        error: "already registered by another application",
      },
    });
    const fixed = registered();
    applyShortcutsMock.mockResolvedValueOnce(fixed);

    let latest = failing;
    render(
      <ShortcutEditor
        shortcuts={DEFAULT_SHORTCUTS}
        registrations={latest}
        onRegistrations={(next) => (latest = next)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Re-register" }));

    await vi.waitFor(() => expect(applyShortcutsMock).toHaveBeenCalledTimes(1));
    expect(latest).toEqual(fixed);
  });

  it("Escape while capturing cancels capture but does not close the parent dialog", () => {
    let closed = false;
    render(
      <Modal label="Settings" onClose={() => (closed = true)}>
        <ShortcutEditor shortcuts={DEFAULT_SHORTCUTS} registrations={registered()} onRegistrations={() => {}} />
      </Modal>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]);
    expect(screen.getByText("Press keys… (Esc to cancel)")).not.toBeNull();

    fireEvent.keyDown(screen.getByRole("button", { name: "Waiting…" }), { key: "Escape" });

    expect(closed).toBe(false);
    expect(screen.getAllByRole("button", { name: "Change" }).length).toBeGreaterThan(0);
  });

  it("shows the refusal reason inline for a plain key without a modifier", () => {
    render(
      <ShortcutEditor shortcuts={DEFAULT_SHORTCUTS} registrations={registered()} onRegistrations={() => {}} />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Waiting…" }), { key: "o" });

    const reason = screen.getByRole("status");
    expect(reason.textContent).toContain("Ctrl");
    expect(reason.textContent).toContain("Alt");
    expect(reason.textContent).toContain("function key");
  });
});
