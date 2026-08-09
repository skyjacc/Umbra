import { describe, it, expect } from 'vitest';
import {
  NO_PREVIEW,
  NO_BASELINE,
  previewForDrag,
  previewForBypass,
  captureBaseline,
  owesGlobalRestore,
  type Baseline,
  type SavedTarget
} from './edit-state';
import { flatBands } from './engine-io';
import type { Band } from './audio';

const curve = (gain: number): Band[] => flatBands().map((b) => ({ ...b, gain }));

const FLAT = flatBands();

const GLOBAL: SavedTarget = { kind: 'global' };
const RULE: SavedTarget = { kind: 'rule', id: 'r1' };


describe('captureBaseline', () => {
  const g = { bands: curve(1), gain: 1, presetName: '' };

  it('latches the global profile and the target', () => {
    const b = captureBaseline(NO_BASELINE, { target: GLOBAL, global: g, rule: null });
    expect(b.has).toBe(true);
    expect(b.target).toEqual(GLOBAL);
    expect(b.global!.bands[0].gain).toBe(1);
  });

  it('snapshots rather than aliasing the live array', () => {
    const live = { bands: curve(1), gain: 1, presetName: '' };
    const b = captureBaseline(NO_BASELINE, { target: GLOBAL, global: live, rule: null });
    live.bands[0].gain = 99; // the popup keeps mutating its own arrays
    expect(b.global!.bands[0].gain).toBe(1);
  });

  it('distinguishes "no stored profile" from "not latched"', () => {
    // readDefaultEq returns null on a fresh install, so null is a real value to restore to.
    const b = captureBaseline(NO_BASELINE, { target: GLOBAL, global: null, rule: null });
    expect(b.has).toBe(true);
    expect(b.global).toBeNull();
    expect(NO_BASELINE.has).toBe(false);
  });

  it('never replaces an existing baseline — every writer, in sequence', () => {
    // Regression guard for the trap this exists to prevent: one writer guards with
    // `if (!has) capture()` and another calls capture() unconditionally, so the second commit
    // overwrites the baseline with an already-mutated value and a later restore "restores" the
    // damage. Runs all four writers from invariant 8 back to back.
    const original = { bands: curve(0), gain: 1, presetName: '' };
    let b: Baseline = captureBaseline(NO_BASELINE, { target: GLOBAL, global: original, rule: null });

    // commitTarget (drag), commitTarget (second drag), applyPreset, resetProfile
    for (const mutated of [curve(3), curve(5), curve(7), curve(9)]) {
      b = captureBaseline(b, { target: GLOBAL, global: { bands: mutated, gain: 1, presetName: '' }, rule: null });
    }

    expect(b.global!.bands.every((x) => x.gain === 0)).toBe(true);
  });

  it('keeps the first target even if a later mutation would pick a different one', () => {
    let b = captureBaseline(NO_BASELINE, { target: GLOBAL, global: { bands: curve(0), gain: 1, presetName: '' }, rule: null });
    b = captureBaseline(b, { target: RULE, global: null, rule: { id: 'r1' } });
    expect(b.target).toEqual(GLOBAL);
  });

  it('snapshots a rule deeply', () => {
    const rule = { id: 'r1', patterns: ['youtube.com'], curve: { gains: [1, 2] } };
    const b = captureBaseline(NO_BASELINE, { target: RULE, global: null, rule });
    (rule.curve.gains as number[])[0] = 99;
    expect((b.rule as typeof rule).curve.gains[0]).toBe(1);
  });
});

describe('owesGlobalRestore', () => {
  it('is owed when the session first mutated the global profile', () => {
    const b = captureBaseline(NO_BASELINE, { target: GLOBAL, global: { bands: curve(0), gain: 1, presetName: '' }, rule: null });
    expect(owesGlobalRestore(b)).toBe(true);
  });

  it('is not owed when the session was editing a rule all along', () => {
    // Editing a ruled site never touched the global profile, so "Save for this site" has nothing
    // to undo — it just rewrites the same rule.
    const b = captureBaseline(NO_BASELINE, { target: RULE, global: null, rule: { id: 'r1' } });
    expect(owesGlobalRestore(b)).toBe(false);
  });

  it('is not owed before anything was latched', () => {
    expect(owesGlobalRestore(NO_BASELINE)).toBe(false);
  });
});

describe('preview lifecycle', () => {
  it('clearing returns to the resolved profile', () => {
    // Reachable case behind "preview must not outlive its tab": the active tab can leave the
    // captured set (user pressed Stop, or the browser revoked the stream) while a preview is
    // live. Clearing must hand the tab straight back to its stored sound.
    expect(previewForBypass(FLAT).has).toBe(true);
    expect(NO_PREVIEW.has).toBe(false);
  });

  it('records its source so a save can tell drag from bypass', () => {
    expect(previewForDrag().source).toBe('drag');
    expect(previewForBypass(FLAT).source).toBe('bypass');
    expect(NO_PREVIEW.source).toBeNull();
  });
});
