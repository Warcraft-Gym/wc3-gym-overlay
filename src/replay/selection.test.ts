import { describe, expect, it } from "vitest";
import {
  applyAssignGroupHotkey,
  applyChangeSelection,
  applySelectGroupHotkey,
  createSelectionState,
  netTagKey,
  snapshot,
} from "./selection";

const K1 = [100, 200] as const;
const K2 = [101, 201] as const;
const K3 = [102, 202] as const;

describe("selection", () => {
  it("netTagKey is a stable a:b string", () => {
    expect(netTagKey(K1)).toBe("100:200");
  });

  it("selectMode 1 adds units to the current selection", () => {
    const state = createSelectionState();
    applyChangeSelection(state, 1, [K1]);
    expect(snapshot(state)).toEqual([netTagKey(K1)]);
  });

  it("selectMode 2 removes units from the current selection", () => {
    const state = createSelectionState();
    applyChangeSelection(state, 1, [K1, K2]);
    applyChangeSelection(state, 2, [K1]);
    expect(snapshot(state)).toEqual([netTagKey(K2)]);
  });

  it("a plain click (remove-then-add pair) replaces the selection", () => {
    const state = createSelectionState();
    applyChangeSelection(state, 1, [K1]);
    applyChangeSelection(state, 2, [K1]);
    applyChangeSelection(state, 1, [K2]);
    expect(snapshot(state)).toEqual([netTagKey(K2)]);
  });

  it("assigning a control group does not change the current selection", () => {
    const state = createSelectionState();
    applyChangeSelection(state, 1, [K1]);
    applyAssignGroupHotkey(state, 3, [K1]);
    expect(snapshot(state)).toEqual([netTagKey(K1)]);
  });

  it("selecting a control group replaces the current selection with its members", () => {
    const state = createSelectionState();
    applyChangeSelection(state, 1, [K1]);
    applyAssignGroupHotkey(state, 3, [K1]);
    applyChangeSelection(state, 2, [K1]);
    applyChangeSelection(state, 1, [K2]);
    expect(snapshot(state)).toEqual([netTagKey(K2)]);

    applySelectGroupHotkey(state, 3);
    expect(snapshot(state)).toEqual([netTagKey(K1)]);
  });

  it("selecting an unassigned group clears the current selection", () => {
    const state = createSelectionState();
    applyChangeSelection(state, 1, [K1]);
    applySelectGroupHotkey(state, 9);
    expect(snapshot(state)).toEqual([]);
  });

  it("preserves first-selected-first order for multi-object selections", () => {
    const state = createSelectionState();
    applyChangeSelection(state, 1, [K2, K1, K3]);
    expect(snapshot(state)).toEqual([netTagKey(K2), netTagKey(K1), netTagKey(K3)]);
  });
});
