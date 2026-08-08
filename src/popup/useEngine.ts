import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NUM_FILTERS, sanitizeFilter, type Band } from '@/lib/audio';
import { type PresetBands } from '@/lib/presets';
import { matchRule, newRuleId, patternForHost, type Rule } from '@/lib/rules';
import { captureUIState, showsGraph, type CaptureSkipReason } from '@/lib/capture-state';
import { commitDecision, COMMIT_DEBOUNCE_MS } from '@/lib/commit-policy';
import {
  NO_PREVIEW,
  NO_BASELINE,
  previewForDrag,
  captureBaseline as latchBaseline,
  type Preview,
  type Baseline
} from '@/lib/edit-state';
import { BUILTIN_PRESETS } from '@/lib/builtins';
import { t } from './i18n';
import * as io from '@/lib/engine-io';

export interface TabInfo {
  id: number;
  title: string;
  favIconUrl: string;
  host: string;
}
export interface TabState extends TabInfo {
  bands: Band[];
  gain: number;
  activePreset: string;
}
// Rebuild a tab's bands from the engine's eqFilters (defensive sanitize).
const toBands = (eqFilters: any[]): Band[] =>
  Array.from({ length: NUM_FILTERS }, (_, i) => {
    const f = (eqFilters && eqFilters[i]) || {};
    return sanitizeFilter({ frequency: f.frequency, gain: f.gain, q: f.q }, i);
  });

// Value-equal (freq/gain/Q) — used to skip a state write when a resolved curve didn't change.
const bandsEqual = (a: Band[], b: Band[]): boolean =>
  a.length === b.length && a.every((x, i) => !!b[i] && x.frequency === b[i].frequency && x.gain === b[i].gain && x.q === b[i].q);

// The popup's engine. The editable curve tracks the ACTIVE tab; each captured tab
// holds its own EQ (offscreen), and a tab's curve is remembered per hostname.
export function useEngine() {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [activeHost, setActiveHost] = useState('');
  const [capturable, setCapturable] = useState(true);
  // Why there is no capture, when the background knows. Both are cleared the moment a capture
  // succeeds or the user asks for one, so a stale reason can't outlive the condition.
  const [skipReason, setSkipReason] = useState<CaptureSkipReason | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  // Mirrors autoTried so the render reads it; a ref alone would not re-render when it flips.
  const [autoAttempted, setAutoAttempted] = useState(false);
  // A capture was asked for and hasn't reported back. Capture startup is a popup -> background ->
  // offscreen -> getUserMedia round trip; without this the UI would say "not running" throughout it.
  const [inFlight, setInFlight] = useState(false);

  const [bands, setBands] = useState<Band[]>(io.flatBands);
  const [gain, setGain] = useState(1);
  const [activePreset, setActivePreset] = useState('');
  const [sampleRate, setSampleRate] = useState(44100);
  const [presets, setPresets] = useState<Record<string, PresetBands>>({});
  const [rules, setRules] = useState<Rule[]>([]);
  // Status CODE (not a display string) so the UI can localize it — see i18n `engine.*` + the
  // header/banner in App. Values: starting | initializing | connected | stale | devPreview | error | notResponding.
  const [engineStatus, setEngineStatus] = useState('starting');
  const [notice, setNoticeState] = useState('');
  const [spectrum, setSpectrum] = useState<boolean>(() => {
    try {
      return localStorage.SHOW_VISUALIZER === '1';
    } catch {
      return false;
    }
  });
  // Band guide: overlay a per-dot zone icon so newcomers see what each point shapes. Off by
  // default (persisted like the spectrum toggle); purely visual, no engine involvement.
  const [showRoles, setShowRoles] = useState<boolean>(() => {
    try {
      return localStorage.SHOW_ROLES === '1';
    } catch {
      return false;
    }
  });
  // The "Full window" page runs as a GLOBAL-PROFILE editor: its own tab isn't capturable, so
  // instead of editing a real tab it edits the sound-everywhere profile (host '' → global).
  const [globalEditor, setGlobalEditor] = useState(false);

  // Refs mirror state so message-handler closures read fresh values.
  const activeIdRef = useRef(activeTabId);
  activeIdRef.current = activeTabId;
  const activeHostRef = useRef(activeHost);
  activeHostRef.current = activeHost;
  const bandsRef = useRef(bands);
  bandsRef.current = bands;
  const gainRef = useRef(gain);
  gainRef.current = gain;
  const activeRef = useRef(activePreset);
  activeRef.current = activePreset;
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const interacting = useRef(false); // true mid-drag — don't let a broadcast clobber the curve
  // "There is an edit storage does not have yet." NOT the same as "a debounce timer is armed":
  // the timer is only set when a gesture SETTLES, so mid-drag there is unsaved state and no timer.
  // Keying the flush off the timer meant a popup closed mid-drag flushed nothing, and that window
  // is the whole drag rather than the 200ms debounce.
  const dirty = useRef(false);
  const gotFirstStatus = useRef(false);
  const autoTried = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useRef(io.makeThrottle(33)).current;
  // The offscreen document has NO chrome.storage access, so the ENGINE can't resolve a tab's
  // sound. The POPUP is the source of truth: it holds the global profile, resolves each tab
  // (rule → global → flat), and pushes the bands to the engine (a dumb applier).
  const globalRef = useRef<{ bands: Band[]; gain: number } | null>(null);

  // The engine is playing something other than resolvedFor(activeHost) — a live drag today, a
  // bypass or an A/B slot later. Ephemeral by design: it is never written to storage, and it dies
  // with the popup. See src/lib/edit-state.ts for why it holds no copy of the curve.
  const previewRef = useRef<Preview>(NO_PREVIEW);
  // The stored profile as it stood before this popup session first changed it. Latched once so a
  // later "save this to the site instead" can put back what it displaced; later commits must not
  // replace it, or the restore would restore the damage.
  const baselineRef = useRef<Baseline>(NO_BASELINE);

  // Every writer of saved state calls this BEFORE its first mutation. There are four today
  // (commitTarget, resetAll, applyPreset, and saveForThisSite once it lands); missing one means a
  // silent loss of the global profile, so keep this list and the call sites in step.
  const captureBaseline = useCallback(() => {
    const mr = activeHostRef.current ? matchRule(activeHostRef.current, rulesRef.current) : null;
    baselineRef.current = latchBaseline(baselineRef.current, {
      target: mr ? { kind: 'rule', id: mr.id } : { kind: 'global' },
      global: globalRef.current,
      rule: mr
    });
  }, []);

  const resolvedFor = useCallback((host: string): { bands: Band[]; gain: number; presetName: string } => {
    const mr = host ? matchRule(host, rulesRef.current) : null;
    if (mr) {
      if (mr.mode === 'curve' && mr.curve) return { bands: io.presetToBands(mr.curve), gain: mr.gain ?? 1, presetName: mr.preset || '' };
      if (mr.mode === 'preset' && mr.preset) {
        // Own-property lookup only: an untrusted imported rule preset named "__proto__"/"toString"/
        // etc. would otherwise resolve to an inherited member and throw in presetToBands.
        const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
        const p = has(presetsRef.current, mr.preset) ? presetsRef.current[mr.preset] : has(BUILTIN_PRESETS, mr.preset) ? BUILTIN_PRESETS[mr.preset] : null;
        if (p) return { bands: io.presetToBands(p), gain: 1, presetName: mr.preset };
      }
    }
    const g = globalRef.current;
    if (g) return { bands: g.bands, gain: g.gain, presetName: '' };
    return { bands: io.flatBands(), gain: 1, presetName: '' };
  }, []);

  // Push every captured tab's resolved sound to the engine, and mirror the active tab's in
  // the graph. Skips while the user is mid-drag (don't clobber a live edit).
  const applyEverywhere = useCallback(
    (tabsList: { id: number; host: string }[]) => {
      // The guard is per tab, not global. A preview or a live drag owns the ACTIVE tab only —
      // every other captured tab must still receive its resolved sound, so a rule or preset change
      // keeps propagating while the user is shaping this one.
      const held = () => interacting.current || previewRef.current.has;
      for (const t of tabsList) {
        if (t.id === activeIdRef.current && held()) continue;
        const r = resolvedFor(t.host);
        io.toOffscreen('applySettings', { tabId: t.id, eqFilters: r.bands, gain: r.gain, activePreset: r.presetName });
      }
      if (held()) return; // don't mirror over the curve the user is editing / previewing
      const cur = tabsList.find((t) => t.id === activeIdRef.current);
      if (cur) {
        const r = resolvedFor(cur.host);
        // Skip the state write when the resolved curve is value-identical: resolvedFor allocates
        // fresh arrays, so a no-change broadcast would otherwise bust EqGraph's memo every time.
        if (r.gain !== gainRef.current || r.presetName !== activeRef.current || !bandsEqual(r.bands, bandsRef.current)) {
          setBands(r.bands);
          setGain(r.gain);
          setActivePreset(r.presetName);
        }
      }
    },
    [resolvedFor]
  );

  const capturing = activeTabId != null && tabs.some((t) => t.id === activeTabId);
  // Editing needs a live capture on the active tab. In the standalone dev preview
  // (no extension APIs) the graph stays interactive so it can be demoed/screenshotted.
  const canEdit = capturing || globalEditor || !io.hasChrome();
  // What the UI should say about capture — see src/lib/capture-state.ts for the priority order.
  // In the standalone dev preview there are no extension APIs, so present the working screen.
  const captureState = io.hasChrome()
    ? captureUIState({ globalEditor, capturing, capturable, skipReason, lastError, autoTried: autoAttempted, inFlight })
    : 'active';

  // Mark a capture request as outstanding, and stop waiting after a few seconds so a dropped
  // background message degrades to a real state instead of spinning on "pending" forever.
  const flightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginFlight = useCallback(() => {
    setInFlight(true);
    if (flightTimer.current) clearTimeout(flightTimer.current);
    flightTimer.current = setTimeout(() => {
      flightTimer.current = null;
      setInFlight(false);
    }, 4000);
  }, []);
  const endFlight = useCallback(() => {
    if (flightTimer.current) {
      clearTimeout(flightTimer.current);
      flightTimer.current = null;
    }
    setInFlight(false);
  }, []);
  useEffect(() => () => void (flightTimer.current && clearTimeout(flightTimer.current)), []);

  const showNotice = useCallback((t: string) => {
    setNoticeState(t);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNoticeState(''), 5000);
  }, []);
  // Lets the commit path report a failed write without taking showNotice as a dependency, which
  // would re-create commitTarget and every callback built on it.
  const showNoticeRef = useRef(showNotice);
  showNoticeRef.current = showNotice;

  const maybeAutoCapture = useCallback((list: TabState[]) => {
    if (autoTried.current) return;
    if (activeIdRef.current == null || !gotFirstStatus.current) return;
    autoTried.current = true;
    setAutoAttempted(true);
    if (list.some((t) => t.id === activeIdRef.current)) return; // already captured
    beginFlight();
    io.toBackground('toggleCapture', { on: true, auto: true }); // Ears-style: open popup = EQ the tab (skips tabs the user Stopped)
  }, [beginFlight]);

  const handleStatus = useCallback(
    (msg: any) => {
      if (msg.build && msg.build !== io.BUILD) {
        setEngineStatus('stale');
        return;
      }
      if (msg.initializing) {
        setEngineStatus('initializing');
        return;
      }
      gotFirstStatus.current = true;
      const list: TabState[] = (msg.tabs || []).map((t: any) => ({
        id: t.id,
        title: t.title || '',
        favIconUrl: t.favIconUrl || '',
        host: t.host || '',
        bands: toBands(t.eqFilters),
        gain: typeof t.gain === 'number' ? t.gain : 1,
        activePreset: t.activePreset || ''
      }));
      setTabs(list);
      // A live capture on the active tab settles the question: drop any reason we were showing.
      if (activeIdRef.current != null && list.some((t) => t.id === activeIdRef.current)) {
        setSkipReason(null);
        setLastError(null);
        endFlight();
      }
      if (msg.sampleRate) setSampleRate(msg.sampleRate);
      if (msg.presets && Object.keys(msg.presets).length) setPresets(msg.presets);
      setEngineStatus('connected');

      // The engine can't resolve a tab's sound (offscreen has no chrome.storage), so the popup
      // resolves each captured tab and pushes it. Runs on every status (a no-op while dragging,
      // and idempotent when nothing changed).
      applyEverywhere(list);
      maybeAutoCapture(list);
    },
    [maybeAutoCapture, applyEverywhere]
  );

  // Boot: paint presets + domain preview, learn the active tab, wake the engine.
  useEffect(() => {
    let mounted = true;

    // Load presets + rules together, then re-resolve. Both are read async; a preset-mode rule
    // resolves to null (→ flat) if applyEverywhere runs before its preset finished loading, so set
    // the refs directly (not only via the re-render) and push one fresh resolve once both are in.
    Promise.all([io.readInitialState(), io.readRules()]).then(([init, rs]) => {
      if (!mounted) return;
      presetsRef.current = init.presets;
      setPresets(init.presets);
      rulesRef.current = rs;
      setRules(rs);
      applyEverywhere(tabsRef.current);
    });
    io.readDefaultEq().then((g) => {
      if (mounted) globalRef.current = g;
    });
    if (io.hasChrome()) {
      io.isFullWindowTab().then((full) => {
        if (!mounted) return;
        if (full) {
          // Full window = global-profile editor (own tab isn't capturable → edit the sound
          // that plays everywhere instead). Host '' resolves to the global profile (no rule).
          setGlobalEditor(true);
          setActiveTabId(null);
          setActiveHost('');
          setCapturable(false);
          io.readDefaultEq().then((g) => {
            if (!mounted) return;
            globalRef.current = g;
            if (!interacting.current) {
              const r = resolvedFor('');
              setBands(r.bands);
              setGain(r.gain);
              setActivePreset(r.presetName);
            }
          });
          return;
        }
        io.getActiveTab().then(async (t) => {
          if (!mounted) return;
          setActiveTabId(t.id);
          setActiveHost(t.host || '');
          setCapturable(t.capturable !== false);
          // Show what this site will play (its rule / the global profile) before capture.
          globalRef.current = await io.readDefaultEq();
          if (mounted && t.host && !interacting.current) {
            const r = resolvedFor(t.host);
            setBands(r.bands);
            setGain(r.gain);
            setActivePreset(r.presetName);
          }
          maybeAutoCapture(tabsRef.current);
        });
      });
    } else {
      setEngineStatus('devPreview');
    }

    const onMsg = (m: any) => {
      if (m.type === 'workspaceStatus') handleStatus(m);
      else if (m.type === 'engineError') setEngineStatus('error');
      else if (m.type === 'captureSkipped') {
        // Only reasons the state machine understands; an unknown one must not be relabelled into
        // a known-looking value.
        if (m.reason === 'stopped' || m.reason === 'uncapturable') setSkipReason(m.reason);
        endFlight();
      } else if (m.type === 'captureError') {
        const e = String(m.error || '');
        endFlight();
        if (/active stream|already|in use/i.test(e)) {
          io.toOffscreen('getStatus', {}, (resp: any) => resp && resp.type === 'workspaceStatus' && handleStatus(resp));
        } else {
          setLastError(e);
          showNotice(t('note.couldNotEq', { err: e }));
        }
      }
    };
    const onChanged = (changes: any, area: string) => {
      if (area !== 'sync') return;
      if (Object.keys(changes).some((k) => k.startsWith(io.PRESET_PREFIX))) {
        io.refreshPresets().then((p) => mounted && setPresets(p));
      }
      if (io.RULES_KEY in changes) io.readRules().then((rs) => mounted && setRules(rs));
    };
    if (io.hasChrome()) {
      chrome.runtime.onMessage.addListener(onMsg);
      chrome.storage?.onChanged?.addListener(onChanged);
      io.toBackground('ensureOffscreen', {}, () => {
        let attempts = 0;
        const poll = () => {
          if (gotFirstStatus.current) return;
          if (attempts++ > 20) {
            setEngineStatus('notResponding');
            return;
          }
          io.toOffscreen('getStatus', {}, (resp: any) => {
            if (resp && resp.type === 'workspaceStatus') handleStatus(resp);
          });
          setTimeout(poll, 300);
        };
        poll();
      });
    }

    return () => {
      mounted = false;
      if (io.hasChrome()) {
        chrome.runtime.onMessage.removeListener(onMsg);
        chrome.storage?.onChanged?.removeListener(onChanged);
      }
    };
  }, [handleStatus, maybeAutoCapture, showNotice, resolvedFor]);

  // (The spectrum FFT poll lives in EqGraph now, so it re-renders only that component — not the
  // whole popup — while the visualizer is on.)

  const toggleSpectrum = useCallback(() => {
    setSpectrum((s) => {
      const n = !s;
      try {
        localStorage.SHOW_VISUALIZER = n ? '1' : '';
      } catch {
        /* ignore */
      }
      return n;
    });
  }, []);

  const toggleRoles = useCallback(() => {
    setShowRoles((s) => {
      const n = !s;
      try {
        localStorage.SHOW_ROLES = n ? '1' : '';
      } catch {
        /* ignore */
      }
      return n;
    });
  }, []);

  // ---- Editing ----
  // Commit the current sound to WHERE it belongs: a ruled site edits that rule's curve, an
  // unruled site edits the global profile. reapplyAll then propagates to every captured tab.
  const commitTarget = useCallback(
    (bands: Band[], gain: number, presetName = '') => {
      const mr = activeHostRef.current ? matchRule(activeHostRef.current, rulesRef.current) : null;
      // The edit is about to reach storage; anything after this point is a fresh change.
      dirty.current = false;
      if (mr) {
        // Write the applied preset's name (or '' for a hand-tweak) so a ruled site's label reflects
        // the curve that actually plays, instead of a stale earlier preset name.
        const next = rulesRef.current.map((r) =>
          r.id === mr.id ? { ...r, mode: 'curve' as const, curve: io.bandsToPreset(bands), gain, preset: presetName } : r
        );
        rulesRef.current = next; // so applyEverywhere resolves with the new rule immediately
        setRules(next);
        // A ruled site writes to storage.sync, which caps writes per minute AND per hour. Dropping
        // this result made a refused write invisible: the UI kept showing the new sound as saved.
        io.writeRulesResult(next).then((res) => {
          if (!res.ok) {
            dirty.current = true; // still unsaved — a later flush or commit can try again
            showNoticeRef.current(t('note.rulesSaveFailed'));
          }
        });
      } else {
        globalRef.current = { bands, gain };
        io.writeDefaultEq(bands, gain).then((res) => {
          if (!res.ok) {
            dirty.current = true;
            showNoticeRef.current(t('note.rulesSaveFailed'));
          }
        });
      }
      applyEverywhere(tabsRef.current);
    },
    [applyEverywhere]
  );

  // Coalesce the VISUAL band update to one per frame — setBands isn't throttled like the engine
  // message, and each setBands re-runs EqGraph's ~5.8k biquad-eval memo. bandsRef is updated
  // synchronously every move so a commit uses the latest curve regardless of the pending frame.
  const bandsPending = useRef<Band[] | null>(null);
  const bandsFrame = useRef(0);
  const onBandsLive = useCallback(
    (nb: Band[]) => {
      if (!interacting.current) captureBaseline(); // first movement of this drag
      interacting.current = true;
      dirty.current = true; // unsaved from the first move, not only once the gesture settles
      previewRef.current = previewForDrag(); // engine now plays the editing buffer, not resolved
      bandsRef.current = nb;
      bandsPending.current = nb;
      if (!bandsFrame.current) {
        bandsFrame.current = requestAnimationFrame(() => {
          bandsFrame.current = 0;
          if (bandsPending.current) {
            setBands(bandsPending.current);
            setActivePreset('');
          }
        });
      }
      const id = activeIdRef.current;
      if (id == null) return;
      send(() => io.toOffscreen('applySettings', { tabId: id, eqFilters: nb, gain: gainRef.current, activePreset: '' }));
    },
    [send, captureBaseline]
  );
  // Coalesce the volume drag to one setGain per frame (same rationale as onBandsLive); keep gainRef
  // synchronous so a commit uses the latest value regardless of the pending frame.
  const gainPending = useRef<number | null>(null);
  const gainFrame = useRef(0);
  const onGainLive = useCallback(
    (g: number) => {
      if (!interacting.current) captureBaseline(); // first movement of this drag
      interacting.current = true;
      dirty.current = true;
      previewRef.current = previewForDrag();
      gainRef.current = g;
      gainPending.current = g;
      if (!gainFrame.current) {
        gainFrame.current = requestAnimationFrame(() => {
          gainFrame.current = 0;
          if (gainPending.current != null) {
            setGain(gainPending.current);
            setActivePreset('');
          }
        });
      }
      const id = activeIdRef.current;
      if (id == null) return;
      send(() => io.toOffscreen('modifyGain', { tabId: id, gain: g, activePreset: '' }));
    },
    [send, captureBaseline]
  );
  // Persist once, trailing-debounced. Keyboard nudges auto-repeat (~30/s) and each commit can be a
  // storage.sync write on a ruled site (120/min quota) — committing per keydown silently drops the
  // final save past quota. Drag-end also routes here, so this collapses a burst into one write.
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitWindowOpenedAt = useRef(0);
  const onCommit = useCallback(() => {
    // A plain trailing debounce never fires while an arrow key is held: auto-repeat resets it every
    // ~33ms. The ceiling turns "delay the write" into "delay it, but not forever".
    const decision = commitDecision({
      armed: commitTimer.current != null,
      windowOpenedAt: commitWindowOpenedAt.current,
      now: performance.now()
    });
    if (decision === 'schedule') commitWindowOpenedAt.current = performance.now();
    if (commitTimer.current) clearTimeout(commitTimer.current);
    if (decision === 'commit-now') {
      commitTimer.current = null;
      interacting.current = false;
      previewRef.current = NO_PREVIEW;
      commitTarget(bandsRef.current, gainRef.current);
      return;
    }
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      // Clear the mid-edit guard only here — one statement before the authoritative write — not
      // synchronously at the top of onCommit. Otherwise a workspaceStatus broadcast arriving in the
      // 200ms debounce window would pass applyEverywhere's guard, resolve the still-stale pre-commit
      // curve, and both revert the on-screen edit and get persisted over it. commitTarget's own
      // applyEverywhere still runs because the flag is already false at this point.
      interacting.current = false;
      // The commit makes the stored profile equal what is playing, so the override is over.
      // Cleared BEFORE commitTarget, whose applyEverywhere would otherwise skip the active tab.
      previewRef.current = NO_PREVIEW;
      commitTarget(bandsRef.current, gainRef.current);
    }, COMMIT_DEBOUNCE_MS);
  }, [commitTarget]);
  // Write a pending edit NOW instead of waiting out the debounce. Idempotent: it is a no-op when
  // nothing is scheduled, so the lifecycle listener and the unmount cleanup can both call it.
  //
  // It commits the state that has already ACCUMULATED (bandsRef/gainRef) rather than recomputing
  // anything — those refs are updated synchronously on every pointer move, so they are the pending
  // state. Keeping a second copy of the curve just to label it "pending" would give two holders of
  // the same data and a way for them to drift.
  const flushPendingCommit = useCallback(() => {
    if (!dirty.current) return; // idempotent, and true mid-drag when no timer is armed yet
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    interacting.current = false;
    previewRef.current = NO_PREVIEW;
    commitTarget(bandsRef.current, gainRef.current);
  }, [commitTarget]);

  // Cancel any queued frame on unmount so no callback fires on a dead tree. The commit timer is
  // deliberately NOT cancelled here — see the lifecycle effect below.
  useEffect(
    () => () => {
      if (bandsFrame.current) cancelAnimationFrame(bandsFrame.current);
      if (gainFrame.current) cancelAnimationFrame(gainFrame.current);
    },
    []
  );

  // A popup dies on any focus loss — closing it, pressing Ctrl+R on the page, clicking away — and
  // it can die INSIDE the 200ms commit debounce. Cancelling the pending write there (what this
  // used to do) loses the edit while the engine keeps playing it: the tab still sounds edited, so
  // the user believes it was saved, and the next popup open resolves from storage and silently
  // reverts it. Live audio and persistence are two paths; this guarantees the second one always
  // has an exit.
  useEffect(() => {
    const onHide = () => flushPendingCommit();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPendingCommit();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flushPendingCommit(); // last resort if the page went away without either event
    };
  }, [flushPendingCommit]);

  // The graph is unmounted whenever capture goes away — which can happen MID-DRAG, because the
  // browser revokes the stream on navigation (offscreen: track.onended -> disconnectTab). React
  // then detaches the SVG that holds the pointer capture, so eqUp never runs, onCommit is never
  // scheduled, and `interacting` stays true: applyEverywhere would return early for the rest of
  // the popup session and no rule, preset or resolved curve would ever reach the engine again.
  // Also drops any preview: an override must not outlive the tab it was overriding. The active
  // tab cannot change during a popup session (setActiveTabId only runs at boot), but it can leave
  // the captured set — the user presses Stop, or the browser revokes the stream.
  useEffect(() => {
    if (showsGraph(captureState)) return;
    // Flush rather than onCommit(): arming a fresh 200ms fuse is the wrong move when the thing
    // that just happened is the tab disappearing underneath the drag.
    flushPendingCommit();
    interacting.current = false;
    previewRef.current = NO_PREVIEW;
  }, [captureState, flushPendingCommit]);

  const toggleCapture = useCallback(() => {
    const on = !capturing;
    // Asking for a capture invalidates whatever reason we were showing; a fresh one arrives if it
    // fails again. On Stop the background reports 'stopped', so nothing to clear there.
    if (on) {
      setSkipReason(null);
      setLastError(null);
      beginFlight();
    }
    io.toBackground('toggleCapture', { on });
  }, [capturing, beginFlight]);
  // The active tab's Stop must route through the background so its id lands in the stoppedTabs set
  // (same as the main "Stop EQing" button); a direct disconnect leaves the tab un-remembered, so the
  // next popup open auto-captures and re-EQs it. Non-active tabs are never the auto-capture target,
  // so a direct disconnect is fine for them.
  const stopTab = useCallback((id: number) => {
    if (id === activeIdRef.current) io.toBackground('toggleCapture', { on: false });
    else io.toOffscreen('disconnectTab', { tabId: id });
  }, []);

  // On the current site: reset to flat. Unruled → the global profile; ruled → remove the rule.
  const resetAll = useCallback(() => {
    const flat = io.flatBands();
    captureBaseline(); // writer #2 — this one bypasses commitTarget entirely
    interacting.current = false;
    previewRef.current = NO_PREVIEW;
    const mr = activeHostRef.current ? matchRule(activeHostRef.current, rulesRef.current) : null;
    if (mr) {
      // On a ruled site, "reset" removes the rule → the site falls back to the global profile.
      const next = rulesRef.current.filter((r) => r.id !== mr.id);
      rulesRef.current = next;
      setRules(next);
      io.writeRules(next);
    } else {
      globalRef.current = { bands: flat, gain: 1 };
      io.writeDefaultEq(flat, 1);
    }
    applyEverywhere(tabsRef.current);
    // Reflect the reset in the editor graph directly — the active "tab" may not be in the
    // pushed list (e.g. the global editor's own non-captured tab), so applyEverywhere's
    // active-tab mirror wouldn't fire.
    const r = resolvedFor(activeHostRef.current);
    setBands(r.bands);
    setGain(r.gain);
    setActivePreset(r.presetName);
  }, [applyEverywhere, resolvedFor, captureBaseline]);

  // ---- Domain rules (pattern -> preset/curve, first match wins) ----
  const persistRules = useCallback(
    (next: Rule[]) => {
      rulesRef.current = next;
      setRules(next);
      io.writeRules(next).then((ok) => {
        if (!ok) showNotice(t('note.rulesSaveFailed'));
      });
      applyEverywhere(tabsRef.current); // a rule change takes effect live on all captured tabs
    },
    [showNotice, applyEverywhere]
  );

  const addRule = useCallback((rule: Rule) => persistRules([...rulesRef.current, rule]), [persistRules]);
  const updateRule = useCallback(
    (id: string, patch: Partial<Rule>) => persistRules(rulesRef.current.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    [persistRules]
  );
  const deleteRule = useCallback((id: string) => persistRules(rulesRef.current.filter((r) => r.id !== id)), [persistRules]);

  // Quick-add a rule from the active tab: snapshots the current curve and picks a
  // pattern scope off the hostname (exact / any-tld / any-subdomain).
  const quickAddRule = useCallback(
    (scope: 'exact' | 'anyTld' | 'anySub') => {
      // Pattern building lives in rules.ts: it is pattern-language logic that must agree with
      // hostMatchesPattern, and it is the only part of this flow a unit test can reach.
      const pattern = patternForHost(activeHostRef.current || '', scope);
      if (!pattern) {
        showNotice(t('note.noSite'));
        return;
      }
      const rule: Rule = {
        id: newRuleId(),
        patterns: [pattern],
        mode: 'curve',
        curve: io.bandsToPreset(bandsRef.current),
        gain: gainRef.current,
        preset: activeRef.current || '',
        enabled: true
      };
      persistRules([...rulesRef.current, rule]);
      const captured = tabsRef.current.some((tb) => tb.id === activeIdRef.current);
      showNotice(t(captured ? 'note.ruleAddedReeq' : 'note.ruleAdded', { pattern }));
    },
    [persistRules, showNotice]
  );

  const matchedRule = useMemo(() => (activeHost ? matchRule(activeHost, rules) : null), [activeHost, rules]);

  // ---- Share by code (offline base64; presets and/or rules) ----
  const copyCode = useCallback(
    async (code: string) => {
      try {
        if (!navigator.clipboard) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(code);
        showNotice(t('note.codeCopied'));
      } catch {
        showNotice(t('note.copyFailed'));
      }
    },
    [showNotice]
  );
  const copyPresetsCode = useCallback(() => copyCode(io.encodeShare({ presets: presetsRef.current })), [copyCode]);
  const copyRulesCode = useCallback(() => copyCode(io.encodeShare({ rules: rulesRef.current })), [copyCode]);
  const importShareCode = useCallback(
    async (code: string) => {
      const data = io.decodeShare(code);
      if (!data) {
        showNotice(t('note.codeInvalid'));
        return;
      }
      let pCount = 0;
      let rCount = 0;
      let presetErr = '';
      if (data.presets && typeof data.presets === 'object') {
        const res = await io.importPresetsText(JSON.stringify(data.presets));
        if (!res.error) {
          pCount = res.count;
          setPresets(await io.refreshPresets());
        } else {
          presetErr = res.error;
        }
      }
      const valid = io.sanitizeImportedRules(data.rules);
      if (valid.length) {
        rCount = valid.length;
        persistRules([...rulesRef.current, ...valid]);
      }
      if (!pCount && !rCount) {
        showNotice(presetErr ? t('note.importFailed', { err: presetErr }) : t('note.codeInvalid'));
        return;
      }
      showNotice(t('note.codeImported', { p: pCount, r: rCount }));
    },
    [persistRules, showNotice]
  );

  const applyPreset = useCallback(
    async (name: string) => {
      let p = presetsRef.current[name];
      if (!p) {
        const fresh = await io.refreshPresets();
        setPresets(fresh);
        p = fresh[name];
      }
      if (!p) p = BUILTIN_PRESETS[name]; // curated built-ins aren't in sync storage
      if (!p) {
        showNotice(t('note.notFound', { name }));
        return;
      }
      const nb = io.presetToBands(p);
      captureBaseline(); // writer #3 — commits immediately, with no debounce to hide behind
      setBands(nb);
      bandsRef.current = nb; // keep the save buffer in step; commitTarget below uses nb directly
      setActivePreset(name);
      // Apply live to the active tab for instant feedback, then commit it to the global
      // profile (or the site's rule) so it becomes the sound everywhere / for that site.
      const id = activeIdRef.current;
      if (id != null) io.toOffscreen('applySettings', { tabId: id, eqFilters: nb, gain: gainRef.current, activePreset: name });
      commitTarget(nb, gainRef.current, name);
    },
    [showNotice, commitTarget, captureBaseline]
  );

  const savePreset = useCallback(
    async (name: string) => {
      try {
        await io.savePreset(name, bandsRef.current); // just names the current curve (sync storage)
      } catch {
        showNotice(t('note.saveFailed'));
        return;
      }
      setActivePreset(name);
      setPresets(await io.refreshPresets());
      showNotice(t('note.saved', { name }));
    },
    [showNotice]
  );

  const deletePreset = useCallback(
    async (name: string) => {
      try {
        await io.deletePreset(name);
      } catch {
        /* ignore */
      }
      if (activeRef.current === name) setActivePreset('');
      setPresets(await io.refreshPresets());
      showNotice(t('note.deleted', { name }));
    },
    [showNotice]
  );

  const importPresets = useCallback(
    async (text: string) => {
      const res = await io.importPresetsText(text);
      if (res.error) {
        showNotice(t('note.importFailed', { err: res.error }));
        return;
      }
      setPresets(await io.refreshPresets());
      showNotice(t('note.imported', { n: res.count }));
    },
    [showNotice]
  );

  const exportPresets = useCallback(() => {
    const blob = new Blob([JSON.stringify(presetsRef.current, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'umbra-presets.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  return {
    // active-tab curve
    bands,
    gain,
    activePreset,
    sampleRate,
    // per-tab + domain state
    tabs,
    streams: tabs, // alias: the Tabs view renders the captured-tab list
    activeTabId,
    activeHost,
    capturable,
    globalEditor,
    rules,
    matchedRule,
    presets,
    engineStatus,
    notice,
    capturing,
    canEdit,
    captureState,
    lastError,
    spectrum,
    showRoles,
    // actions
    toggleSpectrum,
    toggleRoles,
    onBandsLive,
    onGainLive,
    onCommit,
    toggleCapture,
    stopTab,
    resetAll,
    addRule,
    updateRule,
    deleteRule,
    quickAddRule,
    copyPresetsCode,
    copyRulesCode,
    importShareCode,
    applyPreset,
    savePreset,
    deletePreset,
    importPresets,
    exportPresets,
    showNotice
  };
}
