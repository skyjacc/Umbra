import { describe, it, expect } from 'vitest';
import { planResetProfile, makeResetSnapshot, applyUndoReset, hasDiscardableChanges, resetControls, type ResetSnapshot } from './reset';
import type { RestoreWriters } from './reset-changes';
import type { Rule } from './rules';
import type { Band } from './audio';
import { flatBands } from './engine-io';

const BANDS = flatBands().map((b) => ({ ...b, gain: 4 })) as Band[];

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
  const global = { bands: flatBands().map((b) => ({ ...b, gain: 4 })) as Band[], gain: 0.5, presetName: '' };

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
    const g = { bands: flatBands(), gain: 1, presetName: '' };
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
  it('is true while a drag preview is showing', () => {
    expect(hasDiscardableChanges({ previewSource: 'drag', dirty: false })).toBe(true);
  });

  it('is FALSE while bypass is on, however long it lasts', () => {
    // Bypass is not an edit: the stored sound is simply not being applied. Counting it would put a
    // "discard your change" button next to the bypass toggle, doing the same thing under a name
    // that describes something else.
    expect(hasDiscardableChanges({ previewSource: 'bypass', dirty: false })).toBe(false);
  });

  it('is true while an edit is waiting to be written', () => {
    expect(hasDiscardableChanges({ previewSource: null, dirty: true })).toBe(true);
  });

  it('is false when everything on screen is already stored', () => {
    expect(hasDiscardableChanges({ previewSource: null, dirty: false })).toBe(false);
  });
});

describe('resetControls — placement contract', () => {
  it('offers Reset changes in the main row only for a real edit', () => {
    expect(resetControls({ previewSource: 'drag', dirty: false }).changesInMainRow).toBe(true);
    expect(resetControls({ previewSource: null, dirty: true }).changesInMainRow).toBe(true);
    expect(resetControls({ previewSource: 'bypass', dirty: false }).changesInMainRow).toBe(false);
    expect(resetControls({ previewSource: null, dirty: false }).changesInMainRow).toBe(false);
  });

  it('keeps Reset profile in More in every state', () => {
    for (const s of [
      { previewSource: 'drag' as const, dirty: true },
      { previewSource: 'bypass' as const, dirty: false },
      { previewSource: null, dirty: false }
    ]) {
      expect(resetControls(s).profileInMore).toBe(true);
    }
  });

  it('never puts the destructive reset where the harmless one lives', () => {
    const shape = Object.keys(resetControls({ previewSource: null, dirty: false }));
    expect(shape).toEqual(['changesInMainRow', 'profileInMore']);
  });
});

// The snapshot has to be a COMPLETE picture of what the reset overwrote, and the undo has to be
// spent only once the restore is actually stored. Both were wrong: the snapshot dropped the
// profile's provenance, and undoReset disarmed the slot before attempting the write.
describe('the snapshot keeps the provenance too', () => {
  it('carries the preset the profile came from', () => {
    const snap = makeResetSnapshot([], { bands: BANDS, gain: 1, presetName: 'Vocal' });
    expect(snap.global).toEqual({ bands: BANDS, gain: 1, presetName: 'Vocal' });
  });

  it('still deep-copies rather than aliasing', () => {
    const live = { bands: BANDS.map((b) => ({ ...b })), gain: 1, presetName: 'Vocal' };
    const snap = makeResetSnapshot([], live);
    live.bands[0].gain = 99;
    expect(snap.global!.bands[0].gain).not.toBe(99);
  });

  it('keeps null meaning "there was no profile"', () => {
    expect(makeResetSnapshot([], null).global).toBeNull();
  });
});

describe('spending the undo only once the restore is stored', () => {
  const snapOf = (over: Partial<ResetSnapshot> = {}): ResetSnapshot => ({
    rules: [{ id: 'r1', patterns: ['a.com'], mode: 'curve', curve: { frequencies: [20], gains: [3], qs: [0.7] }, gain: 1, enabled: true }],
    global: { bands: BANDS, gain: 1, presetName: 'Vocal' },
    ...over
  });

  const spy = (over: Partial<RestoreWriters> = {}) => {
    const calls: string[] = [];
    const w: RestoreWriters = {
      writeGlobal: async () => (calls.push('writeGlobal'), { ok: true }),
      clearGlobal: async () => (calls.push('clearGlobal'), { ok: true }),
      writeRules: async () => (calls.push('writeRules'), { ok: true }),
      ...over
    };
    return { w, calls };
  };

  it('puts the rules back first, then the profile, and reports success', async () => {
    const { w, calls } = spy();
    expect(await applyUndoReset(snapOf(), w, false)).toBe('restored');
    expect(calls).toEqual(['writeRules', 'writeGlobal']);
  });

  it('restores the profile WITH its provenance', async () => {
    const seen: unknown[] = [];
    const { w } = spy({ writeGlobal: async (...a) => (seen.push(a), { ok: true }) });
    await applyUndoReset(snapOf(), w, false);
    expect(seen).toEqual([[BANDS, 1, 'Vocal']]);
  });

  it('removes the profile when the snapshot says there was none', async () => {
    const { w, calls } = spy();
    await applyUndoReset(snapOf({ global: null }), w, false);
    expect(calls).toEqual(['writeRules', 'clearGlobal']);
  });

  it('reports failure rather than success when the rules cannot be written', async () => {
    // The worst case in the audit: the snapshot is the ONLY copy of a rule Reset profile deleted.
    // The caller must keep it and keep the undo armed, so the user can try again.
    const { w, calls } = spy({ writeRules: async () => (calls.push('writeRules'), { ok: false }) });
    expect(await applyUndoReset(snapOf(), w, false)).toBe('write-failed');
    expect(calls).toEqual(['writeRules']); // and it does not go on to touch the profile
  });

  it('reports failure when only the profile write is refused', async () => {
    const { w } = spy({ writeGlobal: async () => ({ ok: false }) });
    expect(await applyUndoReset(snapOf(), w, false)).toBe('write-failed');
  });

  it('does not write the rules at all when storage already holds them', async () => {
    // Reset profile on a site with no rule flattens the global and leaves the rules alone, so an
    // undo of it has nothing to put back. Writing them anyway is not merely wasteful: engine-io
    // refuses to write a rules array a document could not read, so this turned a global-only undo
    // into 'write-failed' and blamed the sync quota.
    const { w, calls } = spy();
    expect(await applyUndoReset(snapOf(), w, true)).toBe('restored');
    expect(calls).toEqual(['writeGlobal']);
  });

  it('still restores the profile when the rules write is skipped and the rules writer would refuse', async () => {
    const { w } = spy({ writeRules: async () => ({ ok: false }) });
    expect(await applyUndoReset(snapOf(), w, true)).toBe('restored');
  });

  it('skipping is decided by the caller, not guessed from the snapshot', async () => {
    // Same snapshot, opposite answers — so a caller that stops computing the comparison cannot
    // silently fall back to "always skip", which would drop a rule Reset profile had deleted.
    const a = spy();
    await applyUndoReset(snapOf(), a.w, false);
    const b = spy();
    await applyUndoReset(snapOf(), b.w, true);
    expect(a.calls).toEqual(['writeRules', 'writeGlobal']);
    expect(b.calls).toEqual(['writeGlobal']);
  });
});
