// Typing a band's numbers instead of dragging them.
//
// Dragging is fast and imprecise; sometimes you know the number. This is the arithmetic behind the
// editable readout under the graph — parsing what was typed, printing it back, and how far an
// arrow key moves a value.
//
// EVERYTHING GOES THROUGH THE SAME CLAMPS AS THE DRAG. clampFreq, clampGainDb and clampQ are the
// ones the pointer path already uses and the ones the engine's own clamps are kept in lock-step
// with. A second, parallel set of bounds here is how a typed value ends up in a state the graph or
// the audio engine was never built to receive.
//
// FREQUENCY MOVES BY RATIO, NOT BY HERTZ. A fixed 10 Hz is a third of the way up the bottom band
// and inaudible at 10 kHz. Fractions of an octave are what the drag already feels like, because
// the graph's x axis is logarithmic.
//
// OUT OF RANGE IS CLAMPED, NOT REJECTED. Typing 9999 dB is a mistake, not an attack; snapping to
// the ceiling shows the user the limit, whereas an error message on a field with no visible range
// just tells them they are wrong without saying what would be right.

import { clampFreq, clampGainDb, clampQ } from './audio';

export type BandField = 'frequency' | 'gain' | 'q';
export type StepSize = 'coarse' | 'normal' | 'fine';

/** Fine beats coarse when both are held: a stray Shift must not enlarge a careful adjustment. */
export function stepKind(mods: { shift?: boolean; alt?: boolean }): StepSize {
  if (mods.alt) return 'fine';
  if (mods.shift) return 'coarse';
  return 'normal';
}

/** Octave fractions for frequency; plain units for the other two. */
const STEPS: Record<BandField, Record<StepSize, number>> = {
  frequency: { fine: 1 / 24, normal: 1 / 6, coarse: 1 },
  gain: { fine: 0.1, normal: 1, coarse: 3 },
  q: { fine: 0.01, normal: 0.1, coarse: 0.5 }
};

export function nudge(field: BandField, value: number, direction: 1 | -1, size: StepSize): number {
  const step = STEPS[field][size];
  if (field === 'frequency') return clampFreq(value * Math.pow(2, direction * step));
  if (field === 'gain') return clampGainDb(value + direction * step);
  return clampQ(value + direction * step);
}

const CLAMPS: Record<BandField, (n: number) => number> = { frequency: clampFreq, gain: clampGainDb, q: clampQ };

/**
 * Read a typed value, or null when there is no number in it at all.
 *
 * Deliberately forgiving about the things people actually type: a leading plus, a comma for a
 * decimal point, the unit copied off the screen, and the `k` the frequency axis itself prints.
 */
export function parseField(field: BandField, text: string): number | null {
  const cleaned = String(text).trim().replace(',', '.');
  const m = cleaned.match(/^[+-]?(?:\d+\.?\d*|\.\d+)/);
  if (!m) return null;
  let n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  // `1.3k` — only for frequency, where the axis labels use it. "3k dB" is not a thing.
  if (field === 'frequency' && /^\s*k/i.test(cleaned.slice(m[0].length))) n *= 1000;
  return CLAMPS[field](n);
}

/** Print at the precision the readout already shows, so reading and retyping is a round trip. */
export function formatField(field: BandField, value: number): string {
  if (field === 'frequency') return String(Math.round(value));
  if (field === 'gain') return (Math.round(value * 10) / 10).toFixed(1);
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * Is this text just what the field was already showing?
 *
 * Focusing a field and leaving it is not an edit, and the field commits on blur — so without this
 * question a Tab through the row, or Escape (which blurs), wrote the band back to storage. That
 * write is not harmless. The readout is printed at DISPLAY precision, so what gets committed is
 * the rounded number: a band dragged to 437.34 Hz comes back 437, gain 1.2534 comes back 1.3, Q
 * 0.7071 comes back 0.71. Worse, the commit counts as a canonical write, and a canonical write
 * spends the Reset-profile undo slot — which is the only copy of a rule that Reset just deleted.
 *
 * Compared against the FORMATTED value rather than the raw one, because the formatted value is
 * what the user was looking at. Retyping the same digits is not a change either; the raw
 * comparison would call it one, since the band behind "437" is 437.34.
 */
export function isUnchanged(field: BandField, text: string, current: number): boolean {
  return String(text).trim() === formatField(field, current);
}
