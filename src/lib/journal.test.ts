import { describe, it, expect } from 'vitest';
import {
  makeJournal,
  isUsableJournal,
  replayDecision,
  ruleFingerprint,
  fingerprintsEqual,
  planReplay,
  JOURNAL_VERSION,
  type EditJournal,
  type JournalTarget
} from './journal';
import type { PresetBands } from './presets';
import type { Rule } from './rules';

const bands = (gain: number): PresetBands => ({
  frequencies: [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480],
  gains: Array(11).fill(gain),
  qs: Array(11).fill(0.7071)
});

const GLOBAL: JournalTarget = { kind: 'global' };
const RULE_T: JournalTarget = { kind: 'rule', id: 'r1' };

const rule = (over: Partial<Rule> = {}): Rule => ({
  id: 'r1',
  patterns: ['youtube.com'],
  mode: 'curve',
  curve: bands(3),
  gain: 1,
  preset: '',
  enabled: true,
  ...over
});

const journalFor = (target: JournalTarget, at: number, was = target.kind === 'rule' ? ruleFingerprint(rule()) : null) =>
  makeJournal(target, bands(6), 1, at, was);

describe('makeJournal', () => {
  it('snapshots the bands instead of aliasing them', () => {
    // The caller keeps mutating its live arrays during the drag; a reference would let the journal
    // drift into whatever the curve became later.
    const live = bands(2);
    const j = makeJournal(GLOBAL, live, 1, 1000, null);
    live.gains[0] = 99;
    expect(j.bands.gains[0]).toBe(2);
  });

  it('snapshots the target fingerprint too', () => {
    const r = rule();
    const fp = ruleFingerprint(r);
    const j = makeJournal(RULE_T, bands(1), 1, 1000, fp);
    fp.curve!.gains[0] = 99;
    expect(j.targetWas!.curve!.gains[0]).toBe(3);
  });

  it('records the target and does not alias it', () => {
    const t: JournalTarget = { kind: 'rule', id: 'r1' };
    const j = makeJournal(t, bands(1), 1, 1000, ruleFingerprint(rule()));
    expect(j.target).toEqual({ kind: 'rule', id: 'r1' });
    expect(j.target).not.toBe(t);
  });
});

describe('isUsableJournal', () => {
  it('accepts a well-formed record', () => {
    expect(isUsableJournal(journalFor(GLOBAL, 1000))).toBe(true);
  });

  it('rejects garbage without throwing', () => {
    for (const bad of [null, undefined, 0, '', 'x', [], {}, { v: 1 }]) {
      expect(() => isUsableJournal(bad)).not.toThrow();
      expect(isUsableJournal(bad)).toBe(false);
    }
  });

  it('rejects a foreign or future version', () => {
    const j = { ...journalFor(GLOBAL, 1000), v: JOURNAL_VERSION + 1 };
    expect(isUsableJournal(j)).toBe(false);
  });

  it('rejects mismatched band arrays', () => {
    const j = journalFor(GLOBAL, 1000) as any;
    j.bands = { frequencies: [20, 40], gains: [1], qs: [1] };
    expect(isUsableJournal(j)).toBe(false);
  });

  it('rejects a non-finite gain', () => {
    for (const g of [NaN, Infinity, 'loud']) {
      const j = { ...journalFor(GLOBAL, 1000), gain: g } as any;
      expect(isUsableJournal(j)).toBe(false);
    }
  });

  it('rejects a rule target with no id', () => {
    const j = { ...journalFor(GLOBAL, 1000), target: { kind: 'rule' } } as any;
    expect(isUsableJournal(j)).toBe(false);
  });
});

describe('replayDecision — global target', () => {
  it('does nothing when there is no journal', () => {
    expect(replayDecision({ journal: null, canonicalUpdatedAt: 5, currentRule: null })).toBe('none');
  });

  it('applies when the journal is newer than the stored profile', () => {
    expect(replayDecision({ journal: journalFor(GLOBAL, 2000), canonicalUpdatedAt: 1000, currentRule: null })).toBe('apply');
  });

  it('discards when a normal save happened after the journal', () => {
    // The regression this test exists for: journal A is written, the popup dies, a later session
    // saves B normally, then a third session opens. Replaying A would silently undo B.
    expect(replayDecision({ journal: journalFor(GLOBAL, 1000), canonicalUpdatedAt: 2000, currentRule: null })).toBe('discard');
  });

  it('discards on an exact tie — the canonical write is at least as new', () => {
    expect(replayDecision({ journal: journalFor(GLOBAL, 1000), canonicalUpdatedAt: 1000, currentRule: null })).toBe('discard');
  });

  it('applies when nothing is stored yet', () => {
    // Fresh install: readDefaultEq returns null, so the journal is the only record of the edit.
    expect(replayDecision({ journal: journalFor(GLOBAL, 1000), canonicalUpdatedAt: null, currentRule: null })).toBe('apply');
  });

  it('discards an unusable record rather than replaying junk', () => {
    expect(replayDecision({ journal: { v: 99 }, canonicalUpdatedAt: null, currentRule: null })).toBe('discard');
  });
});

describe('replayDecision — rule target', () => {
  it('applies when the rule is untouched since the edit began', () => {
    const r = rule();
    const j = makeJournal(RULE_T, bands(6), 1, 1000, ruleFingerprint(r));
    expect(replayDecision({ journal: j, canonicalUpdatedAt: null, currentRule: r })).toBe('apply');
  });

  it('discards when the rule is gone', () => {
    expect(replayDecision({ journal: journalFor(RULE_T, 1000), canonicalUpdatedAt: null, currentRule: null })).toBe('discard');
  });

  it('discards when the id no longer matches', () => {
    expect(replayDecision({ journal: journalFor(RULE_T, 1000), canonicalUpdatedAt: null, currentRule: rule({ id: 'other' }) })).toBe(
      'discard'
    );
  });

  it("discards when the rule's curve changed elsewhere", () => {
    const j = makeJournal(RULE_T, bands(6), 1, 1000, ruleFingerprint(rule()));
    expect(replayDecision({ journal: j, canonicalUpdatedAt: null, currentRule: rule({ curve: bands(9) }) })).toBe('discard');
  });

  it('discards when only enabled was flipped elsewhere', () => {
    // The reason the fingerprint covers more than the curve: someone disabling the rule in another
    // window has changed it, and a replay would quietly re-enable their edit away.
    const j = makeJournal(RULE_T, bands(6), 1, 1000, ruleFingerprint(rule()));
    expect(replayDecision({ journal: j, canonicalUpdatedAt: null, currentRule: rule({ enabled: false }) })).toBe('discard');
  });

  it('discards when only the preset name changed elsewhere', () => {
    const j = makeJournal(RULE_T, bands(6), 1, 1000, ruleFingerprint(rule()));
    expect(replayDecision({ journal: j, canonicalUpdatedAt: null, currentRule: rule({ preset: 'Vocal' }) })).toBe('discard');
  });

  it('discards when only the gain changed elsewhere', () => {
    const j = makeJournal(RULE_T, bands(6), 1, 1000, ruleFingerprint(rule()));
    expect(replayDecision({ journal: j, canonicalUpdatedAt: null, currentRule: rule({ gain: 2 }) })).toBe('discard');
  });

  it('discards when only the mode changed elsewhere', () => {
    const j = makeJournal(RULE_T, bands(6), 1, 1000, ruleFingerprint(rule()));
    expect(replayDecision({ journal: j, canonicalUpdatedAt: null, currentRule: rule({ mode: 'preset', preset: '' }) })).toBe('discard');
  });

  it('ignores the canonical timestamp for a rule target', () => {
    // Rules have no timestamp of their own; a stale DEFAULT_EQ time must not decide their fate.
    const r = rule();
    const j = makeJournal(RULE_T, bands(6), 1, 1, ruleFingerprint(r));
    expect(replayDecision({ journal: j, canonicalUpdatedAt: 999999, currentRule: r })).toBe('apply');
  });
});

describe('ruleFingerprint / fingerprintsEqual', () => {
  it('treats a missing gain as unity and a missing preset as empty', () => {
    const a = ruleFingerprint(rule({ gain: undefined, preset: undefined }));
    expect(a.gain).toBe(1);
    expect(a.preset).toBe('');
  });

  it('matches two fingerprints of the same rule', () => {
    expect(fingerprintsEqual(ruleFingerprint(rule()), ruleFingerprint(rule()))).toBe(true);
  });

  it('never matches when one side is missing', () => {
    expect(fingerprintsEqual(ruleFingerprint(rule()), null)).toBe(false);
    expect(fingerprintsEqual(null, null)).toBe(true);
  });

  it('distinguishes a preset-mode rule with no curve from a curve-mode one', () => {
    const p = ruleFingerprint(rule({ mode: 'preset', curve: undefined, preset: 'Vocal' }));
    expect(p.curve).toBeNull();
    expect(fingerprintsEqual(p, ruleFingerprint(rule()))).toBe(false);
  });
});

// The recovery path end to end. replayDecision being correct proves nothing on its own if the code
// that consumes it ignores the answer — these assert the OUTCOME: what gets written, and that a
// conflicting rule comes back untouched.
describe('planReplay — recovery conflict', () => {
  const RULES = [rule({ id: 'other', patterns: ['spotify.'] }), rule()];

  it('does nothing when there is no journal', () => {
    expect(planReplay({ journal: null, canonicalUpdatedAt: 1, rules: RULES })).toEqual({ action: 'none' });
  });

  it('recovers a global edit into the profile', () => {
    const j = makeJournal(GLOBAL, bands(6), 0.5, 2000, null);
    const plan = planReplay({ journal: j, canonicalUpdatedAt: 1000, rules: RULES });
    expect(plan.action).toBe('apply-global');
    if (plan.action !== 'apply-global') throw new Error('unreachable');
    expect(plan.bands.gains[0]).toBe(6);
    expect(plan.gain).toBe(0.5);
  });

  it('recovers a rule edit into the rules array, leaving other rules alone', () => {
    const j = makeJournal(RULE_T, bands(6), 2, 2000, ruleFingerprint(rule()));
    const plan = planReplay({ journal: j, canonicalUpdatedAt: null, rules: RULES });
    expect(plan.action).toBe('apply-rule');
    if (plan.action !== 'apply-rule') throw new Error('unreachable');
    expect(plan.rules.find((r) => r.id === 'r1')!.curve!.gains[0]).toBe(6);
    expect(plan.rules.find((r) => r.id === 'r1')!.gain).toBe(2);
    expect(plan.rules.find((r) => r.id === 'other')).toEqual(RULES[0]);
    // Order is part of the contract, not an incidental property of map(): rules are first-match-wins,
    // so a rebuild via filter+push or sort would silently change which rule covers a site.
    expect(plan.rules.map((r) => r.id)).toEqual(['other', 'r1']);
  });

  // The scenario the fingerprint exists for: edit A is journalled but not committed, something else
  // changes the same rule to B, the popup dies, and reopening must keep B rather than resurrect A.
  // One case per fingerprint field, because any single one being ignored reopens the hole.
  const CONFLICTS: Array<[string, Partial<Rule>]> = [
    ['curve', { curve: bands(9) }],
    ['gain', { gain: 3 }],
    ['enabled', { enabled: false }],
    ['preset', { preset: 'Vocal' }],
    ['mode', { mode: 'preset', preset: 'Warm', curve: undefined }]
  ];

  for (const [field, changed] of CONFLICTS) {
    it(`discards the journal when ${field} changed elsewhere, and leaves that change standing`, () => {
      const before = ruleFingerprint(rule()); // fingerprint taken when edit A began
      const j = makeJournal(RULE_T, bands(6), 1, 2000, before);
      const nowRules = [RULES[0], rule(changed)]; // ...then B happened in another context
      const plan = planReplay({ journal: j, canonicalUpdatedAt: null, rules: nowRules });
      expect(plan).toEqual({ action: 'discard' });
    });
  }

  it('discards when a normal save superseded a global journal', () => {
    const j = makeJournal(GLOBAL, bands(6), 1, 1000, null);
    expect(planReplay({ journal: j, canonicalUpdatedAt: 2000, rules: RULES })).toEqual({ action: 'discard' });
  });

  it('discards when the journalled rule was deleted', () => {
    const j = makeJournal(RULE_T, bands(6), 1, 2000, ruleFingerprint(rule()));
    expect(planReplay({ journal: j, canonicalUpdatedAt: null, rules: [RULES[0]] })).toEqual({ action: 'discard' });
  });

  it('does not alias the journal or the caller rules array', () => {
    const j = makeJournal(RULE_T, bands(6), 1, 2000, ruleFingerprint(rule()));
    const input = [rule()];
    const plan = planReplay({ journal: j, canonicalUpdatedAt: null, rules: input });
    if (plan.action !== 'apply-rule') throw new Error('unreachable');
    plan.rules[0].curve!.gains[0] = 99;
    expect(j.bands.gains[0]).toBe(6);
    expect(input[0].curve!.gains[0]).toBe(3);
  });
});
