import { describe, it, expect, beforeEach } from 'vitest';
import { planSaveForSite, applySavePlan, setRuleIdFactory, type SaveWriters, type SavePlan } from './save-for-site';
import type { Rule } from './rules';
import type { PresetBands } from './presets';
import type { Band } from './audio';
import { flatBands } from './engine-io';

const bands = (g: number): PresetBands => ({ frequencies: [20, 40, 80], gains: [g, g, g], qs: [0.7, 0.7, 0.7] });
const A = flatBands().map((b) => ({ ...b, gain: 1 })) as Band[]; // the global profile before the edit
const B = bands(7); // what the user shaped

const rule = (id: string, patterns: string[], over: Partial<Rule> = {}): Rule => ({
  id,
  patterns,
  mode: 'curve',
  curve: bands(3),
  gain: 1,
  preset: '',
  enabled: true,
  ...over
});

const base = {
  host: 'youtube.com',
  rules: [] as Rule[],
  matchedRule: null as Rule | null,
  bands: B,
  gain: 2,
  presetName: '',
  scope: 'exact' as const,
  baselineGlobal: { bands: A, gain: 1 },
  owesGlobalRestore: true
};

beforeEach(() => setRuleIdFactory(() => 'r_new'));

describe('planSaveForSite — creating', () => {
  it('creates an exact-host rule carrying the edited sound', () => {
    const plan = planSaveForSite(base);
    if (plan.action !== 'save') throw new Error('unreachable');
    expect(plan.created).toBe(true);
    const made = plan.rules.at(-1)!;
    expect(made.patterns).toEqual(['youtube.com']);
    expect(made.mode).toBe('curve');
    expect(made.curve!.gains[0]).toBe(7);
    expect(made.gain).toBe(2);
    expect(made.enabled).toBe(true);
  });

  it('puts the global profile back to what it was before the edit', () => {
    // The point of the whole action: the edit became the everywhere-sound on its way here, and
    // saving it for one site must not leave it applying to all the others.
    const plan = planSaveForSite(base);
    if (plan.action !== 'save') throw new Error('unreachable');
    expect(plan.globalRollback).toEqual({ to: { bands: A, gain: 1 } });
    expect(plan.globalRollback!.to!.bands[0].gain).toBe(1); // A, not B
  });

  it('plans to clear the profile when there was none before', () => {
    // Fresh install: the edit created DEFAULT_EQ. Putting it back means removing it again, not
    // writing a flat profile that never existed.
    const plan = planSaveForSite({ ...base, baselineGlobal: null });
    if (plan.action !== 'save') throw new Error('unreachable');
    expect(plan.globalRollback).toEqual({ to: null });
  });

  it('plans no rollback when the session never touched the global profile', () => {
    const plan = planSaveForSite({ ...base, owesGlobalRestore: false });
    if (plan.action !== 'save') throw new Error('unreachable');
    expect(plan.globalRollback).toBeNull();
  });

  it('keeps existing rules and their order', () => {
    const rules = [rule('a', ['spotify.']), rule('b', ['twitch.'])];
    const plan = planSaveForSite({ ...base, rules });
    if (plan.action !== 'save') throw new Error('unreachable');
    expect(plan.rules.map((r) => r.id)).toEqual(['a', 'b', 'r_new']);
    expect(plan.rules[0]).toEqual(rules[0]);
    expect(plan.rules[1]).toEqual(rules[1]);
  });

  it('does nothing without a host', () => {
    expect(planSaveForSite({ ...base, host: '' })).toEqual({ action: 'none', reason: 'no-host' });
  });
});

describe('planSaveForSite — updating', () => {
  const existing = rule('r1', ['youtube.com', 'youtu.be'], { enabled: false, preset: 'Vocal', mode: 'preset', curve: undefined });
  const rules = [rule('other', ['spotify.']), existing];

  it('updates the matched rule in place and leaves the rest alone', () => {
    const plan = planSaveForSite({ ...base, rules, matchedRule: existing });
    if (plan.action !== 'save') throw new Error('unreachable');
    expect(plan.created).toBe(false);
    expect(plan.ruleId).toBe('r1');
    expect(plan.rules.map((r) => r.id)).toEqual(['other', 'r1']);
    expect(plan.rules[0]).toEqual(rules[0]);
  });

  it('owns the sound and nothing else', () => {
    // The ownership contract: shaping a band is not a reason to re-enable a rule the user turned
    // off, or to change which sites it covers.
    const plan = planSaveForSite({ ...base, rules, matchedRule: existing, presetName: '' });
    if (plan.action !== 'save') throw new Error('unreachable');
    const updated = plan.rules.find((r) => r.id === 'r1')!;

    expect(updated.id).toBe('r1');
    expect(updated.patterns).toEqual(['youtube.com', 'youtu.be']);
    expect(updated.enabled).toBe(false);

    expect(updated.mode).toBe('curve'); // a dragged band is no longer "the Vocal preset"
    expect(updated.curve!.gains[0]).toBe(7);
    expect(updated.gain).toBe(2);
  });

  it('does not alias the caller rules or the buffer', () => {
    const input = [rule('r1', ['youtube.com'])];
    const buffer = bands(7);
    const plan = planSaveForSite({ ...base, rules: input, matchedRule: input[0], bands: buffer });
    if (plan.action !== 'save') throw new Error('unreachable');
    plan.rules[0].curve!.gains[0] = 99;
    expect(buffer.gains[0]).toBe(7);
    expect(input[0].curve!.gains[0]).toBe(3);
  });
});

describe('applySavePlan — write ordering', () => {
  const plan = (): SavePlan => planSaveForSite(base);

  const spyWriters = (over: Partial<SaveWriters> = {}) => {
    const calls: string[] = [];
    const w: SaveWriters = {
      writeRules: async () => (calls.push('writeRules'), { ok: true }),
      writeGlobal: async () => (calls.push('writeGlobal'), { ok: true }),
      clearGlobal: async () => void calls.push('clearGlobal'),
      clearJournal: async () => void calls.push('clearJournal'),
      ...over
    };
    return { w, calls };
  };

  it('writes the rule, restores the global, then drops the journal — in that order', () => {
    const { w, calls } = spyWriters();
    return applySavePlan(plan(), w).then((outcome) => {
      expect(outcome).toBe('saved');
      expect(calls).toEqual(['writeRules', 'writeGlobal', 'clearJournal']);
    });
  });

  it('changes NOTHING else when the rule write fails', async () => {
    // The reason the rule goes first. On failure the user is exactly where they started: the edit
    // is still on the global profile and the journal still describes it. Rolling the global back
    // first would have deleted the edit from the only place it existed, to make room for a rule
    // that then could not be written.
    const { w, calls } = spyWriters({ writeRules: async () => (calls.push('writeRules'), { ok: false }) });
    const outcome = await applySavePlan(plan(), w);

    expect(outcome).toBe('rule-write-failed');
    expect(calls).toEqual(['writeRules']);
    expect(calls).not.toContain('writeGlobal');
    expect(calls).not.toContain('clearGlobal');
    expect(calls).not.toContain('clearJournal');
  });

  it('reports a partial success rather than undoing the rule', async () => {
    // Rule stored but the profile not put back: the site is right and the others still carry the
    // edit. Recoverable with Reset, and worth saying out loud — but undoing the rule here would
    // throw away the thing that did succeed.
    const { w, calls } = spyWriters({ writeGlobal: async () => (calls.push('writeGlobal'), { ok: false }) });
    const outcome = await applySavePlan(plan(), w);

    expect(outcome).toBe('saved-global-not-restored');
    expect(calls).toEqual(['writeRules', 'writeGlobal']);
    expect(calls).not.toContain('clearJournal'); // the edit is still un-reconciled somewhere
  });

  it('clears the stored profile when the rollback target is "there was none"', async () => {
    const { w, calls } = spyWriters();
    const outcome = await applySavePlan(planSaveForSite({ ...base, baselineGlobal: null }), w);
    expect(outcome).toBe('saved');
    expect(calls).toEqual(['writeRules', 'clearGlobal', 'clearJournal']);
  });

  it('skips the rollback entirely when none is owed', async () => {
    const { w, calls } = spyWriters();
    await applySavePlan(planSaveForSite({ ...base, owesGlobalRestore: false }), w);
    expect(calls).toEqual(['writeRules', 'clearJournal']);
  });

  it('does nothing for a plan with no host', async () => {
    const { w, calls } = spyWriters();
    expect(await applySavePlan(planSaveForSite({ ...base, host: '' }), w)).toBe('nothing-to-do');
    expect(calls).toEqual([]);
  });
});

describe('the whole point, end to end', () => {
  it('leaves the global profile at A and the site at B', () => {
    // Global = A, buffer = B, save for youtube.com → rule carries B, global goes back to A.
    const plan = planSaveForSite(base);
    if (plan.action !== 'save') throw new Error('unreachable');

    expect(plan.rules.at(-1)!.curve!.gains[0]).toBe(7); // site gets B
    expect(plan.globalRollback!.to!.bands[0].gain).toBe(1); // everywhere else keeps A
  });
});
