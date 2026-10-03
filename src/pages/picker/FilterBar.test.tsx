import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countLabel, FilterBar, hasActiveFilters, type Filters } from "./FilterBar";

afterEach(() => cleanup());

function renderBar(filters: Filters = {}, matchCount = 41, totalCount = 41) {
  const onChange = vi.fn();
  render(<FilterBar apiBase="https://warcraft-gym.com" filters={filters} onChange={onChange} matchCount={matchCount} totalCount={totalCount} />);
  return onChange;
}

describe("FilterBar helpers", () => {
  it("counts", () => {
    expect(countLabel(41, 41, false)).toBe("41 builds");
    expect(countLabel(1, 41, false)).toBe("1 build");
    expect(countLabel(12, 41, true)).toBe("12 of 41");
    expect(countLabel(41, 41, true)).toBe("41 builds");
  });

  it("active filters", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ sort: "title" })).toBe(false);
    expect(hasActiveFilters({ source: "all" })).toBe(false);
    expect(hasActiveFilters({ race: "orc" })).toBe(true);
    expect(hasActiveFilters({ q: "rush" })).toBe(true);
  });
});

describe("FilterBar", () => {
  it("has compact race toggles with 'Any' as text, pressed state per side", () => {
    renderBar({ race: "orc" });
    expect(screen.getByRole("button", { name: "Your race: Orc" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Your race: Any" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Against: Any" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("Any")).toHaveLength(2);
  });

  it("picking a race sets it; picking it again clears it", () => {
    const onChange = renderBar({ race: "orc" });
    fireEvent.click(screen.getByRole("button", { name: "Against: Undead" }));
    expect(onChange).toHaveBeenLastCalledWith({ race: "orc", vsRace: "undead" });
    fireEvent.click(screen.getByRole("button", { name: "Your race: Orc" }));
    expect(onChange).toHaveBeenLastCalledWith({ race: undefined });
  });

  it("shows '12 of 41' and a Clear that keeps the sort", () => {
    const onChange = renderBar({ race: "orc", q: "rush", sort: "title" }, 12, 41);
    expect(screen.getByText("12 of 41")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith({ sort: "title" });
  });

  it("no Clear without filters", () => {
    renderBar();
    expect(screen.getByText("41 builds")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});
