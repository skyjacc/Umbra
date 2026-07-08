// Audio engine — PER-TAB chains. Every captured tab gets its own
//   MediaStreamSource(tab) -> preGain -> [11 biquad filters] -> postGain -> limiter -> speakers
// so two tabs can hold two different EQ curves at the same time (a film tab and a
// music tab, each shaped independently).
//
// Model v2: the engine is a DUMB APPLIER. The offscreen document has no reliable
// chrome.storage, so it does NOT resolve a tab's sound. The POPUP is the source of truth —
// it holds the global profile + rules, resolves each tab (rule -> global -> flat), and
// pushes the bands here via 'applySettings'. This script only builds/holds per-tab chains
// and reports status + FFT back to the popup. Named presets (sync storage) are read here
// solely to echo them back in status.

const NUM_FILTERS = 11;
const DEFAULT_FREQUENCIES = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
const DEFAULT_Q = 0.7071; // Butterworth

const PRESET_PREFIX = 'PRESETS.';

// Bump on every change so the popup can detect a STALE service worker / offscreen.
const BUILD = '2.2.0';

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
// tabId -> { stream, source, preGain, filters[11], postGain, limiter, analyzer,
//            lastAnalyzerUse, host, tab, bands[11], gain, presetName }
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
  // Strip a leading www. so per-domain rules treat www.site and site as one.
  try {
    return (new URL(url).hostname || '').replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Storage — the engine only READS named presets (sync) to echo them in status. All
// resolution + persistence (global profile, rules, presets) is owned by the popup.

const _stg = (area) => (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) || null;

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
  // Output limiter — catches the peaks that big EQ boosts (or master gain) create, so loud
  // curves stay clean instead of hard-clipping into crackle/harshness. Near-transparent at
  // sane levels; a brick wall just below 0 dBFS.
  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  post.connect(limiter);
  limiter.connect(audioContext.destination);
  post.__t = post.gain.value;

  entry.preGain = pre;
  entry.postGain = post;
  entry.limiter = limiter;
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
  // The engine can't resolve (no storage) — start flat. The popup pushes this tab's real
  // bands via 'applySettings' as soon as it sees the capture in the next status broadcast.
  const bands = flatBands();
  const gain = 1;

  const source = audioContext.createMediaStreamSource(stream);
  const entry = {
    stream,
    source,
    host,
    tab: { id: tab.id, title: tab.title || '', favIconUrl: tab.favIconUrl || '', url: tab.url || '' },
    bands,
    gain,
    presetName: '',
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
  try {
    e.stream.getTracks().forEach((t) => t.stop());
  } catch (x) {
    /* ignore */
  }
  for (const node of [e.source, e.preGain, ...(e.filters || []), e.postGain, e.limiter, e.analyzer]) {
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

// Live master-gain drag (the popup's onGainLive). Bands + preset changes come through
// applySettings; gain gets its own message so a volume drag doesn't resend 11 bands.
function modifyGain(m) {
  const e = streams[m.tabId];
  if (!e) return;
  if (m.activePreset !== undefined) e.presetName = m.activePreset || '';
  const g = clampMasterGain(m.gain);
  setParamSmooth(e.postGain.gain, g);
  e.postGain.__t = g;
  e.gain = g;
}

// Core: write a whole bands list + gain into one tab's chain.
function applyToEntry(e, list, gain, presetName) {
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
}

// Live-drag + commit path. Deliberately does NOT broadcast: it fires up to ~30x/s
// during a drag, and a broadcast reads all storage (getPresets) every time. The popup
// holds the active tab's curve optimistically, so it needs no echo here; discrete
// actions (capture) broadcast instead.
function applySettings(m) {
  const e = streams[m.tabId];
  if (!e) {
    dlog('applySettings: NO stream for tab', m.tabId);
    return;
  }
  applyToEntry(e, m.eqFilters, m.gain, m.activePreset);
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
  if (message.type !== 'getFFT') dlog('recv', message.type); // getFFT fires ~30x/s — keep it out of the ring buffer

  if (message.type === 'getLogs') {
    sendResponse({
      build: BUILD,
      log: LOG.slice(),
      state: {
        hasAudioContext: !!audioContext,
        contextState: audioContext && audioContext.state,
        sampleRate: audioContext && audioContext.sampleRate,
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
      case 'modifyGain':
        modifyGain(message);
        break;
      case 'applySettings':
        applySettings(message);
        break;
    }
  };

  run().catch((e) => reportEngineError('handler failed for ' + message.type, e));
});
