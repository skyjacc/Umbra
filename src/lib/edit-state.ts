// The editing model: what is SAVED, what the engine is actually playing, and the one-shot snapshot
// that lets a later action undo a side effect it did not intend.
//
// Background. The popup is the source of truth (the offscreen engine has no chrome.storage), and
// until now every way of changing the sound also wrote it: a drag commits 200ms after release, a
// preset commits immediately. That left no way to say "play this, but don't save it" — which is
// what Bypass, A/B and hold-to-compare all need, and what makes "Save for this site" honest.
//
// PREVIEW is that missing concept. It is NOT a second copy of the curve: the curve being edited
// already lives in the popup's editing buffer. Preview only records that the engine is playing
// something other than what `resolvedFor(host)` would return, and (for bypass) what that something
// is. Consequence worth stating plainly: what gets SAVED is always the editing buffer, never the
// override — so "bypass then save" stores the real curve, with no special case to forget.

import type { Band } from './audio';

/** Which stored profile an edit belongs to. A ruled site edits its rule; anything else is global. */
export type SavedTarget = { kind: 'global' } | { kind: 'rule'; id: string };

export type PreviewSource = 'drag' | 'bypass';

export interface Preview {
  /** True when the engine is playing something other than resolvedFor(activeHost). */
  has: boolean;
  /**
   * What it is playing instead. `null` does NOT mean "no preview" — with has=true it means
   * "the current editing buffer", which is the live drag case. Presence is `has` and only `has`.
   */
  overrideBands: Band[] | null;
  source: PreviewSource | null;
}

export interface BaselineValue {
  bands: Band[];
  gain: number;
  /**
   * Which preset this curve came from. Part of the snapshot rather than an extra, because putting
   * a profile back without its provenance is not putting it back: the header would read "None"
   * for a curve that is still, and visibly, Vocal. Empty on profiles stored before the field
   * existed, which is what "came from nowhere" means.
   */
  presetName: string;
}

export interface Baseline {
  /**
   * Explicit, because `null` is a legitimate captured value: readDefaultEq returns null on a
   * fresh install, so `if (!baseline.value)` would never latch on first run.
   */
  has: boolean;
  target: SavedTarget | null;
  /** The global profile as it stood before the first mutation of this popup session. */
  global: BaselineValue | null;
  /** The whole rule as it stood, when the first mutated target was a rule. */
  rule: unknown | null;
}

export const NO_PREVIEW: Preview = { has: false, overrideBands: null, source: null };
export const NO_BASELINE: Baseline = { has: false, target: null, global: null, rule: null };

/** Bands are handed around live; a snapshot must not alias the array it snapshots. */
const cloneBands = (bands: Band[]): Band[] => bands.map((b) => ({ ...b }));

export function previewForDrag(): Preview {
  return { has: true, overrideBands: null, source: 'drag' };
}

export function previewForBypass(flat: Band[]): Preview {
  return { has: true, overrideBands: cloneBands(flat), source: 'bypass' };
}

// Two functions used to live here — engineBandsFor(preview, editing, resolved) and
// bandsForSave(editing) — and neither was ever imported by the popup. They were removed once that
// was measured rather than assumed: no production import, no re-export, and no trace of either in
// the built bundle. Recording what they were for, because the questions they were answering are
// still open and the answers now live in less obvious places.
//
// bandsForSave was `editing => editing`. An identity function cannot hold an invariant: its tests
// asserted that identity is identity, and stayed green through a deliberate change that made the
// save store a flat curve. The rule it meant — a save writes the editing buffer, never the
// override, which is why "bypass, then save for this site" keeps the sound you shaped — is real,
// so it is now asserted where the decision is actually taken. See invariants.test.ts,
// "a save reads the editing buffer, never the preview override".
//
// engineBandsFor answered "what should the ACTIVE tab play". THAT QUESTION HAS NO SINGLE OWNER
// TODAY. Three places decide it separately: applyEverywhere SKIPS the active tab while a preview
// is on, onBandsLive sends the editing buffer, and toggleBypass sends flat. They agree only
// because whoever set the preview already pushed the matching curve; nothing holds them together,
// and a change that made bypass inaudible left the whole suite green.
//
// Giving that question one owner means making applyEverywhere send to the active tab instead of
// skipping it, which is a change to how bypass works rather than a cleanup — so it belongs to the
// bypass work, where it can be wired and proven in the same change. Until then, note that
// `overrideBands` below is written by previewForBypass and read by nobody.

/**
 * Latch once per popup session. Later mutations must not replace it, or a "restore what it was"
 * action would restore an already-mutated value.
 */
export function captureBaseline(
  current: Baseline,
  next: { target: SavedTarget; global: { bands: Band[]; gain: number; presetName?: string } | null; rule: unknown | null }
): Baseline {
  if (current.has) return current;
  return {
    has: true,
    target: next.target,
    global: next.global ? { bands: cloneBands(next.global.bands), gain: next.global.gain, presetName: next.global.presetName ?? '' } : null,
    rule: next.rule ? JSON.parse(JSON.stringify(next.rule)) : null
  };
}

/** True when a "restore the global profile" step is owed — i.e. the session first mutated global. */
export function owesGlobalRestore(baseline: Baseline): boolean {
  return baseline.has && baseline.target?.kind === 'global';
}
