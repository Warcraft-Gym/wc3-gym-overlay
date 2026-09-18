/**
 * F004 — the browser fallbacks for `saveTextFile`/`openTextFile`: a Blob
 * download and a hidden `<input type="file">`. `browser.ts` keeps a single
 * persistent input across calls (see its doc comment), which is exactly
 * what lets a Playwright test drive it with `locator('input[type=file]')
 * .setInputFiles(...)` without ever needing to intercept a native dialog —
 * these unit tests exercise that same input programmatically.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserHost } from "./browser";

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("expected a hidden file input in the DOM");
  return input;
}

describe("browser host — saveTextFile", () => {
  it("creates a Blob object URL and clicks a throwaway download link", async () => {
    // jsdom doesn't implement these — stub them onto `URL` before spying.
    if (!URL.createObjectURL) Object.assign(URL, { createObjectURL: () => "" });
    if (!URL.revokeObjectURL) Object.assign(URL, { revokeObjectURL: () => {} });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const host = createBrowserHost();
    const result = await host.saveTextFile("my-build.wc3gym.json", '{"format":"wc3gym-build"}');

    expect(result).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
  });
});

describe("browser host — openTextFile", () => {
  afterEach(() => {
    document.querySelectorAll('input[type="file"]').forEach((el) => el.remove());
  });

  it("appends a hidden file input to the document and reads the selected file's text", async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      // Simulates what a real OS dialog (or Playwright's `setInputFiles`)
      // does: populate `.files` and fire `change`.
      const file = new File(['{"format":"wc3gym-build","version":1,"build":{}}'], "build.json", {
        type: "application/json",
      });
      Object.defineProperty(this, "files", { value: [file], configurable: true });
      this.dispatchEvent(new Event("change"));
    });

    const host = createBrowserHost();
    const resultPromise = host.openTextFile();

    const input = fileInput();
    expect(input.type).toBe("file");
    expect(input.style.display).toBe("none");

    const text = await resultPromise;
    expect(text).toContain("wc3gym-build");

    clickSpy.mockRestore();
  });

  it("resolves null when the dialog is cancelled (no file selected)", async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, "files", { value: [], configurable: true });
      this.dispatchEvent(new Event("change"));
    });

    const host = createBrowserHost();
    const text = await host.openTextFile();

    expect(text).toBeNull();
    clickSpy.mockRestore();
  });
});
