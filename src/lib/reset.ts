// The two things "reset" can mean, kept apart because one is free and the other destroys work.
//
// Until now a single Reset button did the destructive one with no confirmation: on a ruled site it
// DELETED the rule, and on any other site it flattened the global profile — the sound for every tab
// that has no rule of its own. One click, no question asked.
//
// Splitting them:
//   Reset changes  — drop the un-committed edit and go back to what is stored. Touches no storage.
//   Reset profile  — the destructive one. Same behaviour as before, now behind a snapshot so it can
//                    be undone from a notice rather than guarded by a modal (the project has no
//                    modals, and adding the pattern for one action isn't worth it).

import type { Band } from './audio';
import { matchRule, type Rule } from './rules';
import type { RestoreWriters, RestoreOutcome } from './reset-changes';

export type ResetPlan =
  /** Ruled site: the rule goes away and the site falls back to the global profile. */
  | { action: 'delete-rule'; ruleId: string; rules: Rule[] }
  /** Anywhere else: the sound-everywhere profile becomes flat. */
  | { action: 'flatten-global' };

/**
 * What `Reset profile` would do here. Returns the full next rules array rather than an instruction,
 * so the caller cannot get the removal subtly wrong, and so a test can assert what survives.
 */
export function planResetProfile(activeHost: string, rules: Rule[]): ResetPlan {
  const mr = activeHost ? matchRule(activeHost, rules) : null;
  if (!mr) return { action: 'flatten-global' };
  return { action: 'delete-rule', ruleId: mr.id, rules: rules.filter((r) => r.id !== mr.id) };
}

export interface ResetSnapshot {
  rules: Rule[];
  /** null is a real value — it means no global profile was stored at all. */
  /** Complete, provenance included — a profile put back without the preset it came from reads
   *  "None" for a curve that is still, visibly, Vocal. */
  global: { bands: Band[]; gain: number; presetName: string } | null;
}

/**
 * Everything `Reset profile` is about to overwrite, deep-copied.
 *
 * A shallow copy would leave the snapshot sharing the very arrays the reset then replaces, so
 * "undo" would restore the flattened state over itself — the failure mode that makes an undo worse
 * than no undo, because the user trusts it.
 */
export function makeResetSnapshot(rules: Rule[], global: { bands: Band[]; gain: number; presetName?: string } | null): ResetSnapshot {
  return {
    rules: rules.map((r) => ({
      ...r,
      patterns: [...r.patterns],
      curve: r.curve ? { frequencies: [...r.curve.frequencies], gains: [...r.curve.gains], qs: [...r.curve.qs] } : undefined
    })),
    global: global ? { bands: global.bands.map((b) => ({ ...b })), gain: global.gain, presetName: global.presetName ?? '' } : null
  };
}

/**
 * True when there is an EDIT to discard.
 *
 * Keyed on what the preview IS, not merely that one exists. A drag preview is an alternative state
 * the user built and might want to throw away. A bypass preview is the opposite: the stored EQ is
 * simply not being applied for a moment, so there is nothing to discard — offering to would put a
 * second control next to the bypass toggle doing the same thing under a misleading name.
 */
export function hasDiscardableChanges(input: { previewSource: 'drag' | 'bypass' | null; dirty: boolean }): boolean {
  return input.previewSource === 'drag' || input.dirty;
}

/**
 * Where each reset is allowed to appear.
 *
 * The rule this encodes: one position in the UI must not change what it does depending on state.
 * The tempting alternative — a single button that says "Reset changes" while an edit is pending and
 * "Reset profile" otherwise — puts a destructive action under the muscle memory built for a
 * harmless one. So the two live in different places, permanently, and the harmless one simply is
 * not there when it has nothing to do.
 */
export interface ResetControls {
  /** Main action row. Present only while there is an edit to discard. */
  changesInMainRow: boolean;
  /** Always in the More view, never in the main row, whatever the state. */
  profileInMore: boolean;
}

export function resetControls(input: { previewSource: 'drag' | 'bypass' | null; dirty: boolean }): ResetControls {
  return { changesInMainRow: hasDiscardableChanges(input), profileInMore: true };
}

/**
 * Put back exactly what a Reset profile overwrote, and only then let the caller call it done.
 *
 * The order is rules first: the rule is the thing Reset profile DELETED, and the snapshot is the
 * only copy of it. Attempting the cheap-to-lose thing first means a refusal leaves the user where
 * they were, with the undo still armed and the snapshot still held, rather than half-restored.
 *
 * Sequenced through injected writers for the same reason applySavePlan is: the defect this
 * replaces was not in the arithmetic, it was in a caller that disarmed the slot at the top of the
 * function and then fired both writes with their results discarded.
 */
export async function applyUndoReset(
  snapshot: ResetSnapshot,
  w: RestoreWriters,
  /**
   * Does storage already hold the rules this snapshot would restore? The caller knows: it has just
   * fingerprinted the world to decide the undo was still valid at all.
   *
   * A Reset profile on a site with no rule flattens the global and never touches the rules, so
   * there is nothing to put back — and the write is not free to attempt. engine-io refuses to write
   * a rules array a document could not read, so on a popup whose rules read failed this turned an
   * undo that only ever needed the global into 'write-failed', reported as "Rules save failed (sync
   * storage full?)" — a quota that was not the problem, about rules it was not going to change.
   */
  rulesAlreadyMatch: boolean
): Promise<RestoreOutcome> {
  if (!rulesAlreadyMatch) {
    const rules = await w.writeRules(snapshot.rules);
    if (!rules.ok) return 'write-failed';
  }

  const g = snapshot.global;
  const global = g ? await w.writeGlobal(g.bands, g.gain, g.presetName) : await w.clearGlobal();
  if (!global.ok) return 'write-failed';

  return 'restored';
}
