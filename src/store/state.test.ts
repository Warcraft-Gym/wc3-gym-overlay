import { beforeEach, describe, expect, it, vi } from "vitest";
import { readKey } from "./state";
import { SELECTED_BUILD_SLUG, TIMER } from "./keys";

describe("readKey", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns the default when the key is absent", () => {
    expect(readKey(SELECTED_BUILD_SLUG)).toBe(SELECTED_BUILD_SLUG.defaultValue());
  });

  it("falls back to the default on unparsable JSON, logging a warning", () => {
    localStorage.setItem(TIMER.name, "{not json");
    expect(readKey(TIMER)).toEqual(TIMER.defaultValue());
    expect(console.warn).toHaveBeenCalled();
  });

  it("falls back to the default when the shape fails schema validation", () => {
    localStorage.setItem(TIMER.name, JSON.stringify({ startedAtMs: "nope" }));
    expect(readKey(TIMER)).toEqual(TIMER.defaultValue());
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns valid stored values unchanged", () => {
    const value = { startedAtMs: 123, baseElapsedMs: 456 };
    localStorage.setItem(TIMER.name, JSON.stringify(value));
    expect(readKey(TIMER)).toEqual(value);
  });
});
