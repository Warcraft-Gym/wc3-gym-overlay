import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW = new Date("2026-09-17T12:00:00.000Z").getTime();

describe("relativeTime", () => {
  it("formats a couple of minutes in the past", () => {
    const iso = new Date(NOW - 2 * 60 * 1000).toISOString();
    expect(relativeTime(iso, NOW)).toBe("2 minutes ago");
  });

  it("formats seconds in the past as 'just now'", () => {
    const iso = new Date(NOW - 5 * 1000).toISOString();
    expect(relativeTime(iso, NOW)).toBe("just now");
  });

  it("formats hours in the past", () => {
    const iso = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso, NOW)).toBe("3 hours ago");
  });

  it("formats days in the past", () => {
    const iso = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso, NOW)).toBe("2 days ago");
  });

  it("returns a placeholder for an unparsable date", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("unknown time");
  });
});
