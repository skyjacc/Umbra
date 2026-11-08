// Whose sound the editing buffer is showing.
//
// The buffer belongs to the active HOST. That sounds like a restatement of the obvious, and it is
// exactly the thing the popup got wrong: applyEverywhere looked the owner up by TAB IDENTITY —
// `tabs.find(t => t.id === activeTabId)` — and then mirrored only if that found something.
//
// In the browser-action popup the two questions have the same answer, so the bug was invisible
// there. In the "Full window" page they do not: that page edits the everywhere-sound and sets
// activeTabId to null by construction, so the lookup searched a list of numeric tab ids for `null`
// and never matched. The mirror step was dead code for the entire life of that page.
//
// The consequence was a silent cross-window lost update, and it defeated the fix in
// storage-events.ts rather than being covered by it. That module correctly wakes the full-window
// page when DEFAULT_EQ changes in `local`, and the audio really does follow — but the graph the
// user is looking at kept whatever it had at boot. Edit one band there and the commit writes that
// stale curve over everything the popup saved in between. The write-ahead journal made it worse:
// under a global target persistsNow() is true, so the stale curve was recorded for replay too.
//
// Returning null (rather than '' ) for "no owner on screen" matters: '' is a REAL host meaning the
// global profile, so a falsy check here would silently turn "nothing to mirror" into "mirror the
// everywhere-sound" and pull the global curve into a popup looking at an uncaptured tab.

export interface MirrorTargetInput {
  /** The "Full window" page, which edits the global profile instead of a tab. */
  globalEditor: boolean;
  activeTabId: number | null;
  tabs: { id: number; host: string }[];
}

/**
 * The host whose resolved sound the editing buffer should show, or null to leave the buffer alone.
 *
 * Kept out of the hook so the decision can be tested. The defect this replaces was not in the
 * arithmetic — there is none — it was a lookup that could not succeed, and no behavioural test
 * existed that would have noticed.
 */
export function mirrorHost(input: MirrorTargetInput): string | null {
  // The global editor owns the everywhere-sound, which resolvedFor addresses as host ''.
  if (input.globalEditor) return '';
  const cur = input.tabs.find((t) => t.id === input.activeTabId);
  return cur ? cur.host : null;
}
