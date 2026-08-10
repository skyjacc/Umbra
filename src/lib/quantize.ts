// Rounding curves down to a storage grid, at the write boundary and nowhere else.
//
// Why this exists. Rules live in chrome.storage.sync under ONE key, and sync enforces 8192 bytes
// per item. A dragged band is whatever xToFreq/yToDb returned — 20.94643674875, -19.73421875123,
// 0.7071067811865476 — and eleven of those, three times over, is most of a rule. Measured: 702
// bytes per fully dragged rule, so the array stops fitting at eleven saved sites and every later
// write fails with a quota error. That ceiling is not documented anywhere and nothing warns about
// it; the user simply finds that saving stopped working.
//
// The grid is chosen to be finer than the product can express:
//   frequency 0.1 Hz   — 0.043 of a semitone at the lowest band; the UI prints whole Hz
//   gain      0.1 dB   — the UI prints one decimal, so the error is literally not renderable
//   Q         0.001    — 0.01% of the default 0.7071
// 368 bytes per rule, 22 sites. Coarser grids buy little: whole Hz reaches 24 sites but costs 0.43
// of a semitone at 20 Hz, which is a real detuning of a narrow filter for two extra rules.
//
// WHERE IT IS ALLOWED TO RUN. Only on the way into storage. The editing buffer, the engine and the
// graph keep full precision, so a value is rounded once, when it is written — never accumulated
// upon. Rounding state instead of the write would coarsen the curve a little more on every
// open-edit-save trip, which is the failure this module's tests are mostly about.
//
// Reading does NOT quantize. Rules stored by an older version keep their exact values until the
// user next saves, and then they are normalized along with everything else — the array is a single
// item, so it is rewritten whole regardless, and normalizing all of it is what lets an existing
// install reclaim the space its old rules are wasting.

import type { Rule } from './rules';
import type { PresetBands } from './presets';

const FREQ_DECIMALS = 1;
const GAIN_DECIMALS = 1;
const Q_DECIMALS = 3;

export const FREQ_STEP = 10 ** -FREQ_DECIMALS;
export const GAIN_STEP = 10 ** -GAIN_DECIMALS;
export const Q_STEP = 10 ** -Q_DECIMALS;

/**
 * Round to a decimal count rather than to a step.
 *
 * `Math.round(v / step) * step` is the obvious spelling and it defeats the purpose: 0.1 * 3 is
 * 0.30000000000000004, which serializes to seventeen more characters than "0.3". Dividing an
 * integer by a power of ten lands on the double that JSON prints in its shortest form.
 */
const round = (v: number, decimals: number): number => {
  const p = 10 ** decimals;
  return Math.round(v * p) / p;
};

/** A copy on the storage grid. Never mutates its argument — the caller's buffer stays exact. */
export function quantizeCurve(curve: PresetBands): PresetBands {
  return {
    frequencies: curve.frequencies.map((v) => round(v, FREQ_DECIMALS)),
    gains: curve.gains.map((v) => round(v, GAIN_DECIMALS)),
    qs: curve.qs.map((v) => round(v, Q_DECIMALS))
  };
}

/**
 * The whole array, ready to serialize.
 *
 * Touches `curve` and nothing else. A rule's identity and reach — id, patterns, enabled — are not
 * numbers anyone dragged, and `gain` is one value per rule whose full precision costs about four
 * percent of the rule; not worth a second semantic change inside a fix about capacity.
 */
export function quantizeRules(rules: Rule[]): Rule[] {
  return rules.map((r) => (r.curve ? { ...r, curve: quantizeCurve(r.curve) } : r));
}
