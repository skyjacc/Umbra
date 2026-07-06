import { useCallback, useEffect, useRef, useState } from 'react';
import { sanitizeStatus, type Band } from '@/lib/audio';
import { type PresetBands } from '@/lib/presets';
import * as io from '@/lib/engine-io';

export interface TabInfo {
  id: number;
  title: string;
  favIconUrl: string;
}

// The popup's engine: all state + the popup<->service-worker<->offscreen protocol.
// Ported from popup.js; the graph and views consume this.
export function useEngine() {
  const [bands, setBands] = useState<Band[]>(io.flatBands);
  const [gain, setGain] = useState(1);
  const [sampleRate, setSampleRate] = useState(44100);
  const [streams, setStreams] = useState<TabInfo[]>([]);
  const [presets, setPresets] = useState<Record<string, PresetBands>>({});
  const [activePreset, setActivePreset] = useState('');
  const [tabId, setTabId] = useState<number | null>(null);
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
  const bandsRef = useRef(bands);
  bandsRef.current = bands;
  const gainRef = useRef(gain);
  gainRef.current = gain;
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  const activeRef = useRef(activePreset);
  activeRef.current = activePreset;
  const streamsRef = useRef(streams);
  streamsRef.current = streams;
  const tabIdRef = useRef<number | null>(tabId);
  tabIdRef.current = tabId;
  const gotFirstStatus = useRef(false);
  const pendingRestore = useRef<{ bands: Band[]; gain: number; activePreset: string } | null>(null);
  const autoTried = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useRef(io.makeThrottle(33)).current;

  const capturing = tabId != null && streams.some((s) => s.id === tabId);

  const showNotice = useCallback((t: string) => {
    setNoticeState(t);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNoticeState(''), 5000);
  }, []);

  const maybeAutoCapture = useCallback((streams?: TabInfo[]) => {
    if (autoTried.current) return;
    if (tabIdRef.current == null || !gotFirstStatus.current) return;
    autoTried.current = true;
    // Use the freshly-received streams when available — streamsRef lags a render, and
    // reading it stale here re-captures an already-captured tab ("active stream").
    const list = streams ?? streamsRef.current;
    if (list.some((s) => s.id === tabIdRef.current)) return;
    io.toBackground('toggleCapture', { on: true });
  }, []);

  const handleStatus = useCallback(
    (msg: any) => {
      if (msg.build && msg.build !== io.BUILD) {
        setEngineStatus('STALE — reload extension');
        return;
      }
      if (msg.initializing || !msg.eqFilters || msg.eqFilters.length === 0) {
        setEngineStatus('initializing…');
        return;
      }
      gotFirstStatus.current = true;
      // Boot-restore: force the engine to the curve we restored from storage, so a
      // fresh/flat engine after a browser restart can't overwrite it with a flat one.
      if (pendingRestore.current) {
        const r = pendingRestore.current;
        pendingRestore.current = null;
        io.toOffscreen('applySettings', { eqFilters: r.bands, gain: r.gain, activePreset: r.activePreset || '' });
        msg = { ...msg, eqFilters: r.bands, gain: r.gain };
        if (r.activePreset) msg.activePreset = r.activePreset;
      }
      const clean = sanitizeStatus(msg);
      setBands(clean.eqFilters);
      setGain(clean.gain);
      setSampleRate(clean.sampleRate);
      setStreams(clean.streams as TabInfo[]);
      // Presets are popup-owned; only adopt the engine's set when it actually has entries.
      const incoming = msg.presets || {};
      if (Object.keys(incoming).length) setPresets(incoming);
      if (msg.activePreset !== undefined) setActivePreset(msg.activePreset || '');
      setEngineStatus('connected');
      maybeAutoCapture(clean.streams as TabInfo[]);
    },
    [maybeAutoCapture]
  );

  // Boot: paint from storage, wake the engine, poll until its first real status.
  useEffect(() => {
    let mounted = true;

    io.readInitialState().then((init) => {
      if (!mounted) return;
      setBands(init.bands);
      setGain(init.gain);
      setPresets(init.presets);
      setActivePreset(init.activePreset);
      pendingRestore.current = { bands: init.bands, gain: init.gain, activePreset: init.activePreset };
    });

    if (io.hasChrome() && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) setTabId(tabs[0].id ?? null);
        maybeAutoCapture();
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
          // The tab already has a live capture (usually ours from a prior popup
          // session). Treat it as "already EQ'd" and refresh, don't alarm the user.
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

  // Spectrum: poll the offscreen FFT ~30fps while enabled.
  useEffect(() => {
    if (!spectrum) {
      setFft(null);
      return;
    }
    if (!io.hasChrome()) {
      // Dev preview (no engine): a static synthetic spectrum (4096 bins, like the real
      // analyser's frequencyBinCount for fftSize 8192) so the overlay looks accurate.
      setFft(Array.from({ length: 4096 }, (_, i) => -100 + 82 * Math.exp(-((i - 40) ** 2) / 1400) + 40 * Math.exp(-i / 500) * (0.6 + 0.4 * Math.sin(i / 2))));
      return;
    }
    let alive = true;
    let raf = 0;
    // requestAnimationFrame-driven: request the next FFT only after the previous reply
    // lands, synced to the display refresh (~60fps) — smoother than a fixed 30fps timer.
    const tick = () => {
      if (!alive) return;
      io.toOffscreen('getFFT', {}, (resp: any) => {
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

  // ---- Actions ----
  const onBandsLive = useCallback(
    (nb: Band[]) => {
      setBands(nb);
      setActivePreset('');
      send(() => io.toOffscreen('applySettings', { eqFilters: nb, gain: gainRef.current, activePreset: '' }));
    },
    [send]
  );
  const onGainLive = useCallback(
    (g: number) => {
      setGain(g);
      setActivePreset('');
      send(() => io.toOffscreen('modifyGain', { gain: g, activePreset: '' }));
    },
    [send]
  );
  const onCommit = useCallback(() => {
    io.persistEqState(bandsRef.current, gainRef.current, '');
    io.toOffscreen('applySettings', { eqFilters: bandsRef.current, gain: gainRef.current, activePreset: '' });
  }, []);

  const toggleCapture = useCallback(() => io.toBackground('toggleCapture', { on: !capturing }), [capturing]);
  const stopTab = useCallback((id: number) => io.toOffscreen('disconnectTab', { tabId: id }), []);
  const resetAll = useCallback(() => {
    const nb = io.flatBands();
    setBands(nb);
    setGain(1);
    setActivePreset('');
    io.persistEqState(nb, 1, '');
    io.toOffscreen('applySettings', { eqFilters: nb, gain: 1, activePreset: '' });
    io.toOffscreen('resetFilters');
  }, []);

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
      io.persistEqState(nb, gainRef.current, name);
      io.toOffscreen('applySettings', { eqFilters: nb, gain: gainRef.current, activePreset: name });
    },
    [showNotice]
  );

  const savePreset = useCallback(
    async (name: string) => {
      try {
        await io.savePreset(name, bandsRef.current);
      } catch {
        showNotice('Save failed (sync storage unavailable).');
        return;
      }
      setActivePreset(name);
      io.persistEqState(bandsRef.current, gainRef.current, name);
      io.toOffscreen('setActivePreset', { activePreset: name });
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
      if (activeRef.current === name) {
        setActivePreset('');
        io.persistEqState(bandsRef.current, gainRef.current, '');
        io.toOffscreen('setActivePreset', { activePreset: '' });
      }
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
      io.toOffscreen('getStatus');
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
    bands,
    gain,
    sampleRate,
    streams,
    presets,
    activePreset,
    engineStatus,
    notice,
    capturing,
    spectrum,
    fft,
    toggleSpectrum,
    onBandsLive,
    onGainLive,
    onCommit,
    toggleCapture,
    stopTab,
    resetAll,
    applyPreset,
    savePreset,
    deletePreset,
    importPresets,
    exportPresets,
    showNotice
  };
}
