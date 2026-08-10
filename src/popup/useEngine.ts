import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NUM_FILTERS, sanitizeFilter, type Band } from '@/lib/audio';
import { type PresetBands } from '@/lib/presets';
import { matchRule, newRuleId, patternForHost, type Rule } from '@/lib/rules';
import { captureUIState, showsGraph, type CaptureSkipReason } from '@/lib/capture-state';
import { commitDecision, COMMIT_DEBOUNCE_MS } from '@/lib/commit-policy';
import { makeJournal, planReplay, ruleFingerprint, type RuleFingerprint } from '@/lib/journal';
import { quantizeRules } from '@/lib/quantize';
import { provenanceOf } from '@/lib/provenance';
import {
  isBypassed,
  previewAfterDrag,
  previewAfterCommit,
  persistsNow,
  sendsBandsToActiveTab,
  mayMirrorBuffer,
  commitOnUnbypass
} from '@/lib/bypass';
import { planResetProfile, makeResetSnapshot, applyUndoReset, resetControls } from '@/lib/reset';
import { NO_UNDO, armUndo, undoAfter, canUndo, type UndoEvent, type UndoSlot } from '@/lib/undo';
import { fingerprintWorld, planArm, planUndo, type ResetUndoRecord } from '@/lib/undo-state';
import { canResetChanges, planResetChanges, applyRestore, type RestoreWriters } from '@/lib/reset-changes';
import { AUTO_GAIN_DEFAULT, outputGain } from '@/lib/auto-gain';
import { refreshFor } from '@/lib/storage-events';
import { mirrorHost } from '@/lib/mirror-target';
import { dbg, debugOn } from '@/lib/debug-log';
import { planSaveForSite, applySavePlan, setRuleIdFactory, type SaveWriters } from '@/lib/save-for-site';
import {
  NO_PREVIEW,
  NO_BASELINE,
  previewForDrag,
  previewForBypass,
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
// The planner mints rule ids through this so tests can pin them; the popup wants the real thing.
setRuleIdFactory(newRuleId);

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
  // Mirrors previewRef for rendering — the ref alone would not re-render the action row.
  const [previewOn, setPreviewOn] = useState(false);
  // What the last Reset profile overwrote, and whether it is still offerable. One slot for one
  // operation — see lib/undo.ts for why a boolean beside a ref was the wrong shape.
  const [undoSlot, setUndoSlot] = useState<UndoSlot<ResetUndoRecord>>(NO_UNDO);
  // Bypass is a listening mode, not an edit: the stored EQ is simply not applied for a while.
  const [bypassed, setBypassed] = useState(false);
  // Render mirror for the Reset control. The three things it depends on — the session baseline,
  // `dirty` and `committedSinceBaseline` — are all refs, and a ref changing does not re-render, so
  // the answer is pushed at the moments it can change rather than computed during render. The
  // answer itself comes from canResetChanges, so the tested predicate is the one that ships.
  const [resettable, setResettable] = useState(false);

  const [bands, setBands] = useState<Band[]>(io.flatBands);
  const [gain, setGain] = useState(1);
  const [activePreset, setActivePreset] = useState('');
  const [sampleRate, setSampleRate] = useState(44100);
  const [presets, setPresets] = useState<Record<string, PresetBands>>({});
  const [rules, setRules] = useState<Rule[]>([]);
  // Status CODE (not a display string) so the UI can localize it — see i18n `engine.*` + the
  // header/banner in App. Values: starting | initializing | connected | stale | devPreview | error | notResponding.
  const [engineStatus, setEngineStatus] = useState('starting');
  const [notice, setNoticeState] = useState<{ text: string; undo: boolean }>({ text: '', undo: false });
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
  // Level-match the tab against what it sounded like before the curve was shaped. Off by default,
  // and a RENDERING of the gain rather than a change to it — see lib/auto-gain.ts. Persisted the
  // same way the other view toggles are; it is a listening preference, not part of any profile.
  const [autoGain, setAutoGain] = useState<boolean>(() => {
    try {
      return localStorage.AUTO_GAIN === '1';
    } catch {
      return AUTO_GAIN_DEFAULT;
    }
  });
  const autoGainRef = useRef(autoGain);
  autoGainRef.current = autoGain;
  /** What to SEND. The stored gain is always the user's own; this is only ever a message payload. */
  const sentGain = useCallback((userGain: number, bands: Band[]) => outputGain({ userGain, bands, on: autoGainRef.current }), []);

  // The "Full window" page runs as a GLOBAL-PROFILE editor: its own tab isn't capturable, so
  // instead of editing a real tab it edits the sound-everywhere profile (host '' → global).
  const [globalEditor, setGlobalEditor] = useState(false);

  // Refs mirror state so message-handler closures read fresh values.
  const activeIdRef = useRef(activeTabId);
  activeIdRef.current = activeTabId;
  const activeHostRef = useRef(activeHost);
  activeHostRef.current = activeHost;
  // Read by applyEverywhere, which runs from message-handler closures — the state alone would be
  // the value captured when that closure was created.
  const globalEditorRef = useRef(globalEditor);
  globalEditorRef.current = globalEditor;
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
  /**
   * The ONLY way to put a rules array into the mirror. Quantizes on the way in, so what the popup
   * holds is byte-for-byte what storage holds — see quantize.ts.
   *
   * Why it is a chokepoint and not a call at each site: the divergence it prevents is silent.
   * The crash-recovery journal identifies its target by comparing the whole curve, so a mirror
   * holding the exact curve while storage holds the rounded one makes the next boot conclude the
   * rule changed underneath it and DISCARD the recovered edit — in exactly the crash the journal
   * exists for. quantize.test.ts proves those two fingerprints really do differ.
   *
   * Returns the stored array so callers write the same one they mirrored.
   */
  const setRulesMirror = useCallback((next: Rule[]): Rule[] => {
    const stored = quantizeRules(next);
    rulesRef.current = stored;
    setRules(stored);
    return stored;
  }, []);
  const interacting = useRef(false); // true mid-drag — don't let a broadcast clobber the curve
  // "There is an edit storage does not have yet." NOT the same as "a debounce timer is armed":
  // the timer is only set when a gesture SETTLES, so mid-drag there is unsaved state and no timer.
  // Keying the flush off the timer meant a popup closed mid-drag flushed nothing, and that window
  // is the whole drag rather than the 200ms debounce.
  const dirty = useRef(false);
  // Write-ahead copy of the edit in progress. The popup is destroyed on any focus loss and cannot
  // be relied on to finish a write on the way out, so the record has to already exist. Throttled in
  // memory — a storage write per pointermove would just move the cost, not remove it.
  const journalThrottle = useRef(io.makeThrottle(150)).current;
  // How the edited rule looked when THIS edit began. Re-taken per drag (unlike the once-per-session
  // baseline), because a second edit starts from what the first one saved.
  const journalTargetWas = useRef<RuleFingerprint | null>(null);
  const gotFirstStatus = useRef(false);
  const autoTried = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useRef(io.makeThrottle(33)).current;
  // The offscreen document has NO chrome.storage access, so the ENGINE can't resolve a tab's
  // sound. The POPUP is the source of truth: it holds the global profile, resolves each tab
  // (rule → global → flat), and pushes the bands to the engine (a dumb applier).
  const globalRef = useRef<{ bands: Band[]; gain: number; presetName?: string } | null>(null);

  // The engine is playing something other than resolvedFor(activeHost) — a live drag today, a
  // bypass or an A/B slot later. Ephemeral by design: it is never written to storage, and it dies
  // with the popup. See src/lib/edit-state.ts for why it holds no copy of the curve.
  const previewRef = useRef<Preview>(NO_PREVIEW);
  /**
   * The ONLY way to change what the engine is previewing.
   *
   * `previewRef`, `previewOn` and `bypassed` were three independently settable holders of one
   * fact, and every bypass defect found in review was two of them drifting apart: a commit that
   * cleared the ref but not the flag left the badge insisting the equalizer was off while the tab
   * audibly played again. Setting them together makes that class unrepresentable.
   */
  const setPreview = useCallback((next: Preview) => {
    previewRef.current = next;
    setPreviewOn(next.has);
    setBypassed(isBypassed(next));
  }, []);

  /**
   * Has anything this session shaped actually reached storage yet?
   *
   * The difference between "cancel the pending write" and "put back what was already written", and
   * the reason the Reset control can stay on screen after the 200ms debounce instead of blinking
   * out with `dirty`.
   */
  const committedSinceBaseline = useRef(false);

  /**
   * Everything the reset / bypass / provenance bugs have turned out to hinge on, in one line of the
   * log. All of it lives in refs, so a screenshot cannot show it and the React devtools cannot
   * either — which is how several of these went unnoticed for a whole release.
   */
  const dbgState = useCallback((why: string) => {
    if (!debugOn()) return;
    dbg('state', {
      why,
      host: activeHostRef.current,
      preview: previewRef.current.has ? previewRef.current.source : 'none',
      dirty: dirty.current,
      committed: committedSinceBaseline.current,
      baseline: baselineRef.current.has ? baselineRef.current.target?.kind : 'none',
      gain: gainRef.current,
      b0: bandsRef.current[0]?.gain,
      preset: activeRef.current,
      rules: rulesRef.current.length,
      globalGain: globalRef.current?.gain
    });
  }, []);

  const refreshResettable = useCallback(
    () =>
      setResettable(
        canResetChanges({
          baselineHas: baselineRef.current.has,
          dirty: dirty.current,
          committed: committedSinceBaseline.current
        })
      ),
    []
  );

  /** A write happened; the snapshot now describes a world the user has moved on from. */
  const noteUndoEvent = useCallback((ev: UndoEvent) => setUndoSlot((cur) => undoAfter(cur, ev)), []);

  // The stored profile as it stood before this popup session first changed it. Latched once so a
  // later "save this to the site instead" can put back what it displaced; later commits must not
  // replace it, or the restore would restore the damage.
  const baselineRef = useRef<Baseline>(NO_BASELINE);

  /**
   * The reset whose write has not resolved yet.
   *
   * Identity is the guard: a second reset replaces this, and the first reset's late callback finds
   * it is no longer the pending one and says nothing. That is the fix for a real hole — the two
   * writes go to DIFFERENT storage areas (a ruled site deletes a rule in `sync`, anywhere else
   * flattens the profile in `local`), so "the second one resolves first" is ordinary, not exotic,
   * and the first one's failure branch used to hand back a debt over a reset that had already
   * succeeded.
   */
  const pendingReset = useRef<ResetUndoRecord | null>(null);

  /** One restore at a time — see undoReset. */
  const undoInFlight = useRef(false);

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

  // Write the edit-in-progress ahead of the debounced canonical save. Cheap: storage.local has no
  // write-rate quota (unlike sync), and the throttle keeps it to a few writes per drag.
  const recordJournal = useCallback((immediate = false) => {
    const mr = activeHostRef.current ? matchRule(activeHostRef.current, rulesRef.current) : null;
    const j = makeJournal(
      mr ? { kind: 'rule', id: mr.id } : { kind: 'global' },
      io.bandsToPreset(bandsRef.current),
      gainRef.current,
      Date.now(),
      mr ? journalTargetWas.current : null
    );
    if (immediate) void io.writeJournal(j);
    else journalThrottle(() => void io.writeJournal(j));
  }, [journalThrottle]);

  // Where the curve on screen came from, as the header renders it. Derived every render from the
  // state that already exists — see lib/provenance.ts for why there is no second field.
  const provenance = useMemo(() => {
    const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
    const named = has(presets, activePreset)
      ? presets[activePreset]
      : has(BUILTIN_PRESETS, activePreset)
        ? BUILTIN_PRESETS[activePreset]
        : null;
    return provenanceOf({ presetName: activePreset, current: io.bandsToPreset(bands), named });
  }, [activePreset, bands, presets]);

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
    if (g) return { bands: g.bands, gain: g.gain, presetName: g.presetName ?? '' };
    return { bands: io.flatBands(), gain: 1, presetName: '' };
  }, []);

  // Push every captured tab's resolved sound to the engine, and mirror the active tab's in
  // the graph. Skips while the user is mid-drag (don't clobber a live edit).
  const applyEverywhere = useCallback(
    (tabsList: { id: number; host: string }[]) => {
      // The guard is per tab, not global. A preview or a live drag owns the ACTIVE tab only —
      // every other captured tab must still receive its resolved sound, so a rule or preset change
      // keeps propagating while the user is shaping this one.
      // AUDIO: a preview of any kind owns the active tab, so it is skipped. Unchanged.
      const held = () => interacting.current || previewRef.current.has;
      for (const t of tabsList) {
        if (t.id === activeIdRef.current && held()) continue;
        const r = resolvedFor(t.host);
        io.toOffscreen('applySettings', { tabId: t.id, eqFilters: r.bands, gain: sentGain(r.gain, r.bands), activePreset: r.presetName });
      }
      // BUFFER: a different question, and it used to share the flag above. A bypass has no claim
      // on the editing buffer — freezing it for a whole bypass session let the graph keep showing
      // a rule that had just been deleted, and the next commit wrote that curve somewhere else.
      if (!mayMirrorBuffer({ interacting: interacting.current, dirty: dirty.current, preview: previewRef.current })) return;
      // Whose buffer this is, asked by HOST rather than by tab identity — see lib/mirror-target.ts.
      // The full-window editor has no tab id at all, so the old `find(t => t.id === activeTabId)`
      // could never match there and its graph never refreshed from storage.
      const host = mirrorHost({ globalEditor: globalEditorRef.current, activeTabId: activeIdRef.current, tabs: tabsList });
      if (host !== null) {
        const r = resolvedFor(host);
        // Skip the state write when the resolved curve is value-identical: resolvedFor allocates
        // fresh arrays, so a no-change broadcast would otherwise bust EqGraph's memo every time.
        if (r.gain !== gainRef.current || r.presetName !== activeRef.current || !bandsEqual(r.bands, bandsRef.current)) {
          setBands(r.bands);
          setGain(r.gain);
          setActivePreset(r.presetName);
        }
      }
    },
    [resolvedFor, sentGain]
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

  const showNotice = useCallback((t: string, undo = false) => {
    setNoticeState({ text: t, undo });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNoticeState({ text: '', undo: false }), 5000);
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
    [maybeAutoCapture, applyEverywhere, setRulesMirror]
  );

  // Boot: paint presets + domain preview, learn the active tab, wake the engine.
  useEffect(() => {
    let mounted = true;

    // Load presets + rules together, then re-resolve. Both are read async; a preset-mode rule
    // resolves to null (→ flat) if applyEverywhere runs before its preset finished loading, so set
    // the refs directly (not only via the re-render) and push one fresh resolve once both are in.
    // Boot: load presets + rules, then replay any edit the previous popup didn't finish saving,
    // and only then resolve. The journal is read exactly once, here — it is a recovery record, not
    // a second source of truth, and nothing plays from it directly.
    Promise.all([io.readInitialState(), io.readRules(), io.readDefaultEq(), io.readJournal()]).then(
      async ([init, rs, g, journal]) => {
        if (!mounted) return;
        presetsRef.current = init.presets;
        setPresets(init.presets);
        // Same distinction as the refresh below: `null` is "could not read", not "there are
        // none". Leaving the mirror untouched is only half of it — at boot there is nothing to
        // preserve, so the other half lives in engine-io, which refuses to write the rules array
        // until a read has succeeded. Without that, a failed boot read plus one new rule deletes
        // every rule the popup never saw.
        const rules0 = rs === null ? rulesRef.current : setRulesMirror(rs);
        // Not in the dev preview, where there is no chrome.storage to fail: readRules answers null
        // there too, and a data-integrity warning on every open would simply be untrue.
        if (rs === null && io.hasChrome()) showNoticeRef.current(t('note.rulesUnreadBoot'));
        globalRef.current = g;

        // The whole recovery decision lives in planReplay so it is testable; this is just the
        // executor. Note the order: write canonically FIRST, clear the journal only on success.
        // rs, not rules0: planReplay has to be able to tell "no rules" from "could not read", or a
        // rule-targeted journal is discarded on the very failure it exists to survive.
        const plan = planReplay({ journal, canonicalUpdatedAt: g?.updatedAt ?? null, rules: rs === null ? null : rules0 });
        if (plan.action === 'apply-global') {
          // Keep the provenance the stored profile already had: EditJournal records the curve,
          // not which preset it came from, so replaying an edit must not blank the name — a
          // recovered "Based on Vocal" would come back reading "None".
          globalRef.current = { bands: io.presetToBands(plan.bands), gain: plan.gain, presetName: g?.presetName ?? '' };
          const res = await io.writeDefaultEq(globalRef.current.bands, plan.gain, globalRef.current.presetName);
          if (res.ok) await io.clearJournal();
          else showNoticeRef.current(t('note.rulesSaveFailed'));
        } else if (plan.action === 'apply-rule') {
          const res = await io.writeRulesResult(setRulesMirror(plan.rules));
          if (res.ok) await io.clearJournal();
          else showNoticeRef.current(t('note.rulesSaveFailed'));
        } else if (plan.action === 'discard') {
          await io.clearJournal(); // superseded, unusable, or aimed at something that is gone
        }

        if (mounted) applyEverywhere(tabsRef.current);
      }
    );
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
      const want = refreshFor(area, Object.keys(changes || {}));
      if (want.presets) io.refreshPresets().then((p) => mounted && setPresets(p));
      if (want.rules)
        io.readRules().then((rs) => {
          if (!mounted) return;
          // NOT `rs ?? []`. That spelling is the bug this replaced: a rejected read emptied the
          // list, the user saw "no rules", and the next save wrote the empty array over a rule
          // that was still in storage. A read that failed leaves the list we already have.
          if (rs === null) showNotice(t('note.rulesUnreadStale'));
          else setRules(rs);
        });
      if (want.global) {
        // The everywhere-sound changed under us — most likely the other window of this extension.
        // Re-read rather than trust the incoming value: this also fires for our OWN writes, and a
        // read is the one answer that is right in both cases.
        io.readDefaultEq().then((g) => {
          if (!mounted) return;
          globalRef.current = g;
          // applyEverywhere will not touch the editing buffer while there is unsaved work — see
          // mayMirrorBuffer — so this cannot pull a curve out from under a live drag.
          applyEverywhere(tabsRef.current);
        });
      }
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
    (bands: Band[], gain: number, presetName: string) => {
    dbgState('commitTarget');
      const mr = activeHostRef.current ? matchRule(activeHostRef.current, rulesRef.current) : null;
      // The edit is about to reach storage; anything after this point is a fresh change.
      dirty.current = false;
      committedSinceBaseline.current = true;
      refreshResettable();
      noteUndoEvent('commit');
      if (mr) {
        // Write the applied preset's name (or '' for a hand-tweak) so a ruled site's label reflects
        // the curve that actually plays, instead of a stale earlier preset name.
        // The editing buffer is untouched — `bands` stays exact, so the next drag starts from the
        // curve the user shaped, not from a rounded copy of it.
        const next = setRulesMirror(
          rulesRef.current.map((r) =>
            r.id === mr.id ? { ...r, mode: 'curve' as const, curve: io.bandsToPreset(bands), gain, preset: presetName } : r
          )
        ); // mirrored before the write so applyEverywhere resolves with the new rule immediately
        // A ruled site writes to storage.sync, which caps writes per minute AND per hour. Dropping
        // this result made a refused write invisible: the UI kept showing the new sound as saved.
        io.writeRulesResult(next).then((res) => {
          if (res.ok) void io.clearJournal(); // ONLY on success — a failed write must keep the record
          else {
            dirty.current = true; // still unsaved — a later flush or commit can try again
            showNoticeRef.current(t('note.rulesSaveFailed'));
          }
        });
      } else {
        globalRef.current = { bands, gain, presetName };
        io.writeDefaultEq(bands, gain, presetName).then((res) => {
          if (res.ok) void io.clearJournal();
          else {
            dirty.current = true;
            showNoticeRef.current(t('note.rulesSaveFailed'));
          }
        });
      }
      applyEverywhere(tabsRef.current);
    },
    [applyEverywhere, setRulesMirror]
  );

  // Coalesce the VISUAL band update to one per frame — setBands isn't throttled like the engine
  // message, and each setBands re-runs EqGraph's ~5.8k biquad-eval memo. bandsRef is updated
  // synchronously every move so a commit uses the latest curve regardless of the pending frame.
  const bandsPending = useRef<Band[] | null>(null);
  const bandsFrame = useRef(0);
  const onBandsLive = useCallback(
    (nb: Band[]) => {
      if (!interacting.current) {
        captureBaseline(); // first movement of this drag
        const mr = activeHostRef.current ? matchRule(activeHostRef.current, rulesRef.current) : null;
        journalTargetWas.current = mr ? ruleFingerprint(mr) : null;
      }
      interacting.current = true;
      dirty.current = true; // unsaved from the first move, not only once the gesture settles
      refreshResettable();
      setPreview(previewAfterDrag(previewRef.current)); // a bypass outranks the drag and survives it
      bandsRef.current = nb;
      // Draft mode writes nothing, the journal included: an entry written under bypass would be
      // replayed by the next popup as an edit the user never confirmed.
      if (persistsNow(previewRef.current)) recordJournal();
      bandsPending.current = nb;
      if (!bandsFrame.current) {
        bandsFrame.current = requestAnimationFrame(() => {
          bandsFrame.current = 0;
          if (bandsPending.current) setBands(bandsPending.current);
        });
      }
      const id = activeIdRef.current;
      if (id == null) return;
      // The eleven filters stop at the tab boundary while bypassed; the master volume below does
      // not, because bypass is about the equalizer and not the user's volume.
      if (!sendsBandsToActiveTab(previewRef.current)) return;
      send(() => io.toOffscreen('applySettings', { tabId: id, eqFilters: nb, gain: sentGain(gainRef.current, nb), activePreset: activeRef.current }));
    },
    [send, captureBaseline, recordJournal]
  );
  // Coalesce the volume drag to one setGain per frame (same rationale as onBandsLive); keep gainRef
  // synchronous so a commit uses the latest value regardless of the pending frame.
  const gainPending = useRef<number | null>(null);
  const gainFrame = useRef(0);
  const onGainLive = useCallback(
    (g: number) => {
      if (!interacting.current) {
        captureBaseline();
        const mr = activeHostRef.current ? matchRule(activeHostRef.current, rulesRef.current) : null;
        journalTargetWas.current = mr ? ruleFingerprint(mr) : null;
      }
      interacting.current = true;
      dirty.current = true;
      refreshResettable();
      setPreview(previewAfterDrag(previewRef.current));
      gainRef.current = g;
      if (persistsNow(previewRef.current)) recordJournal();
      gainPending.current = g;
      if (!gainFrame.current) {
        gainFrame.current = requestAnimationFrame(() => {
          gainFrame.current = 0;
          if (gainPending.current != null) setGain(gainPending.current);
        });
      }
      const id = activeIdRef.current;
      if (id == null) return;
      send(() => io.toOffscreen('modifyGain', { tabId: id, gain: sentGain(g, bandsRef.current), activePreset: activeRef.current }));
    },
    [send, captureBaseline, recordJournal]
  );
  // Persist once, trailing-debounced. Keyboard nudges auto-repeat (~30/s) and each commit can be a
  // storage.sync write on a ruled site (120/min quota) — committing per keydown silently drops the
  // final save past quota. Drag-end also routes here, so this collapses a burst into one write.
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitWindowOpenedAt = useRef(0);
  const onCommit = useCallback(() => {
    // Bypass is a draft: the edit stays in the buffer, `dirty` stays true, and leaveBypass writes
    // it once when the user comes back to hearing the result.
    if (!persistsNow(previewRef.current)) return;
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
      setPreview(previewAfterCommit(previewRef.current));
      commitTarget(bandsRef.current, gainRef.current, activeRef.current);
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
      setPreview(previewAfterCommit(previewRef.current));
      commitTarget(bandsRef.current, gainRef.current, activeRef.current);
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
    if (!persistsNow(previewRef.current)) return; // a draft dies with the popup, by contract
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    interacting.current = false;
    setPreview(previewAfterCommit(previewRef.current));
    commitTarget(bandsRef.current, gainRef.current, activeRef.current);
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
    setPreview(NO_PREVIEW);
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
  // Mirror the resolved sound into the editor directly. applyEverywhere only mirrors tabs it
  // pushed to, and the active "tab" may not be among them (the global editor's own tab isn't
  // captured), so without this the graph would keep showing the discarded curve.
  const mirrorResolved = useCallback(() => {
    const r = resolvedFor(activeHostRef.current);
    setBands(r.bands);
    setGain(r.gain);
    setActivePreset(r.presetName);
  }, [resolvedFor]);

  // --- bypass:on:start ------------------------------------------------------------------------
  // Turning bypass ON writes NOTHING. Not commitTarget, not writeDefaultEq, not writeRules, not
  // the journal; it must not touch bandsRef/setBands, so the graph keeps showing the real curve;
  // and it must not touch the master volume, because "bypass the EQ" means the equalizer and not
  // the user's volume. invariants.test.ts asserts the no-writer part on the source, because a
  // behavioural test would happily pass with a stray save in here.
  //
  // Turning it OFF is a different thing and deliberately outside these markers: bypass is a draft
  // mode, so leaving it is where the draft becomes a save.
  const enterBypass = useCallback(() => {
    dbgState('enterBypass');
    setPreview(previewForBypass(io.flatBands()));
    const id = activeIdRef.current;
    // No activePreset in the payload: the engine only overwrites the label when it is defined, so
    // the tab keeps showing which preset it is on while muted-flat.
    if (id != null) io.toOffscreen('applySettings', { tabId: id, eqFilters: io.flatBands(), gain: sentGain(gainRef.current, io.flatBands()) });
  }, [setPreview]);
  // --- bypass:on:end --------------------------------------------------------------------------

  /**
   * Leave bypass, and settle up.
   *
   * Everything shaped while bypassed was a draft — no commit ran, no journal entry was written —
   * so this is the one moment it can be saved. The order matters: write first, then re-resolve.
   * applyEverywhere reads storage through resolvedFor, and commitTarget updates rulesRef/globalRef
   * synchronously before its async write, so committing first is what makes the tab play the curve
   * the user just built rather than the one it had before they started.
   */
  const leaveBypass = useCallback(() => {
    dbgState('leaveBypass');
    const owed = commitOnUnbypass({ dirty: dirty.current });
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    interacting.current = false;
    setPreview(NO_PREVIEW);
    if (owed) {
      // Write ahead FIRST, and synchronously. Everything shaped under bypass was deliberately kept
      // out of the journal, so this draft has no recovery copy anywhere — and commitTarget's own
      // storage write is asynchronous while the popup can be destroyed the instant the user clicks
      // away. Without this line, "bypass, shape it, switch bypass off, close" races that write and
      // loses the whole draft. commitTarget clears the journal itself once the write lands.
      recordJournal(true);
      commitTarget(bandsRef.current, gainRef.current, activeRef.current);
    } else applyEverywhere(tabsRef.current); // commitTarget does its own applyEverywhere
  }, [applyEverywhere, commitTarget, recordJournal, setPreview]);

  const toggleAutoGain = useCallback(() => {
    dbgState('toggleAutoGain');
    setAutoGain((v) => {
      const next = !v;
      autoGainRef.current = next; // applyEverywhere below reads the ref, not the pending state
      try {
        localStorage.AUTO_GAIN = next ? '1' : '0';
      } catch {
        /* private mode */
      }
      applyEverywhere(tabsRef.current);
      return next;
    });
  }, [applyEverywhere]);

  const toggleBypass = useCallback(() => {
    if (isBypassed(previewRef.current)) leaveBypass();
    else enterBypass();
  }, [enterBypass, leaveBypass]);

  /**
   * The writes every restore path shares. Kept in one place so the three of them cannot drift
   * apart again — before this, each rolled its own and all three discarded the result.
   */
  const restoreWriters = useRef<RestoreWriters>({
    writeGlobal: (bands, gain, presetName) => io.writeDefaultEq(bands, gain, presetName),
    clearGlobal: async () => (await io.clearDefaultEq(), { ok: true }),
    writeRules: async (rules) => io.writeRulesResult(rules)
  }).current;

  /**
   * Put the sound back the way it was when this popup opened.
   *
   * Restores, never deletes — it can only return the user to a state they were already in, which
   * is why it is allowed to sit in the main row next to Save while `Reset profile` stays in More.
   * The decision, including whether storage needs touching at all, is planResetChanges; this
   * executes it. Bypass survives on purpose: cancelling an edit is not a reason to stop
   * auditioning.
   */
  const resetChanges = useCallback(() => {
    dbgState('resetChanges');
    const plan = planResetChanges({
      baseline: baselineRef.current,
      rules: rulesRef.current,
      committed: committedSinceBaseline.current
    });
    if (plan.action !== 'restore') return;

    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    interacting.current = false;
    setPreview(previewAfterCommit(previewRef.current)); // a drag preview ends; a bypass does not

    // The sound goes back either way — that is what the user pressed the button for. What is
    // gated on the WRITE is everything that claims something happened: the notice, the journal,
    // and the undo slot from an older Reset profile.
    void applyRestore(plan, restoreWriters).then((outcome) => {
      if (outcome === 'write-failed') {
        showNoticeRef.current(t('note.rulesSaveFailed'));
        return; // storage still holds the edit: keep the journal and keep the undo armed
      }
      dirty.current = false;
      committedSinceBaseline.current = false;
      refreshResettable();
      void io.clearJournal(); // the recovery copy described an edit the user just took back
      showNoticeRef.current(t('note.changesReset'));
      // Only a write that actually happened may spend the undo. Pressing Reset when the baseline
      // rule has since been deleted writes NOTHING, and treating that as a write destroyed the
      // only copy of that rule with a click that changed nothing.
      if (outcome === 'restored') noteUndoEvent('commit');
    });

    if (plan.global) globalRef.current = plan.global.to;
    if (plan.rules) setRulesMirror(plan.rules);

    bandsRef.current = plan.bands;
    setBands(plan.bands);
    gainRef.current = plan.gain;
    setGain(plan.gain);
    applyEverywhere(tabsRef.current);
    mirrorResolved();
  }, [applyEverywhere, mirrorResolved, noteUndoEvent, setPreview, setRulesMirror]);


  // The destructive one: on a ruled site it DELETES the rule, elsewhere it flattens the profile
  // every tab without a rule plays. Snapshot first so the notice can offer an undo.
  const resetProfile = useCallback(() => {
    dbgState('resetProfile');
    // No captureBaseline() here. It used to latch one so the clear below had something to discard,
    // which made it a no-op after any real edit and, in a session that had edited nothing,
    // MANUFACTURED a debt describing a profile this session never displaced. A reset is not an
    // edit; it has its own undo and owes no rollback. See the clear below for what does happen.
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    interacting.current = false;
    dirty.current = false;
    setPreview(NO_PREVIEW);

    // Snapshot BEFORE the plan touches anything, and take the session bookkeeping with it.
    //
    // `committed` is READ here and stored, never reconstructed later from whether a baseline
    // exists. Every writer latches a baseline before writing, so committed implies has — but the
    // implication runs one way only, and both counter-examples are ordinary: a drag latches on its
    // first move and commits 200ms after the last one, and an edit made under bypass latches and
    // never commits at all, because bypass is a draft mode. Deriving it would restore `true` in
    // both cases and make planResetChanges spend a storage.sync write to store what is already
    // stored — the write its own comment calls out as the one not to make.
    const snapshot = makeResetSnapshot(rulesRef.current, globalRef.current);
    const debt = { baseline: baselineRef.current, committed: committedSinceBaseline.current };
    const plan = planResetProfile(activeHostRef.current, rulesRef.current);
    const write =
      plan.action === 'delete-rule'
        ? io.writeRulesResult(setRulesMirror(plan.rules))
        : (() => {
            const flat = io.flatBands();
            globalRef.current = { bands: flat, gain: 1, presetName: '' };
            return io.writeDefaultEq(flat, 1, '');
          })();

    // One record, armed as one thing. The snapshot used to live in React state (set when the write
    // resolved) and the debt in a ref (written synchronously), and two clocks for one operation is
    // how they came to disagree. `produces` is fingerprinted AFTER the plan has been applied to
    // the mirrors, so it describes the world this reset just created — the only world its undo is
    // allowed to undo. See lib/undo-state.ts.
    const record: ResetUndoRecord = { snapshot, debt, produces: fingerprintWorld(rulesRef.current, globalRef.current) };
    pendingReset.current = record;

    // This operation has its own undo, so the session baseline retires with it: a reset is not a
    // displacement and must not be rolled back by the next "Save for this site". Synchronously,
    // so an edit started while the write is still in flight latches against the profile the reset
    // actually produced rather than inheriting one that is about to be thrown away.
    baselineRef.current = NO_BASELINE;
    committedSinceBaseline.current = false;
    refreshResettable();

    void write.then((res) => {
      const outcome = planArm({ ok: res.ok, isCurrent: pendingReset.current === record });
      if (outcome === 'superseded') return; // a newer reset owns the slot; this one is not on screen
      pendingReset.current = null;
      if (outcome === 'refused') {
        // The reset never happened, so the displacement it cancelled is still owed — put the whole
        // debt back, both halves. Unless a new edit has since latched its own baseline against the
        // (still unchanged) profile, in which case it owns the slot now.
        if (!baselineRef.current.has) {
          baselineRef.current = record.debt.baseline;
          committedSinceBaseline.current = record.debt.committed;
          refreshResettable();
        }
        showNoticeRef.current(t('note.rulesSaveFailed'));
        return; // nothing to undo, and nothing to celebrate
      }
      setUndoSlot(armUndo(record));
      void io.clearJournal();
      showNoticeRef.current(t('note.profileReset'), true);
    });
    applyEverywhere(tabsRef.current);
    mirrorResolved();
  }, [applyEverywhere, mirrorResolved, captureBaseline, setRulesMirror]);

  // Put back exactly what resetProfile overwrote. The snapshot is deep, so it survived the reset
  // replacing those very arrays.
  /**
   * The restore itself. Split from the click handler so the in-flight guard cannot be bypassed by
   * an early return inside the body, and so the guard's release is a `finally` around one call.
   */
  const runUndo = useCallback(
    async (record: ResetUndoRecord) => {
      // Is the world still the one that reset produced? This — not any flag of ours — is the
      // guarantee that an undo returns the user to the state immediately before the reset and
      // never to an older state at the cost of a newer one. A flag records that WE think the world
      // moved; a fingerprint records what the world actually is, so it is also right about writers
      // we never hear from: the Full-window editor, another machine's sync, a rules import.
      //
      // Asked of STORAGE, not of the mirrors. The mirrors are refreshed a render late — a storage
      // change arrives, `onChanged` starts an async read, and only the render after that reassigns
      // rulesRef — so a click landing inside that window would fingerprint the pre-change world,
      // match, and restore over the other window's write.
      //
      // And "I don't know" is not "the world is empty". A reset performed on an install with no
      // rules produces exactly the fingerprint of [], so a reader that swallowed its failure would
      // reproduce it, the comparison would say "unchanged", and the undo would write an empty
      // rules array over a rule that had arrived since. readWorld reports the failure instead, so
      // this refuses rather than guesses — it does not lean on readRules for the answer.
      const world = await io.readWorld();
      if (!world) {
        showNoticeRef.current(t('note.undoUnavailable'));
        return;
      }
      // quantizeRules on the way in because `produces` was fingerprinted from the mirror, which
      // setRulesMirror keeps on the storage grid. Comparing a raw read against a rounded mirror
      // would report a difference that is only a representation, and refuse every undo on an
      // install still holding rules written before quantization existed.
      if (planUndo({ record, world: fingerprintWorld(quantizeRules(world.rules), world.global) }) !== 'restore') {
        // The slot is NOT spent here. Nothing was written, and this snapshot is the only copy of a
        // rule Reset profile deleted — the journal was cleared when the reset succeeded, so there
        // is no other record of it anywhere. Discarding it on a path that stores nothing destroys
        // the rule with a click labelled Undo. Held instead: the state is conditional, not
        // terminal — if the other window puts its own change back, this works again.
        showNoticeRef.current(t('note.undoSuperseded'));
        return;
      }

      // A commit armed before this click would land after the restore and overwrite it.
      // resetProfile already cancels its own; the undo has to cancel one too.
      if (commitTimer.current) {
        clearTimeout(commitTimer.current);
        commitTimer.current = null;
      }
      interacting.current = false;
      dirty.current = false;

      // Nothing below happens before the write lands. applyUndoReset writes rules first and
      // reports 'write-failed' if the global write then fails, and the version this replaces ran
      // its mirror update synchronously regardless — so a partial failure left the user looking at
      // and hearing a full restore that storage did not have.
      // Only the halves that actually differ get written. See applyUndoReset for why attempting
      // the rules write unconditionally was not free.
      const rulesHere = fingerprintWorld(quantizeRules(world.rules), null).rules;
      const rulesThen = fingerprintWorld(record.snapshot.rules, null).rules;
      const outcome = await applyUndoReset(record.snapshot, restoreWriters, rulesHere === rulesThen);
      if (outcome !== 'restored') {
        showNoticeRef.current(t('note.rulesSaveFailed'));
        return; // slot stays armed: this snapshot is still the only copy
      }
      setRulesMirror(record.snapshot.rules);
      globalRef.current = record.snapshot.global;
      // The bookkeeping travels with the sound. Both halves, verbatim from the record: the
      // baseline so "Save for this site" still owes what the session displaced, and `committed` so
      // "Reset changes" agrees with it instead of reading a different world.
      baselineRef.current = record.debt.baseline;
      committedSinceBaseline.current = record.debt.committed;
      refreshResettable();
      setUndoSlot(undoAfter(undoSlot, 'undo'));
      applyEverywhere(tabsRef.current);
      mirrorResolved();
    },
    [applyEverywhere, mirrorResolved, setRulesMirror, undoSlot]
  );

  // Put back exactly what resetProfile overwrote, if the world has not moved since.
  const undoReset = useCallback(async () => {
    dbgState('undoReset');
    if (!undoSlot.armed) return;
    // `armed` alone does not stop a second click: the slot is not spent until the restore lands,
    // several awaits away. Two buttons carry this action — the toast and the More view — and both
    // can be on screen at once, so two runs would issue two chrome.storage.sync writes for one
    // user action, against a quota this codebase guards everywhere else. The later interleaving is
    // worse than wasteful: the second run fingerprints the world the first one just restored,
    // finds it changed, and reports "superseded" immediately after a successful undo.
    if (undoInFlight.current) return;
    undoInFlight.current = true;
    try {
      await runUndo(undoSlot.snapshot);
    } finally {
      undoInFlight.current = false;
    }
  }, [runUndo, undoSlot]);

  // Turn the sound you are hearing into a rule for this site.
  //
  // On a site with no rule, editing has ALREADY written the global profile — that is the committed
  // behaviour — so this is "save here, and put back what that displaced". The plan and the write
  // ordering both live in lib/save-for-site.ts, where they are tested; this is the executor.
  const saveRuleFromCurrent = useCallback(
    async (scope: 'exact' | 'anyTld' | 'anySub', target: 'update-matching' | 'always-create') => {
    dbgState('saveRuleFromCurrent');
      // First, and before anything else: a queued commit must not land after the rule is written,
      // match it, and rewrite it with a stale curve.
      if (commitTimer.current) {
        clearTimeout(commitTimer.current);
        commitTimer.current = null;
      }
      interacting.current = false;

      const plan = planSaveForSite({
        host: activeHostRef.current,
        rules: rulesRef.current,
        // The two entry points differ HERE and only here. "Save for this site" replaces the rule
        // that is actually shaping the tab; the Rules chips have always appended a new rule for the
        // scope you picked, and 6.1 is about the write sequence, not about changing that.
        matchedRule:
          target === 'update-matching' && activeHostRef.current ? matchRule(activeHostRef.current, rulesRef.current) : null,
        bands: io.bandsToPreset(bandsRef.current), // the editing buffer — bypass never touches it
        gain: gainRef.current,
        presetName: activeRef.current || '',
        scope,
        baselineGlobal: baselineRef.current.global,
        owesGlobalRestore: baselineRef.current.has && baselineRef.current.target?.kind === 'global'
      });

      if (plan.action === 'none') {
        showNoticeRef.current(t('note.noSite'));
        return;
      }

      const writers: SaveWriters = {
        writeRules: (next) => io.writeRulesResult(next),
        writeGlobal: (bands, gain, presetName) => io.writeDefaultEq(bands, gain, presetName),
        clearGlobal: () => io.clearDefaultEq(),
        clearJournal: () => io.clearJournal()
      };
      noteUndoEvent('save-for-site');
      const outcome = await applySavePlan(plan, writers);

      if (outcome === 'rule-write-failed') {
        // Nothing changed. The edit is still on the global profile and the journal still describes
        // it, which is exactly where the user was a moment ago — say so rather than fail silently.
        showNoticeRef.current(t('note.rulesSaveFailed'));
        return;
      }

      setRulesMirror(plan.rules); // applySavePlan already stored it; keep the mirror in step
      if (plan.globalRollback) globalRef.current = plan.globalRollback.to;
      setPreview(NO_PREVIEW);
      dirty.current = false;
      baselineRef.current = NO_BASELINE;
      committedSinceBaseline.current = false;
      refreshResettable(); // an explicit save is the end of the cycle, not something to undo
      applyEverywhere(tabsRef.current);
      mirrorResolved();

      showNoticeRef.current(
        outcome === 'saved-global-not-restored'
          ? t('note.savedForSitePartial', { host: activeHostRef.current })
          : t(plan.created ? 'note.savedForSite' : 'note.ruleUpdated', { host: activeHostRef.current })
      );
    },
    [applyEverywhere, mirrorResolved, setRulesMirror, sentGain]
  );

  const saveForThisSite = useCallback(
    (scope: 'exact' | 'anyTld' | 'anySub' = 'exact') => saveRuleFromCurrent(scope, 'update-matching'),
    [saveRuleFromCurrent]
  );

  // ---- Domain rules (pattern -> preset/curve, first match wins) ----
  const persistRules = useCallback(
    (incoming: Rule[]) => {
    dbgState('persistRules');
      noteUndoEvent('rules-write');
      const next = setRulesMirror(incoming);
      io.writeRules(next).then((ok) => {
        if (!ok) showNotice(t('note.rulesSaveFailed'));
      });
      applyEverywhere(tabsRef.current); // a rule change takes effect live on all captured tabs
    },
    [showNotice, applyEverywhere, setRulesMirror]
  );

  const addRule = useCallback((rule: Rule) => persistRules([...rulesRef.current, rule]), [persistRules]);
  const updateRule = useCallback(
    (id: string, patch: Partial<Rule>) => persistRules(rulesRef.current.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    [persistRules]
  );
  const deleteRule = useCallback((id: string) => persistRules(rulesRef.current.filter((r) => r.id !== id)), [persistRules]);

  // Quick-add a rule from the active tab: snapshots the current curve and picks a
  // pattern scope off the hostname (exact / any-tld / any-subdomain).
  // The Rules chips. They keep their own scope choice and their own "always append" behaviour —
  // but they no longer have their own idea of what saving means. Before 6.1 this path left the
  // edit on the GLOBAL profile as well as putting it in the rule, so picking a chip quietly
  // changed the sound of every other site: the same gesture, two different consequences.
  const quickAddRule = useCallback(
    (scope: 'exact' | 'anyTld' | 'anySub') => void saveRuleFromCurrent(scope, 'always-create'),
    [saveRuleFromCurrent]
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
    dbgState('applyPreset');
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
      // Under bypass this is a draft like any other edit: the curve lands in the buffer and the
      // graph, the tab keeps playing unshaped, and leaveBypass writes it. Without the dirty flag
      // the draft would have nothing to tell leaveBypass it exists.
      if (!persistsNow(previewRef.current)) {
        dirty.current = true;
        refreshResettable();
        return;
      }
      const id = activeIdRef.current;
      if (id != null) io.toOffscreen('applySettings', { tabId: id, eqFilters: nb, gain: sentGain(gainRef.current, nb), activePreset: name });
      commitTarget(nb, gainRef.current, name);
    },
    [showNotice, commitTarget, captureBaseline, sentGain]
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
    provenance,
    autoGain,
    toggleAutoGain,
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
    bypassed,
    toggleBypass,
    saveForThisSite,
    resetChanges,
    resetProfile,
    undoReset,
    canUndoReset: canUndo(undoSlot),
    canResetChanges: resettable,
    previewOn,
    resetControls: resetControls({ previewSource: previewRef.current.source, dirty: dirty.current }),
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
