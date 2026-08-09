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

export type UndoSlot = { armed: false } | { armed: true; snapshot: ResetSnapshot };

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

export const NO_UNDO: UndoSlot = { armed: false };

export const canUndo = (slot: UndoSlot): boolean => slot.armed;

/** Arm from a fresh snapshot. Replaces whatever was there — see the one-operation rule above. */
export const armUndo = (snapshot: ResetSnapshot): UndoSlot => ({ armed: true, snapshot });

export function undoAfter(slot: UndoSlot, event: UndoEvent): UndoSlot {
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
