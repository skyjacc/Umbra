import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { flatBands } from './lib/sound-profile';
import { bandsToPreset } from './lib/engine-io';

let handlers: Record<string, Function>, messages: any[], active: any, captured: any[];
let sync: Record<string, any>, local: Record<string, any>, session: Record<string, any>;
let chromeMock: any;
const listener = (name: string) => ({ addListener: (fn: Function) => { handlers[name] = fn; } });
const flush = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };

beforeEach(async () => {
  vi.resetModules();
  handlers = {}; messages = []; captured = []; sync = { RULES: [] }; local = {}; session = {};
  active = { id: 1, url: 'https://example.com/one', title: 'Example' };
  const area = (data: Record<string, any>) => ({
    get: vi.fn(async (key: string | string[] | null) => structuredClone(key == null ? data : Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, data[k]])))),
    set: vi.fn(async (patch: any) => Object.assign(data, structuredClone(patch)))
  });
  chromeMock = {
    storage: { sync: area(sync), local: area(local), session: area(session) },
    tabs: { query: vi.fn(async () => [structuredClone(active)]), onUpdated: listener('updated'), onRemoved: listener('removed'), create: vi.fn(async () => ({})) },
    commands: { onCommand: listener('command') },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    offscreen: { createDocument: vi.fn(async () => {}), closeDocument: vi.fn(async () => {}) },
    tabCapture: { getMediaStreamId: vi.fn(async ({ targetTabId }: any) => 'stream-' + targetTabId) },
    runtime: {
      getURL: (path: string) => 'chrome-extension://test/' + path,
      getContexts: vi.fn(async () => [{}]),
      onMessage: listener('message'), onInstalled: listener('installed'),
      sendMessage: vi.fn((m: any, cb?: any) => {
        messages.push(structuredClone(m));
        const response = m.type === 'getStatus' ? { type: 'workspaceStatus', build: '2.5.0', tabs: structuredClone(captured) } : undefined;
        if (cb) cb(response);
        return Promise.resolve(response);
      })
    }
  };
  vi.stubGlobal('chrome', chromeMock);
  vi.stubGlobal('self', { addEventListener: vi.fn() });
  // The worker is JavaScript bundled by CRXJS; import its actual listeners for lifecycle tests.
  // @ts-expect-error The worker has no generated declaration file.
  await import('./background.js');
  await flush();
});
afterEach(() => vi.unstubAllGlobals());

describe('worker capture lifecycle', () => {
  it('shares the whole offscreen recovery, including probing and closing a failed document', async () => {
    let finishClose!: () => void;
    chromeMock.offscreen.closeDocument.mockImplementation(() => new Promise<void>(resolve => { finishClose = resolve; }));
    chromeMock.runtime.sendMessage.mockImplementation((m: any, cb?: Function) => {
      messages.push(structuredClone(m));
      const response = { type: 'workspaceStatus', failed: true, tabs: [] };
      cb?.(response);
      return Promise.resolve(response);
    });
    const first = vi.fn(), second = vi.fn();
    handlers.message({ target: 'bg', type: 'ensureOffscreen' }, {}, first);
    handlers.message({ target: 'bg', type: 'ensureOffscreen' }, {}, second);
    await flush();
    // A second close must not remain in flight when the first caller creates the replacement.
    expect(chromeMock.offscreen.closeDocument).toHaveBeenCalledOnce();
    finishClose(); await flush();
    expect(chromeMock.offscreen.createDocument).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledWith({ ok: true, build: '2.5.0' });
    expect(second).toHaveBeenCalledWith({ ok: true, build: '2.5.0' });
  });

  it('does not let a delayed Stop cancel a later manual Start', async () => {
    let finishLookup!: (value: any[]) => void;
    chromeMock.runtime.getContexts.mockImplementationOnce(() => new Promise(resolve => { finishLookup = resolve; }));
    handlers.message({ target: 'bg', type: 'stopCapture', tabId: 1 }, {}, vi.fn());
    await flush();
    expect(session.stoppedTabs).toContain(1);
    handlers.message({ target: 'bg', type: 'toggleCapture', on: true, auto: false }, {}, vi.fn());
    await flush();
    expect(messages.some(m => m.type === 'startCapture')).toBe(true);
    finishLookup([{}]); await flush();
    expect(messages.some(m => m.type === 'stopCapture')).toBe(false);
    expect(session.stoppedTabs).not.toContain(1);
  });

  it('keeps a delayed Stop effective when a later automatic Start is skipped', async () => {
    let finishLookup!: (value: any[]) => void;
    chromeMock.runtime.getContexts.mockImplementationOnce(() => new Promise(resolve => { finishLookup = resolve; }));
    handlers.message({ target: 'bg', type: 'stopCapture', tabId: 1 }, {}, vi.fn()); await flush();
    handlers.message({ target: 'bg', type: 'toggleCapture', on: true, auto: true }, {}, vi.fn()); await flush();
    finishLookup([{}]); await flush();
    expect(messages).toContainEqual({ target: 'offscreen', type: 'stopCapture', tabId: 1 });
    expect(messages.some(m => m.type === 'startCapture')).toBe(false);
  });

  it.each([true, false])('reports stream-id errors only for the current attempt (stopped=%s)', async (stopped) => {
    let fail!: (error: Error) => void;
    chromeMock.tabCapture.getMediaStreamId.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    handlers.message({ target: 'bg', type: 'toggleCapture', on: true, auto: false }, {}, vi.fn()); await flush();
    if (stopped) { handlers.message({ target: 'bg', type: 'stopCapture', tabId: 1 }, {}, vi.fn()); await flush(); }
    fail(new Error('Capture request revoked')); await flush();
    expect(messages.some(m => m.type === 'captureError')).toBe(!stopped);
  });

  it('starts from the saved global profile using the keyboard command with no popup', async () => {
    local.DEFAULT_EQ = { filters: flatBands().map((b, i) => ({ f: b.frequency, g: i === 2 ? 7 : 0, q: b.q })), gain: 1.8, preset: 'Mine' };
    handlers.command('toggle-eq'); await flush();
    const start = messages.find(m => m.type === 'startCapture');
    expect(start.tab.id).toBe(1);
    expect(start.settings.eqFilters[2].gain).toBe(7);
    expect(start.settings.gain).toBeCloseTo(1.8);
    expect(start.settings.activePreset).toBe('Mine');
  });

  it('resolves a user-preset site rule ahead of the global sound at startup', async () => {
    sync.RULES = [{ id: 'r', patterns: ['example.com'], mode: 'preset', preset: 'Mine', enabled: true }];
    sync['PRESETS.Mine'] = bandsToPreset(flatBands().map((b, i) => ({ ...b, gain: i === 2 ? 9 : 0 })));
    local.DEFAULT_EQ = { filters: flatBands().map(b => ({ f: b.frequency, g: -4, q: b.q })), gain: 2 };
    handlers.command('toggle-eq'); await flush();
    const start = messages.find(m => m.type === 'startCapture');
    expect(start.settings.eqFilters[2].gain).toBe(9);
    expect(start.settings.gain).toBe(1);
  });

  it('retains Auto Gain on keyboard startup and same-origin navigation without a popup', async () => {
    local.AUTO_GAIN = true;
    local.DEFAULT_EQ = { filters: flatBands().map(b => ({ f: b.frequency, g: 6, q: b.q })), gain: 1.8 };
    handlers.command('toggle-eq'); await flush();
    const expectedGain = 1.8 * 10 ** (-6 / 20);
    expect(messages.find(m => m.type === 'startCapture').settings.gain).toBeCloseTo(expectedGain);
    captured = [{ id: 1, url: active.url, host: 'example.com' }];
    handlers.updated(1, { url: 'https://example.com/two' }, active); await flush();
    expect(messages.find(m => m.type === 'applySettings').gain).toBeCloseTo(expectedGain);
    expect(local.DEFAULT_EQ.gain).toBe(1.8);
  });

  it('remembers stopping a non-active tab and prevents its next automatic capture', async () => {
    handlers.message({ target: 'bg', type: 'stopCapture', tabId: 2 }, {}, vi.fn()); await flush();
    expect(session.stoppedTabs).toContain(2);
    expect(messages).toContainEqual({ target: 'offscreen', type: 'stopCapture', tabId: 2 });
    active = { id: 2, url: 'https://other.com/' };
    handlers.message({ target: 'bg', type: 'toggleCapture', on: true, auto: true }, {}, vi.fn()); await flush();
    expect(messages.some(m => m.type === 'startCapture')).toBe(false);
    expect(messages).toContainEqual({ type: 'captureSkipped', reason: 'stopped', tabId: 2 });
  });

  it('refreshes a known same-origin navigation without stopping capture', async () => {
    captured = [{ id: 1, url: 'https://example.com/one', title: 'Old', host: 'example.com' }];
    handlers.updated(1, { url: 'https://example.com/two', status: 'loading' }, { ...active, title: 'New' }); await flush();
    expect(messages.some(m => m.type === 'stopCapture')).toBe(false);
    expect(messages.find(m => m.type === 'applySettings').tab).toMatchObject({ id: 1, title: 'New', url: 'https://example.com/two' });
  });

  it.each([
    [{ url: 'https://other.com/two', status: 'loading' }, { id: 1 }],
    [{ status: 'loading' }, { id: 1, url: 'https://example.com/one' }]
  ])('stops capture when the destination origin changes or cannot be established', async (info, tab) => {
    captured = [{ id: 1, url: 'https://example.com/one', host: 'example.com' }];
    handlers.updated(1, info, tab); await flush();
    expect(messages).toContainEqual({ target: 'offscreen', type: 'stopCapture', tabId: 1 });
    expect(messages).toContainEqual({ type: 'captureInterrupted', tabId: 1, reason: 'navigation' });
    expect(messages.some(m => m.type === 'applySettings')).toBe(false);
  });

  it('does not start a stale capture if navigation occurs while settings are loading', async () => {
    let finish!: (value: any) => void;
    chromeMock.storage.sync.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    handlers.command('toggle-eq'); await flush();
    expect(finish).toBeTypeOf('function');
    handlers.updated(1, { status: 'loading' }, { id: 1 }); await flush();
    finish({ RULES: [] }); await flush();
    expect(messages.some(m => m.type === 'startCapture')).toBe(false);
    expect(chromeMock.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
  });
});
