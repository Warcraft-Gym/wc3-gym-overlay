/**
 * F001 (Esc/Cancel-button cancels): a pure, per-player model of the WC3
 * client's unit selection and control groups, built from the same
 * `gamedatablock` action stream `parseReplay.ts` already walks for
 * hero-training detection. Verified against real replay byte streams
 * (`w3c_6a87c0c1f214d632276e68be_shallow_grave.w3g`, ms 0-340_000):
 *
 *  - `0x16` `ChangeSelectionAction { selectMode, units }`: every plain click
 *    the client makes is a `selectMode: 2` (remove) of the previous
 *    selection immediately followed by a `selectMode: 1` (add) of the new
 *    one, in the same command block — so plain sequential set add/remove is
 *    enough, no "replace" mode exists in practice.
 *  - `0x17` `AssignGroupHotkeyAction { groupNumber, units }`: records which
 *    objects a control-group number refers to. Does **not** itself change
 *    the current selection.
 *  - `0x18` `SelectGroupHotkeyAction { groupNumber }`: pressing a control
 *    group's number key **replaces** the current selection with whatever
 *    was last assigned to that group (confirmed: selecting group N after a
 *    plain click always drops the click's object from `current`).
 *  - `0x19`/`0x1a`/`0x1b` (subgroup change / pre-subselection / select unit)
 *    never change the underlying set — WC3 emits them alongside `0x18` for
 *    UI bookkeeping (which unit type's command card to show), not to alter
 *    who is selected.
 */

export type NetTag = readonly [number, number];

/** `"a:b"` — a `NetTag`'s stable map/set key. */
export type ObjectKey = string;

export function netTagKey(tag: NetTag): ObjectKey {
  return `${tag[0]}:${tag[1]}`;
}

export interface SelectionState {
  /** The objects currently selected, in the order they most recently
   *  entered the selection — order matters for the "first selected object"
   *  binding rule (see `parseReplay.ts`). */
  current: ObjectKey[];
  groups: Map<number, ObjectKey[]>;
}

export function createSelectionState(): SelectionState {
  return { current: [], groups: new Map() };
}

/** `selectMode`: `1` adds the given units to the current selection, `2`
 *  removes them. Any other value is ignored (never observed in practice —
 *  see the module docblock). */
export function applyChangeSelection(state: SelectionState, selectMode: number, units: readonly NetTag[]): void {
  const keys = units.map(netTagKey);
  if (selectMode === 1) {
    for (const key of keys) {
      if (!state.current.includes(key)) state.current.push(key);
    }
  } else if (selectMode === 2) {
    state.current = state.current.filter((key) => !keys.includes(key));
  }
}

/** Records (overwriting) which objects control-group `groupNumber` refers
 *  to. Does not change `current`. */
export function applyAssignGroupHotkey(state: SelectionState, groupNumber: number, units: readonly NetTag[]): void {
  state.groups.set(groupNumber, units.map(netTagKey));
}

/** Pressing a control-group hotkey replaces the current selection outright
 *  with that group's last-assigned members (or clears it, if the group was
 *  never assigned). */
export function applySelectGroupHotkey(state: SelectionState, groupNumber: number): void {
  state.current = [...(state.groups.get(groupNumber) ?? [])];
}

/** The current selection, first-selected-first — see `parseReplay.ts`'s
 *  "first selected object" order-attribution rule. */
export function snapshot(state: SelectionState): ObjectKey[] {
  return [...state.current];
}
