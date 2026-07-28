import { describe, it, expect } from 'vitest';
import { encodeShare, decodeShare, sanitizeImportedRules, presetToBands } from './engine-io';
import { NUM_FILTERS } from './audio';

describe('share codes — round-trip', () => {
  it('round-trips presets with a Cyrillic + emoji name (UTF-8 safe)', () => {
    const payload = { presets: { 'Бас 🔥': { frequencies: [20], gains: [6], qs: [0.7] } } };
    const code = encodeShare(payload);
    expect(code.startsWith('UMBRA1:')).toBe(true);
    const back = decodeShare(code);
    expect(back?.presets?.['Бас 🔥']).toBeTruthy();
  });

  it('round-trips rules', () => {
    const payload = { rules: [{ id: 'x', patterns: ['youtube.'], mode: 'preset' as const, preset: 'P', enabled: true }] };
    const back = decodeShare(encodeShare(payload));
    expect(back?.rules?.[0].patterns).toEqual(['youtube.']);
  });

  it('accepts a bare base64 body without the UMBRA1: prefix', () => {
    const full = encodeShare({ presets: {} });
    const body = full.slice('UMBRA1:'.length);
    expect(decodeShare(body)).toEqual({ presets: {} });
  });

  it('garbage / empty → null', () => {
    expect(decodeShare('not a code')).toBeNull();
    expect(decodeShare('')).toBeNull();
  });
});

describe('sanitizeImportedRules', () => {
  it('coerces non-string patterns to strings (would otherwise crash matchRule)', () => {
    const out = sanitizeImportedRules([{ patterns: [123, 'YouTube.'], mode: 'preset', preset: 'P' }]);
    expect(out).toHaveLength(1);
    expect(out[0].patterns).toEqual(['123', 'youtube.']);
    expect(out[0].id.startsWith('r_')).toBe(true);
  });

  it('drops curve rules with no valid curve', () => {
    expect(sanitizeImportedRules([{ patterns: ['x.'], mode: 'curve' }])).toEqual([]);
  });

  it('keeps curve rules with a valid curve', () => {
    const out = sanitizeImportedRules([
      { patterns: ['x.'], mode: 'curve', curve: { frequencies: [20], gains: [6], qs: [0.7] } }
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].curve?.frequencies).toHaveLength(11);
  });

  it('drops preset rules with empty patterns or no preset name', () => {
    expect(sanitizeImportedRules([{ patterns: [], mode: 'preset', preset: 'P' }])).toEqual([]);
    expect(sanitizeImportedRules([{ patterns: ['x.'], mode: 'preset' }])).toEqual([]);
  });

  it('non-array input → empty', () => {
    expect(sanitizeImportedRules(null)).toEqual([]);
    expect(sanitizeImportedRules({})).toEqual([]);
  });
});

describe('presetToBands — defensive coercion', () => {
  it('does not throw on an un-coercible preset and returns NUM_FILTERS finite bands', () => {
    // A legacy/tampered PRESETS.* shape coerceBands rejects (no frequencies/gains/qs arrays). Before
    // the guard this threw a TypeError and, via resolvedFor/applyEverywhere, killed the engine for
    // every captured tab.
    const bad = { eq: [1, 2, 3] } as any;
    expect(() => presetToBands(bad)).not.toThrow();
    const bands = presetToBands(bad);
    expect(bands).toHaveLength(NUM_FILTERS);
    expect(bands.every((b) => Number.isFinite(b.frequency) && Number.isFinite(b.gain) && Number.isFinite(b.q))).toBe(true);
  });

  it('preserves a valid preset', () => {
    const bands = presetToBands({ frequencies: [100], gains: [6], qs: [1] } as any);
    expect(bands).toHaveLength(NUM_FILTERS);
    expect(Number.isFinite(bands[0].gain)).toBe(true);
  });
});
