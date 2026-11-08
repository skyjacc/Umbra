import { describe, it, expect } from 'vitest';
import { commitDecision, COMMIT_DEBOUNCE_MS, MAX_COMMIT_WAIT_MS } from './commit-policy';

describe('commitDecision', () => {
  it('opens a window when nothing is pending', () => {
    expect(commitDecision({ armed: false, windowOpenedAt: 0, now: 1000 })).toBe('schedule');
  });

  it('pushes the write out while inside the ceiling', () => {
    expect(commitDecision({ armed: true, windowOpenedAt: 1000, now: 1100 })).toBe('reschedule');
  });

  it('writes once the ceiling is reached', () => {
    expect(commitDecision({ armed: true, windowOpenedAt: 1000, now: 1000 + MAX_COMMIT_WAIT_MS })).toBe('commit-now');
  });

  it('writes past the ceiling too', () => {
    expect(commitDecision({ armed: true, windowOpenedAt: 1000, now: 9000 })).toBe('commit-now');
  });

  it('bounds a held key: a plain debounce would never fire, this one does', () => {
    // Auto-repeat delivers an edit roughly every 33ms. A trailing debounce alone resets on each
    // one and never fires while the key is held — the exact hole this ceiling exists to close.
    const start = 0;
    let opened = start;
    let armed = false;
    let commits = 0;

    for (let t = start; t <= 3000; t += 33) {
      const d = commitDecision({ armed, windowOpenedAt: opened, now: t });
      if (d === 'schedule') {
        armed = true;
        opened = t;
      } else if (d === 'commit-now') {
        commits++;
        armed = false; // the write happened; the next edit opens a fresh window
      }
    }

    expect(commits).toBeGreaterThan(0);
    // Roughly one write per ceiling over the hold, not one per keypress.
    expect(commits).toBeLessThanOrEqual(Math.ceil(3000 / MAX_COMMIT_WAIT_MS));
  });

  it('a burst shorter than the ceiling still coalesces into one write', () => {
    // The batching the debounce exists for must survive: a quick flurry of edits must not turn
    // into a write per edit.
    let opened = 0;
    let armed = false;
    let immediate = 0;

    for (let t = 0; t <= 150; t += 33) {
      const d = commitDecision({ armed, windowOpenedAt: opened, now: t });
      if (d === 'schedule') {
        armed = true;
        opened = t;
      } else if (d === 'commit-now') immediate++;
    }

    expect(immediate).toBe(0); // the trailing timer handles it, no forced write
  });

  it('honours a caller-supplied ceiling', () => {
    expect(commitDecision({ armed: true, windowOpenedAt: 0, now: 50, maxWaitMs: 40 })).toBe('commit-now');
    expect(commitDecision({ armed: true, windowOpenedAt: 0, now: 30, maxWaitMs: 40 })).toBe('reschedule');
  });

  it('keeps the ceiling above the debounce, or the debounce could never complete', () => {
    expect(MAX_COMMIT_WAIT_MS).toBeGreaterThan(COMMIT_DEBOUNCE_MS);
  });
});
