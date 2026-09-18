/**
 * C-504 item 6: the icon picker groups by race and filters by title search.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameIconEntry } from "../../../api/schema";
import { IconPicker } from "./IconPicker";

const ICONS: GameIconEntry[] = [
  { key: "or-peon", title: "Peon", race: "orc", kind: "unit", url: "https://x/or-peon.webp" },
  { key: "or-burrow", title: "Burrow", race: "orc", kind: "building", url: "https://x/or-burrow.webp" },
  { key: "hu-peasant", title: "Peasant", race: "human", kind: "unit", url: "https://x/hu-peasant.webp" },
];

describe("IconPicker", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("opens as a dialog listing every icon, grouped by race heading", () => {
    render(<IconPicker icons={ICONS} onPick={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Pick an icon" });
    expect(within(dialog).getByText("Orc")).toBeTruthy();
    expect(within(dialog).getByText("Human")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Peon" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Peasant" })).toBeTruthy();
  });

  it("filters icons by title search", () => {
    render(<IconPicker icons={ICONS} onPick={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), { target: { value: "peon" } });

    expect(screen.getByRole("button", { name: "Peon" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Burrow" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Peasant" })).toBeNull();
    expect(screen.queryByText("Human")).toBeNull();
  });

  it("calls onPick with the icon key when an icon is clicked", () => {
    const onPick = vi.fn();
    render(<IconPicker icons={ICONS} onPick={onPick} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Peon" }));
    expect(onPick).toHaveBeenCalledWith("or-peon");
  });

  it("shows a no-match message when the search matches nothing", () => {
    render(<IconPicker icons={ICONS} onPick={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), { target: { value: "zzz" } });
    expect(screen.getByText(/No icons match/)).toBeTruthy();
  });
});
