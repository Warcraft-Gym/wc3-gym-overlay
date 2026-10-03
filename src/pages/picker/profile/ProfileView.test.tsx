import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILE, SETTINGS } from "../../../store/keys";
import { readKey, writeKey } from "../../../store/state";
import { D0WI, realProfile } from "../../../w3c/testProfile";
import { PickerTabs } from "../PickerTabs";
import { ProfileTab } from "./ProfileTab";
import { profileSubtitle, ProfileView } from "./ProfileView";
import { sparklinePoints } from "./Sparkline";

vi.mock("../../../profileLoader", () => ({ refreshProfile: vi.fn(async () => undefined) }));

const API = "https://warcraft-gym.com";
beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("ProfileView on d0wi's real profile", () => {
  it("header: name, subtitle, record and the MMR line", () => {
    render(<ProfileView profile={realProfile()} apiBase={API} />);
    expect(screen.getByText("d0wi")).toBeTruthy();
    expect(profileSubtitle(realProfile())).toBe("1830 MMR · #84 · FR · 19 seasons");
    expect(screen.getByRole("img", { name: "MMR from 1747 to 1830, peak 1904" })).toBeTruthy();
  });

  it("strengths and weaknesses as labelled lists", () => {
    render(<ProfileView profile={realProfile()} apiBase={API} />);
    const strengths = within(screen.getByRole("list", { name: "Strengths" })).getAllByRole("listitem");
    const weak = within(screen.getByRole("list", { name: "Work on" })).getAllByRole("listitem");
    expect(strengths[0].getAttribute("aria-label")).toBe("Strong vs Human: 13–7 (65%)");
    expect(weak[0].getAttribute("aria-label")).toBe("Weak on Hammerfall: 36% here vs 52% overall");
    expect(strengths).toHaveLength(5);
    expect(weak).toHaveLength(4);
  });

  it("matchups, maps, form, length and heroes", () => {
    render(<ProfileView profile={realProfile()} apiBase={API} />);
    const matchups = within(screen.getByRole("region", { name: "Matchups" }));
    expect(matchups.getByText("18–24")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Maps · 5+ games" })).getByText("Turtle Rock")).toBeTruthy();
    expect(screen.getByLabelText("Recent form, newest first: W L W W W L L W L L")).toBeTruthy();
    expect(screen.getByText("8 games in 24 h")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "By game length" })).getByText("19–9")).toBeTruthy();
    expect(screen.getByText("Demon Hunter")).toBeTruthy();
  });
});

describe("ProfileTab states", () => {
  it("asks for a BattleTag, with a way to Settings", () => {
    const open = vi.fn();
    render(<ProfileTab onOpenSettings={open} />);
    fireEvent.click(screen.getByRole("button", { name: /Open Settings/ }));
    expect(open).toHaveBeenCalled();
  });

  it("shows loading, then the error with a retry", async () => {
    await writeKey(SETTINGS, { ...readKey(SETTINGS), myBattleTag: D0WI });
    await writeKey(PROFILE, { version: 2, status: "loading", tag: D0WI, race: null, profile: null, error: null, fetchedAt: null });
    const { unmount } = render(<ProfileTab onOpenSettings={() => {}} />);
    expect(screen.getByText(`Loading ${D0WI}'s W3Champions games…`)).toBeTruthy();
    unmount();
    await writeKey(PROFILE, { version: 2, status: "error", tag: D0WI, race: null, profile: null, error: "Couldn't load your W3Champions profile: 503", fetchedAt: null });
    render(<ProfileTab onOpenSettings={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain("503");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("keeps showing the profile while it refreshes", async () => {
    await writeKey(SETTINGS, { ...readKey(SETTINGS), myBattleTag: D0WI });
    await writeKey(PROFILE, { version: 2, status: "loading", tag: D0WI, race: null, profile: realProfile(), error: null, fetchedAt: "2026-10-03T11:58:00Z" });
    render(<ProfileTab onOpenSettings={() => {}} />);
    expect(screen.getByText("d0wi")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Refresh profile" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("PickerTabs", () => {
  it("marks the active tab and moves with the arrow keys", () => {
    const change = vi.fn();
    render(<PickerTabs active="builds" onChange={change} />);
    expect(screen.getByRole("tab", { name: "Builds" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(change).toHaveBeenCalledWith("profile");
  });
});

describe("sparklinePoints", () => {
  it("needs two points and spans the box", () => {
    expect(sparklinePoints([1800])).toBe("");
    expect(sparklinePoints([1700, 1800], 100, 20)).toBe("3.0,17.0 97.0,3.0");
  });
});

describe("RacePicker", () => {
  it("one radio per race, Random included, with game counts; unplayed races are disabled", () => {
    const onRace = vi.fn();
    render(<ProfileView profile={realProfile()} apiBase={API} onRace={onRace} />);
    const radios = within(screen.getByRole("radiogroup", { name: "Show my profile as" })).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Human, 0 games",
      "Orc, 0 games",
      "Night Elf, 109 games",
      "Undead, 0 games",
      "Random, 0 games",
    ]);
    expect(radios[2].getAttribute("aria-checked")).toBe("true");
    expect((radios[4] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(radios[2]);
    expect(onRace).toHaveBeenCalledWith("nightelf");
  });
});
