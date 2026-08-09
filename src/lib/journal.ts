// A write-ahead record of the edit in progress, so a popup that dies mid-edit doesn't take the
// user's change with it.
//
// Why this exists. Persisting an edit is debounced, and a browser-action popup is destroyed on any
// focus loss — closing it, Ctrl+R on the page, clicking away. It is destroyed as a widget rather
// than unloaded as a page, so teardown events are unreliable; and even when a handler does run,
// chrome.storage.set is dispatched asynchronously to a browser-side endpoint that dies with the
// frame, so a last-gasp write is a race you usually lose. The only thing that works is having
// written already. This module is that record.
//
// What it is NOT. It is not a second source of truth. Nothing plays from the journal; the canonical
// state stays in DEFAULT_EQ / RULES, and the journal is read exactly once — at popup boot, before
// the first resolve — then dropped as soon as the canonical write succeeds.

import type { PresetBands } from './presets';
import type { Rule } from './rules';

export const JOURNAL_VERSION = 1;

export type JournalTarget = { kind: 'global' } | { kind: 'rule'; id: string };

/**
 * The rule fields a journal replay could overwrite. Comparing only the id would call a rule
 * "unchanged" after someone flipped `enabled` or swapped the preset in another window, and the
 * replay would then quietly undo that.
 */
export interface RuleFingerprint {
  mode: 'preset' | 'curve';
  preset: string;
  gain: number;
  enabled: boolean;
  curve: PresetBands | null;
}

export interface EditJournal {
  v: typeof JOURNAL_VERSION;
  target: JournalTarget;
  bands: PresetBands;
  gain: number;
  /** Compared against the canonical record's own timestamp for the global target. */
  writtenAt: number;
  /**
   * How the rule looked when the edit began. Rules carry no timestamp of their own, so this is the
   * only way to tell that the target moved underneath us — another window, the full-window editor,
   * or chrome.storage.sync arriving from another machine.
   */
  targetWas: RuleFingerprint | null;
}

export type JournalDecision =
  /** Nothing recorded. */
  | 'none'
  /** Recorded and still valid — replay it, then clear. */
  | 'apply'
  /** Superseded, unusable, or aimed at something that no longer exists — drop it. */
  | 'discard';

const cloneBands = (b: PresetBands): PresetBands => ({
  frequencies: [...b.frequencies],
  gains: [...b.gains],
  qs: [...b.qs]
});

export function ruleFingerprint(rule: Rule): RuleFingerprint {
  return {
    mode: rule.mode,
    preset: rule.preset || '',
    gain: typeof rule.gain === 'number' ? rule.gain : 1,
    enabled: rule.enabled !== false,
    curve: rule.curve ? cloneBands(rule.curve) : null
  };
}

const bandsEqual = (a: PresetBands | null, b: PresetBands | null): boolean => {
  if (!a || !b) return a === b;
  const same = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return same(a.frequencies, b.frequencies) && same(a.gains, b.gains) && same(a.qs, b.qs);
};

export function fingerprintsEqual(a: RuleFingerprint | null, b: RuleFingerprint | null): boolean {
  if (!a || !b) return a === b;
  return a.mode === b.mode && a.preset === b.preset && a.gain === b.gain && a.enabled === b.enabled && bandsEqual(a.curve, b.curve);
}

/** Snapshots its inputs — the caller keeps mutating the arrays it passed in. */
export function makeJournal(
  target: JournalTarget,
  bands: PresetBands,
  gain: number,
  writtenAt: number,
  targetWas: RuleFingerprint | null
): EditJournal {
  return {
    v: JOURNAL_VERSION,
    target: target.kind === 'rule' ? { kind: 'rule', id: target.id } : { kind: 'global' },
    bands: cloneBands(bands),
    gain,
    writtenAt,
    targetWas: targetWas ? { ...targetWas, curve: targetWas.curve ? cloneBands(targetWas.curve) : null } : null
  };
}

const isBands = (b: any): b is PresetBands =>
  !!b && Array.isArray(b.frequencies) && Array.isArray(b.gains) && Array.isArray(b.qs) && b.frequencies.length === b.gains.length && b.gains.length === b.qs.length && b.frequencies.length > 0;

/** Shape check for data that has been through storage — never throws on garbage. */
export function isUsableJournal(j: any): j is EditJournal {
  if (!j || j.v !== JOURNAL_VERSION) return false;
  if (!isBands(j.bands) || typeof j.gain !== 'number' || !Number.isFinite(j.gain)) return false;
  if (typeof j.writtenAt !== 'number' || !Number.isFinite(j.writtenAt)) return false;
  const t = j.target;
  if (!t) return false;
  if (t.kind === 'global') return true;
  return t.kind === 'rule' && typeof t.id === 'string' && !!t.id;
}

export interface ReplayInput {
  journal: unknown;
  /** DEFAULT_EQ's own updatedAt, or null when nothing is stored yet. Global target only. */
  canonicalUpdatedAt: number | null;
  /** The rule the journal names, as it stands right now, or null if it is gone. Rule target only. */
  currentRule: Rule | null;
}

/**
 * Whether a stored journal should be replayed.
 *
 * Two different staleness tests, because the two targets carry different evidence. The global
 * profile stamps every write with `updatedAt`, so time settles it: a canonical write that happened
 * after the journal wins, which is what stops an old journal from undoing a newer save. Rules have
 * no timestamp, so the journal instead remembers how the rule looked when the edit started and only
 * replays if it still looks that way — strictly stronger than a timestamp, since it also refuses
 * when the rule was changed to something else entirely rather than merely later.
 */
export function replayDecision({ journal, canonicalUpdatedAt, currentRule }: ReplayInput): JournalDecision {
  if (journal == null) return 'none';
  if (!isUsableJournal(journal)) return 'discard';

  if (journal.target.kind === 'global') {
    if (canonicalUpdatedAt == null) return 'apply'; // nothing stored yet — the journal is all there is
    return journal.writtenAt > canonicalUpdatedAt ? 'apply' : 'discard';
  }

  if (!currentRule || currentRule.id !== journal.target.id) return 'discard';
  return fingerprintsEqual(ruleFingerprint(currentRule), journal.targetWas) ? 'apply' : 'discard';
}

/**
 * What boot should DO about a stored journal.
 *
 * The decision and the action live together here on purpose. `replayDecision` alone can be correct
 * while the code that calls it quietly ignores the answer — the fingerprint check would then be
 * well-tested and never actually applied. Making the whole recovery path a pure function lets a
 * test assert the outcome (including "the rules array came back untouched"), not just the verdict.
 * The hook is left as a thin executor: run the plan, write, clear on success.
 */
export type ReplayPlan =
  | { action: 'none' }
  | { action: 'discard' }
  | { action: 'apply-global'; bands: PresetBands; gain: number }
  /** `rules` is the full array to persist, with the recovered rule already merged in. */
  | { action: 'apply-rule'; ruleId: string; rules: Rule[] };

export function planReplay(input: { journal: unknown; canonicalUpdatedAt: number | null; rules: Rule[] }): ReplayPlan {
  const { journal, canonicalUpdatedAt, rules } = input;
  const target = (journal as any)?.target;
  const currentRule = target?.kind === 'rule' ? rules.find((r) => r.id === target.id) || null : null;

  const decision = replayDecision({ journal, canonicalUpdatedAt, currentRule });
  if (decision === 'none') return { action: 'none' };
  if (decision === 'discard') return { action: 'discard' };

  const j = journal as EditJournal;
  if (j.target.kind === 'global') return { action: 'apply-global', bands: cloneBands(j.bands), gain: j.gain };

  const ruleId = j.target.id;
  return {
    action: 'apply-rule',
    ruleId,
    rules: rules.map((r) => (r.id === ruleId ? { ...r, mode: 'curve' as const, curve: cloneBands(j.bands), gain: j.gain } : r))
  };
}
