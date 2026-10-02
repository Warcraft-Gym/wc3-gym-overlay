import { describe, expect, it } from "vitest";

import { isValidOverlayVersion } from "./check-config.mjs";

describe("isValidOverlayVersion", () => {
  it("accepts a plain stable version", () => {
    expect(isValidOverlayVersion("0.5.1")).toBe(true);
  });

  it("accepts a beta prerelease version", () => {
    expect(isValidOverlayVersion("0.6.0-beta.1")).toBe(true);
  });

  it("accepts an rc prerelease version", () => {
    expect(isValidOverlayVersion("0.6.0-rc.2")).toBe(true);
  });

  it("accepts a single-word prerelease identifier", () => {
    expect(isValidOverlayVersion("1.0.0-alpha")).toBe(true);
  });

  it("rejects a missing patch component", () => {
    expect(isValidOverlayVersion("0.6")).toBe(false);
  });

  it("rejects a leading v", () => {
    expect(isValidOverlayVersion("v0.6.0")).toBe(false);
  });

  it("rejects an empty prerelease identifier", () => {
    expect(isValidOverlayVersion("0.6.0-")).toBe(false);
  });

  it("rejects a dangling dot in the prerelease", () => {
    expect(isValidOverlayVersion("0.6.0-beta..1")).toBe(false);
  });

  it("rejects build-metadata suffixes", () => {
    expect(isValidOverlayVersion("0.6.0+build.5")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidOverlayVersion(undefined)).toBe(false);
    expect(isValidOverlayVersion(null)).toBe(false);
    expect(isValidOverlayVersion(0.61)).toBe(false);
  });
});
