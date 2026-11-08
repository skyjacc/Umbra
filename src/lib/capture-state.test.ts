import { describe, it, expect } from 'vitest';
import { captureUIState, showsGraph, offersCapture, type CaptureStateInput, type CaptureUIState } from './capture-state';

const ALL: CaptureUIState[] = ['globalEditor', 'active', 'pending', 'uncapturable', 'stopped', 'idle', 'error'];

// A tab that is capturing normally; each test overrides only what it is about.
const base: CaptureStateInput = {
  globalEditor: false,
  capturing: true,
  capturable: true,
  skipReason: null,
  lastError: null,
  autoTried: true,
  inFlight: false
};
const st = (over: Partial<CaptureStateInput>) => captureUIState({ ...base, ...over });

describe('captureUIState', () => {
  it('reports active while the tab is captured', () => {
    expect(st({})).toBe('active');
  });

  it('reports globalEditor even when a capture is somehow live', () => {
    // The full-window page edits the global profile; capture is irrelevant there and must not
    // win, or the page would render a per-tab UI it cannot act on.
    expect(st({ globalEditor: true })).toBe('globalEditor');
    expect(st({ globalEditor: true, capturing: false, capturable: false, lastError: 'boom' })).toBe('globalEditor');
  });

  it('prefers a live capture over a stale error', () => {
    expect(st({ capturing: true, lastError: 'previous failure' })).toBe('active');
  });

  it('reports error ahead of uncapturable', () => {
    // An error is actionable ("Try again"); "system page" is not. Showing the dead end first
    // would hide the retry.
    expect(st({ capturing: false, lastError: 'no user gesture', capturable: false })).toBe('error');
  });

  it('reports uncapturable for a browser system page', () => {
    expect(st({ capturing: false, capturable: false })).toBe('uncapturable');
  });

  it('reports uncapturable ahead of a stopped flag', () => {
    expect(st({ capturing: false, capturable: false, skipReason: 'stopped' })).toBe('uncapturable');
  });

  it("honours the background's uncapturable verdict over a stale capturable snapshot", () => {
    // `capturable` is read once at boot. The page can navigate to a system URL while the popup
    // stays open, so only the background's live answer is trustworthy.
    expect(st({ capturing: false, capturable: true, skipReason: 'uncapturable' })).toBe('uncapturable');
  });

  it('reports stopped only when the background said so', () => {
    expect(st({ capturing: false, skipReason: 'stopped' })).toBe('stopped');
  });

  it('reports pending before auto-capture has run', () => {
    expect(st({ capturing: false, autoTried: false })).toBe('pending');
  });

  it('reports pending for the whole in-flight window, not just before the request', () => {
    // Regression guard: deriving "in flight" from autoTried alone made the most common path
    // (open popup -> auto-capture) paint "not running" for the entire startup round trip.
    expect(st({ capturing: false, autoTried: true, inFlight: true })).toBe('pending');
  });

  it('lets a real verdict beat an in-flight request', () => {
    expect(st({ capturing: true, inFlight: true })).toBe('active');
    expect(st({ capturing: false, inFlight: true, lastError: 'x' })).toBe('error');
    expect(st({ capturing: false, inFlight: true, capturable: false })).toBe('uncapturable');
    expect(st({ capturing: false, inFlight: true, skipReason: 'stopped' })).toBe('stopped');
  });

  it('reports idle when auto-capture ran and left no capture, no reason and nothing in flight', () => {
    // Reachable without any user action: the browser can revoke or end the stream
    // (offscreen track.onended -> disconnectTab), and a getUserMedia failure surfaces as a
    // generic engine error, so no capture-specific reason ever arrives. Claiming "stopped"
    // here would blame the user for the browser's behaviour.
    expect(st({ capturing: false })).toBe('idle');
  });

  it('treats an empty-string error as no error', () => {
    // showNotice-style code paths hand back '' rather than null on a cleared error.
    expect(st({ capturing: false, lastError: '' })).toBe('idle');
  });
});

describe('showsGraph', () => {
  it('shows the graph only where audio can be shaped', () => {
    expect(showsGraph('active')).toBe(true);
    expect(showsGraph('pending')).toBe(true);
    expect(showsGraph('globalEditor')).toBe(true);
    for (const s of ['uncapturable', 'stopped', 'idle', 'error'] as const) expect(showsGraph(s)).toBe(false);
  });
});

describe('offersCapture', () => {
  it('offers a capture action everywhere it could succeed', () => {
    for (const s of ['active', 'pending', 'stopped', 'idle', 'error'] as const) expect(offersCapture(s)).toBe(true);
  });

  it('offers a capture action while pending', () => {
    // 'pending' is every popup's opening state and can persist when the engine never reports
    // ready (stale BUILD, wedged offscreen doc). The button is the only in-popup recovery,
    // because pressing it runs ensureOffscreenDocument.
    expect(offersCapture('pending')).toBe(true);
  });

  it('offers nothing on a system page or in the global editor', () => {
    expect(offersCapture('uncapturable')).toBe(false);
    expect(offersCapture('globalEditor')).toBe(false);
  });

  it('uncapturable is the only state with no way forward', () => {
    // The failure this module exists to prevent is a screen with an inert graph and no action.
    // A system page is a legitimate dead end — nothing could work there — but it must stay the
    // ONLY one, and it pays for that by always carrying an explanation in the UI.
    const deadEnds = ALL.filter((s) => !showsGraph(s) && !offersCapture(s));
    expect(deadEnds).toEqual(['uncapturable']);
  });
});
