import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEngine } from './useEngine';
import * as io from '@/lib/engine-io';
import { makeJournal } from '@/lib/journal';

const clone = <T,>(v: T): T => structuredClone(v);
const preset = (gain: number) => io.bandsToPreset(io.flatBands().map((b, i) => ({ ...b, gain: i === 2 ? gain : 0 })));
let local: Record<string, any>, sync: Record<string, any>, live: any[], full: boolean;
let messages: any[], copied: string, rejectRules: boolean, rejectClearGlobal: boolean;
let runtimeListeners: Set<(m: any) => void>, storageListeners: Set<(changes: any, area: string) => void>;
let storage: any;

const broadcast = () => runtimeListeners.forEach(fn => fn({ type: 'workspaceStatus', build: io.BUILD, tabs: clone(live), sampleRate: 44100 }));
const settle = async (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const setup = async () => {
  const hook = renderHook(() => useEngine());
  await settle();
  act(broadcast);
  await settle();
  return hook;
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  full = false; copied = ''; rejectRules = false; rejectClearGlobal = false; messages = [];
  local = { DEFAULT_EQ: { filters: io.flatBands().map(b => ({ f: b.frequency, g: b.gain, q: b.q })), gain: 1 } };
  sync = { RULES: [] };
  live = [{ id: 1, host: 'example.com', url: 'https://example.com/', title: 'Example', gain: 1, eqFilters: io.flatBands(), activePreset: '' }];
  runtimeListeners = new Set(); storageListeners = new Set();
  const area = (name: 'sync' | 'local') => ({
    get: async (key: string | null) => { const data = name === 'sync' ? sync : local; return clone(key == null ? data : { [key]: data[key] }); },
    set: async (patch: any) => {
      if (name === 'sync' && rejectRules && 'RULES' in patch) throw new Error('quota exceeded');
      const data = name === 'sync' ? sync : local;
      const changes: any = {};
      for (const [key, value] of Object.entries(patch)) {
        if (JSON.stringify(value) === JSON.stringify(data[key])) continue;
        changes[key] = { oldValue: data[key], newValue: value }; data[key] = clone(value);
      }
      if (Object.keys(changes).length) storageListeners.forEach(fn => fn(changes, name));
    },
    remove: async (key: string) => {
      if (name === 'local' && key === 'DEFAULT_EQ' && rejectClearGlobal) throw new Error('storage unavailable');
      const data = name === 'sync' ? sync : local;
      const oldValue = data[key]; delete data[key];
      if (oldValue !== undefined) storageListeners.forEach(fn => fn({ [key]: { oldValue } }, name));
    }
  });
  storage = { local: area('local'), sync: area('sync'), onChanged: { addListener: (f: any) => storageListeners.add(f), removeListener: (f: any) => storageListeners.delete(f) } };
  vi.stubGlobal('chrome', {
    storage,
    tabs: { getCurrent: (cb: any) => cb(full ? { id: 90 } : undefined) },
    runtime: {
      onMessage: { addListener: (f: any) => runtimeListeners.add(f), removeListener: (f: any) => runtimeListeners.delete(f) },
      sendMessage: (m: any, cb?: any) => {
        messages.push(clone(m));
        const tab = live.find(t => t.id === m.tabId);
        if (m.type === 'applySettings' && tab) Object.assign(tab, { eqFilters: clone(m.eqFilters), gain: m.gain, activePreset: m.activePreset ?? tab.activePreset });
        if (m.type === 'modifyGain' && tab) tab.gain = m.gain;
        const answer = m.type === 'getActiveTab' ? { id: 1, host: 'example.com', title: 'Example', capturable: true }
          : m.type === 'getStatus' ? { type: 'workspaceStatus', build: io.BUILD, tabs: clone(live), sampleRate: 44100 } : undefined;
        if (cb) cb(answer);
        return Promise.resolve(answer);
      }
    }
  });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { copied = value; } } });
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('useEngine storage and lifecycle integration', () => {
  it('cancels queued live audio when entering bypass', async () => {
    const hook = await setup();
    act(() => hook.result.current.onBandsLive(io.presetToBands(preset(9))));
    act(() => hook.result.current.toggleBypass());
    await settle(50);
    expect(hook.result.current.bypassed).toBe(true);
    expect(live[0].eqFilters[2].gain).toBe(0);
  });

  it('keeps master gain uncompensated while the equalizer is bypassed', async () => {
    local.AUTO_GAIN = true;
    local.DEFAULT_EQ.filters[2].g = 6;
    const hook = await setup();
    act(() => hook.result.current.toggleBypass());
    act(() => hook.result.current.onGainLive(1.1)); await settle(50);
    expect(live[0].eqFilters[2].gain).toBe(0);
    expect(live[0].gain).toBeCloseTo(1.1);
  });

  it('pauses new edits while saving the current sound for a site', async () => {
    const hook = await setup();
    act(() => hook.result.current.onBandsLive(io.presetToBands(preset(6)))); await settle(160);
    const originalSet = storage.sync.set;
    let release!: () => void;
    vi.spyOn(storage.sync, 'set').mockImplementation((patch: any) => 'RULES' in patch
      ? new Promise<void>(resolve => { release = () => { void originalSet(patch).then(resolve); }; })
      : originalSet(patch));
    let saving!: Promise<void>;
    act(() => { saving = hook.result.current.saveForThisSite(); }); await settle();
    expect(hook.result.current.canEdit).toBe(false);
    act(() => hook.result.current.onBandsLive(io.presetToBands(preset(9))));
    await act(async () => { release(); await saving; }); await settle();
    expect(hook.result.current.bands[2].gain).toBe(6);
    expect(hook.result.current.canEdit).toBe(true);
  });

  it('does not recreate a canceled rule edit from a trailing journal write after Reset changes', async () => {
    sync.RULES = [{ id: 'r1', patterns: ['example.com'], mode: 'curve', curve: preset(6), gain: 1, enabled: true }];
    const hook = await setup();
    act(() => hook.result.current.onBandsLive(io.presetToBands(preset(9))));
    await settle(20);
    act(() => hook.result.current.resetChanges());
    await settle(200);
    expect(local.EDIT_JOURNAL).toBeUndefined();
    expect(live[0].eqFilters[2].gain).toBe(6);
    hook.unmount();
    const next = await setup();
    expect(next.result.current.bands[2].gain).toBe(6);
  });

  it('does not clear a newer recovery journal when an older commit finishes', async () => {
    const hook = await setup();
    const originalSet = storage.local.set;
    let release!: () => void;
    vi.spyOn(storage.local, 'set').mockImplementation(async (patch: any) => {
      await originalSet(patch);
      if ('DEFAULT_EQ' in patch) await new Promise<void>(resolve => { release = resolve; });
    });
    act(() => hook.result.current.onBandsLive(io.presetToBands(preset(6)))); await settle(160);
    act(() => hook.result.current.onCommit()); await settle(210);
    act(() => hook.result.current.onBandsLive(io.presetToBands(preset(9)))); await settle(160);
    expect(local.EDIT_JOURNAL.bands.gains[2]).toBe(9);
    await act(async () => release()); await settle();
    expect(local.EDIT_JOURNAL?.bands.gains[2]).toBe(9);
    // Finish the newer edit normally so teardown has no deliberately stalled write.
    vi.restoreAllMocks();
  });

  it('does not replay an older global journal when the canonical profile read fails', async () => {
    local.DEFAULT_EQ.filters[2].g = 12;
    local.DEFAULT_EQ.updatedAt = 2000;
    local.EDIT_JOURNAL = makeJournal({ kind: 'global' }, preset(3), 1, 1000, null);
    live[0].eqFilters = io.presetToBands(preset(12));
    const originalGet = storage.local.get;
    vi.spyOn(storage.local, 'get').mockImplementation(async key => {
      if (key === 'DEFAULT_EQ') throw new Error('storage unavailable');
      return originalGet(key);
    });
    const hook = await setup();
    expect(local.DEFAULT_EQ.filters[2].g).toBe(12);
    expect(local.EDIT_JOURNAL).toBeDefined();
    expect(live[0].eqFilters[2].gain).toBe(12);
    expect(hook.result.current.canEdit).toBe(false);
  });

  it('keeps existing rules intact when another boot dependency is unreadable', async () => {
    const originalRules = [{ id: 'saved', patterns: ['other.com'], mode: 'curve', curve: preset(6), enabled: true }];
    sync.RULES = clone(originalRules);
    const originalGet = storage.local.get;
    vi.spyOn(storage.local, 'get').mockImplementation(async key => {
      if (key === 'DEFAULT_EQ') throw new Error('read unavailable');
      return originalGet(key);
    });
    const hook = await setup();
    const added = { id: 'new', patterns: ['example.com'], mode: 'curve' as const, curve: preset(9), enabled: true };
    await act(async () => hook.result.current.addRule(added));
    await act(async () => hook.result.current.importShareCode(io.encodeShare({ rules: [added] })));
    expect(sync.RULES).toEqual(originalRules);
    expect(hook.result.current.notice.text).not.toContain('Imported');
  });

  it('keeps the latest drag in recovery when pagehide flush fails before the journal throttle fires', async () => {
    const hook = await setup();
    act(() => hook.result.current.onBandsLive(io.presetToBands(preset(6)))); await settle(160);
    act(() => hook.result.current.onBandsLive(io.presetToBands(preset(9))));
    const originalSet = storage.local.set;
    vi.spyOn(storage.local, 'set').mockImplementation(async (patch: any) => {
      if ('DEFAULT_EQ' in patch) throw new Error('write unavailable');
      return originalSet(patch);
    });
    act(() => window.dispatchEvent(new Event('pagehide'))); await settle();
    expect(local.EDIT_JOURNAL.bands.gains[2]).toBe(9);
  });

  it('preserves live audio and pauses editing when a preset dependency cannot be read at boot', async () => {
    sync.RULES = [{ id: 'r1', patterns: ['example.com'], mode: 'preset', preset: 'Mine', enabled: true }];
    sync['PRESETS.Mine'] = preset(6);
    live[0].eqFilters = io.presetToBands(preset(6));
    const originalGet = storage.sync.get;
    vi.spyOn(storage.sync, 'get').mockImplementation(async key => {
      if (key === null) throw new Error('read unavailable');
      return originalGet(key);
    });
    const hook = await setup();
    expect(live[0].eqFilters[2].gain).toBe(6);
    expect(hook.result.current.canEdit).toBe(false);
    expect(hook.result.current.stateReadError).toContain('Editing is paused');
  });

  it('does not let a slow boot snapshot overwrite a newer storage change', async () => {
    const originalGet = storage.local.get;
    let release!: () => void;
    let deferred = false;
    vi.spyOn(storage.local, 'get').mockImplementation(key => {
      if (key !== 'DEFAULT_EQ' || deferred) return originalGet(key);
      deferred = true;
      const snapshot = clone({ DEFAULT_EQ: local.DEFAULT_EQ });
      return new Promise(resolve => { release = () => resolve(snapshot); });
    });
    const hook = await setup();
    await act(async () => storage.local.set({ DEFAULT_EQ: { ...local.DEFAULT_EQ, gain: 2 } })); await settle();
    await act(async () => release()); await settle();
    expect(hook.result.current.gain).toBe(2);
    expect(live[0].gain).toBe(2);
  });

  it('preserves the previous sound when a global refresh fails', async () => {
    local.DEFAULT_EQ.filters[2].g = 6;
    const hook = await setup();
    const originalGet = storage.local.get;
    vi.spyOn(storage.local, 'get').mockImplementation(async key => {
      if (key === 'DEFAULT_EQ') throw new Error('read unavailable');
      return originalGet(key);
    });
    await act(async () => storage.local.set({ DEFAULT_EQ: { ...local.DEFAULT_EQ, gain: 2 } })); await settle(6000);
    expect(live[0].eqFilters[2].gain).toBe(6);
    expect(hook.result.current.canEdit).toBe(false);
    expect(hook.result.current.stateReadError).toContain('Editing is paused');
  });

  it('does not claim a preset was deleted when storage rejects the deletion', async () => {
    sync['PRESETS.Mine'] = preset(6);
    local.DEFAULT_EQ.preset = 'Mine';
    const hook = await setup();
    vi.spyOn(storage.sync, 'remove').mockRejectedValue(new Error('storage unavailable'));
    await act(async () => hook.result.current.deletePreset('Mine')); await settle();
    expect(hook.result.current.activePreset).toBe('Mine');
    expect(hook.result.current.notice.text).not.toContain('Deleted');
    expect(sync['PRESETS.Mine']).toBeDefined();
  });

  it('does not import preset-dependent rules after their preset write fails', async () => {
    const hook = await setup();
    const originalSet = storage.sync.set;
    vi.spyOn(storage.sync, 'set').mockImplementation(async (patch: any) => {
      if ('PRESETS.Imported' in patch) throw new Error('quota exceeded');
      return originalSet(patch);
    });
    const code = io.encodeShare({ presets: { Imported: preset(6) }, rules: [{ id: 'r', patterns: ['example.com'], mode: 'preset', preset: 'Imported', enabled: true }] });
    await act(async () => hook.result.current.importShareCode(code)); await settle();
    expect(sync.RULES).toEqual([]);
    expect(hook.result.current.notice.text).toContain('Import failed');
  });

  it('does not report or play imported rules when storage rejects their write', async () => {
    const hook = await setup();
    rejectRules = true;
    const code = io.encodeShare({ rules: [{ id: 'r', patterns: ['example.com'], mode: 'curve', curve: preset(6), enabled: true }] });
    await act(async () => hook.result.current.importShareCode(code)); await settle();
    expect(hook.result.current.rules).toEqual([]);
    expect(live[0].eqFilters[2].gain).toBe(0);
    expect(hook.result.current.notice.text).not.toContain('Imported');
    expect(sync.RULES).toEqual([]);
  });

  it('clears active captures and editing after a fatal engine failure', async () => {
    const hook = await setup();
    expect(hook.result.current.capturing).toBe(true);
    expect(hook.result.current.canEdit).toBe(true);
    act(() => runtimeListeners.forEach(fn => fn({ type: 'workspaceStatus', build: io.BUILD, failed: true, error: 'Worklet failed' })));
    await settle(7000);
    expect(hook.result.current.engineStatus).toBe('error');
    expect(hook.result.current.tabs).toEqual([]);
    expect(hook.result.current.capturing).toBe(false);
    expect(hook.result.current.canEdit).toBe(false);
    expect(hook.result.current.captureState).toBe('error');
    expect(hook.result.current.lastError).toBe('Worklet failed');
  });

  it('does not overwrite worker audio until storage hydration and journal replay both finish', async () => {
    live[0].eqFilters = io.presetToBands(preset(6));
    local.EDIT_JOURNAL = makeJournal({ kind: 'global' }, preset(9), 1, Date.now(), null);
    let releaseRead!: () => void, releaseWrite!: () => void;
    const originalGet = storage.local.get;
    const originalSet = storage.local.set;
    let heldRead = false;
    vi.spyOn(storage.local, 'get').mockImplementation((key) => {
      if (key !== 'DEFAULT_EQ' || heldRead) return originalGet(key);
      heldRead = true;
      return new Promise(resolve => { releaseRead = () => resolve(clone({ DEFAULT_EQ: local.DEFAULT_EQ })); });
    });
    vi.spyOn(storage.local, 'set').mockImplementation((patch: any) => 'DEFAULT_EQ' in patch
      ? new Promise(resolve => { releaseWrite = () => { void originalSet(patch).then(resolve); }; })
      : originalSet(patch));
    const hook = await setup();
    expect(hook.result.current.canEdit).toBe(false);
    expect(messages.some(m => m.type === 'applySettings')).toBe(false);
    expect(live[0].eqFilters[2].gain).toBe(6);
    await act(async () => releaseRead()); await settle();
    expect(releaseWrite).toBeTypeOf('function');
    act(broadcast); await settle();
    expect(messages.some(m => m.type === 'applySettings')).toBe(false);
    await act(async () => releaseWrite()); await settle();
    expect(hook.result.current.canEdit).toBe(true);
    expect(live[0].eqFilters[2].gain).toBe(9);
    expect(local.EDIT_JOURNAL).toBeUndefined();
  });

  it('migrates Auto Gain to worker-readable storage and follows updates from another window', async () => {
    localStorage.AUTO_GAIN = '1';
    local.DEFAULT_EQ.filters[2].g = 6;
    const hook = await setup();
    expect(local.AUTO_GAIN).toBe(true);
    expect(hook.result.current.autoGain).toBe(true);
    expect(live[0].gain).toBeCloseTo(10 ** (-6 / 11 / 20));
    act(() => hook.result.current.toggleAutoGain()); await settle();
    expect(local.AUTO_GAIN).toBe(false);
    expect(live[0].gain).toBe(1);
    await act(async () => storage.local.set({ AUTO_GAIN: true })); await settle();
    expect(hook.result.current.autoGain).toBe(true);
    expect(live[0].gain).toBeCloseTo(10 ** (-6 / 11 / 20));
    expect(local.DEFAULT_EQ.gain).toBe(1);
  });

  it('applies changed preset dependencies to the playing tab without a status broadcast', async () => {
    sync = { RULES: [{ id: 'r1', patterns: ['example.com'], mode: 'preset', preset: 'Mine', enabled: true }], 'PRESETS.Mine': preset(6) };
    const hook = await setup();
    expect(live[0].eqFilters[2].gain).toBe(6);
    await act(async () => storage.sync.set({ 'PRESETS.Mine': preset(12) }));
    await settle();
    expect(hook.result.current.presets.Mine.gains[2]).toBe(12);
    expect(live[0].eqFilters[2].gain).toBe(12);
  });

  it('ignores an older global refresh that resolves after a newer update', async () => {
    const hook = await setup();
    const originalGet = storage.local.get;
    let release!: () => void;
    let deferred = false;
    vi.spyOn(storage.local, 'get').mockImplementation((key) => {
      if (key !== 'DEFAULT_EQ' || deferred) return originalGet(key);
      deferred = true;
      const oldSnapshot = clone({ DEFAULT_EQ: local.DEFAULT_EQ });
      return new Promise(resolve => { release = () => resolve(oldSnapshot); });
    });
    await act(async () => storage.local.set({ DEFAULT_EQ: { ...local.DEFAULT_EQ, gain: 1.4 } }));
    await act(async () => storage.local.set({ DEFAULT_EQ: { ...local.DEFAULT_EQ, gain: 2.2 } })); await settle();
    expect(hook.result.current.gain).toBe(2.2);
    await act(async () => release()); await settle();
    expect(hook.result.current.gain).toBe(2.2);
    expect(live[0].gain).toBe(2.2);
  });

  it('sync refresh preserves a bypass draft while updating other captured tabs', async () => {
    sync = { RULES: [{ id: 'r1', patterns: ['example.com', 'other.com'], mode: 'preset', preset: 'Mine', enabled: true }], 'PRESETS.Mine': preset(6) };
    live.push({ ...clone(live[0]), id: 2, host: 'other.com' });
    const hook = await setup();
    act(() => hook.result.current.toggleBypass());
    act(() => { hook.result.current.onBandsLive(io.presetToBands(preset(9))); hook.result.current.onCommit(); });
    await settle(20);
    await act(async () => storage.sync.set({ 'PRESETS.Mine': preset(12) }));
    await settle();
    expect(hook.result.current.bypassed).toBe(true);
    expect(hook.result.current.bands[2].gain).toBe(9);
    expect(live[0].eqFilters[2].gain).toBe(0);
    expect(live[1].eqFilters[2].gain).toBe(12);
  });

  it('does not let a pre-bypass debounce save the later bypass draft', async () => {
    const hook = await setup();
    act(() => hook.result.current.onGainLive(1.4)); await settle(25);
    act(() => hook.result.current.onCommit()); await settle(30);
    act(() => hook.result.current.toggleBypass()); await settle(25);
    act(() => { hook.result.current.onBandsLive(io.presetToBands(preset(9))); hook.result.current.onCommit(); });
    await settle(230);
    expect(hook.result.current.bypassed).toBe(true);
    expect(local.DEFAULT_EQ.filters[2].g).toBe(0);
    expect(live[0].eqFilters[2].gain).toBe(0);
    act(() => hook.result.current.toggleBypass()); await settle();
    expect(local.DEFAULT_EQ.filters[2].g).toBe(9);
    expect(live[0].eqFilters[2].gain).toBe(9);
  });

  it('exports and imports rules with their referenced user presets', async () => {
    sync = { RULES: [{ id: 'r1', patterns: ['example.com'], mode: 'preset', preset: 'Mine', enabled: true }], 'PRESETS.Mine': preset(6), 'PRESETS.Unused': preset(4) };
    const first = await setup();
    await act(async () => first.result.current.copyRulesCode());
    const payload = io.decodeShare(copied)!;
    expect(Object.keys(payload.presets!)).toEqual(['Mine']);
    first.unmount(); sync = { RULES: [] };
    const second = await setup();
    await act(async () => second.result.current.importShareCode(copied)); await settle();
    expect(second.result.current.rules).toHaveLength(1);
    expect(live[0].eqFilters[2].gain).toBe(6);
  });

  it('flushes a pending edit on unmount instead of canceling the save', async () => {
    const hook = await setup();
    act(() => hook.result.current.onGainLive(1.8)); await settle(20);
    act(() => hook.result.current.onCommit());
    hook.unmount(); await settle();
    expect(local.DEFAULT_EQ.gain).toBeCloseTo(1.8);
    const next = await setup();
    expect(next.result.current.gain).toBeCloseTo(1.8);
  });

  it('routes stop of another tab through the worker with its explicit id', async () => {
    const hook = await setup();
    act(() => hook.result.current.stopTab(2));
    expect(messages).toContainEqual({ target: 'bg', type: 'stopCapture', tabId: 2 });
    act(() => runtimeListeners.forEach(fn => fn({ type: 'captureSkipped', reason: 'stopped', tabId: 2 })));
    expect(hook.result.current.captureState).toBe('active');
  });

  it('keeps dirty recovery data and reports a rejected rule commit', async () => {
    sync = { RULES: [{ id: 'r1', patterns: ['example.com'], mode: 'curve', curve: preset(6), gain: 1, enabled: true }] };
    const hook = await setup(); rejectRules = true;
    act(() => hook.result.current.onGainLive(2)); await settle(25);
    act(() => hook.result.current.onCommit()); await settle(250);
    expect(sync.RULES[0].gain).toBe(1);
    expect(hook.result.current.notice.text).toContain('save failed');
    expect(local.EDIT_JOURNAL).toBeDefined();
  });

  it('keeps the real global sound and recovery data when save-for-site cannot clear it', async () => {
    local = {};
    live.push({ ...clone(live[0]), id: 2, host: 'other.com' });
    const hook = await setup();
    act(() => hook.result.current.onGainLive(2)); await settle(25);
    act(() => hook.result.current.onCommit()); await settle(250);
    act(() => hook.result.current.onGainLive(2.2)); await settle(25);
    rejectClearGlobal = true;
    await act(async () => hook.result.current.saveForThisSite()); await settle();
    expect(sync.RULES).toHaveLength(1);
    expect(sync.RULES[0].gain).toBe(2.2);
    expect(local.DEFAULT_EQ.gain).toBe(2);
    expect(live[1].gain).toBe(2);
    expect(hook.result.current.notice.text).toContain('could not be put back');
    expect(local.EDIT_JOURNAL).toBeDefined();
    rejectClearGlobal = false;
    act(() => hook.result.current.resetChanges()); await settle();
    expect(local.DEFAULT_EQ).toBeUndefined();
    expect(live[1].gain).toBe(1);
    expect(sync.RULES).toHaveLength(1);
  });
});
