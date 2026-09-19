/**
 * F002 — the browser fallback for `openBinaryFile`: a hidden
 * `<input type="file">`, same pattern as `openTextFile` (see
 * `browser.exportImport.test.ts`) but resolving raw bytes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserHost } from "./browser";

function binaryFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"][accept=".w3g"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("expected the replay-import hidden file input");
  return input;
}

describe("browser host — openBinaryFile", () => {
  afterEach(() => {
    document.querySelectorAll('input[type="file"]').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  it("appends a hidden file input scoped to the filter's extensions and resolves the file's bytes", async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      const bytes = new Uint8Array([0x57, 0x33, 0x47]);
      const file = new File([bytes], "fortitude_vs_focus.w3g", { type: "application/octet-stream" });
      // jsdom has no `DataTransfer` — set the read-only `files` property
      // directly, matching how `browser.exportImport.test.ts` drives the
      // sibling `openTextFile` input.
      Object.defineProperty(this, "files", { value: [file], configurable: true });
      this.dispatchEvent(new Event("change"));
    });

    const host = createBrowserHost();
    const result = await host.openBinaryFile([{ name: "Warcraft III replay", extensions: ["w3g"] }]);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(binaryFileInput().accept).toBe(".w3g");
    expect(result?.name).toBe("fortitude_vs_focus.w3g");
    expect(result?.bytes).toEqual(new Uint8Array([0x57, 0x33, 0x47]));
  });

  it("resolves null when no file is chosen (cancel)", async () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, "files", { value: [], configurable: true });
      this.dispatchEvent(new Event("change"));
    });

    const host = createBrowserHost();
    const result = await host.openBinaryFile([{ name: "Warcraft III replay", extensions: ["w3g"] }]);

    expect(result).toBeNull();
  });
});
