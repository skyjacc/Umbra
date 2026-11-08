// Pure audio/graph math, using the Web Audio amplitude-dB and biquad conventions.

export const EQ_W = 524;
export const EQ_H = 252;

export const DB_TOP = 30;
export const DB_BOTTOM = -30;
export const VIEW_DB_TOP = 60;
export const VIEW_DB_BOTTOM = -60;
// Stored gains remain linear: keep the existing 0.003162…10 range and correct only its dB scale.
export const MASTER_DB_MAX = 20;
export const MASTER_DB_MIN = -50;
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
export const masterGainToDb = (g: number) => 20 * Math.log10(g);
export const dbToMasterGain = (db: number) => Math.pow(10, db / 20);

export const clampQ = (q: number) => Math.max(0.2, Math.min(11, q));
export const clampGainDb = (g: number) => Math.max(DB_BOTTOM, Math.min(DB_TOP, g));
// Ceiling raised above band 11's default (20480 Hz) so it round-trips; stays below the 44.1 kHz
// Nyquist. Kept in lock-step with clampFrequency in public/offscreen.js.
export const clampFreq = (f: number) => Math.max(5, Math.min(22000, f));
export const clampMasterGain = (g: number) => {
  const n = Number(g);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(dbToMasterGain(MASTER_DB_MIN), Math.min(dbToMasterGain(MASTER_DB_MAX), n));
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
  // Web Audio / RBJ cookbook coefficients. Shelf slope is fixed at S=1; shelf Q is unused.
  const frequency = Math.max(0, Math.min(sampleRate / 2, f0));
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cs = Math.cos(w0);
  const sn = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  const alpha = sn / (2 * Math.max(0.000001, q));
  const shelf = sn * Math.sqrt(2 * A);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'peaking') {
    b0 = 1 + alpha * A;
    b1 = -2 * cs;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cs;
    a2 = 1 - alpha / A;
  } else if (type === 'lowshelf') {
    b0 = A * ((A + 1) - (A - 1) * cs + shelf);
    b1 = 2 * A * ((A - 1) - (A + 1) * cs);
    b2 = A * ((A + 1) - (A - 1) * cs - shelf);
    a0 = (A + 1) + (A - 1) * cs + shelf;
    a1 = -2 * ((A - 1) + (A + 1) * cs);
    a2 = (A + 1) + (A - 1) * cs - shelf;
  } else {
    b0 = A * ((A + 1) + (A - 1) * cs + shelf);
    b1 = -2 * A * ((A - 1) + (A + 1) * cs);
    b2 = A * ((A + 1) + (A - 1) * cs - shelf);
    a0 = (A + 1) - (A - 1) * cs + shelf;
    a1 = 2 * ((A - 1) - (A + 1) * cs);
    a2 = (A + 1) - (A - 1) * cs - shelf;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
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
