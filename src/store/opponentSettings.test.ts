import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "../config";
import { settingsSchema } from "./keys";

const rest = {
  timer_play_pause: "CommandOrControl+Shift+P",
  timer_reset: "CommandOrControl+Shift+R",
  step_next: "CommandOrControl+Shift+]",
  step_prev: "CommandOrControl+Shift+[",
};
const saved = (shortcuts: Record<string, string>) => ({
  apiBase: "https://warcraft-gym.com",
  opacity: 0.9,
  scale: 1,
  shortcuts: { ...rest, ...shortcuts },
  autoUpdate: true,
  skippedVersion: null,
});

describe("settings saved by older versions still load", () => {
  it("fills in the opponent card fields", () => {
    const parsed = settingsSchema.parse(saved({ toggle_overlay: "F9" }));
    expect(parsed.myBattleTag).toBeNull();
    expect(parsed.opponentCard).toBe(true);
    expect(parsed.opponentAutoOpen).toBe(true);
    expect(parsed.opponentBounds).toBeUndefined();
  });

  it("an untouched 0.5.1 default moves the build order to B and gives the opponent O", () => {
    const { shortcuts } = settingsSchema.parse(saved({ toggle_overlay: "CommandOrControl+Shift+O" }));
    expect(shortcuts.toggle_overlay).toBe("CommandOrControl+Shift+B");
    expect(shortcuts.toggle_opponent).toBe("CommandOrControl+Shift+O");
    expect(DEFAULT_SHORTCUTS.toggle_overlay).toBe("CommandOrControl+Shift+B");
    expect(DEFAULT_SHORTCUTS.toggle_opponent).toBe("CommandOrControl+Shift+O");
  });

  it("the local beta's O + M defaults become B + O", () => {
    const { shortcuts } = settingsSchema.parse(
      saved({ toggle_overlay: "CommandOrControl+Shift+O", toggle_opponent: "CommandOrControl+Shift+M" }),
    );
    expect(shortcuts.toggle_overlay).toBe("CommandOrControl+Shift+B");
    expect(shortcuts.toggle_opponent).toBe("CommandOrControl+Shift+O");
  });

  it("keeps combos the user chose", () => {
    const { shortcuts } = settingsSchema.parse(saved({ toggle_overlay: "F9", toggle_opponent: "F10" }));
    expect(shortcuts.toggle_overlay).toBe("F9");
    expect(shortcuts.toggle_opponent).toBe("F10");
  });

  it("never creates a clash: if O is taken, the opponent keeps its old combo", () => {
    const { shortcuts } = settingsSchema.parse(saved({ toggle_overlay: "F9", step_next: "CommandOrControl+Shift+O" }));
    expect(shortcuts.step_next).toBe("CommandOrControl+Shift+O");
    expect(shortcuts.toggle_opponent).toBe("CommandOrControl+Shift+M");
  });
});
