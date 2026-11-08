// What the popup should show about tab capture, derived from state the popup already holds.
//
// Nothing here is stored: this is a pure projection so the UI stops inferring "is it working?"
// from an indirect combination of flags. Before this existed, a tab that could not be captured
// rendered a full-size, non-interactive equalizer with no explanation — the graph looked broken.
//
// Two of the engine's abort paths used to be silent (they only wrote to the debug log); they now
// broadcast `captureSkipped`, which arrives here as `skipReason`.

export type CaptureUIState =
  /** Full-window page: it edits the global profile, so tab capture does not apply. */
  | 'globalEditor'
  /** The active tab is being captured — the normal working screen. */
  | 'active'
  /** No verdict yet: either auto-capture has not run, or a capture request is in flight. */
  | 'pending'
  /** chrome://, chrome-extension://, about:, devtools://, view-source:, edge://, opera:// */
  | 'uncapturable'
  /** The user stopped THIS tab by hand; auto-capture deliberately skips it. */
  | 'stopped'
  /** No capture and no known reason — see the note on `idle` below. */
  | 'idle'
  /** Minting the capture stream id failed. */
  | 'error';

export type CaptureSkipReason = 'stopped' | 'uncapturable';

export interface CaptureStateInput {
  globalEditor: boolean;
  capturing: boolean;
  capturable: boolean;
  skipReason: CaptureSkipReason | null;
  lastError: string | null;
  /** Auto-capture has already run for this popup session (it runs at most once). */
  autoTried: boolean;
  /** A capture was requested and has not reported back yet. */
  inFlight: boolean;
}

/**
 * First match wins, top to bottom.
 *
 * `pending` covers the whole in-flight window, not just the moment before the request is sent.
 * Capture startup is a popup -> background -> offscreen -> getUserMedia round trip; reporting
 * "not running" during it would contradict what the extension is actively doing, on the most
 * common path there is (opening the popup auto-EQs the tab).
 *
 * `idle` is deliberately NOT folded into `stopped`. "Auto-capture ran and there is still no
 * capture" does not imply the user stopped anything: a captured tab drops out when the browser
 * revokes or ends the stream (`offscreen.js` sets `track.onended = () => disconnectTab(...)`),
 * and a `getUserMedia` failure is reported as a generic engine error, so no capture-specific
 * reason ever arrives. Telling the user "you stopped this" in those cases would be a lie.
 */
export function captureUIState(i: CaptureStateInput): CaptureUIState {
  if (i.globalEditor) return 'globalEditor';
  if (i.capturing) return 'active';
  if (i.lastError) return 'error';
  // The background's live verdict outranks `capturable`, which is a boot-time snapshot: the page
  // can navigate to a system URL while the popup stays open.
  if (!i.capturable || i.skipReason === 'uncapturable') return 'uncapturable';
  if (i.skipReason === 'stopped') return 'stopped';
  if (!i.autoTried || i.inFlight) return 'pending';
  return 'idle';
}

/** The equalizer graph is only meaningful when there is (or may imminently be) audio to shape. */
export function showsGraph(s: CaptureUIState): boolean {
  return s === 'active' || s === 'pending' || s === 'globalEditor';
}

/**
 * Where a capture button belongs. `pending` is included on purpose: it is the state of every
 * popup on open, and it can persist (a stale BUILD or a wedged offscreen document never yields a
 * usable status). Hiding the button there would remove the only in-popup recovery — pressing it
 * runs ensureOffscreenDocument, which is what rebuilds a zombie engine.
 * `globalEditor` is excluded because that screen has its own affordance.
 */
export function offersCapture(s: CaptureUIState): boolean {
  return s !== 'uncapturable' && s !== 'globalEditor';
}
