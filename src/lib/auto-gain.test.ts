import { describe, it, expect } from 'vitest';
import { AUTO_GAIN_DEFAULT, compensationDb, outputGain } from './auto-gain';
import { flatBands } from './engine-io';
import { masterGainToDb, MASTER_DB_MAX, MASTER_DB_MIN } from './audio';
import type { Band } from './audio';

const shaped = (...gains: number[]): Band[] => flatBands().map((b, i) => ({ ...b, gain: gains[i] ?? 0 }));
const all = (g: number): Band[] => flatBands().map((b) => ({ ...b, gain: g }));
const FLAT = flatBands();

describe('it is off until asked for', () => {
  it('defaults to off', () => {
    expect(AUTO_GAIN_DEFAULT).toBe(false);
  });

  it('changes nothing at all while off', () => {
    // Not "approximately nothing". Turning the feature on must be the only thing that alters the
    // sound, so while it is off the number handed to the engine is the user's own, untouched.
    for (const bands of [FLAT, all(9), all(-9), shaped(12, -3, 6)]) {
      for (const userGain of [1, 0.5, 2, 0.031]) {
        expect(outputGain({ userGain, bands, on: false })).toBe(userGain);
      }
    }
  });
});

describe('what it compensates for', () => {
  it('reports nothing to compensate on a flat curve', () => {
    expect(compensationDb(FLAT)).toBe(0);
  });

  it('reports the average boost the curve adds', () => {
    expect(compensationDb(all(6))).toBeCloseTo(6, 9);
    expect(compensationDb(all(-6))).toBeCloseTo(-6, 9);
  });

  it('averages rather than taking the peak', () => {
    // One band lifted by 11 dB out of eleven is not an 11 dB louder track. Peak-matching would
    // duck the whole tab for a single narrow boost, which is worse than not compensating.
    const one = shaped(11);
    expect(compensationDb(one)).toBeCloseTo(1, 9);
  });
});

describe('what the engine is told to play', () => {
  it('turns a boost into a quieter master, and a cut into a louder one', () => {
    expect(outputGain({ userGain: 1, bands: all(6), on: true })).toBeLessThan(1);
    expect(outputGain({ userGain: 1, bands: all(-6), on: true })).toBeGreaterThan(1);
  });

  it('leaves a flat curve exactly alone even when on', () => {
    expect(outputGain({ userGain: 0.7, bands: FLAT, on: true })).toBeCloseTo(0.7, 12);
  });

  it('halves the figure, because the two dB scales here are different', () => {
    // Band gains are amplitude dB; the master is 10*log10, i.e. half as many dB for the same
    // change in level. Compensating one-for-one would overshoot by a factor of two.
    const out = outputGain({ userGain: 1, bands: all(6), on: true });
    expect(masterGainToDb(out)).toBeCloseTo(-3, 6);
  });

  it('rides on top of the volume the user set, rather than replacing it', () => {
    const user = 2;
    const out = outputGain({ userGain: user, bands: all(6), on: true });
    expect(masterGainToDb(out)).toBeCloseTo(masterGainToDb(user) - 3, 6);
  });

  it('stays inside the master range whatever the curve does', () => {
    for (const bands of [all(30), all(-30), shaped(30, 30, 30, -30)]) {
      for (const userGain of [1, 8, 0.01]) {
        const db = masterGainToDb(outputGain({ userGain, bands, on: true }));
        expect(db).toBeLessThanOrEqual(MASTER_DB_MAX + 1e-9);
        expect(db).toBeGreaterThanOrEqual(MASTER_DB_MIN - 1e-9);
      }
    }
  });

  it('does not drift when applied to its own output', () => {
    // outputGain is a rendering of state, not a mutation of it: the stored gain never becomes the
    // compensated one, so the same inputs always give the same answer. If this ever stopped being
    // true, every message to the engine would duck the tab a little further.
    const bands = all(6);
    const once = outputGain({ userGain: 1, bands, on: true });
    expect(outputGain({ userGain: 1, bands, on: true })).toBe(once);
  });
});
