import { beforeEach, describe, expect, it, vi } from 'vitest';
import offscreenSource from '../public/offscreen.js?raw';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const mediaStream = () => {
  const track = { stop: vi.fn(), onended: null };
  return { getTracks: () => [track], getAudioTracks: () => [track], track };
};

let receive: (message: any, sender: any, response: Function) => void;
let getUserMedia: ReturnType<typeof vi.fn>, messages: any[];

beforeEach(async () => {
  messages = [];
  getUserMedia = vi.fn();
  const parameter = () => ({ value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: parameter(), frequency: parameter(), Q: parameter() });
  class Context {
    sampleRate = 48000;
    currentTime = 0;
    state = 'suspended';
    destination = node();
    audioWorklet = { addModule: vi.fn(async () => {}) };
    suspend = vi.fn(async () => {});
    resume = vi.fn(async () => {});
    createGain = node;
    createBiquadFilter = node;
    createAnalyser = node;
    createChannelSplitter = node;
    createMediaStreamSource = node;
  }
  class Worklet {
    connect = vi.fn();
    port = { postMessage: vi.fn() };
  }
  // Run the shipped classic script, not a copy of its capture implementation. Only browser APIs
  // are replaced: these tests exercise message routing, pending promises, status and track cleanup.
  new Function('window', 'AudioWorkletNode', 'chrome', 'navigator', 'self', 'setInterval', 'setTimeout', 'console', offscreenSource)(
    { AudioContext: Context }, Worklet,
    { runtime: {
      getURL: (path: string) => path,
      onMessage: { addListener: (handler: typeof receive) => { receive = handler; } },
      sendMessage: async (message: any) => { messages.push(structuredClone(message)); }
    } },
    { mediaDevices: { getUserMedia } }, { addEventListener: vi.fn() }, vi.fn(), vi.fn(), { error: vi.fn(), log: vi.fn() }
  );
  await flush();
  messages = [];
});

const send = async (type: string, fields: Record<string, unknown> = {}) => {
  receive({ target: 'offscreen', type, ...fields }, {}, vi.fn());
  await flush();
};
const start = () => send('startCapture', { streamId: 'stream-1', tab: { id: 1, url: 'https://example.com/' } });

describe('offscreen pending capture lifecycle', () => {
  it('does not broadcast an acquisition error after that capture has been stopped', async () => {
    const request = deferred<ReturnType<typeof mediaStream>>();
    getUserMedia.mockReturnValueOnce(request.promise);
    await start();
    await send('stopCapture', { tabId: 1 });
    request.reject(new Error('Capture revoked')); await flush();
    expect(messages.some(m => m.type === 'engineError')).toBe(false);
  });

  it('does not let an older failed request mark a replacement capture as broken', async () => {
    const old = deferred<ReturnType<typeof mediaStream>>();
    const replacement = mediaStream();
    getUserMedia.mockReturnValueOnce(old.promise).mockResolvedValueOnce(replacement);
    await start();
    await start();
    old.reject(new Error('Old stream id expired')); await flush();
    expect(messages.some(m => m.type === 'engineError')).toBe(false);
    const response = vi.fn();
    receive({ target: 'offscreen', type: 'getStatus' }, {}, response); await flush();
    expect(response.mock.calls[0][0].tabs.map((tab: any) => tab.id)).toEqual([1]);
    expect(replacement.track.stop).not.toHaveBeenCalled();
  });

  it('still reports a failure for the current capture attempt', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
    await start();
    expect(messages).toContainEqual({ type: 'engineError', where: 'getUserMedia for tab capture failed', error: 'Permission denied' });
  });

  it('stops a canceled stream that finishes acquiring after Stop', async () => {
    const request = deferred<ReturnType<typeof mediaStream>>();
    getUserMedia.mockReturnValueOnce(request.promise);
    await start();
    await send('stopCapture', { tabId: 1 });
    const stream = mediaStream();
    request.resolve(stream); await flush();
    expect(stream.track.stop).toHaveBeenCalledOnce();
    expect(messages.filter(m => m.type === 'workspaceStatus').every(m => m.tabs.length === 0)).toBe(true);
  });
});
