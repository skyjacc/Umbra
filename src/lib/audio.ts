// Pure audio/graph math — ported verbatim from the vanilla popup.js so the React
// graph reuses the exact, test-covered logic (no behavior change). No DOM here.

export const EQ_W = 524;
export const EQ_H = 252;
export const GAIN_W = 34;

export const DB_TOP = 30;
export const DB_BOTTOM = -30;
export const VIEW_DB_TOP = 60;
export const VIEW_DB_BOTTOM = -60;
export const MASTER_DB_MAX = 10; // master volume ceiling (10*log10(gain) scale)
export const MASTER_DB_MIN = -25; // master volume floor — matches the engine's 0.00316 linear clamp
export const AXIS_MAX_FREQ = 22050;

export const NUM_FILTERS = 11;
export const DEFAULT_FREQUENCIES = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
export const DEFAULT_Q = 0.7071;

export type FilterKind = 'lowshelf' | 'peaking' | 'highshelf';
export interface Band {
  frequency: number;
  gain: number;
  q: number;
  type: FilterKind;
}

export const filterType = (i: number): FilterKind =>
  i === 0 ? 'lowshelf' : i === NUM_FILTERS - 1 ? 'highshelf' : 'peaking';

// ---------------------------------------------------------------------------
// Coordinate transforms (power-of-4 frequency axis, linear dB axis)

export const xToFreq = (x: number) => Math.pow(x / EQ_W, 4) * AXIS_MAX_FREQ;
export const freqToX = (f: number) => Math.pow(f / AXIS_MAX_FREQ, 1 / 4) * EQ_W;
export const dbToY = (db: number) => EQ_H * (1 - (db - VIEW_DB_BOTTOM) / (VIEW_DB_TOP - VIEW_DB_BOTTOM));
export const yToDb = (y: number) => (1 - y / EQ_H) * (VIEW_DB_TOP - VIEW_DB_BOTTOM) + VIEW_DB_BOTTOM;
export const masterGainToDb = (g: number) => 10 * Math.log10(g);
export const dbToMasterGain = (db: number) => Math.pow(10, db / 10);

export const clampQ = (q: number) => Math.max(0.2, Math.min(11, q));
export const clampGainDb = (g: number) => Math.max(DB_BOTTOM, Math.min(DB_TOP, g));
// Ceiling raised above band 11's default (20480 Hz) so it round-trips; stays below the 44.1 kHz
// Nyquist. Kept in lock-step with clampFrequency in public/offscreen.js.
export const clampFreq = (f: number) => Math.max(5, Math.min(22000, f));
export const clampMasterGain = (g: number) => {
  const n = Number(g);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return dbToMasterGain(Math.max(MASTER_DB_MIN, Math.min(MASTER_DB_MAX, masterGainToDb(n))));
};

// Pixel clamps that neutralize NaN and keep dots inside + grabbable.
export const clampX = (x: number) => (Number.isFinite(x) ? Math.max(6, Math.min(EQ_W - 6, x)) : 6);
export const clampY = (y: number) => (Number.isFinite(y) ? Math.max(6, Math.min(EQ_H - 6, y)) : EQ_H / 2);

// Signed, compact dB readout for the volume strip: 0 / +3 / -2.
export const gainDbText = (g: number): string => {
  const r = Math.round(masterGainToDb(clampMasterGain(g)) * 10) / 10;
  if (r === 0) return '0';
  return (r > 0 ? '+' : '') + (Number.isInteger(r) ? String(r) : r.toFixed(1));
};

// ---------------------------------------------------------------------------
// Biquad magnitude response (same math the Web Audio filters use)

export interface Coeff {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export function biquadCoefficients(type: FilterKind, f0: number, q: number, gainDb: number, sampleRate: number): Coeff {
  const o = Math.tan((Math.PI * f0) / sampleRate);
  const c = Math.pow(10, Math.abs(gainDb) / 20);
  const boost = gainDb >= 0;
  let s: number, b0: number, b1: number, b2: number, a1: number, a2: number;

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

// Magnitude (dB) of one biquad at a given frequency-domain y = sin^2(omega/2).
export function bandDbAtY(c: Coeff, y: number): number {
  const num =
    Math.pow(c.b0 + c.b1 + c.b2, 2) - 4 * (c.b0 * c.b1 + 4 * c.b0 * c.b2 + c.b1 * c.b2) * y + 16 * c.b0 * c.b2 * y * y;
  const den = Math.pow(1 + c.a1 + c.a2, 2) - 4 * (c.a1 + 4 * c.a2 + c.a1 * c.a2) * y + 16 * c.a2 * y * y;
  const db = 10 * Math.log10(num / den);
  return Number.isFinite(db) ? db : 0;
}

// Sampled points [x, pixelY] for a curve. `bands`=all → combined; one band → its own.
export function curvePoints(bands: Band[], sampleRate: number, step = 2): Array<[number, number]> {
  const coeffs = bands.map((m) => biquadCoefficients(m.type, m.frequency, m.q, m.gain, sampleRate));
  const pts: Array<[number, number]> = [];
  for (let gx = 0; gx <= EQ_W; gx += step) {
    const cx = Math.min(gx, EQ_W - 1);
    const freq = xToFreq(cx);
    const omega = (2 * Math.PI * freq) / sampleRate;
    const y = Math.pow(Math.sin(omega / 2), 2);
    let totalDb = 0;
    for (const c of coeffs) totalDb += bandDbAtY(c, y);
    let py = dbToY(totalDb);
    if (!Number.isFinite(py)) py = EQ_H - 1;
    py = Math.max(-EQ_H, Math.min(EQ_H * 2, py));
    pts.push([cx, py]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Sanitize (defensive: legacy imports can carry out-of-range/NaN values)

export function sanitizeFilter(raw: any, index: number): Band {
  const fallback = DEFAULT_FREQUENCIES[index] || DEFAULT_FREQUENCIES[0];
  const f = Number(raw && (raw.frequency ?? raw.f));
  const g = Number(raw && (raw.gain ?? raw.g));
  const q = Number(raw && (raw.q ?? raw.Q));
  return {
    frequency: clampFreq(Number.isFinite(f) ? f : fallback),
    gain: clampGainDb(Number.isFinite(g) ? g : 0),
    q: clampQ(Number.isFinite(q) ? q : DEFAULT_Q),
    type: raw && (raw.type === 'lowshelf' || raw.type === 'peaking' || raw.type === 'highshelf') ? raw.type : filterType(index)
  };
}

export function sanitizeStatus<T extends { eqFilters?: any[]; gain?: any; sampleRate?: number; streams?: any[] }>(
  status: T,
  fallbackSampleRate = 44100
) {
  const safe: any = Object.assign({}, status || {});
  const inFilters = Array.isArray(safe.eqFilters) ? safe.eqFilters : [];
  safe.eqFilters = [];
  for (let i = 0; i < NUM_FILTERS; i++) safe.eqFilters.push(sanitizeFilter(inFilters[i], i));
  safe.gain = clampMasterGain(safe.gain);
  safe.sampleRate = safe.sampleRate || fallbackSampleRate;
  safe.streams = safe.streams || [];
  return safe as { eqFilters: Band[]; gain: number; sampleRate: number; streams: any[] } & T;
}
