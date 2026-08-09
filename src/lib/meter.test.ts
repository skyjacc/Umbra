import { describe, it, expect } from 'vitest';
import { METER_INIT, stepMeter, meterDb, DECAY_DB_PER_SEC, HOLD_MS, CLIP_MS, type MeterState } from './meter';

/** Feed a run of frames at a fixed rate, the way the rAF poll does. */
const run = (start: MeterState, peaks: number[], t0 = 1000, dt = 16) =>
  peaks.reduce((s, peak, i) => stepMeter(s, { peak, now: t0 + i * dt }), start);

describe('it follows a rise immediately', () => {
  it('jumps straight to a new peak', () => {
    // Attack is instant on purpose: a meter that ramps up under-reads exactly the transient the
    // user is trying to catch.
    const s = stepMeter(METER_INIT, { peak: 0.5, now: 1000 });
    expect(s.level).toBe(0.5);
  });

  it('keeps rising with the signal', () => {
    const s = run(METER_INIT, [0.2, 0.4, 0.9]);
    expect(s.level).toBe(0.9);
  });
});

describe('it falls back at a readable rate', () => {
  it('decays instead of dropping to the next sample', () => {
    // Without decay the bar would flicker at frame rate on ordinary music and read as noise.
    const loud = stepMeter(METER_INIT, { peak: 1, now: 1000 });
    const after = stepMeter(loud, { peak: 0, now: 1100 });
    expect(after.level).toBeGreaterThan(0);
    expect(after.level).toBeLessThan(1);
  });

  it('decays by wall clock, not by frame count', () => {
    // The poll is rAF-driven, so the interval is whatever the machine gives. The SAME 100ms must
    // fall the same distance whether it arrived as two frames or as ten, or the meter would read
    // differently on a busy tab than on an idle one.
    const overMs = (total: number, dt: number) => {
      let s = stepMeter(METER_INIT, { peak: 1, now: 0 });
      for (let t = dt; t <= total; t += dt) s = stepMeter(s, { peak: 0, now: t });
      return meterDb(s.level);
    };
    expect(overMs(100, 50)).toBeCloseTo(overMs(100, 10), 6);
    expect(overMs(100, 50)).toBeCloseTo(-4, 4); // 40 dB/s for 100ms
  });

  it('falls at the stated rate', () => {
    const loud = stepMeter(METER_INIT, { peak: 1, now: 0 });
    const later = stepMeter(loud, { peak: 0, now: 1000 });
    expect(meterDb(later.level)).toBeCloseTo(-DECAY_DB_PER_SEC, 4);
  });

  it('reaches silence rather than creeping towards it forever', () => {
    const s = run(stepMeter(METER_INIT, { peak: 1, now: 0 }), Array(200).fill(0), 0, 50);
    expect(s.level).toBe(0);
  });
});

describe('the held peak', () => {
  it('stays put while the level falls away beneath it', () => {
    const loud = stepMeter(METER_INIT, { peak: 0.8, now: 0 });
    const after = stepMeter(loud, { peak: 0.1, now: 200 });
    expect(after.hold).toBe(0.8);
    expect(after.level).toBeLessThan(0.8);
  });

  it('gives way to a louder peak at once', () => {
    const s = run(METER_INIT, [0.4, 0.95], 0, 16);
    expect(s.hold).toBe(0.95);
  });

  it('expires so it does not sit there forever', () => {
    const loud = stepMeter(METER_INIT, { peak: 0.8, now: 0 });
    const after = stepMeter(loud, { peak: 0.05, now: HOLD_MS + 50 });
    expect(after.hold).toBeLessThan(0.8);
  });
});

describe('clipping', () => {
  it('latches at and above full scale', () => {
    expect(stepMeter(METER_INIT, { peak: 1, now: 0 }).clipUntil).toBeGreaterThan(0);
    expect(stepMeter(METER_INIT, { peak: 1.4, now: 0 }).clipUntil).toBeGreaterThan(0);
  });

  it('does not latch below it', () => {
    expect(stepMeter(METER_INIT, { peak: 0.99, now: 0 }).clipUntil).toBe(0);
  });

  it('stays lit long enough to be seen, then clears', () => {
    // A single clipped frame is 16ms. Without a hold the warning would be invisible in practice.
    const clipped = stepMeter(METER_INIT, { peak: 1.2, now: 0 });
    expect(stepMeter(clipped, { peak: 0.1, now: CLIP_MS - 50 }).clipUntil).toBeGreaterThan(0);
    expect(stepMeter(clipped, { peak: 0.1, now: CLIP_MS + 50 }).clipUntil).toBe(0);
  });
});

describe('reading it as decibels', () => {
  it('calls full scale zero', () => {
    expect(meterDb(1)).toBeCloseTo(0, 9);
  });

  it('is amplitude dB, matching the band gains rather than the master scale', () => {
    expect(meterDb(0.5)).toBeCloseTo(-6.0206, 3);
  });

  it('has a floor instead of minus infinity', () => {
    expect(Number.isFinite(meterDb(0))).toBe(true);
    expect(meterDb(0)).toBeLessThan(-50);
  });
});

describe('bad input cannot wedge it', () => {
  it('ignores a non-finite peak', () => {
    const s = stepMeter(METER_INIT, { peak: NaN, now: 0 });
    expect(s.level).toBe(0);
    expect(Number.isFinite(s.level)).toBe(true);
  });

  it('ignores a clock that goes backwards', () => {
    const a = stepMeter(METER_INIT, { peak: 0.8, now: 1000 });
    const b = stepMeter(a, { peak: 0, now: 500 });
    expect(b.level).toBeLessThanOrEqual(0.8);
    expect(b.level).toBeGreaterThanOrEqual(0);
  });
});
