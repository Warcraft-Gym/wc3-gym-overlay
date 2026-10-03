import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PickerHeader } from "./PickerHeader";

afterEach(() => cleanup());

function renderHeader(settingsOpen = false) {
  const handlers = {
    onNewBuild: vi.fn(),
    onImportReplay: vi.fn(),
    onImportFromW3Champions: vi.fn(),
    onToggleOpponent: vi.fn(),
    onToggleSettings: vi.fn(),
  };
  render(<PickerHeader opponentShortcut="CommandOrControl+Shift+O" settingsOpen={settingsOpen} {...handlers} />);
  return handlers;
}

describe("PickerHeader", () => {
  it("every action keeps its full accessible name and an icon", () => {
    renderHeader();
    for (const name of ["New private build", "Import replay", "From W3Champions", "Opponent", "Settings"]) {
      const button = screen.getByRole("button", { name });
      expect(button.querySelector("svg")).not.toBeNull();
    }
  });

  it("each button calls its handler", () => {
    const h = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "New private build" }));
    fireEvent.click(screen.getByRole("button", { name: "Import replay" }));
    fireEvent.click(screen.getByRole("button", { name: "From W3Champions" }));
    fireEvent.click(screen.getByRole("button", { name: "Opponent" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    for (const fn of Object.values(h)) expect(fn).toHaveBeenCalledTimes(1);
  });

  it("settings reports its open state; the opponent tooltip shows the shortcut", () => {
    renderHeader(true);
    expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Opponent" }).getAttribute("title")).toMatch(/opponent window \(.+O\)/);
  });
});
