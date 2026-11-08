// When a live edit should be written to storage.
//
// Two forces pull against each other. Writes must be batched: a ruled site persists to
// chrome.storage.sync, which caps write operations per minute AND per hour, and keyboard nudges
// auto-repeat at ~30/s. But an unwritten edit is a lost edit — the popup is destroyed on any focus
// loss (close, Ctrl+R on the page, clicking away) and a dying popup cannot be relied on to finish
// the write, so a debounce that keeps getting pushed out is a hole, not a saving.
//
// A plain trailing debounce has exactly that hole: holding an arrow key resets the timer every
// ~33ms, so it never fires while the key is held. Hold for three seconds and three seconds of
// edits exist nowhere but memory. The deadline below bounds that: the debounce may delay a write,
// but it can never postpone one indefinitely.

/** Quiet period after the last edit before writing. */
export const COMMIT_DEBOUNCE_MS = 200;
/** Hard ceiling on how long a continuous stream of edits may hold a write off. */
export const MAX_COMMIT_WAIT_MS = 600;

export type CommitDecision =
  /** Nothing was pending; start the debounce window. */
  | 'schedule'
  /** Still inside the ceiling; push the write out again. */
  | 'reschedule'
  /** The ceiling is reached — write now instead of waiting for a quiet moment that may never come. */
  | 'commit-now';

export interface CommitTiming {
  /** A write is already scheduled. */
  armed: boolean;
  /** Timestamp of the schedule that opened the current window. Ignored when `armed` is false. */
  windowOpenedAt: number;
  now: number;
  maxWaitMs?: number;
}

export function commitDecision({ armed, windowOpenedAt, now, maxWaitMs = MAX_COMMIT_WAIT_MS }: CommitTiming): CommitDecision {
  if (!armed) return 'schedule';
  return now - windowOpenedAt >= maxWaitMs ? 'commit-now' : 'reschedule';
}
