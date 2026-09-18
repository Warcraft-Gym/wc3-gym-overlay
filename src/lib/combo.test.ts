import { describe, expect, it } from "vitest";
import { comboFromKeyboardEvent, isValidCombo, tokenFromCode, unshiftKey } from "./combo";

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

  it("emits the un-shifted token for a Shift-modified punctuation key (real US keyboard)", () => {
    // Ctrl+Shift+] on a real US keyboard reports event.key === "}", not "]".
    expect(comboFromKeyboardEvent(keydown({ key: "}", ctrlKey: true, shiftKey: true }))).toBe(
      "CommandOrControl+Shift+]",
    );
    expect(comboFromKeyboardEvent(keydown({ key: "{", ctrlKey: true, shiftKey: true }))).toBe(
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

describe("unshiftKey", () => {
  it("maps shifted US-keyboard punctuation back to its unshifted key", () => {
    expect(unshiftKey("}")).toBe("]");
    expect(unshiftKey("{")).toBe("[");
    expect(unshiftKey(":")).toBe(";");
    expect(unshiftKey('"')).toBe("'");
    expect(unshiftKey("<")).toBe(",");
    expect(unshiftKey(">")).toBe(".");
    expect(unshiftKey("?")).toBe("/");
    expect(unshiftKey("|")).toBe("\\");
    expect(unshiftKey("_")).toBe("-");
    expect(unshiftKey("+")).toBe("=");
    expect(unshiftKey("~")).toBe("`");
  });

  it("passes through keys with no shifted pair", () => {
    expect(unshiftKey("]")).toBe("]");
    expect(unshiftKey("o")).toBe("o");
  });
});

describe("tokenFromCode", () => {
  it("maps punctuation codes to their token", () => {
    expect(tokenFromCode("BracketRight")).toBe("]");
    expect(tokenFromCode("BracketLeft")).toBe("[");
  });

  it("maps letter and digit codes", () => {
    expect(tokenFromCode("KeyO")).toBe("O");
    expect(tokenFromCode("Digit5")).toBe("5");
  });

  it("returns null for codes with no single-character token", () => {
    expect(tokenFromCode("ArrowUp")).toBeNull();
    expect(tokenFromCode("ShiftLeft")).toBeNull();
  });
});
