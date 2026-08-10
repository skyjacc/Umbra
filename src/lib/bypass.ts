// Bypass, as a mode you can work in rather than a button you hold.
//
// The old rule was "the graph is dead while bypassed", and it was load-bearing by accident: it was
// the only thing stopping an edit made against a stale buffer from reaching storage. Making the
// graph editable — which is how every parametric EQ behaves, and what people expect — removes that
// accident, so the guarantees it was quietly providing have to be stated and held on purpose.
//
// THE CONTRACT
//
//   bypass on          audio = flat · buffer = the real curve, editable · storage = untouched
//   drag while on      buffer changes · audio stays flat · storage still untouched
//   bypass off         the buffer plays, and the accumulated draft is written once
//
// Bypass is a DRAFT MODE: while it is on, nothing is persisted automatically. Not the debounced
// commit, and not the write-ahead journal either — a journal entry written under bypass would be
// replayed by the next popup as an edit the user never confirmed, which is the opposite of what
// the journal is for.
//
// State it as one sentence, because "bypass is a draft" is the half that gets remembered:
//
//   The bypass preview is ephemeral until bypass is disabled. An explicit "Save for this site"
//   MAY persist the current preview.
//
// The distinction is automatic versus asked-for. A debounced commit is the app deciding to write;
// pressing Save is the user deciding, and bypass has no standing to overrule that. Anyone reading
// `isBypassed(preview) === true` as "nothing may ever be written here" will break Save for this
// site, so the exception is written down beside the rule rather than left to be inferred.
//
// WHY THE TWO GUARDS ARE SEPARATE. applyEverywhere used a single flag to answer two unrelated
// questions — "may I push audio to the active tab" and "may I refresh the editing buffer from
// storage". Conflating them was harmless only while the graph was dead. With it editable and the
// buffer frozen for a whole bypass session, deleting that site's rule in the Rules tab left the
// graph showing a curve that existed nowhere, and the next commit resolved a target that had
// changed underneath it. sendsBandsToActiveTab and mayMirrorBuffer are those two questions, kept
// apart on purpose.

import { NO_PREVIEW, previewForDrag, type Preview } from './edit-state';

export const isBypassed = (p: Preview): boolean => p.has && p.source === 'bypass';

/**
 * A drag while bypassed is still a drag, but bypass outranks it: asking to hear the tab unshaped
 * is not withdrawn by shaping something. Only the toggle clears it.
 */
export function previewAfterDrag(current: Preview): Preview {
  return isBypassed(current) ? current : previewForDrag();
}

/** Ending an EDIT must not end a BYPASS. They are orthogonal, and were not, in three places. */
export function previewAfterCommit(current: Preview): Preview {
  return isBypassed(current) ? current : NO_PREVIEW;
}

/** Whether an edit may reach storage right now. False under bypass — that is the draft rule. */
export function persistsNow(preview: Preview): boolean {
  return !isBypassed(preview);
}

/**
 * Whether a live edit may push the eleven filters to the ACTIVE tab.
 *
 * Deliberately about the BANDS and not about messages in general: the master volume keeps flowing
 * while bypassed, because "bypass the EQ" means the equalizer and not the user's volume — the same
 * reason toggleBypass sends the current gain along with its flat curve.
 */
export function sendsBandsToActiveTab(preview: Preview): boolean {
  return !isBypassed(preview);
}

/**
 * Whether a storage change may refresh the editing buffer.
 *
 * Keyed on unsaved work, never on bypass. A bypass is a listening state and has no claim on the
 * buffer; an unsaved draft has every claim, and overwriting it would destroy exactly the work this
 * mode exists to let people do.
 */
export function mayMirrorBuffer(input: { interacting: boolean; dirty: boolean; preview: Preview }): boolean {
  if (input.interacting || input.dirty) return false;
  return !(input.preview.has && input.preview.source === 'drag');
}

/** On leaving bypass: write the draft, but only if one was actually made. */
export function commitOnUnbypass(input: { dirty: boolean }): boolean {
  return input.dirty;
}
