import { describe, it, expect } from 'vitest';
import { canResetChanges, planResetChanges } from './reset-changes';
import type { Baseline } from './edit-state';
import type { Rule } from './rules';
import type { Band } from './audio';
import { flatBands } from './engine-io';

const curve = (gain: number): Band[] => flatBands().map((b) => ({ ...b, gain }));
const A = curve(2); // what the sound was when this popup opened

const rule = (id: string, over: Partial<Rule> = {}): Rule => ({
  id,
  patterns: [id + '.com'],
  mode: 'curve',
  curve: { frequencies: [20], gains: [9], qs: [0.7] },
  gain: 1,
  preset: '',
  enabled: true,
  ...over
});

const globalBaseline: Baseline = { has: true, target: { kind: 'global' }, global: { bands: A, gain: 1 }, rule: null };
const RULE_A = rule('r1', { curve: { frequencies: [20], gains: [2], qs: [0.7] }, gain: 1, preset: 'Vocal', enabled: false });
const ruleBaseline: Baseline = { has: true, target: { kind: 'rule', id: 'r1' }, global: { bands: A, gain: 1 }, rule: RULE_A };

describe('when the button is there at all', () => {
  it('is absent before the session has changed anything', () => {
    expect(canResetChanges({ baselineHas: false, dirty: false, committed: false })).toBe(false);
  });

  it('appears the moment an edit starts, before it is saved', () => {
    // The old attempt keyed on the ~200ms debounce and so blinked out on mouse-up. This is the
    // whole reason the control was unusable.
    expect(canResetChanges({ baselineHas: true, dirty: true, committed: false })).toBe(true);
  });

  it('STAYS once the edit auto-saves', () => {
    expect(canResetChanges({ baselineHas: true, dirty: false, committed: true })).toBe(true);
  });

  it('goes away after a reset, and comes back on the next edit', () => {
    expect(canResetChanges({ baselineHas: true, dirty: false, committed: false })).toBe(false);
    expect(canResetChanges({ baselineHas: true, dirty: true, committed: false })).toBe(true);
  });
});

describe('what it puts back', () => {
  it('does nothing without a baseline', () => {
    expect(planResetChanges({ baseline: { has: false, target: null, global: null, rule: null }, rules: [], committed: true }).action).toBe(
      'none'
    );
  });

  it('restores the global profile the session displaced', () => {
    const plan = planResetChanges({ baseline: globalBaseline, rules: [], committed: true });
    if (plan.action !== 'restore') throw new Error('unreachable');
    expect(plan.global).toEqual({ to: { bands: A, gain: 1 } });
    expect(plan.rules).toBeNull(); // a global edit is no reason to rewrite the rules array
  });

  it('clears the profile when the session created it', () => {
    // Fresh install: there was no stored profile until this edit made one. Putting things back
    // means removing it, not writing a flat one that never existed.
    const plan = planResetChanges({ baseline: { ...globalBaseline, global: null }, rules: [], committed: true });
    if (plan.action !== 'restore') throw new Error('unreachable');
    expect(plan.global).toEqual({ to: null });
  });

  it('restores only the edited rule, and only its sound', () => {
    const others = [rule('other'), rule('r1', { curve: { frequencies: [20], gains: [9], qs: [0.7] }, preset: '', enabled: false })];
    const plan = planResetChanges({ baseline: ruleBaseline, rules: others, committed: true });
    if (plan.action !== 'restore') throw new Error('unreachable');

    expect(plan.global).toBeNull(); // a rule edit never touched the global profile
    expect(plan.rules!.map((r) => r.id)).toEqual(['other', 'r1']);
    expect(plan.rules![0]).toEqual(others[0]); // other rules untouched

    const back = plan.rules!.find((r) => r.id === 'r1')!;
    expect(back.curve!.gains[0]).toBe(2); // the sound came back
    expect(back.preset).toBe('Vocal');
    expect(back.gain).toBe(1);
    // Identity and reach are not the sound, and were never part of this edit.
    expect(back.patterns).toEqual(others[1].patterns);
    expect(back.enabled).toBe(others[1].enabled);
  });

  it('does not resurrect a rule that has since been deleted', () => {
    // Restoring an edit is not a reason to bring back something the user removed on purpose. With
    // the rule gone there is nothing to write, so the plan asks for no rules write at all rather
    // than rewriting the array to look the same.
    const plan = planResetChanges({ baseline: ruleBaseline, rules: [rule('other')], committed: true });
    if (plan.action !== 'restore') throw new Error('unreachable');
    expect(plan.rules).toBeNull();
    expect(JSON.stringify(plan)).not.toContain('r1');
  });

  it('restores the buffer but writes nothing when no save has landed yet', () => {
    // Reset inside the debounce window: cancelling the pending commit is enough, and a write here
    // would spend a storage.sync quota slot to store what is already stored.
    const plan = planResetChanges({ baseline: globalBaseline, rules: [], committed: false });
    if (plan.action !== 'restore') throw new Error('unreachable');
    expect(plan.global).toBeNull();
    expect(plan.rules).toBeNull();
    expect(plan.bands).toEqual(A); // the graph and the engine still go back
  });

  it('always says what the sound should become', () => {
    for (const committed of [true, false]) {
      const plan = planResetChanges({ baseline: globalBaseline, rules: [], committed });
      if (plan.action !== 'restore') throw new Error('unreachable');
      expect(plan.bands).toEqual(A);
      expect(plan.gain).toBe(1);
    }
  });

  it('does not alias the baseline it restores from', () => {
    // Reset twice in one session has to give the same answer both times — see the A/B/A/C/A case.
    const plan = planResetChanges({ baseline: globalBaseline, rules: [], committed: true });
    if (plan.action !== 'restore') throw new Error('unreachable');
    plan.bands[0].gain = 99;
    expect(globalBaseline.global!.bands[0].gain).toBe(2);
  });
});
