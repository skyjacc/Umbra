// One undo, belonging to one operation.
//
// What this replaces. `Reset profile` armed a boolean and stored a snapshot, and the only thing
// that ever disarmed it was using it. The toast that carried the button expired after five
// seconds; the boolean did not. Worse, the toast and the button were gated on different values —
// the toast on there being any notice at all, the button on the stale boolean — so a later,
// unrelated "Saved" or "Copied" arrived wearing a live Undo that wrote back a rules array from
// minutes earlier, over everything done since.
//
// Two rules fix it, and neither of them is a timer:
//
//   the slot holds one operation      a second reset REPLACES it rather than queueing behind it,
//                                     because the UI has one button and it must not lie about
//                                     which reset it is offering
//   a later write invalidates it      once the user has saved something else, restoring the
//                                     snapshot would discard whatever they did in between
//
// Time is explicitly not one of them. A decision like "did I want that reset?" is made by
// listening, which takes longer than any toast should stay on screen, so the undo outlives the
// notice on purpose. That is the opposite of the old behaviour only in appearance: what was wrong
// before was not that the slot lasted, it was that nothing could clear it.

import type { ResetSnapshot } from './reset';

/**
 * Generic over what is being held, because the payload grew.
 *
 * It used to be the reset snapshot alone, and the bookkeeping the reset displaced lived beside it
 * in a separate ref written on a different clock — one synchronously, one when the write resolved.
 * They drifted, and a second reset issued before the first resolved could arm one reset's snapshot
 * next to the other's bookkeeping. Whatever the slot holds now travels as ONE value; see
 * undo-state.ts.
 */
export type UndoSlot<T = ResetSnapshot> = { armed: false } | { armed: true; snapshot: T };

export type UndoEvent =
  /** The user took it. */
  | 'undo'
  /** A canonical write happened, so the snapshot describes a world that has moved on. */
  | 'commit'
  | 'rules-write'
  | 'save-for-site'
  /** Things that must NOT invalidate it — listed so the intent is in the type, not in a comment. */
  | 'notice-shown'
  | 'notice-expired'
  | 'tab-switch';

export const NO_UNDO: UndoSlot<never> = { armed: false };

export const canUndo = <T,>(slot: UndoSlot<T>): boolean => slot.armed;

/** Arm from a fresh record. Replaces whatever was there — see the one-operation rule above. */
export const armUndo = <T,>(snapshot: T): UndoSlot<T> => ({ armed: true, snapshot });

/**
 * Retire the slot when this popup writes.
 *
 * A COURTESY, not the guarantee. It exists so the button disappears the moment we know it is
 * stale, rather than waiting to refuse at press time. It cannot be the authority: it only sees
 * writes made through this popup's own writers, and the Full-window editor is a separate
 * long-lived instance of the same hook writing the same keys. Whether an undo may actually be
 * applied is settled against the world itself — see planUndo in undo-state.ts.
 */
export function undoAfter<T>(slot: UndoSlot<T>, event: UndoEvent): UndoSlot<T> {
  switch (event) {
    case 'undo':
    case 'commit':
    case 'rules-write':
    case 'save-for-site':
      return NO_UNDO;
    case 'notice-shown':
    case 'notice-expired':
    case 'tab-switch':
      return slot;
  }
}
