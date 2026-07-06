// Messaging + storage + preset I/O — ported from popup.js. This is the popup's
// side of the popup <-> service-worker <-> offscreen protocol (unchanged).
import {
  NUM_FILTERS,
  DEFAULT_FREQUENCIES,
  DEFAULT_Q,
  clampMasterGain,
  sanitizeFilter,
  sanitizeStatus,
  filterType,
  type Band
} from './audio';
import { coerceBands, normalizePresets, presetBandsEqual, UNSAFE_KEYS, type PresetBands } from './presets';
import { type Rule } from './rules';

export const BUILD = '2.1.0';
export const PRESET_PREFIX = 'PRESETS.';
export const DEQ_PREFIX = 'DEQ.'; // per-hostname saved EQ (mirrors offscreen.js)
export const RULES_KEY = 'RULES'; // sync: ordered domain-rules array (mirrors offscreen.js)
export const EQ_STATE_KEY = 'EQ_STATE';
export const ACTIVE_PRESET_KEY = 'ACTIVE_PRESET';

export const hasChrome = () => typeof chrome !== 'undefined' && !!chrome.runtime;

export interface ActiveTab {
  id: number | null;
  host: string;
  title: string;
  favIconUrl?: string;
  capturable: boolean;
}

// Which tab the popup is looking at (so it edits that tab's EQ). Answered by the
// service worker from chrome.tabs.query({active,currentWindow}).
export function getActiveTab(): Promise<ActiveTab> {
  return new Promise((resolve) => {
    if (!hasChrome()) {
      resolve({ id: null, host: '', title: '', capturable: false });
      return;
    }
    toBackground('getActiveTab', {}, (r: any) => resolve(r || { id: null, host: '', title: '', capturable: false }));
  });
}

// Read a hostname's saved (domain) curve straight from storage, so the popup can
// PREVIEW a site's sticky EQ before the tab is even captured.
export async function readDomainEq(host: string): Promise<{ bands: Band[]; gain: number } | null> {
  if (!hasChrome() || !chrome.storage || !host) return null;
  try {
    const key = DEQ_PREFIX + host;
    const r: any = await chrome.storage.local.get(key);
    const v = r[key];
    if (v && Array.isArray(v.filters) && v.filters.length === NUM_FILTERS) {
      const bands = v.filters.map((b: any, i: number) => sanitizeFilter({ frequency: b.f, gain: b.g, q: b.q }, i));
      return { bands, gain: clampMasterGain(v.gain ?? 1) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Reading chrome.runtime.lastError inside the callback swallows the benign
// "The message port closed before a response was received" console warning that
// fires when a receiver replies late or not at all (e.g. offscreen still waking).
export function toOffscreen(type: string, extra: Record<string, unknown> = {}, cb?: (r: any) => void) {
  if (!hasChrome()) return;
  const msg = { target: 'offscreen', type, ...extra };
  if (cb) {
    chrome.runtime.sendMessage(msg, (resp: any) => {
      void chrome.runtime.lastError;
      cb(resp);
    });
  } else {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
}

export function toBackground(type: string, extra: Record<string, unknown> = {}, cb?: (r: any) => void) {
  if (!hasChrome()) return;
  const msg = { target: 'bg', type, ...extra };
  if (cb) {
    chrome.runtime.sendMessage(msg, (resp: any) => {
      void chrome.runtime.lastError;
      cb(resp);
    });
  } else {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
}

// Trailing-edge throttle for live-drag messages (don't flood the offscreen page).
export function makeThrottle(intervalMs: number) {
  let last = 0;
  let trailing: ReturnType<typeof setTimeout> | null = null;
  return (fn: () => void) => {
    const now = performance.now();
    if (trailing) clearTimeout(trailing);
    if (now - last >= intervalMs) {
      last = now;
      fn();
    } else {
      trailing = setTimeout(() => {
        last = performance.now();
        fn();
      }, intervalMs - (now - last));
    }
  };
}

export const flatBands = (): Band[] =>
  Array.from({ length: NUM_FILTERS }, (_, i) => ({
    frequency: DEFAULT_FREQUENCIES[i],
    gain: 0,
    q: DEFAULT_Q,
    type: filterType(i)
  }));

// Persist the whole EQ as one atomic snapshot (+ legacy per-band mirror).
export function persistEqState(bands: Band[], gain: number, activePreset: string) {
  if (!hasChrome() || !chrome.storage) return;
  const clean = sanitizeStatus({ eqFilters: bands, gain });
  const filters = clean.eqFilters.map((f) => ({ f: f.frequency, g: f.gain, q: f.q }));
  const payload: Record<string, unknown> = {
    [EQ_STATE_KEY]: { v: 1, filters, gain: clean.gain, activePreset: activePreset || '', updatedAt: Date.now() },
    [ACTIVE_PRESET_KEY]: activePreset || '',
    GAIN: clean.gain
  };
  for (let i = 0; i < NUM_FILTERS; i++) payload['filter' + i] = filters[i];
  try {
    chrome.storage.local.set(payload);
  } catch {
    /* storage may be unavailable */
  }
}

export interface InitialState {
  bands: Band[];
  gain: number;
  presets: Record<string, PresetBands>;
  activePreset: string;
}

// Read the saved EQ + presets so the graph paints immediately (engine-independent).
export async function readInitialState(): Promise<InitialState> {
  const presets: Record<string, PresetBands> = {};
  let bands = flatBands();
  let gain = 1;
  let activePreset = '';
  if (!hasChrome() || !chrome.storage) return { bands, gain, presets, activePreset };
  try {
    const keys = ['GAIN', EQ_STATE_KEY, ACTIVE_PRESET_KEY];
    for (let i = 0; i < NUM_FILTERS; i++) keys.push('filter' + i);
    const stored: any = await chrome.storage.local.get(keys);
    const state = stored[EQ_STATE_KEY];
    const src = state && Array.isArray(state.filters) ? state.filters : null;
    bands = Array.from({ length: NUM_FILTERS }, (_, i) => {
      const raw = src ? src[i] : stored['filter' + i];
      const norm = raw ? { frequency: raw.f ?? raw.frequency, gain: raw.g ?? raw.gain, q: raw.q ?? raw.Q } : null;
      return sanitizeFilter(norm, i);
    });
    gain = clampMasterGain(state && state.gain != null ? state.gain : stored.GAIN);
    activePreset = (state && state.activePreset) || stored[ACTIVE_PRESET_KEY] || '';
  } catch {
    /* fall back to flat */
  }
  try {
    const all: any = await chrome.storage.sync.get(null);
    for (const k in all) {
      if (!k.startsWith(PRESET_PREFIX)) continue;
      const name = k.slice(PRESET_PREFIX.length);
      if (UNSAFE_KEYS.includes(name)) continue;
      presets[name] = all[k];
    }
  } catch {
    /* no presets */
  }
  if (activePreset && !presets[activePreset]) activePreset = '';
  return { bands, gain, presets, activePreset };
}

// Read presets from sync storage, self-healing legacy/out-of-range values.
export async function refreshPresets(): Promise<Record<string, PresetBands>> {
  const presets: Record<string, PresetBands> = {};
  if (!hasChrome() || !chrome.storage) return presets;
  try {
    const all: any = await chrome.storage.sync.get(null);
    const heal: Record<string, PresetBands> = {};
    for (const k in all) {
      if (!k.startsWith(PRESET_PREFIX)) continue;
      const name = k.slice(PRESET_PREFIX.length);
      if (UNSAFE_KEYS.includes(name)) continue;
      const raw = all[k];
      const clean = coerceBands(raw);
      if (clean) {
        presets[name] = clean;
        if (!presetBandsEqual(clean, raw)) heal[k] = clean;
      } else {
        presets[name] = raw;
      }
    }
    if (Object.keys(heal).length) {
      try {
        await chrome.storage.sync.set(heal);
      } catch {
        /* heal is best-effort */
      }
    }
  } catch {
    /* ignore */
  }
  return presets;
}

export async function savePreset(name: string, bands: Band[]) {
  const preset = { frequencies: bands.map((b) => b.frequency), gains: bands.map((b) => b.gain), qs: bands.map((b) => b.q) };
  await chrome.storage.sync.set({ [PRESET_PREFIX + name]: preset });
}

export async function deletePreset(name: string) {
  await chrome.storage.sync.remove(PRESET_PREFIX + name);
}

// Domain rules live in one sync array key so ordering (first-match-wins) is preserved.
export async function readRules(): Promise<Rule[]> {
  if (!hasChrome() || !chrome.storage) return [];
  try {
    const r: any = await chrome.storage.sync.get(RULES_KEY);
    return Array.isArray(r[RULES_KEY]) ? r[RULES_KEY] : [];
  } catch {
    return [];
  }
}

export async function writeRules(rules: Rule[]): Promise<boolean> {
  if (!hasChrome() || !chrome.storage) return false;
  try {
    await chrome.storage.sync.set({ [RULES_KEY]: rules });
    return true;
  } catch {
    return false; // sync quota exceeded
  }
}

export async function importPresetsText(text: string): Promise<{ count: number; error?: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { count: 0, error: 'not a valid JSON file' };
  }
  const presets = normalizePresets(parsed);
  const names = Object.keys(presets);
  if (!names.length) return { count: 0, error: 'no compatible presets in that file' };
  const toSet: Record<string, PresetBands> = {};
  for (const n of names) toSet[PRESET_PREFIX + n] = presets[n];
  try {
    await chrome.storage.sync.set(toSet);
  } catch {
    return { count: 0, error: 'save failed (storage full?)' };
  }
  return { count: names.length };
}

export function bandsToPreset(bands: Band[]): PresetBands {
  return { frequencies: bands.map((b) => b.frequency), gains: bands.map((b) => b.gain), qs: bands.map((b) => b.q) };
}

export function presetToBands(p: PresetBands): Band[] {
  return Array.from({ length: NUM_FILTERS }, (_, i) =>
    sanitizeFilter({ frequency: p.frequencies[i], gain: p.gains[i], q: p.qs[i] }, i)
  );
}
