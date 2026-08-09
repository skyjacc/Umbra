import { describe, it, expect } from 'vitest';
import { NO_UNDO, armUndo, undoAfter, canUndo, type UndoSlot } from './undo';
import { makeResetSnapshot } from './reset';
import type { Rule } from './rules';

const rules: Rule[] = [{ id: 'r1', patterns: ['youtube.com'], mode: 'curve', gain: 1, enabled: true }];
const snap = () => makeResetSnapshot(rules, null);

describe('the undo slot belongs to one operation', () => {
  it('starts empty', () => {
    expect(canUndo(NO_UNDO)).toBe(false);
  });

  it('is armed by a reset and offers that reset back', () => {
    const slot = armUndo(snap());
    expect(canUndo(slot)).toBe(true);
    expect(slot.armed && slot.snapshot.rules.map((r) => r.id)).toEqual(['r1']);
  });

  it('is spent by using it', () => {
    expect(canUndo(undoAfter(armUndo(snap()), 'undo'))).toBe(false);
  });

  it('is invalidated by any later write to the same state', () => {
    // The whole point. Once the user has saved something else, "put back what the reset
    // overwrote" would be putting back a world that no longer exists — it would silently
    // discard whatever they did in between.
    for (const ev of ['commit', 'rules-write', 'save-for-site'] as const) {
      expect(canUndo(undoAfter(armUndo(snap()), ev)), ev).toBe(false);
    }
  });

  it('is replaced, not stacked, by a second reset', () => {
    // One slot, one operation. A second reset offers the second reset back, and the first is
    // gone rather than queued — the UI has one button and it must not lie about which.
    const first = armUndo(makeResetSnapshot(rules, null));
    const second = armUndo(makeResetSnapshot([], { bands: [], gain: 1 }));
    expect(first.armed && second.armed && second.snapshot.rules.length).toBe(0);
  });

  it('does not expire on its own', () => {
    // It used to outlive the toast that carried it while the button that offered it was gated on
    // a different value, so any later, unrelated notice arrived wearing a live Undo that restored
    // a rules array from minutes earlier. Time is not what makes an undo stale — a later write is.
    let slot: UndoSlot = armUndo(snap());
    for (const ev of ['notice-shown', 'notice-expired', 'tab-switch'] as const) slot = undoAfter(slot, ev);
    expect(canUndo(slot)).toBe(true);
  });

  it('stays empty whatever happens to an empty slot', () => {
    expect(canUndo(undoAfter(NO_UNDO, 'notice-expired'))).toBe(false);
    expect(canUndo(undoAfter(NO_UNDO, 'commit'))).toBe(false);
  });
});
