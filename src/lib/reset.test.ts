import { describe, it, expect } from 'vitest';
import { planResetProfile, makeResetSnapshot, hasDiscardableChanges, resetControls } from './reset';
import type { Rule } from './rules';
import type { Band } from './audio';
import { flatBands } from './engine-io';

const rule = (id: string, patterns: string[], over: Partial<Rule> = {}): Rule => ({
  id,
  patterns,
  mode: 'curve',
  curve: { frequencies: [20, 40], gains: [3, 3], qs: [0.7, 0.7] },
  gain: 1,
  preset: '',
  enabled: true,
  ...over
});

const RULES = [rule('a', ['youtube.com']), rule('b', ['.spotify.']), rule('c', ['twitch.'])];

describe('planResetProfile', () => {
  it('flattens the global profile on a site with no rule', () => {
    expect(planResetProfile('example.org', RULES)).toEqual({ action: 'flatten-global' });
  });

  it('flattens the global profile when there is no host at all', () => {
    // The full-window editor edits the global profile and has no host.
    expect(planResetProfile('', RULES)).toEqual({ action: 'flatten-global' });
  });

  it('removes the matching rule on a ruled site', () => {
    const plan = planResetProfile('youtube.com', RULES);
    expect(plan.action).toBe('delete-rule');
    if (plan.action !== 'delete-rule') throw new Error('unreachable');
    expect(plan.ruleId).toBe('a');
    expect(plan.rules.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('removes only the FIRST matching rule, since that is the one in effect', () => {
    // Matching is first-match-wins, so the site is being shaped by exactly one rule. Removing more
    // would silently change other sites the later rules also cover.
    const overlapping = [rule('wide', ['.youtube.']), rule('exact', ['music.youtube.com'])];
    const plan = planResetProfile('music.youtube.com', overlapping);
    if (plan.action !== 'delete-rule') throw new Error('unreachable');
    expect(plan.ruleId).toBe('wide');
    expect(plan.rules.map((r) => r.id)).toEqual(['exact']);
  });

  it('keeps the order of the surviving rules', () => {
    const plan = planResetProfile('.spotify.com', RULES);
    if (plan.action !== 'delete-rule') throw new Error('unreachable');
    expect(plan.rules.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('ignores a disabled rule and falls through to the global profile', () => {
    const disabled = [rule('a', ['youtube.com'], { enabled: false })];
    expect(planResetProfile('youtube.com', disabled)).toEqual({ action: 'flatten-global' });
  });

  it('does not mutate the rules it was given', () => {
    const input = [rule('a', ['youtube.com'])];
    planResetProfile('youtube.com', input);
    expect(input).toHaveLength(1);
  });
});

describe('makeResetSnapshot', () => {
  const global = { bands: flatBands().map((b) => ({ ...b, gain: 4 })) as Band[], gain: 0.5 };

  it('captures rules and the global profile', () => {
    const s = makeResetSnapshot(RULES, global);
    expect(s.rules.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(s.global!.gain).toBe(0.5);
    expect(s.global!.bands[0].gain).toBe(4);
  });

  it('deep-copies, so a later reset cannot overwrite the snapshot', () => {
    // The whole point: reset replaces these very arrays a moment later. A shallow copy would let
    // "undo" restore the flattened state over itself — worse than no undo, because it is trusted.
    const rules = [rule('a', ['youtube.com'])];
    const g = { bands: flatBands(), gain: 1 };
    const s = makeResetSnapshot(rules, g);

    rules[0].curve!.gains[0] = 99;
    rules[0].patterns[0] = 'changed';
    g.bands[0].gain = 99;
    g.gain = 99;

    expect(s.rules[0].curve!.gains[0]).toBe(3);
    expect(s.rules[0].patterns[0]).toBe('youtube.com');
    expect(s.global!.bands[0].gain).toBe(0);
    expect(s.global!.gain).toBe(1);
  });

  it('distinguishes "no profile stored" from an empty one', () => {
    // readDefaultEq returns null on a fresh install; undo must restore that absence, not a flat
    // profile that was never there.
    expect(makeResetSnapshot(RULES, null).global).toBeNull();
  });

  it('survives a rule with no curve', () => {
    const preset = [rule('p', ['x.com'], { mode: 'preset', curve: undefined, preset: 'Vocal' })];
    const s = makeResetSnapshot(preset, null);
    expect(s.rules[0].curve).toBeUndefined();
    expect(s.rules[0].preset).toBe('Vocal');
  });
});

describe('hasDiscardableChanges', () => {
  it('is true while a preview is showing', () => {
    expect(hasDiscardableChanges({ previewOn: true, dirty: false })).toBe(true);
  });

  it('is true while an edit is waiting to be written', () => {
    // The debounce window: the drag is over but the write has not happened, and discarding it is
    // still meaningful.
    expect(hasDiscardableChanges({ previewOn: false, dirty: true })).toBe(true);
  });

  it('is false when everything on screen is already stored', () => {
    expect(hasDiscardableChanges({ previewOn: false, dirty: false })).toBe(false);
  });
});

describe('resetControls — placement contract', () => {
  it('offers Reset changes in the main row only when there is something to discard', () => {
    expect(resetControls({ previewOn: true, dirty: false }).changesInMainRow).toBe(true);
    expect(resetControls({ previewOn: false, dirty: true }).changesInMainRow).toBe(true);
    expect(resetControls({ previewOn: false, dirty: false }).changesInMainRow).toBe(false);
  });

  it('keeps Reset profile in More in every state', () => {
    for (const s of [
      { previewOn: true, dirty: true },
      { previewOn: true, dirty: false },
      { previewOn: false, dirty: true },
      { previewOn: false, dirty: false }
    ]) {
      expect(resetControls(s).profileInMore).toBe(true);
    }
  });

  it('never puts the destructive reset where the harmless one lives', () => {
    // The invariant behind the split: whatever the state, the main row can only ever hold
    // "Reset changes". A future refactor that promotes Reset profile into that slot fails here.
    const shape = Object.keys(resetControls({ previewOn: false, dirty: false }));
    expect(shape).toEqual(['changesInMainRow', 'profileInMore']);
  });
});
