import { describe, it, expect } from 'vitest';
import { stepKind, nudge, parseField, formatField, type BandField } from './band-input';
import { clampFreq, clampGainDb, clampQ, DB_TOP, DB_BOTTOM } from './audio';

describe('which step a modifier asks for', () => {
  it('is normal with nothing held', () => {
    expect(stepKind({})).toBe('normal');
  });

  it('is coarse with Shift and fine with Alt', () => {
    expect(stepKind({ shift: true })).toBe('coarse');
    expect(stepKind({ alt: true })).toBe('fine');
  });

  it('lets fine win when both are held', () => {
    // Arbitrary but it has to be decided somewhere: the careful modifier beats the fast one, so a
    // stray Shift cannot turn a precise adjustment into a large one.
    expect(stepKind({ shift: true, alt: true })).toBe('fine');
  });
});

describe('nudging a value', () => {
  it('moves gain in decibels, and the modifiers change how far', () => {
    expect(nudge('gain', 0, 1, 'normal')).toBeCloseTo(1, 9);
    expect(nudge('gain', 0, 1, 'coarse')).toBeGreaterThan(nudge('gain', 0, 1, 'normal'));
    expect(nudge('gain', 0, 1, 'fine')).toBeLessThan(nudge('gain', 0, 1, 'normal'));
    expect(nudge('gain', 0, -1, 'normal')).toBeCloseTo(-1, 9);
  });

  it('moves frequency by ratio, not by hertz', () => {
    // A fixed number of hertz is a huge step at 20 Hz and imperceptible at 20 kHz. Musically the
    // useful unit is a fraction of an octave, which is what the dot drag already feels like.
    const lowUp = nudge('frequency', 100, 1, 'normal') / 100;
    const highUp = nudge('frequency', 10000, 1, 'normal') / 10000;
    expect(lowUp).toBeCloseTo(highUp, 9);
    expect(lowUp).toBeGreaterThan(1);
  });

  it('returns to where it started after up then down', () => {
    for (const f of ['frequency', 'gain', 'q'] as BandField[]) {
      const start = f === 'frequency' ? 1000 : f === 'q' ? 1 : 3;
      expect(nudge(f, nudge(f, start, 1, 'normal'), -1, 'normal')).toBeCloseTo(start, 6);
    }
  });

  it('never leaves the range the engine accepts', () => {
    expect(nudge('gain', DB_TOP, 1, 'coarse')).toBe(clampGainDb(DB_TOP));
    expect(nudge('gain', DB_BOTTOM, -1, 'coarse')).toBe(clampGainDb(DB_BOTTOM));
    expect(nudge('frequency', 21999, 1, 'coarse')).toBe(clampFreq(nudge('frequency', 21999, 1, 'coarse')));
    expect(nudge('q', 0.2, -1, 'coarse')).toBe(clampQ(0.2));
    expect(nudge('q', 11, 1, 'coarse')).toBe(clampQ(11));
  });
});

describe('reading what was typed', () => {
  it('takes a plain number', () => {
    expect(parseField('frequency', '437')).toBe(437);
    expect(parseField('gain', '-19.7')).toBeCloseTo(-19.7, 9);
    expect(parseField('q', '0.71')).toBeCloseTo(0.71, 9);
  });

  it('takes the k the readout itself prints', () => {
    // The graph labels the axis "1.3k" and "10k", so someone reading a value off the screen and
    // typing it back must get what they read.
    expect(parseField('frequency', '1.3k')).toBeCloseTo(1300, 6);
    expect(parseField('frequency', '10K')).toBe(10000);
  });

  it('takes a leading plus and stray spaces', () => {
    expect(parseField('gain', ' +3 ')).toBe(3);
  });

  it('takes a comma for a decimal point', () => {
    expect(parseField('gain', '-19,7')).toBeCloseTo(-19.7, 9);
  });

  it('ignores a unit typed after the number', () => {
    expect(parseField('frequency', '437 Hz')).toBe(437);
    expect(parseField('gain', '-6 dB')).toBe(-6);
  });

  it('refuses what is not a number at all', () => {
    for (const bad of ['', '   ', 'abc', '-', '.', 'Hz']) {
      expect(parseField('gain', bad), bad).toBeNull();
    }
  });

  it('clamps rather than rejecting an out-of-range number', () => {
    // Typing 9999 dB is a mistake, not an attack. Snapping to the ceiling explains itself; an
    // error message for a field with no visible range does not.
    expect(parseField('gain', '9999')).toBe(clampGainDb(9999));
    expect(parseField('frequency', '999999')).toBe(clampFreq(999999));
    expect(parseField('q', '0')).toBe(clampQ(0));
  });

  it('goes through the same clamps the drag does, not its own', () => {
    for (const v of [-1e9, -1, 0, 0.5, 5, 1e9]) {
      expect(parseField('q', String(v))).toBe(clampQ(v));
    }
  });
});

describe('printing a value back', () => {
  it('round-trips through parse', () => {
    for (const [f, v] of [
      ['frequency', 437],
      ['gain', -19.7],
      ['q', 0.71]
    ] as [BandField, number][]) {
      expect(parseField(f, formatField(f, v))).toBeCloseTo(v, 1);
    }
  });

  it('prints whole hertz and one decimal of gain, matching the readout', () => {
    expect(formatField('frequency', 437.4)).toBe('437');
    expect(formatField('gain', -19.73)).toBe('-19.7');
    expect(formatField('q', 0.7071)).toBe('0.71');
  });
});
