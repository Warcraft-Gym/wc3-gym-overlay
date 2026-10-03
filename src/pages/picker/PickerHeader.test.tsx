import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildsToolbar } from "./BuildsToolbar";
import { PickerHeader } from "./PickerHeader";

afterEach(() => cleanup());

describe("PickerHeader", () => {
  it("holds the three section tabs and the opponent toggle, nothing else", () => {
    const onTab = vi.fn();
    const onToggleOpponent = vi.fn();
    render(<PickerHeader tab="builds" onTab={onTab} opponentShortcut="CommandOrControl+Shift+O" onToggleOpponent={onToggleOpponent} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Builds", "Profile", "Settings"]);
    expect(screen.getAllByRole("button").filter((b) => b.getAttribute("role") !== "tab")).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(onTab).toHaveBeenCalledWith("settings");
    const opponent = screen.getByRole("button", { name: "Opponent" });
    expect(opponent.getAttribute("title")).toMatch(/opponent window \(.+O\)/);
    fireEvent.click(opponent);
    expect(onToggleOpponent).toHaveBeenCalledTimes(1);
  });

  it("wraps from the last tab to the first with the arrow keys", () => {
    const onTab = vi.fn();
    render(<PickerHeader tab="settings" onTab={onTab} opponentShortcut="CommandOrControl+Shift+O" onToggleOpponent={() => {}} />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(onTab).toHaveBeenCalledWith("builds");
  });
});

describe("BuildsToolbar", () => {
  it("every action keeps its full accessible name, an icon and its handler", () => {
    const h = { onNewBuild: vi.fn(), onImportReplay: vi.fn(), onImportFromW3Champions: vi.fn() };
    render(<BuildsToolbar {...h} />);
    for (const name of ["New private build", "Import replay", "From W3Champions"]) {
      const button = screen.getByRole("button", { name });
      expect(button.querySelector("svg")).not.toBeNull();
      fireEvent.click(button);
    }
    for (const fn of Object.values(h)) expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("PickerHeader without the scouting features", () => {
  it("shows only the given tabs and no Opponent button", () => {
    render(<PickerHeader tab="builds" onTab={() => {}} sections={["builds", "settings"]} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Builds", "Settings"]);
    expect(screen.queryByRole("button", { name: "Opponent" })).toBeNull();
  });
});
