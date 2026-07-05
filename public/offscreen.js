// Audio engine. Runs in the offscreen document (has DOM + Web Audio API).
//
// Graph:  MediaStreamSource(tab) --> preGain --> [11 biquad filters] --> postGain --> speakers
// Filters with gain == 0 are bypassed (removed from the chain) to keep the path clean.
//
// Settings live in chrome.storage.local (filters, master gain) and
// chrome.storage.sync (named presets, synced across the user's browsers).

const NUM_FILTERS = 11;
const DEFAULT_FREQUENCIES = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
const DEFAULT_Q = 0.7071; // Butterworth
const PRESET_PREFIX = 'PRESETS.';
const EQ_STATE_KEY = 'EQ_STATE';

// Bump on every change so the popup can detect a STALE service worker / offscreen
// (a common trap: files updated but the SW/offscreen weren't reloaded).
const BUILD = '1.0.1';

// --- Logging: ring buffer + console, so diagnostics can be exported later. ---
const DEBUG = false; // flip to true only for local diagnostics
const LOG = [];
const _ts = () => new Date().toISOString().substr(11, 12);
const _fmt = (x) => {
  try {
    return typeof x === 'object' ? JSON.stringify(x) : String(x);
  } catch (e) {
    return String(x);
  }
};
function dlog(...a) {
  LOG.push(_ts() + ' ' + a.map(_fmt).join(' '));
  if (LOG.length > 400) LOG.shift();
  if (DEBUG) console.log('[UmbraEQ offscreen]', ...a);
}
self.addEventListener('error', (e) => dlog('UNCAUGHT', e.message, e.filename + ':' + e.lineno));
self.addEventListener('unhandledrejection', (e) => dlog('UNHANDLED_REJECTION', e.reason && (e.reason.message || e.reason)));

let audioContext = null;
let preGain = null;
let postGain = null;
let analyzer = null;
let lastAnalyzerUse = null;
let filters = [];
let activePresetName = '';
const streams = {}; // tabId -> {stream, source, tab}

// ---------------------------------------------------------------------------
// Clamps (keep the audio graph in sane ranges no matter what the UI sends)

const clampFilterGain = (g) => Math.max(-30, Math.min(30, Number(g) || 0));
const clampFrequency = (f) => Math.max(5, Math.min(20000, Number(f) || 5));
const clampQ = (q) => Math.max(0.2, Math.min(11, Number(q) || DEFAULT_Q));
const clampMasterGain = (g) => Math.max(0.00316, Math.min(10, Number(g) || 1));

// ---------------------------------------------------------------------------
// Persistence

// Safe storage accessor — never throws if chrome.storage[area] is unavailable.
const _stg = (area) =>
  (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) || null;

async function loadSettings() {
  const s = _stg('local');
  if (!s) {
    dlog('storage.local unavailable');
    return {};
  }
  const keys = ['GAIN', EQ_STATE_KEY];
  for (let i = 0; i < NUM_FILTERS; i++) keys.push('filter' + i);
  const stored = await s.get(keys);
  const state = stored && stored[EQ_STATE_KEY];
  if (state && Array.isArray(state.filters)) {
    activePresetName = state.activePreset || '';
    const out = Object.assign({}, stored);
    if (state.gain != null) out.GAIN = state.gain;
    for (let i = 0; i < NUM_FILTERS; i++) {
      const f = state.filters[i];
      if (f) out['filter' + i] = { f: f.f ?? f.frequency, g: f.g ?? f.gain, q: f.q ?? f.Q };
    }
    return out;
  }
  return stored;
}

function persistFilter(i) {
  const s = _stg('local');
  if (!s) return;
  const payload = buildPersistPayload();
  if (payload) s.set(payload);
}

function persistGain() {
  const s = _stg('local');
  if (!s) return;
  const payload = buildPersistPayload();
  if (payload) s.set(payload);
}

function buildPersistPayload() {
  if (!postGain || filters.length !== NUM_FILTERS) return null;
  const compact = filters.map((f, i) => {
    const t = f.__t || { f: f.frequency.value, g: f.gain.value, q: f.Q.value };
    return {
      f: clampFrequency(t.f ?? DEFAULT_FREQUENCIES[i]),
      g: clampFilterGain(t.g ?? 0),
      q: clampQ(t.q ?? DEFAULT_Q)
    };
  });
  const gain = clampMasterGain(postGain.__t != null ? postGain.__t : postGain.gain.value);
  const payload = {
    [EQ_STATE_KEY]: { v: 1, filters: compact, gain, activePreset: activePresetName, updatedAt: Date.now() },
    GAIN: gain
  };
  for (let i = 0; i < NUM_FILTERS; i++) payload['filter' + i] = compact[i];
  return payload;
}

// null-proto accumulator so a preset literally named "__proto__" becomes an
// own property instead of silently reassigning the object's prototype.
async function getPresets() {
  const s = _stg('sync');
  if (!s) return Object.create(null);
  const all = await s.get(null);
  const presets = Object.create(null);
  for (const key in all) {
    if (key.startsWith(PRESET_PREFIX)) presets[key.slice(PRESET_PREFIX.length)] = all[key];
  }
  return presets;
}

// ---------------------------------------------------------------------------
// Graph setup

async function setupAudioNodes() {
  const stored = await loadSettings();

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('AudioContext unavailable in offscreen document');
  audioContext = new Ctx({ latencyHint: 'playback' });
  audioContext.suspend(); // resume only while something is captured

  preGain = audioContext.createGain();
  preGain.gain.value = 1;

  postGain = audioContext.createGain();
  postGain.gain.value = clampMasterGain(stored.GAIN ?? 1);
  postGain.connect(audioContext.destination);

  filters = [];
  for (let i = 0; i < NUM_FILTERS; i++) {
    const filter = audioContext.createBiquadFilter();
    filter.type = i === 0 ? 'lowshelf' : i === NUM_FILTERS - 1 ? 'highshelf' : 'peaking';

    const saved = stored['filter' + i];
    const f = clampFrequency(saved?.f ?? DEFAULT_FREQUENCIES[i]);
    const g = clampFilterGain(saved?.g ?? 0);
    const q = clampQ(saved?.q ?? DEFAULT_Q);
    filter.frequency.value = f;
    filter.gain.value = g;
    filter.Q.value = q;
    filter.__t = { f, g, q }; // intended target values (survive param smoothing)
    filters.push(filter);
  }

  postGain.__t = postGain.gain.value;
  wireChain();
}

// Static chain: preGain -> f0 -> f1 -> ... -> f10 -> postGain, wired ONCE.
// A biquad at 0 dB gain is effectively transparent, so we never bypass or
// reconnect filters at runtime — live disconnect/reconnect is a classic click
// source. Keeping the chain fixed is both simpler and audibly cleaner.
function wireChain() {
  preGain.disconnect();
  for (const f of filters) f.disconnect();
  let node = preGain;
  for (const f of filters) {
    node.connect(f);
    node = f;
  }
  node.connect(postGain);
  // postGain -> destination (and -> analyzer) persists; never torn down here.
}

// ---------------------------------------------------------------------------
// Capture

async function startCapture(streamId, tab) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });
  } catch (e) {
    console.error('[UmbraEQ offscreen] getUserMedia for tab capture failed:', e);
    return;
  }

  if (tab.id in streams) stopStream(tab.id); // re-capture replaces old stream

  if (Object.keys(streams).length === 0) audioContext.resume();

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(preGain);

  const track = stream.getAudioTracks()[0];
  // Tab closed / capture revoked: clean up so the tab list stays truthful.
  track.onended = () => disconnectTab(tab.id);

  streams[tab.id] = { stream, source, tab };
  dlog('capturing tab', tab.id, '— active streams:', Object.keys(streams).length);
  broadcastStatus();
}

function stopStream(tabId) {
  const entry = streams[tabId];
  if (!entry) return;
  entry.stream.getTracks().forEach((t) => t.stop());
  entry.source.disconnect();
  delete streams[tabId];
}

function disconnectTab(tabId) {
  stopStream(tabId);
  if (Object.keys(streams).length === 0) audioContext.suspend();
  broadcastStatus();
}

// ---------------------------------------------------------------------------
// Filter / gain mutations

const PARAM_TC = 0.012; // ~12ms exponential glide — click-free but responsive

// Glide an AudioParam to a target instead of stamping .value (which zippers).
function setParamSmooth(param, value) {
  if (!audioContext) {
    param.value = value;
    return;
  }
  const t = audioContext.currentTime;
  param.cancelScheduledValues(t);
  param.setTargetAtTime(value, t, PARAM_TC);
}

function modifyFilter({ index, frequency, gain, q, activePreset }) {
  const filter = filters[index];
  if (!filter) return;
  if (activePreset !== undefined) activePresetName = activePreset || '';
  const g = clampFilterGain(gain);
  const f = clampFrequency(frequency);
  const qq = clampQ(q);
  setParamSmooth(filter.gain, g);
  setParamSmooth(filter.frequency, f);
  setParamSmooth(filter.Q, qq);
  filter.__t = { f, g, q: qq };
  persistFilter(index);
}

function modifyGain({ gain, activePreset }) {
  if (activePreset !== undefined) activePresetName = activePreset || '';
  const g = clampMasterGain(gain);
  setParamSmooth(postGain.gain, g);
  postGain.__t = g;
  persistGain();
}

function applySettings({ eqFilters, gain, activePreset }) {
  if (activePreset !== undefined) activePresetName = activePreset || '';
  const list = Array.isArray(eqFilters) ? eqFilters : [];
  for (let i = 0; i < NUM_FILTERS; i++) {
    const raw = list[i] || {};
    const filter = filters[i];
    if (!filter) continue;
    const f = clampFrequency(raw.frequency ?? raw.f ?? DEFAULT_FREQUENCIES[i]);
    const g = clampFilterGain(raw.gain ?? raw.g ?? 0);
    const q = clampQ(raw.q ?? raw.Q ?? DEFAULT_Q);
    setParamSmooth(filter.frequency, f);
    setParamSmooth(filter.gain, g);
    setParamSmooth(filter.Q, q);
    filter.__t = { f, g, q };
  }
  if (gain != null) {
    const master = clampMasterGain(gain);
    setParamSmooth(postGain.gain, master);
    postGain.__t = master;
  }
  const s = _stg('local');
  const payload = buildPersistPayload();
  if (s && payload) s.set(payload);
  broadcastStatus();
}

function resetFilter(index) {
  modifyFilter({ index, frequency: DEFAULT_FREQUENCIES[index], gain: 0, q: DEFAULT_Q, activePreset: '' });
}

function resetAllFilters() {
  const eqFilters = [];
  for (let i = 0; i < NUM_FILTERS; i++) {
    eqFilters.push({ frequency: DEFAULT_FREQUENCIES[i], gain: 0, q: DEFAULT_Q, type: i === 0 ? 'lowshelf' : i === NUM_FILTERS - 1 ? 'highshelf' : 'peaking' });
  }
  applySettings({ eqFilters, gain: 1, activePreset: '' });
}

// ---------------------------------------------------------------------------
// Presets

async function applyPreset(name) {
  let preset;
  if (name === 'bassBoost') {
    preset = {
      frequencies: [340, ...DEFAULT_FREQUENCIES.slice(1)],
      gains: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      qs: Array(NUM_FILTERS).fill(DEFAULT_Q)
    };
  } else {
    preset = (await getPresets())[name];
  }
  if (!preset) return;
  activePresetName = name || '';

  const eqFilters = [];
  for (let i = 0; i < NUM_FILTERS; i++) {
    eqFilters.push({
      frequency: preset.frequencies[i],
      gain: preset.gains[i],
      q: preset.qs[i],
      type: i === 0 ? 'lowshelf' : i === NUM_FILTERS - 1 ? 'highshelf' : 'peaking'
    });
  }
  applySettings({ eqFilters, activePreset: name });
}

async function saveCurrentAsPreset(name) {
  const preset = {
    frequencies: filters.map((f) => f.frequency.value),
    gains: filters.map((f) => f.gain.value),
    qs: filters.map((f) => f.Q.value)
  };
  const s = _stg('sync');
  if (s) await s.set({ [PRESET_PREFIX + name]: preset });
  broadcastStatus();
}

async function deletePreset(name) {
  const s = _stg('sync');
  if (s) await s.remove(PRESET_PREFIX + name);
  broadcastStatus();
}

const UNSAFE_PRESET_NAMES = new Set(['__proto__', 'prototype', 'constructor']);

async function importPresets(presets) {
  if (!presets || typeof presets !== 'object') return;
  const toSet = {};
  for (const name of Object.keys(presets)) {
    if (UNSAFE_PRESET_NAMES.has(name)) continue;
    const p = presets[name];
    if (p && Array.isArray(p.frequencies) && Array.isArray(p.gains) && Array.isArray(p.qs)) {
      toSet[PRESET_PREFIX + name] = p;
    }
  }
  const s = _stg('sync');
  if (s) await s.set(toSet);
  broadcastStatus();
}

// ---------------------------------------------------------------------------
// Status + FFT for the popup

// Build the status object. Defensive: must NEVER throw, or getStatus surfaces a
// scary "Cannot read properties of undefined" and the popup never connects.
async function buildStatus() {
  let presets = {};
  try {
    presets = await getPresets();
  } catch (e) {
    dlog('getPresets failed:', e && e.message);
  }

  if (!audioContext || !postGain || filters.length === 0) {
    return { type: 'workspaceStatus', build: BUILD, initializing: true, eqFilters: [], streams: [], gain: 1, sampleRate: 44100, presets, activePreset: activePresetName };
  }

  const eqFilters = filters.map((f) => {
    const t = f.__t || { f: f.frequency.value, g: f.gain.value, q: f.Q.value };
    return { frequency: t.f, gain: t.g, q: t.q, type: f.type };
  });
  const streamTabs = Object.values(streams)
    .map((s) => s && s.tab)
    .filter(Boolean);

  return {
    type: 'workspaceStatus',
    build: BUILD,
    sampleRate: audioContext.sampleRate,
    gain: postGain.__t != null ? postGain.__t : postGain.gain.value,
    eqFilters,
    streams: streamTabs,
    presets,
    activePreset: activePresetName
  };
}

// Broadcast to any open popup (used for live updates: drag-end, capture, presets).
async function broadcastStatus() {
  const status = await buildStatus();
  dlog('broadcast status — streams:', (status.streams || []).length);
  chrome.runtime.sendMessage(status).catch((e) => dlog('broadcast dropped:', e && e.message));
}

function handleFFT(sendResponse) {
  if (!analyzer) {
    analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 8192;
    analyzer.smoothingTimeConstant = 0.5;
    postGain.connect(analyzer);
  }
  lastAnalyzerUse = performance.now();
  const data = new Float32Array(analyzer.frequencyBinCount);
  analyzer.getFloatFrequencyData(data);
  sendResponse({ fft: Array.from(data) });
}

// Drop the analyzer tap when the visualizer stops asking (saves CPU).
setInterval(() => {
  if (analyzer && lastAnalyzerUse && performance.now() - lastAnalyzerUse > 1000) {
    try {
      postGain.disconnect(analyzer);
    } catch (e) {
      /* already disconnected */
    }
    analyzer = null;
  }
}, 1000);

// ---------------------------------------------------------------------------
// Message routing

function reportEngineError(where, e) {
  const msg = (e && (e.message || e.name)) || String(e);
  console.error('[UmbraEQ offscreen] ' + where + ':', e);
  // Surface it to the popup's debug line so we see it without devtools.
  chrome.runtime.sendMessage({ type: 'engineError', where, error: msg }).catch(() => {});
}

// Watchdog: setup must settle within 5s. A hang becomes a visible engineError
// instead of parking every getStatus forever behind `await ready`.
const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' timeout after ' + ms + 'ms')), ms))
  ]);

const ready = withTimeout(setupAudioNodes(), 5000, 'setupAudioNodes')
  .then(() => {
    dlog('audio engine ready, sampleRate', audioContext && audioContext.sampleRate);
    broadcastStatus(); // proactively push a status to any popup already open
  })
  .catch((e) => reportEngineError('setupAudioNodes failed', e));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;
  dlog('recv', message.type);

  // Diagnostics: hand back this document's log + a state snapshot.
  if (message.type === 'getLogs') {
    sendResponse({
      build: BUILD,
      log: LOG.slice(),
      state: {
        hasAudioContext: !!audioContext,
        contextState: audioContext && audioContext.state,
        sampleRate: audioContext && audioContext.sampleRate,
        filters: filters.length,
        streams: Object.keys(streams),
        masterGain: postGain && postGain.__t
      }
    });
    return true;
  }

  // getStatus is a real request/response (not a fire-and-forget broadcast), so
  // the popup's poll always gets a direct answer even if a broadcast is dropped.
  if (message.type === 'getStatus') {
    ready
      .then(() => buildStatus())
      .then((s) => sendResponse(s))
      .catch((e) => sendResponse({ type: 'engineError', where: 'getStatus', error: String((e && e.message) || e) }));
    return true;
  }

  const run = async () => {
    await ready;
    switch (message.type) {
      case 'startCapture':
        await startCapture(message.streamId, message.tab);
        break;
      case 'stopCapture':
      case 'disconnectTab':
        disconnectTab(message.tabId);
        break;
      case 'modifyFilter':
        modifyFilter(message);
        break;
      case 'modifyGain':
        modifyGain(message);
        break;
      case 'applySettings':
        applySettings(message);
        break;
      case 'setActivePreset':
        activePresetName = message.activePreset || '';
        persistFilter(0); // rewrite EQ_STATE with the new activePreset tag
        broadcastStatus();
        break;
      case 'resetFilter':
        resetFilter(message.index);
        broadcastStatus();
        break;
      case 'resetFilters':
        resetAllFilters();
        broadcastStatus();
        break;
      case 'applyPreset':
        await applyPreset(message.preset);
        break;
      case 'savePreset':
        await saveCurrentAsPreset(message.preset);
        break;
      case 'deletePreset':
        await deletePreset(message.preset);
        break;
      case 'importPresets':
        await importPresets(message.presets);
        break;
    }
  };

  if (message.type === 'getFFT') {
    // FFT needs a synchronous `return true` to keep sendResponse alive.
    ready.then(() => handleFFT(sendResponse));
    return true;
  }

  run().catch((e) => reportEngineError('handler failed for ' + message.type, e));
});
