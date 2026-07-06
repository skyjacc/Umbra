// Audio engine — PER-TAB chains. Every captured tab gets its own
//   MediaStreamSource(tab) -> preGain -> [11 biquad filters] -> postGain -> speakers
// so two tabs can hold two different EQ curves at the same time (a film tab and a
// music tab, each shaped independently).
//
// Per-domain memory: the shaped curve for a tab is saved under its HOSTNAME in
// chrome.storage.local (DEQ.<host>). When AUTO_DOMAIN is on, capturing a tab whose
// hostname has a saved curve applies it instantly — a "sticky EQ" per site.
//
// Named presets still live in chrome.storage.sync (synced across the user's browsers).

const NUM_FILTERS = 11;
const DEFAULT_FREQUENCIES = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
const DEFAULT_Q = 0.7071; // Butterworth
const PRESET_PREFIX = 'PRESETS.';
const DEQ_PREFIX = 'DEQ.'; // per-hostname saved EQ, e.g. DEQ.music.youtube.com
const AUTO_KEY = 'AUTO_DOMAIN'; // bool — auto-apply a domain's saved curve on capture

// Bump on every change so the popup can detect a STALE service worker / offscreen.
const BUILD = '2.1.0';

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
let autoDomain = true;
// tabId -> { stream, source, preGain, filters[11], postGain, analyzer, lastAnalyzerUse,
//            host, tab, bands[11], gain, presetName }
const streams = {};

// ---------------------------------------------------------------------------
// Clamps (keep the audio graph in sane ranges no matter what the UI sends)

const clampFilterGain = (g) => Math.max(-30, Math.min(30, Number(g) || 0));
const clampFrequency = (f) => Math.max(5, Math.min(20000, Number(f) || 5));
const clampQ = (q) => Math.max(0.2, Math.min(11, Number(q) || DEFAULT_Q));
const clampMasterGain = (g) => Math.max(0.00316, Math.min(10, Number(g) || 1));

const typeOf = (i) => (i === 0 ? 'lowshelf' : i === NUM_FILTERS - 1 ? 'highshelf' : 'peaking');
const flatBands = () => DEFAULT_FREQUENCIES.map((f) => ({ f, g: 0, q: DEFAULT_Q }));
function hostOf(url) {
  try {
    return new URL(url).hostname || '';
  } catch (e) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Storage

const _stg = (area) => (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) || null;

async function loadAuto() {
  const s = _stg('local');
  if (!s) return;
  try {
    const r = await s.get(AUTO_KEY);
    autoDomain = r[AUTO_KEY] !== false; // default ON
  } catch (e) {
    dlog('loadAuto failed:', e && e.message);
  }
}

async function setAuto(on) {
  autoDomain = !!on;
  const s = _stg('local');
  if (s) await s.set({ [AUTO_KEY]: autoDomain });
  broadcastStatus();
}

// Read a hostname's saved curve, or null.
async function loadDomainEq(host) {
  if (!host) return null;
  const s = _stg('local');
  if (!s) return null;
  try {
    const r = await s.get(DEQ_PREFIX + host);
    const v = r[DEQ_PREFIX + host];
    if (v && Array.isArray(v.filters) && v.filters.length === NUM_FILTERS) return v;
  } catch (e) {
    dlog('loadDomainEq failed:', e && e.message);
  }
  return null;
}

// Persist a tab's live curve under its hostname (the "sticky EQ" write path).
function saveDomainEq(entry) {
  const s = _stg('local');
  if (!s || !entry || !entry.host) return;
  s.set({
    [DEQ_PREFIX + entry.host]: {
      v: 1,
      filters: entry.bands.map((b) => ({ f: clampFrequency(b.f), g: clampFilterGain(b.g), q: clampQ(b.q) })),
      gain: clampMasterGain(entry.gain),
      preset: entry.presetName || '',
      updatedAt: Date.now()
    }
  }).catch?.((e) => dlog('saveDomainEq failed:', e && e.message));
}

// Coalesce the per-domain writes: a drag mutates ~30x/s, but the site's saved curve
// only needs the settled value. Debounce per tab; flush on stop so a quick edit isn't lost.
const _saveTimers = {};
function queueSaveDomainEq(entry) {
  if (!entry || !entry.host) return;
  const id = entry.tab.id;
  if (_saveTimers[id]) clearTimeout(_saveTimers[id]);
  _saveTimers[id] = setTimeout(() => {
    delete _saveTimers[id];
    saveDomainEq(entry);
  }, 250);
}
function flushSaveDomainEq(tabId) {
  if (_saveTimers[tabId]) {
    clearTimeout(_saveTimers[tabId]);
    delete _saveTimers[tabId];
    if (streams[tabId]) saveDomainEq(streams[tabId]);
  }
}

async function forgetHost(host) {
  const s = _stg('local');
  if (s && host) await s.remove(DEQ_PREFIX + host);
  broadcastStatus();
}

async function forgetAllHosts() {
  const s = _stg('local');
  if (!s) return;
  const all = await s.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(DEQ_PREFIX));
  if (keys.length) await s.remove(keys);
}

async function listSavedHosts() {
  const s = _stg('local');
  if (!s) return [];
  const all = await s.get(null);
  const out = [];
  for (const k in all) {
    if (k.startsWith(DEQ_PREFIX)) {
      const v = all[k] || {};
      out.push({ host: k.slice(DEQ_PREFIX.length), preset: v.preset || '', updatedAt: v.updatedAt || 0 });
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

// null-proto accumulator so a preset literally named "__proto__" becomes an own
// property instead of reassigning the object's prototype.
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
// Engine bootstrap — just the context now; chains are built per captured tab.

async function setupAudioNodes() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('AudioContext unavailable in offscreen document');
  audioContext = new Ctx({ latencyHint: 'playback' });
  audioContext.suspend(); // resume only while something is captured
  await loadAuto();
}

// Build a fresh chain for one tab from a bands[] + master gain.
// Static chain (wired once): a biquad at 0 dB is transparent, so we never bypass
// filters at runtime — live disconnect/reconnect is a classic click source.
function buildChain(entry, bands, gain) {
  const pre = audioContext.createGain();
  pre.gain.value = 1;
  const post = audioContext.createGain();
  post.gain.value = clampMasterGain(gain);

  const filters = [];
  let node = pre;
  for (let i = 0; i < NUM_FILTERS; i++) {
    const f = audioContext.createBiquadFilter();
    f.type = typeOf(i);
    const b = bands[i] || {};
    f.frequency.value = clampFrequency(b.f ?? DEFAULT_FREQUENCIES[i]);
    f.gain.value = clampFilterGain(b.g ?? 0);
    f.Q.value = clampQ(b.q ?? DEFAULT_Q);
    f.__t = { f: f.frequency.value, g: f.gain.value, q: f.Q.value };
    filters.push(f);
    node.connect(f);
    node = f;
  }
  node.connect(post);
  post.connect(audioContext.destination);
  post.__t = post.gain.value;

  entry.preGain = pre;
  entry.postGain = post;
  entry.filters = filters;
}

// ---------------------------------------------------------------------------
// Capture

async function startCapture(streamId, tab) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }
    });
  } catch (e) {
    reportEngineError('getUserMedia for tab capture failed', e);
    return;
  }

  if (tab.id in streams) stopStream(tab.id); // re-capture replaces old stream
  if (Object.keys(streams).length === 0) audioContext.resume();

  const host = hostOf(tab.url);
  // Auto-apply: a known site starts from its saved curve; anything else starts flat.
  let bands, gain, presetName;
  const saved = autoDomain ? await loadDomainEq(host) : null;
  if (saved) {
    bands = saved.filters.map((b) => ({ f: b.f, g: b.g, q: b.q }));
    gain = saved.gain ?? 1;
    presetName = saved.preset || '';
    dlog('auto-applied saved EQ for', host);
  } else {
    bands = flatBands();
    gain = 1;
    presetName = '';
  }

  const source = audioContext.createMediaStreamSource(stream);
  const entry = {
    stream,
    source,
    host,
    tab: { id: tab.id, title: tab.title || '', favIconUrl: tab.favIconUrl || '', url: tab.url || '' },
    bands,
    gain,
    presetName,
    analyzer: null,
    lastAnalyzerUse: 0
  };
  buildChain(entry, bands, gain);
  source.connect(entry.preGain);

  const track = stream.getAudioTracks()[0];
  track.onended = () => disconnectTab(tab.id); // tab closed / capture revoked

  streams[tab.id] = entry;
  dlog('capturing tab', tab.id, 'host', host, '— active streams:', Object.keys(streams).length);
  broadcastStatus();
}

function stopStream(tabId) {
  const e = streams[tabId];
  if (!e) return;
  flushSaveDomainEq(tabId); // persist a just-made edit before tearing the chain down
  try {
    e.stream.getTracks().forEach((t) => t.stop());
  } catch (x) {
    /* ignore */
  }
  for (const node of [e.source, e.preGain, ...(e.filters || []), e.postGain, e.analyzer]) {
    if (node) {
      try {
        node.disconnect();
      } catch (x) {
        /* already gone */
      }
    }
  }
  delete streams[tabId];
}

function disconnectTab(tabId) {
  stopStream(tabId);
  if (Object.keys(streams).length === 0) audioContext.suspend();
  broadcastStatus();
}

// ---------------------------------------------------------------------------
// Filter / gain mutations — every mutation targets ONE tab by tabId.

const PARAM_TC = 0.012; // ~12ms exponential glide — click-free but responsive

function setParamSmooth(param, value) {
  if (!audioContext) {
    param.value = value;
    return;
  }
  const t = audioContext.currentTime;
  param.cancelScheduledValues(t);
  param.setTargetAtTime(value, t, PARAM_TC);
}

function modifyFilter(m) {
  const e = streams[m.tabId];
  if (!e) return;
  const filter = e.filters[m.index];
  if (!filter) return;
  if (m.activePreset !== undefined) e.presetName = m.activePreset || '';
  const g = clampFilterGain(m.gain);
  const f = clampFrequency(m.frequency);
  const qq = clampQ(m.q);
  setParamSmooth(filter.gain, g);
  setParamSmooth(filter.frequency, f);
  setParamSmooth(filter.Q, qq);
  filter.__t = { f, g, q: qq };
  e.bands[m.index] = { f, g, q: qq };
  queueSaveDomainEq(e);
}

function modifyGain(m) {
  const e = streams[m.tabId];
  if (!e) return;
  if (m.activePreset !== undefined) e.presetName = m.activePreset || '';
  const g = clampMasterGain(m.gain);
  setParamSmooth(e.postGain.gain, g);
  e.postGain.__t = g;
  e.gain = g;
  queueSaveDomainEq(e);
}

// Core: write a whole bands list + gain into one tab's chain. `save` controls whether
// it persists to the domain (reset uses save:false so it can forget instead).
function applyToEntry(e, list, gain, presetName, save) {
  if (presetName !== undefined) e.presetName = presetName || '';
  const arr = Array.isArray(list) ? list : [];
  for (let i = 0; i < NUM_FILTERS; i++) {
    const raw = arr[i] || {};
    const filter = e.filters[i];
    if (!filter) continue;
    const f = clampFrequency(raw.frequency ?? raw.f ?? DEFAULT_FREQUENCIES[i]);
    const g = clampFilterGain(raw.gain ?? raw.g ?? 0);
    const q = clampQ(raw.q ?? raw.Q ?? DEFAULT_Q);
    setParamSmooth(filter.frequency, f);
    setParamSmooth(filter.gain, g);
    setParamSmooth(filter.Q, q);
    filter.__t = { f, g, q };
    e.bands[i] = { f, g, q };
  }
  if (gain != null) {
    const master = clampMasterGain(gain);
    setParamSmooth(e.postGain.gain, master);
    e.postGain.__t = master;
    e.gain = master;
  }
  if (save) queueSaveDomainEq(e);
}

// Live-drag + commit path. Deliberately does NOT broadcast: it fires up to ~30x/s
// during a drag, and a broadcast reads all storage (getPresets + listSavedHosts)
// every time. The popup holds the active tab's curve optimistically, so it needs no
// echo here; discrete actions (capture, preset, reset) broadcast instead.
function applySettings(m) {
  const e = streams[m.tabId];
  if (!e) return;
  applyToEntry(e, m.eqFilters, m.gain, m.activePreset, true);
}

function resetFilter(m) {
  const e = streams[m.tabId];
  if (!e) return;
  modifyFilter({ tabId: m.tabId, index: m.index, frequency: DEFAULT_FREQUENCIES[m.index], gain: 0, q: DEFAULT_Q, activePreset: '' });
}

// Reset ONE tab to flat AND forget its domain memory ("reset this page from its preset").
async function resetTab(tabId) {
  const e = streams[tabId];
  if (e) {
    // Cancel any pending debounced save so it can't re-create the key we're forgetting.
    if (_saveTimers[tabId]) {
      clearTimeout(_saveTimers[tabId]);
      delete _saveTimers[tabId];
    }
    applyToEntry(e, flatBands(), 1, '', false);
    await forgetHost(e.host);
  }
  broadcastStatus();
}

// Reset EVERYTHING: flatten every live tab and wipe all domain memory.
async function resetAllTabs() {
  for (const id in _saveTimers) {
    clearTimeout(_saveTimers[id]);
    delete _saveTimers[id];
  }
  for (const id in streams) applyToEntry(streams[id], flatBands(), 1, '', false);
  await forgetAllHosts();
  broadcastStatus();
}

// ---------------------------------------------------------------------------
// Presets

async function applyPreset(m) {
  const e = streams[m.tabId];
  if (!e) return;
  const name = m.preset;
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
  const eqFilters = [];
  for (let i = 0; i < NUM_FILTERS; i++) {
    eqFilters.push({ frequency: preset.frequencies[i], gain: preset.gains[i], q: preset.qs[i] });
  }
  applyToEntry(e, eqFilters, undefined, name, true);
  broadcastStatus();
}

async function saveCurrentAsPreset(m) {
  const e = streams[m.tabId];
  if (!e) return;
  const preset = {
    frequencies: e.bands.map((b) => b.f),
    gains: e.bands.map((b) => b.g),
    qs: e.bands.map((b) => b.q)
  };
  e.presetName = m.preset || '';
  const s = _stg('sync');
  if (s) await s.set({ [PRESET_PREFIX + m.preset]: preset });
  saveDomainEq(e); // keep the domain's preset tag in sync
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

async function buildStatus() {
  let presets = {};
  try {
    presets = await getPresets();
  } catch (e) {
    dlog('getPresets failed:', e && e.message);
  }
  let savedHosts = [];
  try {
    savedHosts = await listSavedHosts();
  } catch (e) {
    dlog('listSavedHosts failed:', e && e.message);
  }

  const tabs = Object.values(streams).map((e) => ({
    id: e.tab.id,
    title: e.tab.title,
    favIconUrl: e.tab.favIconUrl,
    host: e.host,
    eqFilters: e.bands.map((b, i) => ({ frequency: b.f, gain: b.g, q: b.q, type: typeOf(i) })),
    gain: e.gain,
    activePreset: e.presetName || ''
  }));

  return {
    type: 'workspaceStatus',
    build: BUILD,
    initializing: !audioContext,
    sampleRate: audioContext ? audioContext.sampleRate : 44100,
    presets,
    autoDomain,
    savedHosts,
    tabs
  };
}

async function broadcastStatus() {
  const status = await buildStatus();
  dlog('broadcast status — tabs:', (status.tabs || []).length);
  chrome.runtime.sendMessage(status).catch((e) => dlog('broadcast dropped:', e && e.message));
}

function handleFFT(tabId, sendResponse) {
  // The popup asks for the FFT of the tab it is editing; fall back to any live tab.
  const e = streams[tabId] || streams[Object.keys(streams)[0]];
  if (!e || !audioContext) {
    sendResponse({ fft: null });
    return;
  }
  if (!e.analyzer) {
    e.analyzer = audioContext.createAnalyser();
    e.analyzer.fftSize = 8192;
    e.analyzer.smoothingTimeConstant = 0.7;
    e.postGain.connect(e.analyzer);
  }
  e.lastAnalyzerUse = performance.now();
  const data = new Float32Array(e.analyzer.frequencyBinCount);
  e.analyzer.getFloatFrequencyData(data);
  // Clamp non-finite bins (silence gives -Infinity) to -100 so JSON doesn't turn them
  // into null, which the popup would read as 0 dB (a full flat block).
  sendResponse({ fft: Array.from(data, (v) => (Number.isFinite(v) ? v : -100)) });
}

// Drop each idle analyzer tap (saves CPU when a tab's visualizer stops asking).
setInterval(() => {
  const now = performance.now();
  for (const id in streams) {
    const e = streams[id];
    if (e.analyzer && e.lastAnalyzerUse && now - e.lastAnalyzerUse > 1000) {
      try {
        e.postGain.disconnect(e.analyzer);
      } catch (x) {
        /* already disconnected */
      }
      e.analyzer = null;
    }
  }
}, 1000);

// ---------------------------------------------------------------------------
// Message routing

function reportEngineError(where, e) {
  const msg = (e && (e.message || e.name)) || String(e);
  console.error('[UmbraEQ offscreen] ' + where + ':', e);
  chrome.runtime.sendMessage({ type: 'engineError', where, error: msg }).catch(() => {});
}

const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' timeout after ' + ms + 'ms')), ms))]);

const ready = withTimeout(setupAudioNodes(), 5000, 'setupAudioNodes')
  .then(() => {
    dlog('audio engine ready, sampleRate', audioContext && audioContext.sampleRate);
    broadcastStatus();
  })
  .catch((e) => reportEngineError('setupAudioNodes failed', e));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;
  dlog('recv', message.type);

  if (message.type === 'getLogs') {
    sendResponse({
      build: BUILD,
      log: LOG.slice(),
      state: {
        hasAudioContext: !!audioContext,
        contextState: audioContext && audioContext.state,
        sampleRate: audioContext && audioContext.sampleRate,
        autoDomain,
        streams: Object.keys(streams)
      }
    });
    return true;
  }

  if (message.type === 'getStatus') {
    ready
      .then(() => buildStatus())
      .then((s) => sendResponse(s))
      .catch((e) => sendResponse({ type: 'engineError', where: 'getStatus', error: String((e && e.message) || e) }));
    return true;
  }

  if (message.type === 'getFFT') {
    ready.then(() => handleFFT(message.tabId, sendResponse));
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
      case 'resetFilter':
        resetFilter(message);
        broadcastStatus();
        break;
      case 'resetTab':
        await resetTab(message.tabId);
        break;
      case 'resetAllTabs':
        await resetAllTabs();
        break;
      case 'applyPreset':
        await applyPreset(message);
        break;
      case 'savePreset':
        await saveCurrentAsPreset(message);
        break;
      case 'deletePreset':
        await deletePreset(message.preset);
        break;
      case 'importPresets':
        await importPresets(message.presets);
        break;
      case 'setAuto':
        await setAuto(message.on);
        break;
      case 'forgetHost':
        await forgetHost(message.host);
        break;
    }
  };

  run().catch((e) => reportEngineError('handler failed for ' + message.type, e));
});
