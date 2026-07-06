import { useCallback, useEffect, useRef, useState } from 'react';
import { NUM_FILTERS, sanitizeFilter, type Band } from '@/lib/audio';
import { type PresetBands } from '@/lib/presets';
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
export interface SavedHost {
  host: string;
  preset: string;
  updatedAt: number;
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
  const [savedHosts, setSavedHosts] = useState<SavedHost[]>([]);
  const [autoDomain, setAutoDomainState] = useState(true);
  const [engineStatus, setEngineStatus] = useState('starting…');
  const [notice, setNoticeState] = useState('');
  const [spectrum, setSpectrum] = useState<boolean>(() => {
    try {
      return localStorage.SHOW_VISUALIZER === '1';
    } catch {
      return false;
    }
  });
  const [fft, setFft] = useState<number[] | null>(null);

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
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const interacting = useRef(false); // true mid-drag — don't let a broadcast clobber the curve
  const gotFirstStatus = useRef(false);
  const autoTried = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useRef(io.makeThrottle(33)).current;

  const capturing = activeTabId != null && tabs.some((t) => t.id === activeTabId);
  const canEdit = capturing; // editing requires a live capture on the active tab

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
    io.toBackground('toggleCapture', { on: true }); // Ears-style: open popup = EQ the tab
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
      if (Array.isArray(msg.savedHosts)) setSavedHosts(msg.savedHosts);
      if (typeof msg.autoDomain === 'boolean') setAutoDomainState(msg.autoDomain);
      setEngineStatus('connected');

      // Adopt the active tab's live curve (unless the user is mid-drag).
      const cur = activeIdRef.current != null ? list.find((t) => t.id === activeIdRef.current) : undefined;
      if (cur && !interacting.current) {
        setBands(cur.bands);
        setGain(cur.gain);
        setActivePreset(cur.activePreset);
      }
      maybeAutoCapture(list);
    },
    [maybeAutoCapture]
  );

  // Boot: paint presets + domain preview, learn the active tab, wake the engine.
  useEffect(() => {
    let mounted = true;

    io.readInitialState().then((init) => {
      if (mounted) setPresets(init.presets);
    });

    if (io.hasChrome()) {
      io.getActiveTab().then(async (t) => {
        if (!mounted) return;
        setActiveTabId(t.id);
        setActiveHost(t.host || '');
        setCapturable(t.capturable !== false);
        // Preview the site's sticky curve before capture, so the graph isn't flat-then-jump.
        if (t.host) {
          const preview = await io.readDomainEq(t.host);
          if (mounted && preview && !interacting.current) {
            setBands(preview.bands);
            setGain(preview.gain);
          }
        }
        maybeAutoCapture(tabsRef.current);
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
          showNotice('Could not EQ this tab: ' + e);
        }
      }
    };
    const onChanged = (changes: any, area: string) => {
      if (area === 'sync' && Object.keys(changes).some((k) => k.startsWith(io.PRESET_PREFIX))) {
        io.refreshPresets().then((p) => mounted && setPresets(p));
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
  }, [handleStatus, maybeAutoCapture, showNotice]);

  // Spectrum: poll the ACTIVE tab's FFT ~60fps while enabled.
  useEffect(() => {
    if (!spectrum) {
      setFft(null);
      return;
    }
    if (!io.hasChrome()) {
      setFft(Array.from({ length: 4096 }, (_, i) => -100 + 82 * Math.exp(-((i - 40) ** 2) / 1400) + 40 * Math.exp(-i / 500) * (0.6 + 0.4 * Math.sin(i / 2))));
      return;
    }
    let alive = true;
    let raf = 0;
    const tick = () => {
      if (!alive) return;
      io.toOffscreen('getFFT', { tabId: activeIdRef.current }, (resp: any) => {
        if (!alive) return;
        if (resp && resp.fft) setFft(resp.fft);
        raf = requestAnimationFrame(tick);
      });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [spectrum]);

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

  // ---- Editing (targets the active tab; no-op until it's captured) ----
  const onBandsLive = useCallback(
    (nb: Band[]) => {
      interacting.current = true;
      setBands(nb);
      setActivePreset('');
      const id = activeIdRef.current;
      if (id == null) return;
      send(() => io.toOffscreen('applySettings', { tabId: id, eqFilters: nb, gain: gainRef.current, activePreset: '' }));
    },
    [send]
  );
  const onGainLive = useCallback(
    (g: number) => {
      interacting.current = true;
      setGain(g);
      setActivePreset('');
      const id = activeIdRef.current;
      if (id == null) return;
      send(() => io.toOffscreen('modifyGain', { tabId: id, gain: g, activePreset: '' }));
    },
    [send]
  );
  const onCommit = useCallback(() => {
    interacting.current = false;
    const id = activeIdRef.current;
    if (id == null) return;
    io.toOffscreen('applySettings', { tabId: id, eqFilters: bandsRef.current, gain: gainRef.current, activePreset: activeRef.current || '' });
  }, []);

  const toggleCapture = useCallback(() => io.toBackground('toggleCapture', { on: !capturing }), [capturing]);
  const stopTab = useCallback((id: number) => io.toOffscreen('disconnectTab', { tabId: id }), []);
  // Reset one specific tab (from the Tabs view) — flat + forget its domain curve.
  const resetTabById = useCallback((id: number) => io.toOffscreen('resetTab', { tabId: id }), []);

  // Reset the current tab to flat AND forget its saved (domain) curve.
  const resetAll = useCallback(() => {
    setBands(io.flatBands());
    setGain(1);
    setActivePreset('');
    interacting.current = false;
    const id = activeIdRef.current;
    if (id != null && tabsRef.current.some((t) => t.id === id)) io.toOffscreen('resetTab', { tabId: id });
    else if (activeHostRef.current) io.toOffscreen('forgetHost', { host: activeHostRef.current });
  }, []);

  // Reset EVERYTHING: flatten every live tab and wipe all remembered sites.
  const resetEverything = useCallback(() => {
    setBands(io.flatBands());
    setGain(1);
    setActivePreset('');
    io.toOffscreen('resetAllTabs');
    setSavedHosts([]);
    showNotice('Reset all tabs and cleared remembered sites.');
  }, [showNotice]);

  const setAutoDomain = useCallback((on: boolean) => {
    setAutoDomainState(on);
    io.toOffscreen('setAuto', { on });
  }, []);

  const forgetHost = useCallback(
    (host: string) => {
      io.toOffscreen('forgetHost', { host });
      setSavedHosts((hs) => hs.filter((h) => h.host !== host));
      showNotice('Forgot "' + host + '".');
    },
    [showNotice]
  );

  const applyPreset = useCallback(
    async (name: string) => {
      let p = presetsRef.current[name];
      if (!p) {
        const fresh = await io.refreshPresets();
        setPresets(fresh);
        p = fresh[name];
      }
      if (!p) {
        showNotice('Preset "' + name + '" not found.');
        return;
      }
      const nb = io.presetToBands(p);
      setBands(nb);
      setActivePreset(name);
      const id = activeIdRef.current;
      if (id != null && tabsRef.current.some((t) => t.id === id)) io.toOffscreen('applyPreset', { tabId: id, preset: name });
      else showNotice('Press "EQ This Tab" to hear this preset.');
    },
    [showNotice]
  );

  const savePreset = useCallback(
    async (name: string) => {
      const id = activeIdRef.current;
      if (id != null && tabsRef.current.some((t) => t.id === id)) {
        io.toOffscreen('savePreset', { tabId: id, preset: name });
      } else {
        try {
          await io.savePreset(name, bandsRef.current);
        } catch {
          showNotice('Save failed (sync storage unavailable).');
          return;
        }
      }
      setActivePreset(name);
      setPresets(await io.refreshPresets());
      showNotice('Saved preset "' + name + '".');
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
      showNotice('Deleted "' + name + '".');
    },
    [showNotice]
  );

  const importPresets = useCallback(
    async (text: string) => {
      const res = await io.importPresetsText(text);
      if (res.error) {
        showNotice('Import failed: ' + res.error + '.');
        return;
      }
      setPresets(await io.refreshPresets());
      showNotice('Imported ' + res.count + ' preset' + (res.count > 1 ? 's' : '') + '.');
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
    savedHosts,
    autoDomain,
    presets,
    engineStatus,
    notice,
    capturing,
    canEdit,
    spectrum,
    fft,
    // actions
    toggleSpectrum,
    onBandsLive,
    onGainLive,
    onCommit,
    toggleCapture,
    stopTab,
    resetTabById,
    resetAll,
    resetEverything,
    setAutoDomain,
    forgetHost,
    applyPreset,
    savePreset,
    deletePreset,
    importPresets,
    exportPresets,
    showNotice
  };
}
