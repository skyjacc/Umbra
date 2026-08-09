// Where the curve on screen came from.
//
// `presetName` was always meant to be provenance rather than a claim of equality — the popup just
// erased it on the first pointer move and again on every commit, so a hand-tweaked preset became
// an anonymous curve about 200ms after the user touched it. Nothing else was wrong with the field,
// which is why there is no new one here: what the header needs is a reading of the existing state,
// not another copy of it.
//
// The two readings the header distinguishes:
//   exact     the curve IS that preset             ->  "Vocal"
//   based-on  the curve CAME FROM that preset      ->  "Based on Vocal"
//
// Derived, never latched. Drag a band away and back and the header returns to "Vocal", because the
// curve really is Vocal again — a stored `edited` flag would have stayed stuck on.

import { presetBandsEqual, type PresetBands } from './presets';
import { quantizeCurve } from './quantize';

export type Provenance = { kind: 'none' } | { kind: 'exact'; name: string } | { kind: 'based-on'; name: string };

export function provenanceOf(input: { presetName: string; current: PresetBands; named: PresetBands | null }): Provenance {
  const name = input.presetName;
  if (!name) return { kind: 'none' };

  // A preset that was deleted, or one from a rule that never synced to this machine. The name is
  // still where the curve came from; equality is simply not checkable, so it is not claimed.
  if (!input.named) return { kind: 'based-on', name };

  // Compared on the storage grid. A curve is rounded on its way into storage (see quantize.ts), so
  // raw comparison would find the copy read back unequal to the preset it came from, and every
  // preset would read "Based on" the moment the popup was reopened.
  const same = presetBandsEqual(quantizeCurve(input.current), quantizeCurve(input.named));
  return same ? { kind: 'exact', name } : { kind: 'based-on', name };
}
