// "Save this sound for this site" — turning the edit you are hearing into a rule.
//
// Why it needs a plan of its own. On a site with no rule, editing writes the GLOBAL profile: that
// is the committed behaviour, and it means that by the time this button is clickable the user's
// change has already become the sound of every tab without a rule. So the action is not "save" but
// "save here, and put back what that displaced" — and the order in which those two happen decides
// whether a failure loses the edit or leaves it exactly where it was.
//
// Nothing here writes. planSaveForSite computes; applySavePlan sequences the writes through
// injected functions, so the ORDER can be tested — a planner can be perfect while the code calling
// it rolls back the global profile before the rule write it depended on succeeded.

import type { Band } from './audio';
import type { PresetBands } from './presets';
import { patternForHost, type PatternScope, type Rule } from './rules';

export interface SavePlanInput {
  host: string;
  rules: Rule[];
  /** What the resolver says is playing here — the rule to update, or null to create one. */
  matchedRule: Rule | null;
  /** The editing buffer. With bypass on this is still the real curve; bypass never touches it. */
  bands: PresetBands;
  gain: number;
  presetName: string;
  scope: PatternScope;
  /** The global profile as it stood before this session first changed it, provenance included. */
  baselineGlobal: { bands: Band[]; gain: number; presetName: string } | null;
  /** True when this session's first mutation went to the global profile, so it owes a rollback. */
  owesGlobalRestore: boolean;
}

export type SavePlan =
  | { action: 'none'; reason: 'no-host' }
  | {
      action: 'save';
      created: boolean;
      ruleId: string;
      /** The full next rules array, in the original order. */
      rules: Rule[];
      /** null = nothing to put back. `{ to: null }` = there was no stored profile; clear the key. */
      globalRollback: { to: { bands: Band[]; gain: number; presetName: string } | null } | null;
    };

const cloneBands = (b: PresetBands): PresetBands => ({
  frequencies: [...b.frequencies],
  gains: [...b.gains],
  qs: [...b.qs]
});

/**
 * Which rule fields this action owns, spelled out rather than left to a spread.
 *
 * Owns: mode, curve, gain, preset — the sound.
 * Never touches: id, patterns, enabled — the identity and reach of the rule. Shaping a band is not
 * a reason to re-enable a rule the user disabled, or to change which sites it covers.
 *
 * mode moves from 'preset' to 'curve' by design: once a band has been dragged the sound is no
 * longer "the Vocal preset". That matches what an ordinary edit-commit already does.
 */
function withSound(rule: Rule, bands: PresetBands, gain: number, presetName: string): Rule {
  return { ...rule, mode: 'curve', curve: cloneBands(bands), gain, preset: presetName };
}

export function planSaveForSite(input: SavePlanInput): SavePlan {
  const pattern = patternForHost(input.host, input.scope);
  if (!pattern) return { action: 'none', reason: 'no-host' };

  const globalRollback = input.owesGlobalRestore
    ? {
        to: input.baselineGlobal
          ? {
              bands: input.baselineGlobal.bands.map((b) => ({ ...b })),
              gain: input.baselineGlobal.gain,
              // Putting the profile back without the name it came from is not putting it back:
              // the header would read "None" for a curve that is still, visibly, Vocal.
              presetName: input.baselineGlobal.presetName
            }
          : null
      }
    : null;

  if (input.matchedRule) {
    const id = input.matchedRule.id;
    return {
      action: 'save',
      created: false,
      ruleId: id,
      rules: input.rules.map((r) => (r.id === id ? withSound(r, input.bands, input.gain, input.presetName) : r)),
      globalRollback
    };
  }

  const created: Rule = {
    id: newId(),
    patterns: [pattern],
    mode: 'curve',
    curve: cloneBands(input.bands),
    gain: input.gain,
    preset: input.presetName,
    enabled: true
  };
  return { action: 'save', created: true, ruleId: created.id, rules: [...input.rules, created], globalRollback };
}

/** Indirection so tests get stable ids; the popup passes crypto-backed newRuleId. */
let newId: () => string = () => 'r_' + Math.random().toString(36).slice(2);
export function setRuleIdFactory(fn: () => string) {
  newId = fn;
}

export interface SaveWriters {
  writeRules(rules: Rule[]): Promise<{ ok: boolean }>;
  writeGlobal(bands: Band[], gain: number, presetName: string): Promise<{ ok: boolean }>;
  clearGlobal(): Promise<void>;
  clearJournal(): Promise<void>;
}

export type SaveOutcome =
  | 'nothing-to-do'
  /** Rule stored, global put back, recovery record dropped. */
  | 'saved'
  /** Nothing changed at all — the edit is still on the global profile, journal intact. */
  | 'rule-write-failed'
  /** The rule is stored, but the global profile still carries the edit. Recoverable, must be said. */
  | 'saved-global-not-restored';

/**
 * Sequence the writes. There is no transaction across chrome.storage.sync and .local, so this
 * cannot be atomic — the goal is narrower and achievable: never leave the user worse off than
 * before they pressed the button.
 *
 * The rule write goes FIRST and is the only place a failure costs nothing: if it fails, the global
 * profile still holds the edit and the journal still describes it, which is exactly the state the
 * user was already in. Rolling back the global first — the obvious-looking order — would delete the
 * edit from the only place it existed before finding out whether the rule could be written at all.
 */
export async function applySavePlan(plan: SavePlan, w: SaveWriters): Promise<SaveOutcome> {
  if (plan.action !== 'save') return 'nothing-to-do';

  const ruleWrite = await w.writeRules(plan.rules);
  if (!ruleWrite.ok) return 'rule-write-failed'; // deliberately: no rollback, no journal clear

  if (plan.globalRollback) {
    const { to } = plan.globalRollback;
    const ok = to ? (await w.writeGlobal(to.bands, to.gain, to.presetName)).ok : (await w.clearGlobal(), true);
    if (!ok) return 'saved-global-not-restored';
  }

  await w.clearJournal(); // the recovery record described an edit that now lives in the rule
  return 'saved';
}
