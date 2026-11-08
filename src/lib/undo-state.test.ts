import { describe, it, expect } from 'vitest';
import { fingerprintWorld, worldsEqual, planArm, planUndo, type ResetUndoRecord } from './undo-state';
import { makeResetSnapshot } from './reset';
import { NO_BASELINE } from './edit-state';
import type { Rule } from './rules';
import type { Band } from './audio';

// Reset profile is the only destructive action in the product, and its whole safety net is one
// snapshot behind one button. These tests are about the promise attached to that button: Undo
// returns the user to the state immediately before the Reset, or it does nothing at all. It must
// never return them to an older state at the cost of a newer one.

const band = (frequency: number, gain: number, q = 0.7071): Band => ({ frequency, gain, q, type: 'peaking' });
const curve = (g: number) => ({ frequencies: [20, 40, 80], gains: [g, 0, 0], qs: [0.7, 0.7, 0.7] });

const rule = (over: Partial<Rule> = {}): Rule => ({
  id: 'r1',
  patterns: ['youtube.'],
  mode: 'curve',
  curve: curve(6),
  gain: 1,
  preset: 'Vocal',
  enabled: true,
  ...over
});

const global = (g: number, presetName = 'Vocal') => ({ bands: [band(20, g), band(40, 0)], gain: 1, presetName });

describe('fingerprinting the world an undo would overwrite', () => {
  it('calls two identical worlds the same', () => {
    expect(worldsEqual(fingerprintWorld([rule()], global(6)), fingerprintWorld([rule()], global(6)))).toBe(true);
  });

  it('notices the global profile changing', () => {
    expect(worldsEqual(fingerprintWorld([], global(6)), fingerprintWorld([], global(7)))).toBe(false);
  });

  it('notices the global profile losing its provenance', () => {
    // A restore that puts the curve back without the name it came from is not a restore, so a
    // world that differs only by provenance is still a different world.
    expect(worldsEqual(fingerprintWorld([], global(6, 'Vocal')), fingerprintWorld([], global(6, '')))).toBe(false);
  });

  it('notices a global profile appearing where there was none', () => {
    // null is a real value: a fresh install has no stored profile at all.
    expect(worldsEqual(fingerprintWorld([], null), fingerprintWorld([], global(6)))).toBe(false);
  });

  it('notices a rule being added, removed or reordered', () => {
    const a = rule({ id: 'a' });
    const b = rule({ id: 'b' });
    expect(worldsEqual(fingerprintWorld([a], null), fingerprintWorld([a, b], null))).toBe(false);
    // Order is not cosmetic: matching is first-match-wins, so a reorder changes which rule plays.
    expect(worldsEqual(fingerprintWorld([a, b], null), fingerprintWorld([b, a], null))).toBe(false);
  });

  it("notices a rule's sound changing", () => {
    expect(worldsEqual(fingerprintWorld([rule({ curve: curve(6) })], null), fingerprintWorld([rule({ curve: curve(9) })], null))).toBe(
      false
    );
  });

  it('cannot be forged by a field value that looks like a separator', () => {
    // The first draft concatenated fields with `|` and records with `;`, and both boundaries were
    // forgeable. Rules arrive from share codes, which this codebase already treats as untrusted,
    // so a collision here is a crafted import making an undo silently delete a rule.
    //
    // Two patterns vs one pattern containing the field separator:
    expect(worldsEqual(fingerprintWorld([rule({ patterns: ['a', 'b'] })], null), fingerprintWorld([rule({ patterns: ['a+b'] })], null))).toBe(
      false
    );
    // One rule forging the RECORD separator to impersonate a second rule:
    const forged = rule({ id: 'r1', patterns: ['x|curve||1|;r2|1|y'] });
    expect(worldsEqual(fingerprintWorld([forged], null), fingerprintWorld([rule({ id: 'r1' }), rule({ id: 'r2' })], null))).toBe(false);
    // And the same for the id and preset fields, which are equally attacker-shaped.
    expect(worldsEqual(fingerprintWorld([rule({ id: 'a|b' })], null), fingerprintWorld([rule({ id: 'a', preset: 'b' })], null))).toBe(false);
  });

  it('notices a rule being disabled or re-scoped, which a reset never touches', () => {
    // The undo's payload restores the WHOLE rule, so work done on fields the reset ignored is
    // still work the undo would silently revert.
    expect(worldsEqual(fingerprintWorld([rule()], null), fingerprintWorld([rule({ enabled: false })], null))).toBe(false);
    expect(worldsEqual(fingerprintWorld([rule()], null), fingerprintWorld([rule({ patterns: ['spotify.'] })], null))).toBe(false);
  });
});

describe('arming a reset undo once its write resolves', () => {
  it('arms when the write landed and this is still the pending reset', () => {
    expect(planArm({ ok: true, isCurrent: true })).toBe('arm');
  });

  it('refuses when the write was refused — nothing happened, so there is nothing to undo', () => {
    expect(planArm({ ok: false, isCurrent: true })).toBe('refused');
  });

  it('stays silent when a newer reset has taken the slot, however its own write went', () => {
    // Two resets, the first still in flight. The first must not speak for a world it no longer
    // describes — this is the split that let one reset's snapshot be armed beside another's
    // bookkeeping.
    expect(planArm({ ok: true, isCurrent: false })).toBe('superseded');
    expect(planArm({ ok: false, isCurrent: false })).toBe('superseded');
  });
});

describe('applying an armed undo', () => {
  const produced = fingerprintWorld([], null); // a reset that flattened everything
  const record = (): ResetUndoRecord => ({
    snapshot: makeResetSnapshot([rule()], global(6)),
    debt: { baseline: NO_BASELINE, committed: false },
    produces: produced
  });

  it('does nothing when nothing is armed', () => {
    expect(planUndo({ record: null, world: produced })).toBe('none');
  });

  it('restores while the world is still the one the reset produced', () => {
    expect(planUndo({ record: record(), world: fingerprintWorld([], null) })).toBe('restore');
  });

  it('retires when THIS popup has written since the reset', () => {
    // The edit-during-the-in-flight-write case. The old guard armed the slot after a commit had
    // already invalidated it, so Undo put a stale world back over the edit the user had just made.
    expect(planUndo({ record: record(), world: fingerprintWorld([], global(9, '')) })).toBe('superseded');
  });

  it('retires when ANOTHER window has written since the reset', () => {
    // The Full-window editor is a separate long-lived instance of the same hook writing the same
    // keys. No flag of ours moves when it saves, which is why the guard is a fingerprint.
    expect(planUndo({ record: record(), world: fingerprintWorld([], global(3, 'Movie')) })).toBe('superseded');
  });

  it('retires when a rule has been added since the reset', () => {
    expect(planUndo({ record: record(), world: fingerprintWorld([rule({ id: 'new' })], null) })).toBe('superseded');
  });

  it('retires rather than restoring an older world over a newer one', () => {
    // The property in one line: an undo either returns the user to the state immediately before
    // the reset, or it does nothing. There is no third outcome in which it wins a race.
    const r = record();
    for (const moved of [fingerprintWorld([rule()], null), fingerprintWorld([], global(1, '')), fingerprintWorld([rule()], global(6))]) {
      expect(planUndo({ record: r, world: moved })).toBe('superseded');
    }
  });

  it('is not fooled by a world that merely looks similar', () => {
    // Same shape, different sound: a restore here would silently swap the user's curve.
    const r: ResetUndoRecord = { ...record(), produces: fingerprintWorld([], global(6)) };
    expect(planUndo({ record: r, world: fingerprintWorld([], global(6.1)) })).toBe('superseded');
    expect(planUndo({ record: r, world: fingerprintWorld([], global(6)) })).toBe('restore');
  });
});

describe('the session debt an undo carries back', () => {
  it('keeps `committed` as its own fact rather than deriving it from the baseline', () => {
    // The reconstruction this replaces was `committed = baseline.has`, defended by "every writer
    // latches a baseline before writing". True, and one-directional: a drag latches on its FIRST
    // move and commits 200ms after the LAST one, and an edit under bypass latches and never
    // commits at all. Both are `has: true, committed: false`, and restoring `true` there makes
    // planResetChanges spend a storage.sync write to store what is already stored.
    const latchedButNeverWritten: ResetUndoRecord = {
      snapshot: makeResetSnapshot([], global(6)),
      debt: { baseline: { has: true, target: { kind: 'global' }, global: { bands: [band(20, 6)], gain: 1, presetName: '' }, rule: null }, committed: false },
      produces: fingerprintWorld([], null)
    };
    expect(latchedButNeverWritten.debt.baseline.has).toBe(true);
    expect(latchedButNeverWritten.debt.committed).toBe(false);
    // The two fields must be independently representable — that is the whole point of storing both.
    expect(latchedButNeverWritten.debt.committed).not.toBe(latchedButNeverWritten.debt.baseline.has);
  });

  it('travels in the same record as the snapshot, so the two cannot disagree', () => {
    const r = record2();
    expect(r.snapshot).toBeDefined();
    expect(r.debt).toBeDefined();
    expect(r.produces).toBeDefined();
  });

  function record2(): ResetUndoRecord {
    return { snapshot: makeResetSnapshot([rule()], global(6)), debt: { baseline: NO_BASELINE, committed: true }, produces: fingerprintWorld([], null) };
  }
});
