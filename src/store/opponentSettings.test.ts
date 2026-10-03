import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "../config";
import { settingsSchema } from "./keys";

describe("settings saved by 0.5.1 still load", () => {
  it("fills in the opponent card fields and the new shortcut", () => {
    const old = {
      apiBase: "https://warcraft-gym.com",
      opacity: 0.9,
      scale: 1,
      shortcuts: {
        toggle_overlay: "F9",
        timer_play_pause: "CommandOrControl+Shift+P",
        timer_reset: "CommandOrControl+Shift+R",
        step_next: "CommandOrControl+Shift+]",
        step_prev: "CommandOrControl+Shift+[",
      },
      autoUpdate: true,
      skippedVersion: null,
    };
    const parsed = settingsSchema.parse(old);
    expect(parsed.shortcuts.toggle_overlay).toBe("F9");
    expect(parsed.shortcuts.toggle_opponent).toBe(DEFAULT_SHORTCUTS.toggle_opponent);
    expect(parsed.myBattleTag).toBeNull();
    expect(parsed.opponentCard).toBe(true);
    expect(parsed.opponentAutoOpen).toBe(true);
    expect(parsed.opponentBounds).toBeUndefined();
  });
});
