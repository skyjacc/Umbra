import { describe, it, expect } from 'vitest';
import { freqToX, xToFreq, dbToY, yToDb, biquadCoefficients, filterType, gainDbText } from './audio';
import { normalizePresets, coerceBands } from './presets';
import { BUILTIN_PRESETS, BUILTIN_ORDER } from './builtins';

describe('coordinate transforms', () => {
  for (const f of [20, 200, 2000, 20000]) {
    it(`freqToX/xToFreq round-trips ${f}`, () => expect(xToFreq(freqToX(f))).toBeCloseTo(f, 2));
  }
  for (const db of [-20, 0, 15]) {
    it(`dbToY/yToDb round-trips ${db}`, () => expect(yToDb(dbToY(db))).toBeCloseTo(db, 6));
  }
});

describe('biquad', () => {
  it('coeffs finite', () => {
    const c = biquadCoefficients('peaking', 1000, 0.7071, 6, 44100) as unknown as Record<string, number>;
    for (const k of ['b0', 'b1', 'b2', 'a1', 'a2']) expect(Number.isFinite(c[k])).toBe(true);
  });
});

describe('filterType', () => {
  it('0=lowshelf', () => expect(filterType(0)).toBe('lowshelf'));
  it('10=highshelf', () => expect(filterType(10)).toBe('highshelf'));
  it('5=peaking', () => expect(filterType(5)).toBe('peaking'));
});

describe('gainDbText', () => {
  it('unity', () => expect(gainDbText(1)).toBe('0'));
  it('boost', () => expect(gainDbText(Math.pow(10, 4 / 10))).toBe('+4'));
});

describe('builtin presets', () => {
  it('each has 11 valid bands', () => {
    for (const name of BUILTIN_ORDER) {
      const p = BUILTIN_PRESETS[name];
      expect(p, name).toBeTruthy();
      expect(p.frequencies.length).toBe(11);
      expect(p.gains.length).toBe(11);
      expect(p.qs.length).toBe(11);
      expect(coerceBands(p)).not.toBeNull();
    }
  });
});

describe('presets', () => {
  it('legacy format imports', () => {
    const p = normalizePresets({ Bass: { frequencies: [20], gains: [6], qs: [0.7] } });
    expect(Object.keys(p)).toContain('Bass');
    expect(p.Bass.frequencies.length).toBe(11);
  });
  it('array + alt-keys imports', () => {
    const p = normalizePresets([{ name: 'A', freqs: [20], g: [3], q: [0.7] }]);
    expect(Object.keys(p)).toContain('A');
  });
  it('single object -> Imported', () => {
    const p = normalizePresets({ frequencies: [20], gains: [1], qs: [0.7] });
    expect(Object.keys(p)).toContain('Imported');
  });
  it('malformed skipped', () => {
    const p = normalizePresets({ Good: { frequencies: [20], gains: [1], qs: [0.7] }, Bad: { nope: true } });
    expect(Object.keys(p)).toEqual(['Good']);
  });
  it('__proto__ not polluting', () => {
    const payload = JSON.parse('{"__proto__":{"frequencies":[20],"gains":[1],"qs":[0.7]}}');
    const p = normalizePresets(payload);
    expect(({} as Record<string, unknown>).frequencies).toBeUndefined();
    expect(Object.keys(p)).not.toContain('__proto__');
  });
  it('garbage -> empty', () => expect(Object.keys(normalizePresets('nope' as unknown))).toHaveLength(0));
  it('null -> empty', () => expect(Object.keys(normalizePresets(null))).toHaveLength(0));
  it('coerceBands clamps out-of-range', () => {
    const b = coerceBands({ frequencies: [999999], gains: [99], qs: [99] })!;
    expect(b.gains[0]).toBeLessThanOrEqual(30);
    expect(b.frequencies[0]).toBeLessThanOrEqual(22000);
    expect(b.qs[0]).toBeLessThanOrEqual(11);
  });
  it('coerceBands preserves the top band (20480 Hz) — clamp ceiling must not truncate it', () => {
    const b = coerceBands({ frequencies: [20480], gains: [0], qs: [0.7071] })!;
    expect(b.frequencies[0]).toBe(20480);
  });
});
