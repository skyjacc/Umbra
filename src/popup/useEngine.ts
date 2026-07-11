import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NUM_FILTERS, sanitizeFilter, type Band } from '@/lib/audio';
import { type PresetBands } from '@/lib/presets';
import { matchRule, newRuleId, type Rule } from '@/lib/rules';
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

// The popup's engine. The editable curve tracks the ACTIVE tab; each captured tab
// holds its own EQ (offscreen), and a tab's curve is remembered per hostname.
export function useEngine() {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [activeHost, setActiveHost] = useState('');
  const [capturable, setCapturable] = useState(true);

  const [bands, setBands] = useState<Band[]>(io.flatBands);
  const [gain, setGain] = useState(1);
  const [activePreset, setActivePreset] = useState('');
  const [sampleRate, setSampleRate] = useState(44100);
  const [presets, setPresets] = useState<Record<string, PresetBands>>({});
  const [rules, setRules] = useState<Rule[]>([]);
  const [engineStatus, setEngineStatus] = useState('starting…');
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
  const gotFirstStatus = useRef(false);
  const autoTried = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useRef(io.makeThrottle(33)).current;
  // The offscreen document has NO chrome.storage access, so the ENGINE can't resolve a tab's
  // sound. The POPUP is the source of truth: it holds the global profile, resolves each tab
  // (rule → global → flat), and pushes the bands to the engine (a dumb applier).
  const globalRef = useRef<{ bands: Band[]; gain: number } | null>(null);

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
      if (interacting.current) return;
      for (const t of tabsList) {
        const r = resolvedFor(t.host);
        io.toOffscreen('applySettings', { tabId: t.id, eqFilters: r.bands, gain: r.gain, activePreset: r.presetName });
      }
      const cur = tabsList.find((t) => t.id === activeIdRef.current);
      if (cur) {
        const r = resolvedFor(cur.host);
        setBands(r.bands);
        setGain(r.gain);
        setActivePreset(r.presetName);
      }
    },
    [resolvedFor]
  );

  const capturing = activeTabId != null && tabs.some((t) => t.id === activeTabId);
  // Editing needs a live capture on the active tab. In the standalone dev preview
  // (no extension APIs) the graph stays interactive so it can be demoed/screenshotted.
  const canEdit = capturing || globalEditor || !io.hasChrome();

  const showNotice = useCallback((t: string) => {
    setNoticeState(t);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNoticeState(''), 5000);
  }, []);

  const maybeAutoCapture = useCallback((list: TabState[]) => {
    if (autoTried.current) return;
    if (activeIdRef.current == null || !gotFirstStatus.current) return;
    autoTried.current = true;
    if (list.some((t) => t.id === activeIdRef.current)) return; // already captured
    io.toBackground('toggleCapture', { on: true, auto: true }); // Ears-style: open popup = EQ the tab (skips tabs the user Stopped)
  }, []);

  const handleStatus = useCallback(
    (msg: any) => {
      if (msg.build && msg.build !== io.BUILD) {
        setEngineStatus('STALE — reload extension');
        return;
      }
      if (msg.initializing) {
        setEngineStatus('initializing…');
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

    io.readInitialState().then((init) => {
      if (mounted) setPresets(init.presets);
    });
    io.readRules().then((rs) => {
      if (mounted) {
        rulesRef.current = rs;
        setRules(rs);
      }
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
      setEngineStatus('dev preview');
    }

    const onMsg = (m: any) => {
      if (m.type === 'workspaceStatus') handleStatus(m);
      else if (m.type === 'engineError') setEngineStatus('engine ERROR');
      else if (m.type === 'captureError') {
        const e = String(m.error || '');
        if (/active stream|already|in use/i.test(e)) {
          io.toOffscreen('getStatus', {}, (resp: any) => resp && resp.type === 'workspaceStatus' && handleStatus(resp));
        } else {
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
            setEngineStatus('NOT responding');
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
      if (mr) {
        // Write the applied preset's name (or '' for a hand-tweak) so a ruled site's label reflects
        // the curve that actually plays, instead of a stale earlier preset name.
        const next = rulesRef.current.map((r) =>
          r.id === mr.id ? { ...r, mode: 'curve' as const, curve: io.bandsToPreset(bands), gain, preset: presetName } : r
        );
        rulesRef.current = next; // so applyEverywhere resolves with the new rule immediately
        setRules(next);
        io.writeRules(next);
      } else {
        globalRef.current = { bands, gain };
        io.writeDefaultEq(bands, gain);
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
      interacting.current = true;
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
    [send]
  );
  // Coalesce the volume drag to one setGain per frame (same rationale as onBandsLive); keep gainRef
  // synchronous so a commit uses the latest value regardless of the pending frame.
  const gainPending = useRef<number | null>(null);
  const gainFrame = useRef(0);
  const onGainLive = useCallback(
    (g: number) => {
      interacting.current = true;
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
    [send]
  );
  // Persist once, trailing-debounced. Keyboard nudges auto-repeat (~30/s) and each commit can be a
  // storage.sync write on a ruled site (120/min quota) — committing per keydown silently drops the
  // final save past quota. Drag-end also routes here, so this collapses a burst into one write.
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommit = useCallback(() => {
    interacting.current = false;
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      commitTarget(bandsRef.current, gainRef.current);
    }, 200);
  }, [commitTarget]);
  // Cancel any queued frame / pending commit on unmount so no callback fires on a dead tree.
  useEffect(
    () => () => {
      if (bandsFrame.current) cancelAnimationFrame(bandsFrame.current);
      if (gainFrame.current) cancelAnimationFrame(gainFrame.current);
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    []
  );

  const toggleCapture = useCallback(() => io.toBackground('toggleCapture', { on: !capturing }), [capturing]);
  const stopTab = useCallback((id: number) => io.toOffscreen('disconnectTab', { tabId: id }), []);

  // On the current site: reset to flat. Unruled → the global profile; ruled → remove the rule.
  const resetAll = useCallback(() => {
    const flat = io.flatBands();
    interacting.current = false;
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
  }, [applyEverywhere, resolvedFor]);

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
      const host = (activeHostRef.current || '').replace(/^www\./, '');
      if (!host) {
        showNotice(t('note.noSite'));
        return;
      }
      const labels = host.split('.');
      // Pick the registrable-name label. Guard multi-part TLDs (bbc.co.uk → "bbc", not "co", which
      // as ".co." would match amazon.co.jp and half the web). Heuristic: if the second-to-last label
      // is a known second-level under a 2-letter ccTLD, step one further left.
      const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'ac', 'gov', 'edu', 'or', 'ne', 'go']);
      let baseIdx = labels.length - 2;
      if (baseIdx >= 1 && SECOND_LEVEL.has(labels[baseIdx]) && labels[labels.length - 1].length === 2) baseIdx -= 1;
      const base = baseIdx >= 0 ? labels[baseIdx] : host; // registrable name label
      const pattern = scope === 'anyTld' ? base + '.' : scope === 'anySub' ? '.' + base + '.' : host;
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
      setBands(nb);
      setActivePreset(name);
      // Apply live to the active tab for instant feedback, then commit it to the global
      // profile (or the site's rule) so it becomes the sound everywhere / for that site.
      const id = activeIdRef.current;
      if (id != null) io.toOffscreen('applySettings', { tabId: id, eqFilters: nb, gain: gainRef.current, activePreset: name });
      commitTarget(nb, gainRef.current, name);
    },
    [showNotice, commitTarget]
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
