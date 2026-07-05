// Popup UI: interactive parametric EQ rendered with Snap.svg.
//
// Talks to:
//   - the service worker  ({target:'bg', ...})        for capture start/stop
//   - the offscreen page  ({target:'offscreen', ...}) for everything audio
// and listens for 'workspaceStatus' broadcasts to redraw itself.

'use strict';

// ---------------------------------------------------------------------------
// Constants

const EQ_W = 480;
const EQ_H = 220;
const GAIN_W = 26;

// Audio/model hard limits. Legacy imported presets can be wildly outside this range;
// we clamp sound data here so the engine and saved presets stay sane.
const DB_TOP = 30;
const DB_BOTTOM = -30;
// Visual range is intentionally a bit wider than the audio range. This gives
// +30/-30 dB legacy preset handles breathing room instead of pinning them to
// the very top/bottom edge where they look clipped and are harder to grab.
// It is the BASE window; fitViewToModels() expands it (never shrinks below it)
// when a preset's summed curve would otherwise plateau against the top frame.
// Fixed vertical range: wide enough that realistic curves don't clip, so the axis
// never rescales while dragging. (Auto-fit was removed — rescaling on drag-release
// caused a visible "jerk". Dots clamp to +/-30 dB and sit comfortably inside.)
const VIEW_DB_TOP = 60;
const VIEW_DB_BOTTOM = -60;
const MASTER_DB_MAX = 10; // master volume ceiling (10*log10(gain) scale)
const AXIS_MAX_FREQ = 22050;

// Curve colors are read from the active CSS theme (see popup.css :root / [data-theme]).
// loadTheme() refreshes them; fallbacks match the Eclipse default.
let COLOR_BG = '#1a1712';
let COLOR_AXIS = '#5b5346';
let COLOR_PEAKING = '#d7a13f';
let COLOR_SHELF = '#bf7347';
let COLOR_VIZ = '#8a7f6b';
let COLOR_GRAB = '#fff6e6';
let COLOR_TEXT = '#ece3d2';
let GLOW = false; // draw the blurred bloom layer + dot glow (neon theme only)

function themeVar(name, fallback) {
  // Read from <body>: the [data-theme] overrides live there, not on <html>.
  const src = document.body || document.documentElement;
  const v = getComputedStyle(src).getPropertyValue(name).trim();
  return v || fallback;
}
function loadTheme() {
  COLOR_BG = themeVar('--screen', COLOR_BG);
  COLOR_AXIS = themeVar('--axis', COLOR_AXIS);
  COLOR_PEAKING = themeVar('--peak', COLOR_PEAKING);
  COLOR_SHELF = themeVar('--shelf', COLOR_SHELF);
  COLOR_VIZ = themeVar('--viz', COLOR_VIZ);
  COLOR_GRAB = themeVar('--grab', COLOR_GRAB);
  COLOR_TEXT = themeVar('--text', COLOR_TEXT);
  GLOW = themeVar('--glow', '0') === '1';
}

// Switch theme: recolor the CSS chrome (via data-theme) + the SVG curve, persist.
function applyTheme(name) {
  document.body.dataset.theme = name;
  try {
    localStorage[THEME_KEY] = name;
  } catch (e) {
    /* ignore */
  }
  loadTheme();
  if (lastStatus) renderWorkspace(lastStatus);
}

const VIZ_KEY = 'SHOW_VISUALIZER';
const LAST_TAB_KEY = 'last-tab';
const THEME_KEY = 'THEME';
const DEFAULT_THEME = 'eclipse';
const VALID_THEMES = ['eclipse', 'nocturne', 'aurora', 'solar']; // stale/old names fall back to default
const PRESET_PREFIX = 'PRESETS.';
const EQ_STATE_KEY = 'EQ_STATE';
const ACTIVE_PRESET_KEY = 'ACTIVE_PRESET';
const UNSAFE_KEYS = ['__proto__', 'prototype', 'constructor'];
const VIZ_FRAME_MS = 1000 / 30;

// ---------------------------------------------------------------------------
// State

let sampleRate = 44100;
let lastStatus = null;
let currentTabId = null;
let gotFirstStatus = false;
let pendingRestore = null; // EQ restored from storage; forced onto the engine's first status (browser-restart safety)
let autoTried = false; // auto-capture attempted once per popup open

let eqSnap = null; // Snap surface for the EQ area
let gainSnap = null; // Snap surface for the volume strip
let combinedEls = null; // { fill, glow, stroke } of the single composite curve
let currentModels = []; // shared filter models, so drag handlers can redraw the curve
let bandLayer = []; // faint always-on per-band curves
let bandEls = null; // per-band highlight (bold bell + tooltip) on hover/drag
let dragging = false; // true while a filter dot is being dragged
let vizPolyline = null;
let vizLastFrame = null;

// ---------------------------------------------------------------------------
// Debug (flip DEBUG to false before publishing)

const DEBUG = false;
const BUILD = '1.0.1'; // must match background.js / offscreen.js
const EXPECTED_VERSION = '1.0.1'; // must match manifest.json "version"; detects an un-reloaded extension
const dbg = { engine: 'starting…', statusCount: 0, streams: 0, lastMs: null, err: '' };
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
  if (DEBUG) console.log('[UmbraEQ popup]', ...a);
}
window.addEventListener('error', (e) => dlog('UNCAUGHT', e.message, e.filename + ':' + e.lineno));
window.addEventListener('unhandledrejection', (e) => dlog('UNHANDLED_REJECTION', e.reason && (e.reason.message || e.reason)));

// One-click diagnostics: collect popup + service-worker + offscreen logs and state
// into JSON on the clipboard, so a full bug report is a single paste.
function askContext(target, type) {
  return new Promise((resolve) => {
    let done = false;
    const to = setTimeout(() => !done && ((done = true), resolve({ error: 'timeout' })), 1500);
    try {
      chrome.runtime.sendMessage({ target, type }, (resp) => {
        void chrome.runtime.lastError;
        if (!done) {
          done = true;
          clearTimeout(to);
          resolve(resp || { error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'no reply' });
        }
      });
    } catch (e) {
      clearTimeout(to);
      resolve({ error: String(e) });
    }
  });
}

async function copyDiagnostics() {
  const bg = await askContext('bg', 'getLogs');
  const off = await askContext('offscreen', 'getLogs');
  const diag = {
    when: new Date().toISOString(),
    extVersion: (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '?',
    popupBuild: BUILD,
    builds: { popup: BUILD, serviceWorker: bg && bg.build, offscreen: off && off.build },
    userAgent: navigator.userAgent,
    popup: {
      engine: dbg.engine,
      err: dbg.err,
      currentTabId,
      gotFirstStatus,
      streams: (lastStatus && lastStatus.streams) || [],
      theme: document.body.dataset.theme,
      presets: (lastStatus && lastStatus.presets) || {},
      currentBands: currentModels.map((m) => ({ f: Math.round(m.frequency), g: Math.round(m.gain * 10) / 10, q: Math.round(m.q * 100) / 100 }))
    },
    serviceWorker: bg,
    offscreen: off,
    popupLog: LOG.slice()
  };
  const text = JSON.stringify(diag, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    showNotice('Diagnostics copied — paste it to share.');
  } catch (e) {
    // Clipboard blocked: dump to console as a fallback.
    console.log('=== UMBRA EQ DIAGNOSTICS ===\n' + text);
    showNotice('Diagnostics printed to console (clipboard blocked).');
  }
  dlog('diagnostics collected', text.length, 'chars');
}
function renderDebug() {
  const el = document.getElementById('dbg');
  if (!el) return;
  if (!DEBUG) {
    el.style.display = 'none';
    return;
  }
  const age = dbg.lastMs == null ? '—' : Math.round(performance.now() - dbg.lastMs) + 'ms ago';
  el.textContent =
    `engine: ${dbg.engine} · tabs: ${dbg.streams} · status×${dbg.statusCount} (${age})` +
    (dbg.err ? ' · ERR: ' + dbg.err : '');
}

// EQ defaults so the popup can draw immediately, before the engine answers.
const DEFAULT_FREQUENCIES = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
const DEFAULT_Q = 0.7071;
const NUM_FILTERS = 11;
const filterType = (i) => (i === 0 ? 'lowshelf' : i === NUM_FILTERS - 1 ? 'highshelf' : 'peaking');

// ---------------------------------------------------------------------------
// Coordinate transforms (power-of-4 frequency axis, linear dB axis)

const xToFreq = (x) => Math.pow(x / EQ_W, 4) * AXIS_MAX_FREQ;
const freqToX = (f) => Math.pow(f / AXIS_MAX_FREQ, 1 / 4) * EQ_W;
const dbToY = (db) => EQ_H * (1 - (db - VIEW_DB_BOTTOM) / (VIEW_DB_TOP - VIEW_DB_BOTTOM));
const yToDb = (y) => (1 - y / EQ_H) * (VIEW_DB_TOP - VIEW_DB_BOTTOM) + VIEW_DB_BOTTOM;
const masterGainToDb = (g) => 10 * Math.log10(g);
const dbToMasterGain = (db) => Math.pow(10, db / 10);
const clampQ = (q) => Math.max(0.2, Math.min(11, q));
const clampGainDb = (g) => Math.max(DB_BOTTOM, Math.min(DB_TOP, g));
const clampFreq = (f) => Math.max(5, Math.min(20000, f));
const clampMasterGain = (g) => {
  const n = Number(g);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return dbToMasterGain(Math.max(DB_BOTTOM, Math.min(MASTER_DB_MAX, masterGainToDb(n))));
};

// Pixel clamps that ALSO neutralize NaN (Math.min/max propagate NaN, which is
// exactly what lets a dot escape the canvas). Keep dots a few px inside so the
// full circle stays grabbable.
const clampX = (x) => (Number.isFinite(x) ? Math.max(6, Math.min(EQ_W - 6, x)) : 6);
const clampY = (y) => (Number.isFinite(y) ? Math.max(6, Math.min(EQ_H - 6, y)) : EQ_H / 2);

function sanitizeFilter(raw, index) {
  const fallback = DEFAULT_FREQUENCIES[index] || DEFAULT_FREQUENCIES[0];
  const f = Number(raw && (raw.frequency ?? raw.f));
  const g = Number(raw && (raw.gain ?? raw.g));
  const q = Number(raw && (raw.q ?? raw.Q));
  return {
    frequency: clampFreq(Number.isFinite(f) ? f : fallback),
    gain: clampGainDb(Number.isFinite(g) ? g : 0),
    q: clampQ(Number.isFinite(q) ? q : DEFAULT_Q),
    type: raw && raw.type ? raw.type : filterType(index)
  };
}

function sanitizeStatus(status) {
  const safe = Object.assign({}, status || {});
  const inFilters = Array.isArray(safe.eqFilters) ? safe.eqFilters : [];
  safe.eqFilters = [];
  for (let i = 0; i < NUM_FILTERS; i++) safe.eqFilters.push(sanitizeFilter(inFilters[i], i));
  safe.gain = clampMasterGain(safe.gain);
  safe.sampleRate = safe.sampleRate || sampleRate;
  safe.streams = safe.streams || [];
  return safe;
}

function eqStateFiltersFromStorage(stored) {
  const state = stored && stored[EQ_STATE_KEY];
  const source = state && Array.isArray(state.filters) ? state.filters : null;
  const eqFilters = [];
  for (let i = 0; i < NUM_FILTERS; i++) {
    const legacy = stored && stored['filter' + i];
    const raw = source ? source[i] : legacy;
    eqFilters.push(sanitizeFilter(raw, i));
  }
  return eqFilters;
}

function eqStateGainFromStorage(stored) {
  const state = stored && stored[EQ_STATE_KEY];
  const raw = state && state.gain != null ? state.gain : stored && stored.GAIN;
  return clampMasterGain(raw);
}

function activePresetFromStorage(stored, presets) {
  const state = stored && stored[EQ_STATE_KEY];
  const name = (state && state.activePreset) || (stored && stored[ACTIVE_PRESET_KEY]) || '';
  return name && presets && presets[name] ? name : '';
}

// Persist the whole EQ as one atomic snapshot. The older per-band keys are still
// written as a compatibility mirror, but restore prefers EQ_STATE so a browser
// restart cannot rebuild a half-old / half-new curve from partially flushed keys.
function persistEqState(eqFilters, gain, activePreset) {
  const cleanStatus = sanitizeStatus({ eqFilters, gain, sampleRate });
  const filters = cleanStatus.eqFilters.map((f) => ({ f: f.frequency, g: f.gain, q: f.q }));
  const active = activePreset || '';
  const payload = {
    [EQ_STATE_KEY]: {
      v: 1,
      filters,
      gain: cleanStatus.gain,
      activePreset: active,
      updatedAt: Date.now()
    },
    [ACTIVE_PRESET_KEY]: active,
    GAIN: cleanStatus.gain
  };
  for (let i = 0; i < NUM_FILTERS; i++) payload['filter' + i] = filters[i];
  try {
    const ret = chrome.storage.local.set(payload);
    if (ret && typeof ret.catch === 'function') ret.catch((e) => dlog('persistEqState failed', e));
  } catch (e) {
    dlog('persistEqState failed', e);
  }
}

function persistCurrentEqState(activePreset) {
  if (!currentModels || currentModels.length !== NUM_FILTERS) return;
  const eqFilters = currentModels.map((m, i) => ({
    frequency: m.frequency,
    gain: m.gain,
    q: m.q,
    type: m.type || filterType(i)
  }));
  const gain = lastStatus && lastStatus.gain != null ? lastStatus.gain : 1;
  persistEqState(eqFilters, gain, activePreset);
}

// ---------------------------------------------------------------------------
// Messaging

function toOffscreen(type, extra = {}, callback) {
  const msg = Object.assign({ target: 'offscreen', type }, extra);
  if (callback) {
    chrome.runtime.sendMessage(msg, callback);
  } else {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
}

function toBackground(type, extra = {}, callback) {
  const msg = Object.assign({ target: 'bg', type }, extra);
  if (callback) {
    chrome.runtime.sendMessage(msg, callback);
  } else {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
}

// Ask the engine for status and consume the DIRECT reply (request/response),
// so we no longer depend on catching a fire-and-forget broadcast.
const requestStatus = () =>
  toOffscreen('getStatus', {}, (resp) => {
    if (chrome.runtime.lastError || !resp) return;
    if (resp.type === 'engineError') {
      dbg.engine = 'engine ERROR';
      dbg.err = (resp.where ? resp.where + ': ' : '') + resp.error;
      renderDebug();
      return;
    }
    if (resp.type === 'workspaceStatus') handleStatus(resp);
  });

// Throttle for live-drag messages so we don't flood the offscreen page.
function makeThrottle(intervalMs) {
  let last = 0;
  let trailing = null;
  return (fn) => {
    const now = performance.now();
    clearTimeout(trailing);
    if (now - last >= intervalMs) {
      last = now;
      fn();
    } else {
      trailing = setTimeout(() => {
        last = performance.now();
        fn();
      }, intervalMs - (now - last));
    }
  };
}
const throttledSend = makeThrottle(33);

// ---------------------------------------------------------------------------
// Biquad magnitude response (same math the Web Audio filters use), for drawing
// the per-filter curves. omega0 = tan(pi * f0 / Fs), y = sin^2(omega / 2).

function biquadCoefficients(type, f0, q, gainDb) {
  const o = Math.tan((Math.PI * f0) / sampleRate);
  const c = Math.pow(10, Math.abs(gainDb) / 20);
  const boost = gainDb >= 0;
  let s, b0, b1, b2, a1, a2;

  if (type === 'peaking') {
    if (boost) {
      s = 1 / (1 + (1 / q) * o + o * o);
      b0 = (1 + (c / q) * o + o * o) * s;
      b1 = 2 * (o * o - 1) * s;
      b2 = (1 - (c / q) * o + o * o) * s;
      a1 = b1;
      a2 = (1 - (1 / q) * o + o * o) * s;
    } else {
      s = 1 / (1 + (c / q) * o + o * o);
      b0 = (1 + (1 / q) * o + o * o) * s;
      b1 = 2 * (o * o - 1) * s;
      b2 = (1 - (1 / q) * o + o * o) * s;
      a1 = b1;
      a2 = (1 - (c / q) * o + o * o) * s;
    }
  } else if (type === 'highshelf') {
    if (boost) {
      s = 1 / (1 + Math.SQRT2 * o + o * o);
      b0 = (c + Math.sqrt(2 * c) * o + o * o) * s;
      b1 = 2 * (o * o - c) * s;
      b2 = (c - Math.sqrt(2 * c) * o + o * o) * s;
      a1 = 2 * (o * o - 1) * s;
      a2 = (1 - Math.SQRT2 * o + o * o) * s;
    } else {
      s = 1 / (c + Math.sqrt(2 * c) * o + o * o);
      b0 = (1 + Math.SQRT2 * o + o * o) * s;
      b1 = 2 * (o * o - 1) * s;
      b2 = (1 - Math.SQRT2 * o + o * o) * s;
      a1 = 2 * (o * o - c) * s;
      a2 = (c - Math.sqrt(2 * c) * o + o * o) * s;
    }
  } else {
    // lowshelf
    if (boost) {
      s = 1 / (1 + Math.SQRT2 * o + o * o);
      b0 = (1 + Math.sqrt(2 * c) * o + c * o * o) * s;
      b1 = 2 * (c * o * o - 1) * s;
      b2 = (1 - Math.sqrt(2 * c) * o + c * o * o) * s;
      a1 = 2 * (o * o - 1) * s;
      a2 = (1 - Math.SQRT2 * o + o * o) * s;
    } else {
      s = 1 / (1 + Math.sqrt(2 * c) * o + c * o * o);
      b0 = (1 + Math.SQRT2 * o + o * o) * s;
      b1 = 2 * (o * o - 1) * s;
      b2 = (1 - Math.SQRT2 * o + o * o) * s;
      a1 = 2 * (c * o * o - 1) * s;
      a2 = (1 - Math.sqrt(2 * c) * o + c * o * o) * s;
    }
  }
  return { b0, b1, b2, a1, a2 };
}

// The centerpiece: ONE combined magnitude curve = sum of every filter's dB
// response at each x, rendered as a triple stack (dissolving fill + blurred
// halo + razor stroke) — the FabFilter Pro-Q visual grammar.
function drawCombinedCurve(models) {
  if (combinedEls) {
    for (const el of Object.values(combinedEls)) el && el.remove();
    combinedEls = null;
  }
  if (!eqSnap || !models || models.length === 0) return;

  // Coefficients computed once per redraw, reused across all 300 columns.
  const coeffs = models.map((m) => biquadCoefficients(m.type, m.frequency, m.q, m.gain));

  const pts = [];
  for (let gx = 0; gx <= EQ_W; gx += 2) {
    const clampedX = Math.min(gx, EQ_W - 1);
    const freq = xToFreq(clampedX);
    const omega = (2 * Math.PI * freq) / sampleRate;
    const y = Math.pow(Math.sin(omega / 2), 2);

    let totalDb = 0;
    for (const c of coeffs) {
      const num =
        Math.pow(c.b0 + c.b1 + c.b2, 2) -
        4 * (c.b0 * c.b1 + 4 * c.b0 * c.b2 + c.b1 * c.b2) * y +
        16 * c.b0 * c.b2 * y * y;
      const den =
        Math.pow(1 + c.a1 + c.a2, 2) - 4 * (c.a1 + 4 * c.a2 + c.a1 * c.a2) * y + 16 * c.a2 * y * y;
      let db = 10 * Math.log10(num / den);
      if (!Number.isFinite(db)) db = 0; // guard log10(0)/NaN before summing
      totalDb += db;
    }

    // Clamp the PIXEL (not the dB) so clustered extreme boosts never plateau
    // off-canvas — the fill/stroke always stay inside 0..EQ_H.
    let py = dbToY(totalDb);
    if (!Number.isFinite(py)) py = EQ_H - 1;
    py = Math.max(-EQ_H, Math.min(EQ_H * 2, py)); // let extreme peaks exit; the SVG viewport clips them cleanly
    pts.push([clampedX, py]);
  }

  // Open path for the strokes; closed path (down to the 0 dB baseline) for the fill.
  const midY = dbToY(0);
  let open = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (let i = 1; i < pts.length; i++) open += ' L' + pts[i][0] + ' ' + pts[i][1];
  const closed = open + ' L' + (EQ_W - 1) + ' ' + midY + ' L0 ' + midY + ' Z';

  // (1) FILL — accent at top, dissolving into the canvas at the baseline.
  const fillGrad = eqSnap.gradient('l(0.5,0,0.5,1)' + COLOR_PEAKING + '-' + COLOR_BG);
  const fill = eqSnap
    .path(closed)
    .attr({ fill: fillGrad, 'fill-opacity': GLOW ? 0.22 : 0.16, stroke: 'none', 'pointer-events': 'none' });

  // (2) GLOW — blurred bloom, only for the neon theme.
  let glow = null;
  if (GLOW) {
    glow = eqSnap.path(open).attr({
      stroke: COLOR_PEAKING,
      'stroke-width': 6,
      fill: 'none',
      'stroke-linejoin': 'round',
      'stroke-opacity': 0.5,
      'pointer-events': 'none'
    });
    glow.attr({ filter: eqSnap.filter(Snap.filter.blur(4)) });
  }

  // (3) STROKE — crisp edge, hue shifts low->high across the axis.
  const strokeGrad = eqSnap.gradient('l(0,0,1,0)' + COLOR_PEAKING + '-' + COLOR_SHELF);
  const stroke = eqSnap.path(open).attr({
    stroke: strokeGrad,
    'stroke-width': 2,
    fill: 'none',
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    'pointer-events': 'none'
  });

  combinedEls = { fill, glow, stroke };
}

const bandColor = (m) => (m.type === 'peaking' ? COLOR_PEAKING : COLOR_SHELF);

// One filter's response as SVG path strings (open curve + closed-to-baseline fill).
function computeBandPath(model) {
  const { b0, b1, b2, a1, a2 } = biquadCoefficients(model.type, model.frequency, model.q, model.gain);
  const pts = [];
  for (let gx = 0; gx <= EQ_W; gx += 2) {
    const cx = Math.min(gx, EQ_W - 1);
    const freq = xToFreq(cx);
    const omega = (2 * Math.PI * freq) / sampleRate;
    const y = Math.pow(Math.sin(omega / 2), 2);
    const num =
      Math.pow(b0 + b1 + b2, 2) - 4 * (b0 * b1 + 4 * b0 * b2 + b1 * b2) * y + 16 * b0 * b2 * y * y;
    const den = Math.pow(1 + a1 + a2, 2) - 4 * (a1 + 4 * a2 + a1 * a2) * y + 16 * a2 * y * y;
    let db = 10 * Math.log10(num / den);
    if (!Number.isFinite(db)) db = 0;
    let py = dbToY(db);
    py = Math.max(-EQ_H, Math.min(EQ_H * 2, py)); // let extreme peaks exit; the SVG viewport clips them cleanly
    pts.push([cx, py]);
  }
  const midY = dbToY(0);
  let open = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (let i = 1; i < pts.length; i++) open += ' L' + pts[i][0] + ' ' + pts[i][1];
  const closed = open + ' L' + (EQ_W - 1) + ' ' + midY + ' L0 ' + midY + ' Z';
  return { open, closed };
}

// Faint per-band curves, ALWAYS visible so each dot's own shape is readable.
function clearBandLayer() {
  for (const el of bandLayer) el && el.remove();
  bandLayer = [];
}
function drawAllBands(models) {
  clearBandLayer();
  if (!eqSnap) return;
  models.forEach((m) => {
    if (m.gain === 0) return; // a flat band adds nothing — skip to avoid clutter
    const { open } = computeBandPath(m);
    bandLayer.push(
      eqSnap.path(open).attr({
        stroke: bandColor(m),
        'stroke-width': 1,
        'stroke-opacity': 0.32,
        fill: 'none',
        'stroke-linejoin': 'round',
        'pointer-events': 'none'
      })
    );
  });
}

// Faint bands (underneath) + the bold combined curve (on top).
function redrawCurves(models) {
  drawAllBands(models);
  drawCombinedCurve(models);
}

// Peak absolute magnitude (dB) of the SUMMED response across the axis. Used to
// decide how far the vertical scale must zoom out so nothing clips.
function combinedPeakDb(models) {
  if (!models || !models.length) return 0;
  const coeffs = models.map((m) => biquadCoefficients(m.type, m.frequency, m.q, m.gain));
  let peak = 0;
  for (let gx = 0; gx <= EQ_W; gx += 4) {
    const cx = Math.min(gx, EQ_W - 1);
    const freq = xToFreq(cx);
    const omega = (2 * Math.PI * freq) / sampleRate;
    const y = Math.pow(Math.sin(omega / 2), 2);
    let totalDb = 0;
    for (const c of coeffs) {
      const num =
        Math.pow(c.b0 + c.b1 + c.b2, 2) -
        4 * (c.b0 * c.b1 + 4 * c.b0 * c.b2 + c.b1 * c.b2) * y +
        16 * c.b0 * c.b2 * y * y;
      const den =
        Math.pow(1 + c.a1 + c.a2, 2) - 4 * (c.a1 + 4 * c.a2 + c.a1 * c.a2) * y + 16 * c.a2 * y * y;
      let db = 10 * Math.log10(num / den);
      if (!Number.isFinite(db)) db = 0;
      totalDb += db;
    }
    const a = Math.abs(totalDb);
    if (a > peak) peak = a;
  }
  return peak;
}

// Auto-fit the vertical dB scale to THIS curve. Normal presets stay at the
// default ±36 dB window; only extreme legacy presets (clustered boosts whose SUM
// exceeds the window) zoom the axis out so the curve + dots stay inside with
// margin instead of slamming into the top frame. Called on discrete renders only
// (preset apply, boot, drag-end) — never mid-drag, so the axis never jumps while
// the user is actively dragging a dot.
function fitViewToModels(models) {
  const peak = combinedPeakDb(models);
  const MARGIN = 6; // keep the curve's crest off the very top edge
  let needed = Math.max(VIEW_DB_BASE, peak + MARGIN);
  needed = Math.min(needed, 120); // hard cap so a broken preset can't zoom to nothing
  needed = Math.ceil(needed / 6) * 6; // round to a tidy multiple for axis labels
  VIEW_DB_TOP = needed;
  VIEW_DB_BOTTOM = -needed;
}

// Remove the hover/drag highlight (bold band + tooltip).
function hideBand() {
  if (bandEls) {
    for (const el of bandEls) el && el.remove();
    bandEls = null;
  }
}

// Highlight ONE filter: bold bell + filled area + an explanatory tooltip.
function showBand(model) {
  hideBand();
  if (!eqSnap) return;
  const color = bandColor(model);
  const { open, closed } = computeBandPath(model);

  const fillGrad =
    model.gain >= 0
      ? eqSnap.gradient('l(0.5,0,0.5,1)' + color + '-' + COLOR_BG)
      : eqSnap.gradient('l(0.5,1,0.5,0)' + color + '-' + COLOR_BG);
  const fill = eqSnap
    .path(closed)
    .attr({ fill: fillGrad, 'fill-opacity': 0.2, stroke: 'none', 'pointer-events': 'none' });
  const stroke = eqSnap.path(open).attr({
    stroke: color,
    'stroke-width': 2.5,
    fill: 'none',
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    'pointer-events': 'none'
  });

  bandEls = [fill, stroke];
  drawTooltip(model, color);
}

function bandRole(model) {
  if (model.type === 'lowshelf') return 'Low shelf · lifts or cuts all the lows';
  if (model.type === 'highshelf') return 'High shelf · lifts or cuts all the highs';
  return 'Bell · boosts or cuts around this frequency';
}

// Explanatory tooltip: what the filter is (role) + live freq / gain / Q.
function drawTooltip(model, color) {
  const f =
    model.frequency >= 1000
      ? (model.frequency / 1000).toFixed(model.frequency >= 10000 ? 0 : 1) + ' kHz'
      : Math.round(model.frequency) + ' Hz';
  const g = (model.gain >= 0 ? '+' : '') + model.gain.toFixed(1) + ' dB';

  const line1 = eqSnap
    .text(14, 15, bandRole(model))
    .attr({ fill: COLOR_TEXT, 'font-size': 10, 'pointer-events': 'none' });
  const line2 = eqSnap
    .text(14, 31, `${f}    ${g}    Q ${model.q.toFixed(2)}`)
    .attr({ fill: COLOR_TEXT, 'font-size': 11, 'font-weight': 700, 'pointer-events': 'none' });

  const b1 = line1.getBBox();
  const b2 = line2.getBBox();
  const x = Math.min(b1.x, b2.x) - 8;
  const w = Math.max(b1.x2, b2.x2) - Math.min(b1.x, b2.x) + 16;
  const yTop = b1.y - 5;
  const h = b2.y2 - b1.y + 10;
  const bg = eqSnap
    .rect(x, yTop, w, h, 5)
    .attr({ fill: COLOR_BG, 'fill-opacity': 0.85, stroke: color, 'stroke-opacity': 0.55 });
  bg.insertBefore(line1); // rect behind both lines
  bandEls.push(line1, line2, bg);
}

// ---------------------------------------------------------------------------
// Axes

// Compact frequency label: 1000 -> "1k", 20480 -> "20k".
function freqLabel(f) {
  if (f >= 1000) {
    const k = f / 1000;
    return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
  }
  return String(Math.round(f));
}

function drawAxes() {
  for (let f = 5; f < AXIS_MAX_FREQ; f *= 2) {
    const x = freqToX(f);
    // Full-height engraved vertical grid line, very faint.
    eqSnap.line(x, 0, x, EQ_H).attr({ stroke: COLOR_AXIS, 'stroke-opacity': 0.1 });
    // Tick marks top + bottom, slightly stronger.
    eqSnap.line(x, EQ_H, x, EQ_H - 12).attr({ stroke: COLOR_AXIS, 'stroke-opacity': 0.35 });
    eqSnap.line(x, 0, x, 12).attr({ stroke: COLOR_AXIS, 'stroke-opacity': 0.35 });
    eqSnap.text(x, EQ_H - 16, freqLabel(f)).attr({
      fill: COLOR_AXIS,
      'fill-opacity': 0.62,
      'text-anchor': 'middle',
      'font-size': 9
    });
  }

  // dB gridlines span the (possibly auto-fitted) view range with an adaptive step.
  const range = VIEW_DB_TOP;
  const step = range <= 42 ? 5 : range <= 78 ? 10 : 20;
  for (let db = Math.ceil(-range / step) * step; db <= range; db += step) {
    if (range - Math.abs(db) <= step * 0.5) continue; // skip labels crowding the edge
    const y = dbToY(db);
    eqSnap.line(0, y, 5, y).attr({ stroke: COLOR_AXIS, 'stroke-opacity': 0.35 });
    eqSnap.text(7, y, String(db)).attr({
      fill: COLOR_AXIS,
      'fill-opacity': 0.62,
      'font-size': 9,
      'dominant-baseline': 'middle'
    });
  }
}

// ---------------------------------------------------------------------------
// Drag plumbing (Snap.svg)

function svgLocalPoint(snapSurface, clientX, clientY) {
  const rect = snapSurface.node.getBoundingClientRect();
  return [clientX - rect.left, clientY - rect.top];
}

const dragStart = function () {
  this.data('origTransform', this.transform().local);
  this.attr({ fill: COLOR_GRAB });
};

function makeDotDragMove(model, index) {
  return function (dx, dy, cx, cy, evt) {
    if (evt.shiftKey) {
      model.q = clampQ(model.q + evt.movementY / 10);
    } else {
      let [lx, ly] = svgLocalPoint(eqSnap, cx, cy);
      if (lx < 0 || lx >= EQ_W || ly < 0 || ly >= EQ_H) return;
      const topY = dbToY(DB_TOP);
      const bottomY = dbToY(DB_BOTTOM);
      if (ly < topY) {
        dy -= ly - topY;
        ly = topY;
      } else if (ly > bottomY) {
        dy -= ly - bottomY;
        ly = bottomY;
      }
      model.x = lx;
      model.y = ly;
      model.gain = clampGainDb(yToDb(ly));
      model.frequency = clampFreq(xToFreq(lx));
      const orig = this.data('origTransform');
      this.attr({ transform: orig + (orig ? 'T' : 't') + [dx, dy] });
    }
    dragging = true;
    redrawCurves(currentModels); // reshape all bands + the summed curve live
    showBand(model); // highlight THIS band + explanatory tooltip
    throttledSend(() =>
      toOffscreen('modifyFilter', {
        index,
        frequency: model.frequency,
        gain: model.gain,
        q: model.q,
        activePreset: ''
      })
    );
  };
}

function makeDotDragEnd(model, index) {
  return function () {
    dragging = false;
    hideBand();
    // Restore the filter's own color (not the bg) so it stays visible until redraw.
    this.attr({ fill: model.type === 'peaking' ? COLOR_PEAKING : COLOR_SHELF });
    toOffscreen('modifyFilter', {
      index,
      frequency: model.frequency,
      gain: model.gain,
      q: model.q,
      activePreset: ''
    });
    persistCurrentEqState(''); // manual edit: remember the curve, clear preset label
    requestStatus(); // canonical redraw
  };
}

function makeGainDragMove(gainModel) {
  return function (dx, dy, cx, cy) {
    let [, ly] = svgLocalPoint(gainSnap, cx, cy);
    if (ly < 0 || ly >= EQ_H) return;
    if (yToDb(ly) > MASTER_DB_MAX) {
      dy -= ly - dbToY(MASTER_DB_MAX);
      ly = dbToY(MASTER_DB_MAX);
    }
    gainModel.y = ly;
    gainModel.gain = dbToMasterGain(yToDb(ly));
    const orig = this.data('origTransform');
    this.attr({ transform: orig + (orig ? 'T' : 't') + [0, dy] });
    throttledSend(() => toOffscreen('modifyGain', { gain: gainModel.gain, activePreset: '' }));
  };
}

function makeGainDragEnd(gainModel) {
  return function () {
    this.attr({ fill: COLOR_PEAKING });
    lastStatus = Object.assign({}, lastStatus, { gain: clampMasterGain(gainModel.gain) });
    persistCurrentEqState(''); // manual volume edit must survive browser restart too
    toOffscreen('modifyGain', { gain: gainModel.gain, activePreset: '' });
    requestStatus();
  };
}

// ---------------------------------------------------------------------------
// Workspace rendering

function renderWorkspace(status) {
  // Sanitize EVERY status before it reaches the graph: legacy imported presets can
  // carry out-of-range gains (e.g. +99 dB), out-of-range/negative/NaN
  // frequencies, or a bad master gain. Without this the dot's x/y become NaN or
  // land off-canvas and can't be grabbed. This is the single choke point that
  // every render path (storage boot, engine status, preset apply) flows through.
  status = sanitizeStatus(status);
  sampleRate = status.sampleRate || sampleRate;

  if (eqSnap) eqSnap.clear();
  if (gainSnap) gainSnap.clear();
  combinedEls = null;
  bandEls = null;
  bandLayer = [];
  vizPolyline = null;

  eqSnap = Snap('#eqSvg');
  eqSnap.attr({ fill: COLOR_BG, width: EQ_W, height: EQ_H });
  gainSnap = Snap('#gainSvg');
  gainSnap.attr({ fill: COLOR_BG, width: GAIN_W, height: EQ_H });

  currentModels = status.eqFilters.map((f) => ({
    frequency: f.frequency,
    gain: f.gain,
    q: f.q,
    type: f.type
  }));
  const models = currentModels;

  drawAxes(); // engraved grid sits under everything

  // Project each band to pixels with the fitted scale. Values are already clamped
  // by sanitizeStatus; guard NaN once more so a dot is ALWAYS inside + grabbable.
  for (const m of models) {
    m.x = clampX(freqToX(m.frequency));
    m.y = clampY(dbToY(m.gain));
  }

  redrawCurves(models); // faint per-band curves + the bold combined curve

  // Volume strip: channel, 0 dB tick, label
  gainSnap
    .line(GAIN_W / 2, dbToY(DB_BOTTOM), GAIN_W / 2, dbToY(MASTER_DB_MAX))
    .attr({ stroke: COLOR_AXIS, 'stroke-opacity': 0.35 });
  gainSnap.text(GAIN_W / 2, dbToY(MASTER_DB_MAX) - 10, 'vol').attr({
    fill: COLOR_AXIS,
    'fill-opacity': 0.62,
    'text-anchor': 'middle',
    'font-size': 8
  });
  gainSnap.line(GAIN_W / 2 - 5, dbToY(0), GAIN_W / 2 + 5, dbToY(0)).attr({ stroke: COLOR_AXIS, 'stroke-opacity': 0.5 });

  // Fat rect master-volume handle (chunky drag target).
  const gainModel = { gain: status.gain, y: dbToY(masterGainToDb(status.gain)) };
  const gainHandle = gainSnap
    .rect(0, gainModel.y - 3, GAIN_W, 6)
    .attr({ fill: COLOR_PEAKING })
    .addClass('gainLine');
  gainHandle.drag(makeGainDragMove(gainModel), dragStart, makeGainDragEnd(gainModel));

  // Filter handles: jewel discs with a dark knockout ring + type-hue CSS glow.
  models.forEach((m, i) => {
    const color = m.type === 'peaking' ? COLOR_PEAKING : COLOR_SHELF;
    const dot = eqSnap
      .circle(m.x, m.y, 5)
      .attr({ fill: color, stroke: COLOR_BG, 'stroke-width': 1 })
      .addClass('filterDot');
    dot.node.style.color = color; // drives CSS drop-shadow(... currentColor)
    dot.drag(makeDotDragMove(m, i), dragStart, makeDotDragEnd(m, i));
    // Double-click resets THIS band (popup-side, so it works even if engine is asleep).
    dot.dblclick(() => resetBandLocal(i));
    // Hover preview: show this band's own curve + readout even before dragging.
    dot.hover(
      () => {
        if (!dragging) showBand(m);
      },
      () => {
        if (!dragging) hideBand();
      }
    );
  });

  renderTabList(status.streams || []);
  updateEqButton(status.streams || []);
  // NOTE: presets are NOT rendered from status (the engine may broadcast a stale
  // or empty preset list and wipe them). They're owned popup-side via refreshPresets().
}

function renderTabList(streamTabs) {
  const list = document.getElementById('eqTabList');
  list.textContent = '';

  if (streamTabs.length === 0) {
    list.textContent = "No tabs are being EQ'd. Start with EQ This Tab.";
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'tabRows';
  for (const tab of streamTabs) {
    const row = document.createElement('div');
    row.className = 'tabRow';

    // Favicon (from the tab captured via activeTab). Fall back to a globe glyph.
    const icon = document.createElement('span');
    icon.className = 'tabFav';
    if (tab.favIconUrl && /^(https?:|data:)/.test(tab.favIconUrl)) {
      const img = document.createElement('img');
      img.src = tab.favIconUrl;
      img.alt = '';
      img.onerror = () => { icon.textContent = '🌐'; };
      icon.appendChild(img);
    } else {
      icon.textContent = '🌐';
    }
    row.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'tabTitle';
    title.textContent = tab.title || '(untitled)';
    title.title = tab.title || '';
    row.appendChild(title);

    const stopBtn = document.createElement('button');
    stopBtn.className = 'tabStop';
    stopBtn.textContent = 'Stop';
    stopBtn.title = 'Stop EQing this tab';
    stopBtn.onclick = () => toOffscreen('disconnectTab', { tabId: tab.id });
    row.appendChild(stopBtn);

    wrap.appendChild(row);
  }
  list.appendChild(wrap);
}

function renderPresets(presets) {
  const span = document.getElementById('userPresetSpan');
  span.textContent = '';
  for (const name of Object.keys(presets).sort()) {
    const row = document.createElement('button');
    row.className = 'pd-row';
    const label = document.createElement('span');
    label.textContent = name;
    row.appendChild(label);
    const del = document.createElement('span');
    del.className = 'pd-del';
    del.textContent = '⌫';
    del.title = 'Delete "' + name + '"';
    del.onclick = (e) => {
      e.stopPropagation();
      deletePresetLocal(name);
    };
    row.appendChild(del);
    row.onclick = () => {
      applyPresetByName(name);
      document.getElementById('presetNameInput').value = name;
      row.classList.add('applied');
      setTimeout(() => row.classList.remove('applied'), 400);
    };
    span.appendChild(row);
  }
}

// --- Presets: stored in chrome.storage.sync, handled popup-side so import/export
// work even if the audio engine is asleep. Also tolerant of foreign formats. ---

// Coerce one preset object into 11-band {frequencies, gains, qs}, or null.
function coerceBands(p) {
  if (!p || typeof p !== 'object') return null;
  const f = p.frequencies || p.freqs || p.freq || p.f;
  const g = p.gains || p.gain || p.g;
  const q = p.qs || p.q || p.Q;
  if (!Array.isArray(f) || !Array.isArray(g) || !Array.isArray(q)) return null;
  if (f.length === 0) return null;
  const frequencies = [];
  const gains = [];
  const qs = [];
  // Per-element coercion: a single bad value (NaN / 'x' / null) is replaced with
  // a sane default instead of throwing away the whole preset. Legacy import files
  // occasionally carry stray non-numeric slots; we still want the rest usable.
  for (let i = 0; i < NUM_FILTERS; i++) {
    const fn = Number(f[i]);
    const gn = Number(g[i]);
    const qn = Number(q[i]);
    frequencies.push(clampFreq(Number.isFinite(fn) ? fn : DEFAULT_FREQUENCIES[i]));
    gains.push(clampGainDb(Number.isFinite(gn) ? gn : 0));
    qs.push(clampQ(Number.isFinite(qn) ? qn : DEFAULT_Q));
  }
  return { frequencies, gains, qs };
}

// Accept Umbra/legacy format {name:{frequencies,gains,qs}}, arrays of presets,
// alt keys (freqs/f/g/q), or a single preset object.
function normalizePresets(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;

  if (Array.isArray(raw)) {
    raw.forEach((p, i) => {
      const bands = coerceBands(p);
      if (bands) out[(p && (p.name || p.title)) || 'Preset ' + (i + 1)] = bands;
    });
    return out;
  }

  // Single preset object at the top level?
  if (raw.frequencies || raw.freqs || raw.f) {
    const bands = coerceBands(raw);
    if (bands) {
      out[raw.name || raw.title || 'Imported'] = bands;
      return out;
    }
  }

  // Map of name -> preset.
  for (const name in raw) {
    if (UNSAFE_KEYS.includes(name)) continue;
    const bands = coerceBands(raw[name]);
    if (bands) out[name] = bands;
  }
  return out;
}

function presetBandsEqual(a, b) {
  if (!a || !b) return false;
  if (!Array.isArray(b.frequencies) || !Array.isArray(b.gains) || !Array.isArray(b.qs)) return false;
  for (let i = 0; i < NUM_FILTERS; i++) {
    if (Number(a.frequencies[i]) !== Number(b.frequencies[i])) return false;
    if (Number(a.gains[i]) !== Number(b.gains[i])) return false;
    if (Number(a.qs[i]) !== Number(b.qs[i])) return false;
  }
  return true;
}

async function refreshPresets() {
  try {
    const all = await chrome.storage.sync.get(null);
    const presets = {};
    const heal = {};
    for (const k in all) {
      if (!k.startsWith(PRESET_PREFIX)) continue;
      const name = k.slice(PRESET_PREFIX.length);
      if (UNSAFE_KEYS.includes(name)) continue; // never let "__proto__" etc. become a key
      const raw = all[k];
      const clean = coerceBands(raw); // clamped 11-band bands, or null if garbage
      if (clean) {
        presets[name] = clean;
        // If the stored copy had out-of-range/legacy values, rewrite it clean so
        // export and future reads are healthy too (one-time self-heal).
        if (!presetBandsEqual(clean, raw)) heal[k] = clean;
      } else {
        // Un-coercible garbage: keep whatever was there so we never silently drop
        // a user's preset, but it won't be usable until re-saved.
        presets[name] = raw;
      }
    }
    if (Object.keys(heal).length) {
      try {
        await chrome.storage.sync.set(heal);
        dlog('healed legacy presets', Object.keys(heal).length);
      } catch (e) {
        dlog('preset heal write failed', e);
      }
    }
    if (lastStatus) lastStatus.presets = presets;
    renderPresets(presets);
    return presets;
  } catch (e) {
    dlog('refreshPresets failed', e);
    return {};
  }
}

async function importPresetsFromFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    showNotice('Import failed: not a valid JSON file.');
    return;
  }
  const presets = normalizePresets(parsed);
  const names = Object.keys(presets);
  if (names.length === 0) {
    showNotice('No compatible presets found in that file.');
    return;
  }
  const toSet = {};
  for (const name of names) toSet[PRESET_PREFIX + name] = presets[name];
  try {
    await chrome.storage.sync.set(toSet);
  } catch (e) {
    showNotice('Import failed while saving (storage full?).');
    return;
  }
  await refreshPresets();
  toOffscreen('getStatus'); // let the engine pick them up too, if it's alive
  showNotice('Imported ' + names.length + ' preset' + (names.length > 1 ? 's' : '') + '.');
}

// --- Presets applied POPUP-SIDE (storage + local redraw + engine notify) so they
// work even when the audio engine is asleep or reloading. ---

// Push a full set of filter values: update the graph, persist to storage.local,
// and tell the engine (best-effort). masterGain optional.
function applyFilterValues(freqs, gains, qs, masterGain, activePreset) {
  const eqFilters = [];
  for (let i = 0; i < NUM_FILTERS; i++) {
    const f = Number(freqs[i]);
    const g = Number(gains[i]);
    const q = Number(qs[i]);
    // Clamp to the visible/legal ranges so imported presets can't push dots
    // off-canvas or out of reach.
    const fs = clampFreq(Number.isFinite(f) ? f : DEFAULT_FREQUENCIES[i]);
    const gs = clampGainDb(Number.isFinite(g) ? g : 0);
    const qq = clampQ(Number.isFinite(q) ? q : DEFAULT_Q);
    eqFilters.push({ frequency: fs, gain: gs, q: qq, type: filterType(i) });
  }
  let gain = lastStatus && lastStatus.gain != null ? lastStatus.gain : 1;
  if (masterGain != null) {
    gain = clampMasterGain(masterGain);
  }
  persistEqState(eqFilters, gain, activePreset || '');
  toOffscreen('applySettings', { eqFilters, gain, activePreset: activePreset || '' });
  lastStatus = Object.assign({}, lastStatus, { type: 'workspaceStatus', eqFilters, gain, sampleRate, activePreset: activePreset || '' });
  renderWorkspace(lastStatus);
}

// Update ONE band popup-side (persist + notify engine + redraw).
function setBandLocal(index, frequency, gain, q) {
  if (!currentModels[index]) return;
  const f = clampFreq(frequency);
  const g = clampGainDb(gain);
  const qq = clampQ(q);
  const eqFilters = currentModels.map((m, i) =>
    i === index ? { frequency: f, gain: g, q: qq, type: m.type } : { frequency: m.frequency, gain: m.gain, q: m.q, type: m.type }
  );
  const masterGain = lastStatus && lastStatus.gain != null ? lastStatus.gain : 1;
  persistEqState(eqFilters, masterGain, '');
  toOffscreen('modifyFilter', { index, frequency: f, gain: g, q: qq, activePreset: '' });
  lastStatus = Object.assign({}, lastStatus, { type: 'workspaceStatus', eqFilters, activePreset: '' });
  renderWorkspace(lastStatus);
}

// Double-click a dot → flatten that band (freq/Q to default, gain 0).
function resetBandLocal(index) {
  setBandLocal(index, DEFAULT_FREQUENCIES[index], 0, DEFAULT_Q);
}

async function applyPresetByName(name) {
  let presets = (lastStatus && lastStatus.presets) || {};
  if (!presets[name]) presets = await refreshPresets();
  const p = presets[name];
  if (p) applyFilterValues(p.frequencies, p.gains, p.qs, null, name);
  else showNotice('Preset "' + name + '" not found.');
}

function resetFiltersLocal() {
  applyFilterValues(DEFAULT_FREQUENCIES, Array(NUM_FILTERS).fill(0), Array(NUM_FILTERS).fill(DEFAULT_Q), 1, '');
  toOffscreen('resetFilters'); // also reset engine analyzer state
}

async function savePresetLocal(name) {
  const preset = {
    frequencies: currentModels.map((m) => m.frequency),
    gains: currentModels.map((m) => m.gain),
    qs: currentModels.map((m) => m.q)
  };
  try {
    await chrome.storage.sync.set({ [PRESET_PREFIX + name]: preset });
  } catch (e) {
    showNotice('Save failed (sync storage unavailable).');
    return;
  }
  // The just-saved preset matches the current curve, so mark it active. This
  // keeps the Save↔Update label and the restored state consistent after a
  // browser restart (saved-then-restarted shows the same preset as active).
  persistCurrentEqState(name);
  toOffscreen('setActivePreset', { activePreset: name });
  if (lastStatus) lastStatus.activePreset = name;
  await refreshPresets();
  showNotice('Saved preset "' + name + '".');
}

async function deletePresetLocal(name) {
  try {
    await chrome.storage.sync.remove(PRESET_PREFIX + name);
  } catch (e) {}
  // If we just deleted the preset that was marked active, clear the active tag
  // (the curve stays as-is, but it's no longer "the X preset").
  if (lastStatus && lastStatus.activePreset === name) {
    lastStatus.activePreset = '';
    persistCurrentEqState('');
    toOffscreen('setActivePreset', { activePreset: '' });
  }
  await refreshPresets();
  showNotice('Deleted "' + name + '".');
}

function updateEqButton(streamTabs) {
  const btn = document.getElementById('eqTabButton');
  const active = currentTabId != null && streamTabs.some((t) => t.id === currentTabId);
  const label = btn.querySelector('.btn-label');
  if (label) label.textContent = active ? 'Stop EQing' : 'EQ This Tab';
  btn.classList.toggle('active', active);
  btn.onclick = () => toBackground('toggleCapture', { on: !active });
}

// ---------------------------------------------------------------------------
// Spectrum visualizer

const vizEnabled = () => localStorage[VIZ_KEY] === '1';

function drawViz(fft) {
  if (vizLastFrame) {
    const wait = VIZ_FRAME_MS - (performance.now() - vizLastFrame);
    if (wait > 0) {
      setTimeout(vizLoop, wait);
      return;
    }
  }
  vizLastFrame = performance.now();

  if (vizPolyline) {
    vizPolyline.remove();
    vizPolyline = null;
  }
  if (!vizEnabled()) return;
  if (!eqSnap) {
    // EQ surface not built yet (first workspaceStatus hasn't arrived).
    // Keep the loop alive instead of letting it die here.
    setTimeout(vizLoop, 200);
    return;
  }

  if (fft && fft.length > 0) {
    // Resample the FFT per x-pixel (the axis is logarithmic, the bins are linear):
    // for every 2px column, peak-hold the bins whose frequency falls in it. This
    // fills the whole width edge-to-edge (no left gap, no corner diagonal) and stays
    // smooth. Sub-audible x columns just read ~silence, so they sit on the baseline.
    const cols = [];
    for (let x = 0; x <= EQ_W; x += 2) {
      const fLo = xToFreq(Math.max(0, x - 1));
      const fHi = xToFreq(x + 1);
      let b0 = Math.max(0, Math.min(fft.length - 1, Math.floor((fLo * fft.length * 2) / sampleRate)));
      let b1 = Math.max(0, Math.min(fft.length - 1, Math.ceil((fHi * fft.length * 2) / sampleRate)));
      let db = -100;
      for (let b = b0; b <= b1; b++) if (fft[b] > db) db = fft[b];
      // Bottom ghost only: cap at ~half the graph so it never hides the EQ curve/dots.
      const h = Math.max(0, Math.min(EQ_H * 0.5, ((db + 100) / 100) * (EQ_H * 0.5)));
      cols.push([x, h]);
    }

    // Filled area: close along the baseline so it reads as a cool energy ghost.
    const points = [];
    for (const [x, h] of cols) points.push(x, EQ_H - 1 - h);
    if (points.length >= 4) {
      const lastX = points[points.length - 2];
      const firstX = points[0];
      points.push(lastX, EQ_H, firstX, EQ_H);
    }

    const gradient = eqSnap.gradient('l(0.5,0,0.5,1)' + COLOR_VIZ + '-' + COLOR_BG);
    vizPolyline = eqSnap
      .polyline(points)
      .attr({ fill: gradient, 'fill-opacity': 0.14, stroke: COLOR_VIZ, 'stroke-opacity': 0.35, 'pointer-events': 'none' });

    // Keep the ghost BEHIND the hero curve (fill/glow/stroke).
    if (combinedEls && combinedEls.fill) vizPolyline.insertBefore(combinedEls.fill);
  }

  vizLoop();
}

function vizLoop() {
  if (!vizEnabled()) return;
  toOffscreen('getFFT', {}, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      setTimeout(vizLoop, 250); // offscreen busy or not ready yet
      return;
    }
    drawViz(resp.fft);
  });
}

// ---------------------------------------------------------------------------
// Notices

let noticeTimer = null;
function showNotice(text) {
  const div = document.getElementById('noticeDiv');
  div.textContent = text;
  div.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => div.classList.remove('show'), 5000);
}

// ---------------------------------------------------------------------------
// Screen overlays (Guide / Active Tabs) + the Presets drawer

function closeOverlays() {
  ['guideDiv', 'tabsDiv'].forEach((id) => document.getElementById(id) && document.getElementById(id).classList.remove('open'));
  ['guideToggle', 'tabsToggle'].forEach((id) => document.getElementById(id) && document.getElementById(id).classList.remove('active'));
}

function wireOverlays() {
  const map = [
    ['guideToggle', 'guideDiv'],
    ['tabsToggle', 'tabsDiv']
  ];
  for (const [tid, oid] of map) {
    const t = document.getElementById(tid);
    const o = document.getElementById(oid);
    if (!t || !o) continue;
    t.onclick = () => {
      const isOpen = o.classList.contains('open');
      closeOverlays();
      if (!isOpen) {
        o.classList.add('open');
        t.classList.add('active');
      }
    };
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeOverlays();
      closeDrawer();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.screen-overlay') || e.target.closest('#guideToggle') || e.target.closest('#tabsToggle')) return;
    closeOverlays();
  });
}

function openDrawer() {
  const d = document.getElementById('presetDrawer');
  const h = document.getElementById('presetDrawerHandle');
  if (d) d.classList.add('open');
  if (h) {
    h.classList.add('open');
    h.setAttribute('aria-expanded', 'true');
  }
}
function closeDrawer() {
  const d = document.getElementById('presetDrawer');
  const h = document.getElementById('presetDrawerHandle');
  if (d) d.classList.remove('open');
  if (h) {
    h.classList.remove('open');
    h.setAttribute('aria-expanded', 'false');
  }
}
function toggleDrawer() {
  const d = document.getElementById('presetDrawer');
  d && d.classList.contains('open') ? closeDrawer() : openDrawer();
}

function wirePresetDrawer() {
  const handle = document.getElementById('presetDrawerHandle');
  if (!handle) return;
  let startY = null;
  let dragHandled = false;
  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    dragHandled = false;
  });
  handle.addEventListener('pointermove', (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    const open = document.getElementById('presetDrawer').classList.contains('open');
    if (dy > 14 && !open) {
      openDrawer();
      dragHandled = true;
      startY = null;
    } else if (dy < -14 && open) {
      closeDrawer();
      dragHandled = true;
      startY = null;
    }
  });
  const clear = () => (startY = null);
  handle.addEventListener('pointerup', clear);
  handle.addEventListener('pointercancel', clear);
  handle.onclick = () => {
    if (dragHandled) {
      dragHandled = false;
      return;
    }
    toggleDrawer();
  };
  // Outside-click closes the drawer.
  document.addEventListener('click', (e) => {
    if (e.target.closest('#presetDrawer') || e.target.closest('#presetDrawerHandle')) return;
    closeDrawer();
  });
}

// ---------------------------------------------------------------------------
// Wiring

function wireControls() {
  const nameInput = document.getElementById('presetNameInput');

  // Default handler so the button works before the first workspaceStatus lands.
  // updateEqButton() later replaces this with an identical, status-aware handler.
  document.getElementById('eqTabButton').onclick = () => {
    const streams = (lastStatus && lastStatus.streams) || [];
    const active = currentTabId != null && streams.some((t) => t.id === currentTabId);
    toBackground('toggleCapture', { on: !active });
  };

  document.getElementById('resetFiltersButton').onclick = () => {
    nameInput.value = '';
    resetFiltersLocal();
  };

  document.getElementById('savePresetButton').onclick = () => {
    const name = nameInput.value.trim();
    if (!name) {
      showNotice('Type a name in the box, then Save or press Enter.');
      nameInput.focus();
      return;
    }
    savePresetLocal(name);
  };

  document.getElementById('deletePresetButton').onclick = () => {
    const name = nameInput.value.trim();
    if (name) deletePresetLocal(name);
  };

  nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('savePresetButton').click();
      e.preventDefault();
    }
  });

  document.getElementById('exportPresetsButton').onclick = () => {
    const presets = (lastStatus && lastStatus.presets) || {};
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'umbra-presets.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fileInput = document.getElementById('importPresetsFile');
  document.getElementById('importPresetsButton').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    for (const file of fileInput.files) {
      const reader = new FileReader();
      reader.onload = (e) => importPresetsFromFile(e.target.result);
      reader.readAsText(file);
    }
    fileInput.value = '';
  };

  const vizButton = document.getElementById('vizButton');
  const paintVizButton = () => vizButton.classList.toggle('on', vizEnabled());
  paintVizButton();
  vizButton.onclick = () => {
    localStorage[VIZ_KEY] = vizEnabled() ? '' : '1';
    paintVizButton();
    if (vizEnabled()) {
      vizLoop();
    } else if (vizPolyline) {
      // Clear the last-drawn spectrum immediately instead of leaving it frozen.
      vizPolyline.remove();
      vizPolyline = null;
    }
  };

  // Contextual Save label: "Update "name"" when the typed name already exists.
  nameInput.addEventListener('input', () => {
    const name = nameInput.value.trim();
    const presets = (lastStatus && lastStatus.presets) || {};
    const save = document.getElementById('savePresetButton');
    if (save) save.textContent = name && presets[name] ? 'Update "' + name + '"' : '+ Save';
  });

  wireOverlays();
  wirePresetDrawer();


  // Diagnostics button (dev only)
  const diagBtn = document.getElementById('diagBtn');
  const diagWrap = document.getElementById('diagWrap');
  if (diagBtn) {
    if (!DEBUG) {
      if (diagWrap) diagWrap.remove();
      else diagBtn.remove();
    } else {
      if (diagWrap) diagWrap.hidden = false;
      diagBtn.onclick = copyDiagnostics;
    }
  }

  // Theme switcher — custom dropdown (a native <select>'s open list can't be themed)
  const themeTrigger = document.getElementById('themeTrigger');
  const themeMenu = document.getElementById('themeMenu');
  const themeCurrent = document.getElementById('themeCurrent');
  if (themeTrigger && themeMenu && themeCurrent) {
    const themeLabel = (v) => v.charAt(0).toUpperCase() + v.slice(1);
    const initTheme = VALID_THEMES.includes(localStorage[THEME_KEY]) ? localStorage[THEME_KEY] : DEFAULT_THEME;
    const markTheme = (v) => {
      themeCurrent.textContent = themeLabel(v);
      themeMenu.querySelectorAll('[role="option"]').forEach((o) =>
        o.setAttribute('aria-selected', o.dataset.theme === v ? 'true' : 'false')
      );
    };
    markTheme(initTheme);
    const closeTheme = () => {
      themeMenu.classList.remove('open');
      themeTrigger.setAttribute('aria-expanded', 'false');
    };
    themeTrigger.onclick = (e) => {
      e.stopPropagation();
      const open = themeMenu.classList.toggle('open');
      themeTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    themeMenu.querySelectorAll('[role="option"]').forEach((o) => {
      o.onclick = () => {
        markTheme(o.dataset.theme);
        applyTheme(o.dataset.theme);
        closeTheme();
      };
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#themeMenu, #themeTrigger')) closeTheme();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeTheme();
    });
  }

  // Fullscreen link: only useful inside the small popup
  const fsLink = document.getElementById('fullscreen-link');
  fsLink.href = chrome.runtime.getURL('popup.html');
  if (window.innerWidth > 1000) fsLink.style.display = 'none';
}

// Draw the EQ immediately from saved settings (or defaults), so the graph and
// draggable handles ALWAYS appear — even if the audio engine is slow or fails.
// The engine's real status (with live stream count) overrides this when it lands.
async function renderFromStorage() {
  const keys = ['GAIN', EQ_STATE_KEY, ACTIVE_PRESET_KEY];
  for (let i = 0; i < NUM_FILTERS; i++) keys.push('filter' + i);

  let stored = {};
  try {
    stored = await chrome.storage.local.get(keys);
  } catch (e) {
    dlog('storage.local.get failed', e);
  }

  const presets = {};
  try {
    const all = await chrome.storage.sync.get(null);
    for (const k in all) {
      if (!k.startsWith('PRESETS.')) continue;
      const name = k.slice(8);
      if (UNSAFE_KEYS.includes(name)) continue;
      presets[name] = all[k];
    }
  } catch (e) {
    dlog('storage.sync.get failed', e);
  }

  const eqFilters = eqStateFiltersFromStorage(stored);
  const gain = eqStateGainFromStorage(stored);
  const activePreset = activePresetFromStorage(stored, presets);
  pendingRestore = { eqFilters, gain, activePreset }; // force this onto the engine's first status

  lastStatus = { type: 'workspaceStatus', sampleRate, gain, eqFilters, streams: [], presets, activePreset };
  renderWorkspace(lastStatus);
  renderPresets(presets); // presets are popup-owned, rendered here (not from engine status)
  if (activePreset) {
    const nameInput = document.getElementById('presetNameInput');
    const save = document.getElementById('savePresetButton');
    if (nameInput) nameInput.value = activePreset;
    if (save) save.textContent = 'Update "' + activePreset + '"';
  }
  dlog('drew EQ from storage (engine not required)');
}

// ---------------------------------------------------------------------------
// Boot

// Auto-capture the active tab on popup open. The tab appears in Active Tabs and the
// button becomes "Stop EQing". (Chrome forbids capturing tab audio with zero
// interaction; opening the popup is the interaction that authorizes it.)
function maybeAutoCapture() {
  if (autoTried) return;
  if (currentTabId == null || !gotFirstStatus) return;
  autoTried = true;
  const streaming = (lastStatus && (lastStatus.streams || []).some((t) => t.id === currentTabId)) || false;
  if (streaming) return; // already EQ'd — don't re-capture
  dlog('auto-capturing active tab', currentTabId);
  toBackground('toggleCapture', { on: true });
}

function handleStatus(message) {
  // Stale engine: the offscreen/SW are running an older build than this popup.
  // Almost always means the extension files changed but the extension wasn't
  // reloaded (only the popup re-reads files on open).
  if (message.build && message.build !== BUILD) {
    dbg.engine = 'STALE — reload extension';
    dbg.err = 'engine build ' + message.build + ' ≠ popup ' + BUILD;
    renderDebug();
    dlog('stale build', message.build, 'vs', BUILD);
    return;
  }
  // Engine still initializing (no graph yet): note it, keep the storage render.
  if (message.initializing || !message.eqFilters || message.eqFilters.length === 0) {
    dbg.engine = 'initializing…';
    renderDebug();
    return;
  }
  gotFirstStatus = true;
  // Presets are popup-owned (see renderWorkspace note). The engine's status can
  // carry an EMPTY or stale preset set while the service worker / offscreen is
  // (re)starting — adopting it blindly wipes the in-memory list and breaks
  // Export / the Save↔Update label / applyPresetByName's cache. Keep whatever
  // presets we already trust, and only take the engine's set when it actually
  // has entries.
  // First real status after boot: the engine may report a fresh/flat curve before it
  // has loaded the persisted one. Force it to what we restored from storage (and keep
  // rendering that), so a browser restart never resets the EQ to flat.
  if (pendingRestore) {
    const r = pendingRestore;
    pendingRestore = null;
    toOffscreen('applySettings', { eqFilters: r.eqFilters, gain: r.gain, activePreset: r.activePreset || '' });
    message = Object.assign({}, message, { eqFilters: r.eqFilters, gain: r.gain });
    if (r.activePreset) message.activePreset = r.activePreset;
  }
  const prevPresets = (lastStatus && lastStatus.presets) || {};
  const prevActivePreset = (lastStatus && lastStatus.activePreset) || '';
  const incomingPresets = message.presets || {};
  const presets = Object.keys(incomingPresets).length ? incomingPresets : prevPresets;
  lastStatus = message;
  lastStatus.presets = presets;
  lastStatus.activePreset = message.activePreset !== undefined ? message.activePreset || '' : prevActivePreset;
  dbg.engine = 'connected';
  dbg.statusCount++;
  dbg.lastMs = performance.now();
  dbg.streams = (message.streams || []).length;
  dbg.err = '';
  renderDebug();
  renderWorkspace(message);
  // Re-render the preset chips from the trusted set. renderWorkspace deliberately
  // does NOT touch presets, so without this a status update leaves the drawer
  // showing whatever was there before (or empty on the very first status).
  renderPresets(presets);
  maybeAutoCapture();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'workspaceStatus') {
    handleStatus(message);
  } else if (message.type === 'engineError') {
    dbg.engine = 'engine ERROR';
    dbg.err = (message.where ? message.where + ': ' : '') + message.error;
    renderDebug();
    dlog('engineError', message.where, message.error);
  } else if (message.type === 'captureError') {
    showNotice('Could not EQ this tab: ' + message.error);
    dbg.err = 'capture: ' + message.error;
    renderDebug();
  }
});

// Presets live in chrome.storage.sync. Keep the drawer in lock-step with storage
// so a save/delete/import from ANY context (this popup, a full-window instance,
// another browser via sync) is reflected without needing a reopen — and so the
// list can never silently drift from the source of truth.
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const touchedPresets = Object.keys(changes).some((k) => k.startsWith(PRESET_PREFIX));
    if (touchedPresets) refreshPresets();
  });
}

// The loaded manifest version (from the last EXTENSION reload) vs the version the
// files on disk expect. A mismatch = the extension wasn't reloaded, only the popup
// re-read its files — the #1 cause of "engine ERROR / stale" reports.
function checkStale() {
  let loaded = '?';
  try {
    loaded = chrome.runtime.getManifest().version;
  } catch (e) {}
  if (loaded === EXPECTED_VERSION) return false;
  dbg.engine = 'STALE — reload extension';
  dbg.err = 'loaded v' + loaded + ' but files are v' + EXPECTED_VERSION + '. Press ⟳ Reload on the extension card (chrome://extensions).';
  renderDebug();
  const vl = document.getElementById('verLabel');
  if (vl) {
    vl.textContent = 'v' + loaded + ' ⚠ RELOAD → v' + EXPECTED_VERSION;
    vl.style.color = 'var(--red-hi)';
  }
  showNotice('Extension not reloaded — running v' + loaded + '. Press ⟳ Reload in chrome://extensions to get v' + EXPECTED_VERSION + '.');
  dlog('STALE manifest', loaded, 'expected', EXPECTED_VERSION);
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.dataset.theme = VALID_THEMES.includes(localStorage[THEME_KEY]) ? localStorage[THEME_KEY] : DEFAULT_THEME;
  loadTheme(); // read curve colors + glow flag from the active CSS theme
  wireControls();
  // Suppress the right-click menu inside the popup (also hides other extensions'
  // context-menu items like AdBlock); still allow it inside text inputs.
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('input, textarea')) e.preventDefault();
  });
  renderDebug();
  renderFromStorage(); // paint the EQ right away, independent of the engine

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) currentTabId = tabs[0].id;
    if (lastStatus) updateEqButton(lastStatus.streams || []);
    maybeAutoCapture(); // status may have arrived before we knew the tab id
  });

  // Bring up the audio engine, then poll until its first real status lands.
  toBackground('ensureOffscreen', {}, (resp) => {
    const err = chrome.runtime.lastError;
    dlog('ensureOffscreen resp', resp, 'lastError', err && err.message);
    if (err || (resp && resp.ok === false)) {
      dbg.engine = 'offscreen create FAILED';
      dbg.err = (err && err.message) || (resp && resp.error) || 'ensureOffscreen returned not-ok';
      renderDebug();
    } else if (resp && resp.build && resp.build !== BUILD) {
      dbg.engine = 'STALE — reload extension';
      dbg.err = 'service worker build ' + resp.build + ' ≠ popup ' + BUILD;
      renderDebug();
    }
    let attempts = 0;
    const poll = () => {
      if (gotFirstStatus) return;
      if (attempts++ > 20) {
        dbg.engine = 'NOT responding';
        dbg.err = dbg.err || 'no workspaceStatus from offscreen';
        renderDebug();
        dlog('engine never sent a status after', attempts, 'polls');
        return;
      }
      requestStatus();
      setTimeout(poll, 300);
    };
    poll();
  });

  if (vizEnabled()) vizLoop();
});
