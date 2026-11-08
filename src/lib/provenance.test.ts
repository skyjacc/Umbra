import { describe, it, expect } from 'vitest';
import { provenanceOf } from './provenance';
import type { PresetBands } from './presets';

// Eleven bands, because presetBandsEqual walks NUM_FILTERS and a short array compares NaN to NaN.
const FREQS = [20, 40, 80, 160, 320, 640, 1300, 2600, 5100, 10000, 20000];
const bands = (...gains: number[]): PresetBands => ({
  frequencies: [...FREQS],
  gains: FREQS.map((_, i) => gains[i] ?? 0),
  qs: FREQS.map(() => 0.7071067811865476)
});

const VOCAL = bands(3, 0, -2);
const MOVIE = bands(-1, 4, 5);

describe('provenanceOf', () => {
  it('says nothing when the curve came from no preset', () => {
    expect(provenanceOf({ presetName: '', current: bands(1, 1, 1), named: null })).toEqual({ kind: 'none' });
  });

  it('names the preset while the curve still is that preset', () => {
    expect(provenanceOf({ presetName: 'Vocal', current: VOCAL, named: VOCAL })).toEqual({ kind: 'exact', name: 'Vocal' });
  });

  it('keeps the name but drops the claim of equality once a band moves', () => {
    // The distinction the header renders: "Vocal" versus "Based on Vocal". The curve came from
    // Vocal and no longer is Vocal, and both halves of that are worth saying.
    const nudged = bands(3.4, 0, -2);
    expect(provenanceOf({ presetName: 'Vocal', current: nudged, named: VOCAL })).toEqual({ kind: 'based-on', name: 'Vocal' });
  });

  it('goes back to an exact match if the band is dragged back', () => {
    // Provenance is derived, not latched, so undoing an edit by hand undoes the "based on" too.
    // A stored `edited` flag would have stayed stuck.
    expect(provenanceOf({ presetName: 'Vocal', current: bands(3, 0, -2), named: VOCAL })).toEqual({
      kind: 'exact',
      name: 'Vocal'
    });
  });

  it('follows the last preset picked, not the first', () => {
    expect(provenanceOf({ presetName: 'Movie', current: MOVIE, named: MOVIE })).toEqual({ kind: 'exact', name: 'Movie' });
    const nudged = bands(-1, 4, 5.2);
    expect(provenanceOf({ presetName: 'Movie', current: nudged, named: MOVIE })).toEqual({ kind: 'based-on', name: 'Movie' });
  });

  it('compares on the storage grid, not on raw floats', () => {
    // Without this the feature would break itself: a curve is rounded on its way into storage, so
    // the copy read back would never equal the preset it came from and every preset would read
    // "Based on" the moment the popup was reopened.
    const stored = bands(3.00004, 0.00002, -2.00001);
    expect(provenanceOf({ presetName: 'Vocal', current: stored, named: VOCAL })).toEqual({ kind: 'exact', name: 'Vocal' });
  });

  it('does not claim equality with a preset it cannot see', () => {
    // Deleted preset, or a rule naming one that never synced. "Based on" is the honest answer:
    // the name is where the curve came from, and equality is simply not checkable.
    expect(provenanceOf({ presetName: 'Vocal', current: VOCAL, named: null })).toEqual({
      kind: 'based-on',
      name: 'Vocal'
    });
  });

  it('ignores master gain by construction', () => {
    // Master volume is not part of the curve, so moving it cannot change where the curve came
    // from. Recorded as a test because the requirement was explicit, even though the type makes
    // it unrepresentable.
    expect(provenanceOf({ presetName: 'Vocal', current: VOCAL, named: VOCAL })).toEqual({ kind: 'exact', name: 'Vocal' });
  });

  it('treats a differently shaped curve as based-on rather than throwing', () => {
    const short: PresetBands = { frequencies: [20, 40], gains: [3, 0], qs: [0.7071067811865476, 0.7071067811865476] };
    expect(provenanceOf({ presetName: 'Vocal', current: short, named: VOCAL })).toEqual({
      kind: 'based-on',
      name: 'Vocal'
    });
  });
});
