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

export const BUILD = '2.4.1';
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
// Write-ahead record of the edit in progress. Deliberately in `local`: it is written often during a
// drag, and local has no write-rate quota (sync caps writes per minute AND per hour). It is also
// per-machine by nature — a half-finished edit is not something to sync to other devices.
export const JOURNAL_KEY = 'EDIT_JOURNAL';
/**
 * `updatedAt` has always been written here; it just wasn't read back. The edit journal needs it to
 * tell "my unsaved edit is newer" from "a normal save already superseded it", so it is surfaced
 * now. Absent on records written before this field existed, hence nullable.
 */
export async function readDefaultEq(): Promise<{ bands: Band[]; gain: number; updatedAt: number | null } | null> {
  if (!hasChrome() || !chrome.storage) return null;
  try {
    const r: any = await chrome.storage.local.get(DEFAULT_EQ_KEY);
    const v = r[DEFAULT_EQ_KEY];
    if (v && Array.isArray(v.filters) && v.filters.length === NUM_FILTERS) {
      const bands = v.filters.map((b: any, i: number) => sanitizeFilter({ frequency: b.f, gain: b.g, q: b.q }, i));
      const updatedAt = typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) ? v.updatedAt : null;
      return { bands, gain: clampMasterGain(v.gain ?? 1), updatedAt };
    }
  } catch {
    /* ignore */
  }
  return null;
}
/**
 * Outcome of a persistence attempt. Returned rather than swallowed: a write that fails silently
 * leaves the UI claiming a sound is saved while storage disagrees, which is the hardest class of
 * bug to notice and the easiest to lose data to.
 */
export type PersistResult = { ok: true } | { ok: false; error: string };

const persistFailed = (e: unknown): PersistResult => ({ ok: false, error: (e as Error)?.message || String(e) });

export async function writeDefaultEq(bands: Band[], gain: number): Promise<PersistResult> {
  if (!hasChrome() || !chrome.storage) return { ok: false, error: 'no storage' };
  const filters = bands.map((b) => ({ f: b.frequency, g: b.gain, q: b.q }));
  try {
    await chrome.storage.local.set({ [DEFAULT_EQ_KEY]: { v: 1, filters, gain: clampMasterGain(gain), updatedAt: Date.now() } });
    return { ok: true };
  } catch (e) {
    return persistFailed(e);
  }
}

export async function writeJournal(journal: unknown): Promise<PersistResult> {
  if (!hasChrome() || !chrome.storage) return { ok: false, error: 'no storage' };
  try {
    await chrome.storage.local.set({ [JOURNAL_KEY]: journal });
    return { ok: true };
  } catch (e) {
    return persistFailed(e);
  }
}

/** Raw, unvalidated — the caller decides whether it is usable (see lib/journal.ts). */
export async function readJournal(): Promise<unknown> {
  if (!hasChrome() || !chrome.storage) return null;
  try {
    const r: any = await chrome.storage.local.get(JOURNAL_KEY);
    return r[JOURNAL_KEY] ?? null;
  } catch {
    return null;
  }
}

/**
 * Only ever called after the canonical write succeeded. Dropping the journal on a failed write
 * would discard the one copy of the edit at the exact moment it is the only copy.
 */
export async function clearJournal(): Promise<void> {
  if (!hasChrome() || !chrome.storage) return;
  try {
    await chrome.storage.local.remove(JOURNAL_KEY);
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
      presets[name] = coerceBands(all[k]) ?? all[k]; // sanitize legacy/foreign shapes for first paint
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
  return (await writeRulesResult(rules)).ok;
}

/** Same write, with the reason when it fails — sync enforces both a per-minute and an hourly cap. */
export async function writeRulesResult(rules: Rule[]): Promise<PersistResult> {
  if (!hasChrome() || !chrome.storage) return { ok: false, error: 'no storage' };
  try {
    await chrome.storage.sync.set({ [RULES_KEY]: rules });
    return { ok: true };
  } catch (e) {
    return persistFailed(e); // typically the sync write quota
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
  if (body.length > 64 * 1024) return null; // reject oversized blobs before decode/parse (sync-quota / DoS guard)
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
  // Defensive: readInitialState/refreshPresets deliberately keep a raw, un-coercible preset shape
  // (legacy or tampered chrome.storage.sync) whose frequencies/gains/qs may not be arrays. Indexing
  // those throws and — via resolvedFor/applyEverywhere — makes the engine look dead for every
  // captured tab. Coerce first; fall back to a flat curve so a corrupt preset degrades to a no-op.
  const c = coerceBands(p) ?? {
    frequencies: DEFAULT_FREQUENCIES,
    gains: Array(NUM_FILTERS).fill(0),
    qs: Array(NUM_FILTERS).fill(DEFAULT_Q)
  };
  return Array.from({ length: NUM_FILTERS }, (_, i) =>
    sanitizeFilter({ frequency: c.frequencies[i], gain: c.gains[i], q: c.qs[i] }, i)
  );
}
