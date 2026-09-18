import { describe, expect, it } from "vitest";
import { comboFromKeyboardEvent, explainRefusal, isStandaloneKey, isValidCombo, tokenFromCode, unshiftKey } from "./combo";

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

  it("requires at least one of Ctrl/Cmd/Alt for a non-standalone key", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "o", shiftKey: true }))).toBeNull();
    expect(comboFromKeyboardEvent(keydown({ key: "o" }))).toBeNull();
  });

  it("accepts standalone keys with no modifier held, spelled as the plugin parses them", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "F9" }))).toBe("F9");
    expect(comboFromKeyboardEvent(keydown({ key: "F24" }))).toBe("F24");
    expect(comboFromKeyboardEvent(keydown({ key: "Insert" }))).toBe("Insert");
    expect(comboFromKeyboardEvent(keydown({ key: "Home" }))).toBe("Home");
    expect(comboFromKeyboardEvent(keydown({ key: "PageUp" }))).toBe("PageUp");
    expect(comboFromKeyboardEvent(keydown({ key: "PageDown" }))).toBe("PageDown");
    expect(comboFromKeyboardEvent(keydown({ key: "Pause" }))).toBe("Pause");
    expect(comboFromKeyboardEvent(keydown({ key: "ScrollLock" }))).toBe("ScrollLock");
    expect(comboFromKeyboardEvent(keydown({ key: "Delete" }))).toBe("Delete");
    expect(comboFromKeyboardEvent(keydown({ key: "End" }))).toBe("End");
  });

  it("still builds a modifier combo for a standalone key held with Ctrl/Shift", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "F9", ctrlKey: true, shiftKey: true }))).toBe(
      "CommandOrControl+Shift+F9",
    );
  });
});

describe("isStandaloneKey", () => {
  it("accepts F1 through F24", () => {
    expect(isStandaloneKey("F1")).toBe(true);
    expect(isStandaloneKey("F12")).toBe(true);
    expect(isStandaloneKey("F24")).toBe(true);
  });

  it("rejects out-of-range function key numbers and letters", () => {
    expect(isStandaloneKey("F25")).toBe(false);
    expect(isStandaloneKey("F0")).toBe(false);
    expect(isStandaloneKey("o")).toBe(false);
  });

  it("accepts the other standalone keys", () => {
    for (const key of ["Insert", "Delete", "Home", "End", "PageUp", "PageDown", "Pause", "ScrollLock"]) {
      expect(isStandaloneKey(key)).toBe(true);
    }
  });
});

describe("explainRefusal", () => {
  it("explains a plain letter/digit press with no modifier", () => {
    const reason = explainRefusal(keydown({ key: "o" }));
    expect(reason).not.toBeNull();
    expect(reason).toContain("Ctrl");
    expect(reason).toContain("Alt");
    expect(reason).toContain("function key");
  });

  it("is silent for a lone modifier keypress", () => {
    expect(explainRefusal(keydown({ key: "Control", ctrlKey: true }))).toBeNull();
  });

  it("is silent when a required modifier is held", () => {
    expect(explainRefusal(keydown({ key: "o", ctrlKey: true }))).toBeNull();
  });

  it("is silent for an accepted standalone key", () => {
    expect(explainRefusal(keydown({ key: "F9" }))).toBeNull();
    expect(explainRefusal(keydown({ key: "PageUp" }))).toBeNull();
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

  it("accepts a single standalone key with no modifier", () => {
    expect(isValidCombo("F9")).toBe(true);
    expect(isValidCombo("PageUp")).toBe(true);
  });

  it("rejects a single non-standalone key with no modifier", () => {
    expect(isValidCombo("O")).toBe(false);
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
