// What "Undo that reset" is allowed to mean.
//
// Reset profile is the one destructive action in the product: on a ruled site it DELETES the
// site's rule, everywhere else it flattens the sound every unruled tab plays. Its only safety net
// is a snapshot and a button. So the question this module answers is narrow and load-bearing:
//
//   given that the user pressed Undo, is the snapshot still a description of a world they can
//   safely be returned to — and if not, what happened instead?
//
// THE CONTRACT, stated because the code never did. Four readings were possible and the
// implementation silently mixed them:
//   (a) go back to the state immediately before Reset
//   (b) go back to the state before the last committed write
//   (c) put back only the rules Reset deleted
//   (d) restore the whole snapshot — rules, global profile and preset provenance
// What ships is (d) as the payload and (a) as the promise. (d) alone is not enough: replaying a
// full snapshot over a world that has moved on is how an undo destroys work instead of restoring
// it. (a) is the guarantee, and this module is what enforces it.
//
// WHY A FINGERPRINT AND NOT A FLAG. The old guard was "a later write invalidates the slot", raised
// by the popup's own writers calling noteUndoEvent. It missed in both directions:
//
//   too late   the slot is armed inside the reset write's .then, while a commit invalidates it
//              synchronously — so an edit made WHILE the reset write was in flight cleared the
//              slot before the reset armed it, and the arming then put a stale world back on the
//              button. The user pressed Undo and lost the edit they had just made.
//   too narrow only writes made through this popup were counted. The Full-window editor is a
//              separate, long-lived instance of the same hook writing the same keys; nothing it
//              did moved the flag, so a popup's Undo would happily overwrite it.
//
// A flag records that we think the world moved. A fingerprint records what the world actually was,
// and is therefore right about writers it has never heard of — including another window, another
// machine's sync, and our own future selves. It is the same reasoning the crash-recovery journal
// already uses for its target rule (see journal.ts), applied to the whole world instead of one
// rule.
//
// Nothing here writes, reads storage, or knows about React.

import type { Rule } from './rules';
import type { ResetSnapshot } from './reset';
import type { Baseline } from './edit-state';

/**
 * The bookkeeping a reset displaced, so Undo can put it back with the sound.
 *
 * `committed` is stored rather than derived. It was briefly reconstructed as `baseline.has` on the
 * grounds that every writer latches a baseline before writing — which is true, and still wrong:
 * the implication only runs one way. A drag latches a baseline on its FIRST MOVE and commits
 * 200ms after the last one, and an edit made under bypass latches one and never commits at all
 * (bypass is a draft mode). Both leave `has` true with `committed` false. Restoring `true` there
 * makes planResetChanges believe storage holds an edit it does not, and it answers by spending a
 * chrome.storage.sync write to store what is already stored — the exact write its own comment
 * calls out as the thing not to do.
 */
export interface SessionDebt {
  baseline: Baseline;
  committed: boolean;
}

/**
 * A fingerprint of the world a reset produced.
 *
 * Deliberately the WHOLE world — rules and the global profile — rather than the half the reset
 * happened to touch. A reset that deleted a rule can still be made unsafe by someone rewriting the
 * global profile, because the undo's payload restores both.
 */
export interface WorldFingerprint {
  /** Rule identity and sound, in order. Order matters: matching is first-match-wins. */
  rules: string;
  global: string;
}

/**
 * Stable, order-sensitive, and blind to nothing that an undo would overwrite.
 *
 * `enabled` and `patterns` are included even though a reset never changes them: the undo's payload
 * restores the whole rule, so a rule the user disabled or re-scoped between the reset and the undo
 * is work that the undo would silently revert.
 *
 * SERIALIZED, NOT CONCATENATED. The obvious spelling — join the fields with `|` and the records
 * with `;` — is ambiguous, and ambiguity in this particular function means an undo proceeding over
 * a world it should have refused. Two real collisions in the first draft:
 *
 *   patterns ['a','b'] and ['a+b']            identical keys, so a re-scoped rule reads as unchanged
 *   one rule whose pattern contains the        a single rule impersonates a two-rule world, so a rule
 *   record separator                           added since the reset is invisible to the check
 *
 * Neither needs a hostile user to be a problem, but one is available: rules arrive from share
 * codes, which this codebase already treats as untrusted input (see sanitizeImportedRules). A
 * crafted import could otherwise make an undo silently delete a rule. JSON.stringify quotes and
 * escapes every string, so no field value can forge a boundary.
 */
export function fingerprintWorld(
  rules: Rule[],
  global: { bands: { frequency: number; gain: number; q: number }[]; gain: number; presetName?: string } | null
): WorldFingerprint {
  return {
    rules: JSON.stringify(
      (rules ?? []).map((r) => [
        r.id,
        r.enabled !== false,
        r.patterns ?? [],
        r.mode,
        r.preset ?? '',
        r.gain ?? 1,
        r.curve ? [r.curve.frequencies, r.curve.gains, r.curve.qs] : null
      ])
    ),
    global: JSON.stringify(
      global ? [(global.bands ?? []).map((b) => [b.frequency, b.gain, b.q]), global.gain, global.presetName ?? ''] : null
    )
  };
}

export function worldsEqual(a: WorldFingerprint | null, b: WorldFingerprint | null): boolean {
  if (!a || !b) return a === b;
  return a.rules === b.rules && a.global === b.global;
}

/**
 * Everything one Reset profile needs to be undoable, in ONE object.
 *
 * It is one object on purpose. The version this replaces held the snapshot in React state (armed
 * asynchronously, when the write landed) and the session debt in a ref (written synchronously),
 * and the two could disagree: a second reset issued before the first resolved wiped the debt while
 * the slot still held the first reset's snapshot, so Undo restored one reset's world with the
 * other's bookkeeping. Anything armed together cannot drift; anything armed apart eventually does.
 */
export interface ResetUndoRecord {
  snapshot: ResetSnapshot;
  debt: SessionDebt;
  /**
   * The world this reset was about to create. Compared against the world as it actually stands
   * when Undo is pressed — see `planUndo`.
   */
  produces: WorldFingerprint;
}

export type ArmOutcome =
  /** The write landed and nothing else moved: this undo is offerable. */
  | 'arm'
  /** The write was refused. Nothing happened, so there is nothing to undo — and the debt is owed again. */
  | 'refused'
  /** A newer reset owns the slot now. Drop this one silently; it is not the one on screen. */
  | 'superseded';

/**
 * Whether a reset whose write has just resolved may arm its undo.
 *
 * `isCurrent` is identity, not equality: the caller holds the record it created and asks whether
 * that same record is still the pending one. A second reset replaces it, and the first reset's
 * late callback must not then speak for a world it no longer describes.
 */
export function planArm(input: { ok: boolean; isCurrent: boolean }): ArmOutcome {
  if (!input.isCurrent) return 'superseded';
  return input.ok ? 'arm' : 'refused';
}

export type UndoOutcome =
  /** Safe: the world is still the one the reset produced. Restore the snapshot and the debt. */
  | 'restore'
  /** Nothing armed. */
  | 'none'
  /**
   * Something has been written since the reset — by this popup, the Full-window editor, or another
   * machine's sync. Restoring now would overwrite it, so the undo retires instead.
   */
  | 'superseded';

/**
 * Whether an armed undo may still be applied, given the world as it stands right now.
 *
 * This is the whole (a) guarantee: an undo returns the user to the state immediately before the
 * reset, or it does nothing. It never returns them to an older state at the cost of a newer one.
 */
export function planUndo(input: { record: ResetUndoRecord | null; world: WorldFingerprint }): UndoOutcome {
  if (!input.record) return 'none';
  return worldsEqual(input.record.produces, input.world) ? 'restore' : 'superseded';
}
