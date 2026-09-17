import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_API_BASE } from "../../config";
import { SETTINGS } from "../../store/keys";
import { readKey } from "../../store/state";
import { applyApiBaseOverride } from "./applyApiBaseOverride";

describe("applyApiBaseOverride", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes a valid ?api= value into SETTINGS.apiBase synchronously", () => {
    applyApiBaseOverride("?api=http://localhost:3111");
    expect(readKey(SETTINGS).apiBase).toBe("http://localhost:3111");
  });

  it("leaves SETTINGS untouched when ?api= is absent", () => {
    applyApiBaseOverride("");
    expect(readKey(SETTINGS).apiBase).toBe(DEFAULT_API_BASE);
  });

  it("ignores an invalid ?api= value and logs a warning", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    applyApiBaseOverride("?api=not-a-url");
    expect(readKey(SETTINGS).apiBase).toBe(DEFAULT_API_BASE);
    expect(console.warn).toHaveBeenCalled();
  });
});
