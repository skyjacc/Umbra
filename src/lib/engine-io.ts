// Messaging + storage + preset I/O — ported from popup.js. This is the popup's
// side of the popup <-> service-worker <-> offscreen protocol (unchanged).
import {
  NUM_FILTERS,
  DEFAULT_FREQUENCIES,
  DEFAULT_Q,
  clampMasterGain,
  sanitizeFilter,
  filterType,
  type Band
} from './audio';
import { coerceBands, normalizePresets, presetBandsEqual, UNSAFE_KEYS, type PresetBands } from './presets';
import { parsePatterns, newRuleId, type Rule } from './rules';

export const BUILD = '2.2.0';
export const PRESET_PREFIX = 'PRESETS.';
export const RULES_KEY = 'RULES'; // sync: ordered domain-rules array

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

// Are we the "Full window" page (opened in its own tab), not the browser-action popup?
// chrome.tabs.getCurrent resolves to the running tab in a real tab, and to undefined in a
// popup — the canonical way to tell the two apart (both load the same index.html). Used to
// run the full-window page as a GLOBAL-PROFILE editor (its own tab isn't capturable).
export function isFullWindowTab(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!hasChrome() || !chrome.tabs || !chrome.tabs.getCurrent) {
        resolve(false);
        return;
      }
      chrome.tabs.getCurrent((tab) => {
        void chrome.runtime.lastError;
        resolve(!!tab);
      });
    } catch {
      resolve(false);
    }
  });
}

// Global profile (v2 source of truth) — the sound played on every tab with no matching rule.
// The popup writes it (writeDefaultEq) and resolves each tab from it. Stored as a curve.
export const DEFAULT_EQ_KEY = 'DEFAULT_EQ';
export async function readDefaultEq(): Promise<{ bands: Band[]; gain: number } | null> {
  if (!hasChrome() || !chrome.storage) return null;
  try {
    const r: any = await chrome.storage.local.get(DEFAULT_EQ_KEY);
    const v = r[DEFAULT_EQ_KEY];
    if (v && Array.isArray(v.filters) && v.filters.length === NUM_FILTERS) {
      const bands = v.filters.map((b: any, i: number) => sanitizeFilter({ frequency: b.f, gain: b.g, q: b.q }, i));
      return { bands, gain: clampMasterGain(v.gain ?? 1) };
    }
  } catch {
    /* ignore */
  }
  return null;
}
export async function writeDefaultEq(bands: Band[], gain: number) {
  if (!hasChrome() || !chrome.storage) return;
  const filters = bands.map((b) => ({ f: b.frequency, g: b.gain, q: b.q }));
  try {
    await chrome.storage.local.set({ [DEFAULT_EQ_KEY]: { v: 1, filters, gain: clampMasterGain(gain), updatedAt: Date.now() } });
  } catch {
    /* ignore */
  }
}
export async function clearDefaultEq() {
  if (!hasChrome() || !chrome.storage) return;
  try {
    await chrome.storage.local.remove(DEFAULT_EQ_KEY);
  } catch {
    /* ignore */
  }
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

export interface InitialState {
  bands: Band[];
  gain: number;
  presets: Record<string, PresetBands>;
  activePreset: string;
}

// Read saved presets (sync) so the popup can paint them immediately. The active
// tab's live curve comes from the engine broadcast, so bands/gain start flat here.
export async function readInitialState(): Promise<InitialState> {
  const presets: Record<string, PresetBands> = {};
  const base = { bands: flatBands(), gain: 1, activePreset: '' };
  if (!hasChrome() || !chrome.storage) return { ...base, presets };
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
  return { ...base, presets };
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

// Sanitize rules from an untrusted share code before they touch storage/matching:
// coerce every pattern to a clean string (a non-string pattern would throw in
// matchRule and white-screen the popup), validate curve payloads via coerceBands,
// require a real preset name for preset rules, mint fresh ids, drop everything else.
export function sanitizeImportedRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return [];
  const out: Rule[] = [];
  for (const r of raw as any[]) {
    if (!r || (r.mode !== 'preset' && r.mode !== 'curve') || !Array.isArray(r.patterns)) continue;
    const patterns = parsePatterns(r.patterns.join(' '));
    if (!patterns.length) continue;
    if (r.mode === 'curve') {
      const curve = coerceBands(r.curve);
      if (!curve) continue;
      out.push({
        id: newRuleId(),
        patterns,
        mode: 'curve',
        curve,
        gain: clampMasterGain(r.gain ?? 1),
        preset: typeof r.preset === 'string' ? r.preset : '',
        enabled: r.enabled !== false
      });
    } else {
      if (typeof r.preset !== 'string' || !r.preset) continue;
      out.push({ id: newRuleId(), patterns, mode: 'preset', preset: r.preset, enabled: r.enabled !== false });
    }
  }
  return out;
}

// Share codes — a self-contained, offline base64 string (no server/link) that bundles
// presets and/or rules. UTF-8 safe.
const SHARE_PREFIX = 'UMBRA1:';
export interface SharePayload {
  presets?: Record<string, PresetBands>;
  rules?: Rule[];
}
function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function b64decode(b64: string): string {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
export function encodeShare(payload: SharePayload): string {
  return SHARE_PREFIX + b64encode(JSON.stringify(payload));
}
export function decodeShare(code: string): SharePayload | null {
  const s = (code || '').trim();
  const body = s.startsWith(SHARE_PREFIX) ? s.slice(SHARE_PREFIX.length) : s;
  try {
    const obj = JSON.parse(b64decode(body));
    if (obj && typeof obj === 'object') return obj as SharePayload;
  } catch {
    /* not a valid code */
  }
  return null;
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

// --- Debug snapshot: storage + engine ring-buffer logs, as one text blob the user pastes. ---
function fetchLogs(target: 'bg' | 'offscreen'): Promise<any> {
  return new Promise((resolve) => {
    if (!hasChrome()) return resolve({ unavailable: true });
    const to = setTimeout(() => resolve({ timeout: true }), 1500);
    const send = target === 'bg' ? toBackground : toOffscreen;
    send('getLogs', {}, (r: any) => {
      clearTimeout(to);
      resolve(r || { none: true });
    });
  });
}

export async function collectDebug(extra: Record<string, unknown>): Promise<string> {
  const out: string[] = [];
  out.push('=== UmbraEQ debug · build ' + BUILD + ' ===');
  out.push('popup: ' + JSON.stringify(extra));
  if (hasChrome() && chrome.storage) {
    try {
      const local: any = await chrome.storage.local.get(null);
      const sync: any = await chrome.storage.sync.get(null);
      out.push('DEFAULT_EQ (global profile): ' + JSON.stringify(local[DEFAULT_EQ_KEY] ?? null));
      out.push('AUTO_DOMAIN: ' + JSON.stringify(local.AUTO_DOMAIN));
      const deq = Object.keys(local).filter((k) => k.startsWith('DEQ.')); // v1 leftovers (unused in v2)
      out.push('DEQ leftover keys (' + deq.length + '): ' + JSON.stringify(deq));
      out.push('RULES: ' + JSON.stringify(sync[RULES_KEY] ?? []));
      out.push('preset names: ' + JSON.stringify(Object.keys(sync).filter((k) => k.startsWith(PRESET_PREFIX)).map((k) => k.slice(PRESET_PREFIX.length))));
    } catch (e) {
      out.push('storage error: ' + String(e));
    }
  }
  const bg: any = await fetchLogs('bg');
  out.push('--- background · build ' + (bg.build ?? '?') + ' · state=' + JSON.stringify(bg.state ?? {}) + ' ---');
  (bg.log ?? []).forEach((l: string) => out.push('bg ' + l));
  const off: any = await fetchLogs('offscreen');
  out.push('--- offscreen · build ' + (off.build ?? '?') + ' · state=' + JSON.stringify(off.state ?? {}) + ' ---');
  (off.log ?? []).forEach((l: string) => out.push('off ' + l));
  return out.join('\n');
}
