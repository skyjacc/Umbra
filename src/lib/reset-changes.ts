// "Put it back the way it was" — the control that belongs next to Save, and never had one.
//
// Not Undo, and the name matters. This does not step back through a history; it returns to the
// sound as it stood when the popup was opened, however many drags ago that was. A → B → reset → A.
// Edit again to C and it still returns to A, because A is what the session displaced and C is just
// more of the same session.
//
// WHY THE FIRST ATTEMPT WAS UNUSABLE. It was gated on "there is an un-committed edit", which is a
// state that exists for about 200ms: a drag auto-commits after COMMIT_DEBOUNCE_MS, so the button
// appeared as the pointer went down and vanished a fifth of a second after it came up. The report
// was exact — "начинаю тянуть — появляется кнопка, отпускаю — пропадает". The fix is not a longer
// timer; it is keying on the right thing. An edit that has been auto-saved is still an edit the
// user may want back, so `committed` keeps the button alive after the debounce, and only a reset
// (or never having edited at all) takes it away.
//
// WHAT IT IS NOT. It is not `Reset profile`, which is destructive and lives in More: that one
// DELETES the site's rule or flattens the everywhere-sound. This one restores; it can only ever
// return the user to a state they were already in. The two must never share a position in the UI.

import type { Baseline } from './edit-state';
import type { Band } from './audio';
import type { Rule } from './rules';
import { presetToBands } from './engine-io';

export type ResetChangesPlan =
  | { action: 'none' }
  | {
      action: 'restore';
      /** What the graph and the engine should show and play. Always present. */
      bands: Band[];
      gain: number;
      /** Storage work, or null when nothing has reached storage yet and none is needed. */
      global: { to: { bands: Band[]; gain: number; presetName: string } | null } | null;
      rules: Rule[] | null;
    };

const cloneBands = (b: Band[]): Band[] => b.map((x) => ({ ...x }));

/**
 * Whether there is anything to put back.
 *
 * `dirty` covers the live edit, `committed` covers everything the session has already saved. Both
 * are needed: without the first the button is missing while you drag, and without the second it
 * disappears 200ms after you stop — which is the bug this control was withdrawn for the first time.
 */
export function canResetChanges(input: { baselineHas: boolean; dirty: boolean; committed: boolean }): boolean {
  return input.baselineHas && (input.dirty || input.committed);
}

export function planResetChanges(input: { baseline: Baseline; rules: Rule[]; committed: boolean }): ResetChangesPlan {
  const b = input.baseline;
  if (!b.has || !b.target) return { action: 'none' };

  if (b.target.kind === 'global') {
    const bands = b.global ? cloneBands(b.global.bands) : [];
    const gain = b.global?.gain ?? 1;
    return {
      action: 'restore',
      bands,
      gain,
      // Nothing has been written yet: cancelling the pending commit is the whole job, and a write
      // here would spend a storage.sync slot to store what is already stored.
      global: input.committed
        ? { to: b.global ? { bands: cloneBands(b.global.bands), gain: b.global.gain, presetName: b.global.presetName } : null }
        : null,
      rules: null // a global edit is no reason to rewrite the rules array
    };
  }

  const was = b.rule as Rule | null;
  const id = b.target.id;
  const present = input.rules.some((r) => r.id === id);
  // presetToBands rather than a hand-rolled map: band 0 is a lowshelf and band 10 a highshelf, and
  // spelling that out again here is how the two copies drift.
  const bands = was?.curve ? presetToBands(was.curve) : [];

  return {
    action: 'restore',
    bands,
    gain: was?.gain ?? 1,
    global: null, // a rule edit never displaced the everywhere-sound
    // Owns the sound and nothing else — the same split withSound() commits to on the way in. And
    // it does not resurrect a rule deleted since the baseline was taken: restoring an edit is not
    // a reason to bring back something the user removed on purpose.
    rules:
      input.committed && present && was
        ? input.rules.map((r) => (r.id === id ? { ...r, mode: was.mode, curve: was.curve, gain: was.gain, preset: was.preset } : r))
        : null
  };
}

/**
 * The writes a restore may need. Injected so the ORDER and the failure branches can be tested —
 * a planner can be perfect while the code calling it announces success before the write lands.
 */
export interface RestoreWriters {
  writeGlobal(bands: Band[], gain: number, presetName: string): Promise<{ ok: boolean }>;
  clearGlobal(): Promise<{ ok: boolean }>;
  writeRules(rules: Rule[]): Promise<{ ok: boolean }>;
}

export type RestoreOutcome =
  | 'nothing-to-do'
  /** Everything asked for was written. Only now may the caller clear the journal and say so. */
  | 'restored'
  /**
   * The buffer goes back but storage was already correct, so nothing was written.
   *
   * Distinguishing this from 'restored' is the fix for a real loss: pressing Reset when the
   * baseline rule has since been deleted writes nothing, and treating it as a write let it spend
   * the undo slot from an earlier Reset profile — destroying the only copy of the deleted rule
   * with a click that changed nothing.
   */
  | 'restored-without-writing'
  /** Storage still holds the edit. The caller must keep the journal, the undo and its mouth shut. */
  | 'write-failed';

/** True when the plan actually asks for storage to change. */
export function writesAnything(plan: ResetChangesPlan): boolean {
  return plan.action === 'restore' && (plan.global !== null || plan.rules !== null);
}

export async function applyRestore(plan: ResetChangesPlan, w: RestoreWriters): Promise<RestoreOutcome> {
  if (plan.action !== 'restore') return 'nothing-to-do';
  if (!writesAnything(plan)) return 'restored-without-writing';

  if (plan.global) {
    const { to } = plan.global;
    const res = to ? await w.writeGlobal(to.bands, to.gain, to.presetName) : await w.clearGlobal();
    if (!res.ok) return 'write-failed';
  }
  if (plan.rules) {
    const res = await w.writeRules(plan.rules);
    if (!res.ok) return 'write-failed';
  }
  return 'restored';
}
