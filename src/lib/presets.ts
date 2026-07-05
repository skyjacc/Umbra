// Preset coercion/normalization — ported from popup.js. Tolerant of foreign/legacy
// formats and hardened against prototype pollution.
import { NUM_FILTERS, DEFAULT_FREQUENCIES, DEFAULT_Q, clampFreq, clampGainDb, clampQ } from './audio';

export const UNSAFE_KEYS = ['__proto__', 'prototype', 'constructor'];

export interface PresetBands {
  frequencies: number[];
  gains: number[];
  qs: number[];
}

// Coerce one preset object into 11-band {frequencies, gains, qs}, or null.
export function coerceBands(p: any): PresetBands | null {
  if (!p || typeof p !== 'object') return null;
  const f = p.frequencies || p.freqs || p.freq || p.f;
  const g = p.gains || p.gain || p.g;
  const q = p.qs || p.q || p.Q;
  if (!Array.isArray(f) || !Array.isArray(g) || !Array.isArray(q)) return null;
  if (f.length === 0) return null;
  const frequencies: number[] = [];
  const gains: number[] = [];
  const qs: number[] = [];
  for (let i = 0; i < NUM_FILTERS; i++) {
    const fn = Number(f[i]);
    const gn = Number(g[i]);
    const qn = Number(q[i]);
    frequencies.push(clampFreq(Number.isFinite(fn) ? fn : DEFAULT_FREQUENCIES[i]));
    gains.push(clampGainDb(Number.isFinite(gn) ? gn : 0));
    qs.push(clampQ(Number.isFinite(qn) ? qn : DEFAULT_Q));
  }
  return { frequencies, gains, qs };
}

// Accept Umbra/legacy {name:{...}}, arrays of presets, alt keys, or a single preset.
// Uses a null-proto accumulator so a preset named "__proto__" can't pollute.
export function normalizePresets(raw: any): Record<string, PresetBands> {
  const out: Record<string, PresetBands> = Object.create(null);
  if (!raw || typeof raw !== 'object') return out;

  if (Array.isArray(raw)) {
    raw.forEach((p, i) => {
      const bands = coerceBands(p);
      if (bands) out[(p && (p.name || p.title)) || 'Preset ' + (i + 1)] = bands;
    });
    return out;
  }

  if (raw.frequencies || raw.freqs || raw.f) {
    const bands = coerceBands(raw);
    if (bands) {
      out[raw.name || raw.title || 'Imported'] = bands;
      return out;
    }
  }

  for (const name in raw) {
    if (UNSAFE_KEYS.includes(name)) continue;
    if (!Object.prototype.hasOwnProperty.call(raw, name)) continue;
    const bands = coerceBands(raw[name]);
    if (bands) out[name] = bands;
  }
  return out;
}

export function presetBandsEqual(a: PresetBands | null, b: PresetBands | null): boolean {
  if (!a || !b) return false;
  if (!Array.isArray(b.frequencies) || !Array.isArray(b.gains) || !Array.isArray(b.qs)) return false;
  for (let i = 0; i < NUM_FILTERS; i++) {
    if (Number(a.frequencies[i]) !== Number(b.frequencies[i])) return false;
    if (Number(a.gains[i]) !== Number(b.gains[i])) return false;
    if (Number(a.qs[i]) !== Number(b.qs[i])) return false;
  }
  return true;
}
