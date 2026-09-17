import { describe, expect, it } from "vitest";
import { comboFromKeyboardEvent, isValidCombo } from "./combo";

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("comboFromKeyboardEvent", () => {
  it("builds a CommandOrControl+Shift+<KEY> string", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "o", ctrlKey: true, shiftKey: true }))).toBe(
      "CommandOrControl+Shift+O",
    );
  });

  it("builds an Alt combo", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "p", altKey: true }))).toBe("Alt+P");
  });

  it("treats metaKey the same as ctrlKey", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "r", metaKey: true }))).toBe("CommandOrControl+R");
  });

  it("keeps non-letter keys as-is (uppercased where relevant)", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "[", ctrlKey: true, shiftKey: true }))).toBe(
      "CommandOrControl+Shift+[",
    );
  });

  it("ignores a lone modifier keypress", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "Control", ctrlKey: true }))).toBeNull();
    expect(comboFromKeyboardEvent(keydown({ key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("requires at least one of Ctrl/Cmd/Alt", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "o", shiftKey: true }))).toBeNull();
    expect(comboFromKeyboardEvent(keydown({ key: "o" }))).toBeNull();
  });
});

describe("isValidCombo", () => {
  it("accepts combos with a required modifier and a key", () => {
    expect(isValidCombo("CommandOrControl+Shift+O")).toBe(true);
    expect(isValidCombo("Alt+P")).toBe(true);
  });

  it("rejects combos missing a required modifier", () => {
    expect(isValidCombo("Shift+O")).toBe(false);
    expect(isValidCombo("O")).toBe(false);
  });

  it("rejects an empty or malformed string", () => {
    expect(isValidCombo("")).toBe(false);
    expect(isValidCombo("CommandOrControl+Shift+Shift")).toBe(false);
  });
});
