import { describe, it, expect } from 'vitest';
import { quantizeCurve, quantizeRules, FREQ_STEP, GAIN_STEP, Q_STEP } from './quantize';
import { matchRule, type Rule } from './rules';
import type { PresetBands } from './presets';
import { ruleFingerprint, fingerprintsEqual, replayDecision } from './journal';

const FREQS = [20, 40, 80, 160, 320, 640, 1300, 2600, 5100, 10000, 20000];

/** What a drag actually produces: xToFreq/yToDb output, unrounded. */
const dragged = (): PresetBands => ({
  frequencies: FREQS.map((f) => f * 1.0473218374),
  gains: FREQS.map(() => -19.73421875123),
  qs: FREQS.map(() => 0.7071067811865476)
});

const rule = (id: string, over: Partial<Rule> = {}): Rule => ({
  id,
  patterns: ['youtube.com'],
  mode: 'curve',
  curve: dragged(),
  gain: 0.8234567890123,
  preset: '',
  enabled: true,
  ...over
});

const onGrid = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;

describe('quantizeCurve', () => {
  it('puts every number on the storage grid', () => {
    const q = quantizeCurve(dragged());
    expect(q.frequencies.every((f) => onGrid(f, FREQ_STEP))).toBe(true);
    expect(q.gains.every((g) => onGrid(g, GAIN_STEP))).toBe(true);
    expect(q.qs.every((v) => onGrid(v, Q_STEP))).toBe(true);
  });

  it('stays within half a step of what the user shaped', () => {
    // The grid is chosen so the error is below what the UI can show and below what an ear can
    // hear: 0.05 dB, and 0.043 of a semitone at the lowest band.
    const src = dragged();
    const q = quantizeCurve(src);
    src.gains.forEach((g, i) => expect(Math.abs(q.gains[i] - g)).toBeLessThanOrEqual(GAIN_STEP / 2 + 1e-9));
    src.frequencies.forEach((f, i) => expect(Math.abs(q.frequencies[i] - f)).toBeLessThanOrEqual(FREQ_STEP / 2 + 1e-9));
    src.qs.forEach((v, i) => expect(Math.abs(q.qs[i] - v)).toBeLessThanOrEqual(Q_STEP / 2 + 1e-9));
  });

  it('does not touch the curve it was given', () => {
    // The editing buffer keeps full precision — rounding belongs to the write, not to the state.
    // If this ever aliases, every save would coarsen the live curve a little more.
    const src = dragged();
    const before = JSON.parse(JSON.stringify(src));
    quantizeCurve(src);
    expect(src).toEqual(before);
  });

  it('is idempotent — a value already on the grid comes back unchanged', () => {
    const once = quantizeCurve(dragged());
    expect(quantizeCurve(once)).toEqual(once);
  });

  it('does not drift over repeated save cycles', () => {
    // The failure this exists to prevent: rounding the working buffer instead of the write, so
    // every open-edit-save round trip walks the value further from what the user set.
    let curve = quantizeCurve(dragged());
    const first = JSON.parse(JSON.stringify(curve));
    for (let i = 0; i < 50; i++) curve = quantizeCurve(curve);
    expect(curve).toEqual(first);
  });

  it('does not drift when an edit is applied between saves', () => {
    // Read the stored (rounded) curve, nudge one band by a whole step, store again. The other ten
    // bands must be exactly where they were — a nudge to band 3 is not a reason for band 7 to move.
    let curve = quantizeCurve(dragged());
    for (let i = 0; i < 20; i++) {
      const edited = { ...curve, gains: curve.gains.map((g, j) => (j === 3 ? g + GAIN_STEP : g)) };
      curve = quantizeCurve(edited);
    }
    const expected = quantizeCurve(dragged());
    expect(curve.frequencies).toEqual(expected.frequencies);
    expect(curve.qs).toEqual(expected.qs);
    expect(curve.gains[7]).toBe(expected.gains[7]);
    expect(curve.gains[3]).toBeCloseTo(expected.gains[3] + 20 * GAIN_STEP, 9);
  });
});

describe('quantizeRules', () => {
  it('owns the curve and nothing else', () => {
    const r = rule('r1', { patterns: ['a.com', 'b.com'], enabled: false, preset: 'Vocal' });
    const [out] = quantizeRules([r]);
    expect(out.id).toBe('r1');
    expect(out.patterns).toEqual(['a.com', 'b.com']);
    expect(out.enabled).toBe(false);
    expect(out.preset).toBe('Vocal');
    expect(out.mode).toBe('curve');
    expect(out.gain).toBe(r.gain); // one number per rule: not worth a semantic change
  });

  it('leaves a preset-mode rule with no curve alone', () => {
    const r: Rule = { id: 'r1', patterns: ['a.com'], mode: 'preset', preset: 'Vocal', enabled: true };
    expect(quantizeRules([r])[0]).toEqual(r);
  });

  it('keeps order and does not alias the input', () => {
    const input = [rule('a'), rule('b')];
    const before = JSON.parse(JSON.stringify(input));
    const out = quantizeRules(input);
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
    expect(input).toEqual(before);
  });

  it('normalizes every rule in the array, not only the edited one', () => {
    // RULES is a single sync item, so the whole array is rewritten on any change. Normalizing all
    // of it is what lets an existing install recover the space its old rules are wasting.
    const out = quantizeRules([rule('a'), rule('b')]);
    expect(out.every((r) => r.curve!.gains.every((g) => onGrid(g, GAIN_STEP)))).toBe(true);
  });
});

describe('the capacity this buys', () => {
  // The point of the whole change. chrome.storage.sync enforces 8192 bytes PER ITEM, and RULES is
  // one item holding every rule, so this number is a hard ceiling on how many sites a user can
  // save before writes start failing.
  const QUOTA_BYTES_PER_ITEM = 8192;

  const fits = (make: (i: number) => Rule) => {
    const acc: Rule[] = [];
    for (let i = 0; ; i++) {
      acc.push(make(i));
      if (('RULES' + JSON.stringify(acc)).length > QUOTA_BYTES_PER_ITEM) return i;
    }
  };

  const site = (i: number) => rule('r_9f8e7d6c-5b4a-3210-fedc-ba9876543' + String(200 + i), { patterns: [`site${i}.com`] });

  it('roughly doubles how many sites fit', () => {
    const before = fits(site);
    const after = fits((i) => quantizeRules([site(i)])[0]);
    expect(before).toBeLessThan(13);
    expect(after).toBeGreaterThanOrEqual(20);
    expect(after / before).toBeGreaterThan(1.7);
  });

  it('shrinks a single rule by more than 40%', () => {
    const raw = JSON.stringify(site(0)).length;
    const packed = JSON.stringify(quantizeRules([site(0)])[0]).length;
    expect(packed / raw).toBeLessThan(0.6);
  });
});

// The in-memory rules array is a MIRROR of storage, not a second source of truth. Quantizing only
// on the way out would make the two diverge for the rest of the session, and the divergence is not
// cosmetic: the crash-recovery journal identifies its target by comparing the whole curve.
describe('the mirror has to hold what storage holds', () => {
  const stored = () => quantizeRules([rule('r1')])[0];

  it('a fingerprint taken from the stored rule still matches it after a restart', () => {
    const r = stored();
    const decision = replayDecision({
      journal: { v: 1, target: { kind: 'rule', id: 'r1' }, bands: dragged(), gain: 1, writtenAt: 1, targetWas: ruleFingerprint(r) },
      canonicalUpdatedAt: 0,
      currentRule: r
    });
    expect(decision).toBe('apply');
  });

  it('a fingerprint taken before the grid does NOT match — the reason the mirror must be quantized', () => {
    // If commitTarget kept the full-precision array in memory, this is the comparison the next
    // popup would make: fingerprint of an exact curve against the rounded one storage returned.
    // It fails, replayDecision answers 'discard', and the recovered edit is dropped in silence —
    // in exactly the crash this journal exists for.
    const inMemory = rule('r1');
    expect(fingerprintsEqual(ruleFingerprint(inMemory), ruleFingerprint(stored()))).toBe(false);
  });
});

// Rules written by an older version hold full-precision floats. They are read as they are — the
// read path does not rewrite storage (invariants.test.ts asserts that) — and they are normalized
// the next time anything saves, because RULES is one item and is rewritten whole anyway.
describe('rules from an older version', () => {
  const legacy = [
    rule('old1', { patterns: ['youtube.', 'youtu.be'] }),
    rule('old2', { patterns: ['.spotify.com'], enabled: false, mode: 'preset', preset: 'Vocal', curve: undefined })
  ];

  it('still match exactly the same hosts', () => {
    const after = quantizeRules(legacy);
    for (const host of ['youtube.com', 'youtube.gg', 'youtu.be', 'open.spotify.com', 'example.com']) {
      expect(matchRule(host, after)?.id ?? null).toBe(matchRule(host, legacy)?.id ?? null);
    }
  });

  it('keep playing the same sound, to within half a step', () => {
    const before = legacy[0].curve!;
    const after = quantizeRules(legacy)[0].curve!;
    before.gains.forEach((g, i) => expect(Math.abs(after.gains[i] - g)).toBeLessThanOrEqual(GAIN_STEP / 2 + 1e-9));
  });

  it('reclaim their wasted space on the first save', () => {
    // The upgrade path: an install already near the ceiling gets the room back without the user
    // doing anything beyond their next edit.
    expect(JSON.stringify(quantizeRules(legacy)).length).toBeLessThan(JSON.stringify(legacy).length * 0.65);
  });
});
