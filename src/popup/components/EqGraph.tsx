import { useMemo, useRef } from 'react';
import {
  EQ_W,
  EQ_H,
  GAIN_W,
  DB_TOP,
  DB_BOTTOM,
  MASTER_DB_MAX,
  AXIS_MAX_FREQ,
  DEFAULT_FREQUENCIES,
  DEFAULT_Q,
  type Band,
  xToFreq,
  freqToX,
  dbToY,
  yToDb,
  clampFreq,
  clampGainDb,
  clampQ,
  clampX,
  clampY,
  clampMasterGain,
  masterGainToDb,
  dbToMasterGain,
  gainDbText,
  filterType,
  curvePoints
} from '@/lib/audio';

interface Props {
  bands: Band[];
  gain: number; // linear master gain
  sampleRate: number;
  onBands: (b: Band[]) => void; // live, during drag
  onGain: (g: number) => void; // live, during drag
  onCommit: () => void; // drag end — parent persists + sends canonical state
}

const G = (v: string) => `var(--g-${v})`;
const openPath = (pts: Array<[number, number]>) =>
  'M' + pts.map(([x, y]) => `${x} ${y}`).join(' L');
const closedPath = (pts: Array<[number, number]>) =>
  openPath(pts) + ` L${EQ_W - 1} ${dbToY(0)} L0 ${dbToY(0)} Z`;

function freqLabel(f: number) {
  if (f >= 1000) {
    const k = f / 1000;
    return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
  }
  return String(Math.round(f));
}

export function EqGraph({ bands, gain, sampleRate, onBands, onGain, onCommit }: Props) {
  const eqRef = useRef<SVGSVGElement>(null);
  const gainRef = useRef<SVGSVGElement>(null);
  const dragIdx = useRef<number | null>(null);
  const gainDrag = useRef(false);

  // Derived geometry (recomputed when the curve or sample rate changes).
  const { combined, combinedStroke, ghosts, dots } = useMemo(() => {
    const pts = curvePoints(bands, sampleRate);
    return {
      combined: closedPath(pts),
      combinedStroke: openPath(pts),
      ghosts: bands.map((b) => openPath(curvePoints([b], sampleRate))),
      dots: bands.map((b) => ({
        x: clampX(freqToX(b.frequency)),
        y: clampY(dbToY(b.gain)),
        color: b.type === 'peaking' ? G('peak') : G('shelf')
      }))
    };
  }, [bands, sampleRate]);

  // Axis ticks (frequency) + dB gridlines.
  const freqTicks = useMemo(() => {
    const t: Array<{ x: number; label: string }> = [];
    for (let f = 5; f < AXIS_MAX_FREQ; f *= 2) t.push({ x: freqToX(f), label: freqLabel(f) });
    return t;
  }, []);
  const dbTicks = useMemo(() => {
    const t: Array<{ y: number; label: string }> = [];
    const range = 60;
    const step = 10;
    for (let db = -range; db <= range; db += step) {
      if (range - Math.abs(db) <= step * 0.5) continue;
      t.push({ y: dbToY(db), label: (db > 0 ? '+' : '') + db });
    }
    return t;
  }, []);

  // ---- Drag: filter dots ----
  function dotDown(i: number, e: React.PointerEvent) {
    e.preventDefault();
    dragIdx.current = i;
    try {
      eqRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  }
  function eqMove(e: React.PointerEvent) {
    const i = dragIdx.current;
    if (i == null) return;
    const b = bands[i];
    let next: Band;
    if (e.shiftKey) {
      next = { ...b, q: clampQ(b.q + e.movementY / 10) };
    } else {
      const rect = eqRef.current!.getBoundingClientRect();
      let lx = e.clientX - rect.left;
      let ly = e.clientY - rect.top;
      lx = Math.max(0, Math.min(EQ_W - 1, lx));
      const topY = dbToY(DB_TOP);
      const botY = dbToY(DB_BOTTOM);
      ly = Math.max(topY, Math.min(botY, ly));
      next = { ...b, frequency: clampFreq(xToFreq(lx)), gain: clampGainDb(yToDb(ly)) };
    }
    const nb = bands.slice();
    nb[i] = next;
    onBands(nb);
  }
  function eqUp() {
    if (dragIdx.current != null) {
      dragIdx.current = null;
      onCommit();
    }
  }
  function resetBand(i: number) {
    const nb = bands.slice();
    nb[i] = { frequency: DEFAULT_FREQUENCIES[i], gain: 0, q: DEFAULT_Q, type: filterType(i) };
    onBands(nb);
    onCommit();
  }

  // ---- Drag: master volume ----
  const zeroY = dbToY(0);
  const gainY = clampY(dbToY(masterGainToDb(clampMasterGain(gain))));
  const topY = dbToY(MASTER_DB_MAX);
  const botY = dbToY(DB_BOTTOM);
  const gx = 3;
  const gw = GAIN_W - 6;

  function gainDown(e: React.PointerEvent) {
    e.preventDefault();
    gainDrag.current = true;
    try {
      gainRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  }
  function gainMove(e: React.PointerEvent) {
    if (!gainDrag.current) return;
    const rect = gainRef.current!.getBoundingClientRect();
    let ly = e.clientY - rect.top;
    ly = Math.max(topY, Math.min(botY, ly));
    onGain(dbToMasterGain(yToDb(ly)));
  }
  function gainUp() {
    if (gainDrag.current) {
      gainDrag.current = false;
      onCommit();
    }
  }

  return (
    <div className="flex justify-center gap-1.5 rounded-2xl border border-border p-3" style={{ background: G('screen') }}>
      {/* master volume strip */}
      <svg
        ref={gainRef}
        width={GAIN_W}
        height={EQ_H}
        className="touch-none rounded-lg"
        style={{ background: 'rgba(0,0,0,.28)' }}
        onPointerMove={gainMove}
        onPointerUp={gainUp}
        onPointerCancel={gainUp}
      >
        <rect x={gx} y={topY} width={gw} height={botY - topY} rx={gw / 2} fill={G('axis')} fillOpacity={0.16} />
        <line x1={gx} y1={zeroY} x2={gx + gw} y2={zeroY} stroke={G('text')} strokeOpacity={0.4} strokeDasharray="1 2" />
        <rect
          x={gx}
          y={Math.min(gainY, zeroY)}
          width={gw}
          height={Math.abs(zeroY - gainY)}
          rx={gw / 2}
          fill={gainY <= zeroY ? G('peak') : G('viz')}
          fillOpacity={gainY <= zeroY ? 0.5 : 0.4}
        />
        <text x={GAIN_W / 2} y={topY - 8} textAnchor="middle" fontSize={9} fill={G('text')} fillOpacity={0.92} style={{ fontFamily: 'ui-monospace, monospace' }}>
          {gainDbText(gain)}
        </text>
        <text x={GAIN_W / 2} y={botY + 14} textAnchor="middle" fontSize={7} fill={G('text')} fillOpacity={0.45} letterSpacing="0.14em">
          VOL
        </text>
        <rect
          x={gx - 1}
          y={gainY - 5}
          width={gw + 2}
          height={10}
          rx={4}
          fill={G('peak')}
          stroke={G('screen')}
          strokeWidth={1.5}
          className="cursor-ns-resize"
          onPointerDown={gainDown}
        />
      </svg>

      {/* EQ curve */}
      <svg
        ref={eqRef}
        width={EQ_W}
        height={EQ_H}
        className="touch-none rounded-lg"
        style={{ background: 'rgba(255,255,255,.012)' }}
        onPointerMove={eqMove}
        onPointerUp={eqUp}
        onPointerCancel={eqUp}
      >
        {/* grid */}
        {freqTicks.map((t, i) => (
          <g key={'f' + i}>
            <line x1={t.x} y1={0} x2={t.x} y2={EQ_H} stroke={G('axis')} strokeOpacity={0.12} />
            <text x={t.x} y={EQ_H - 15} textAnchor="middle" fontSize={9} fill={G('text')} fillOpacity={0.72}>
              {t.label}
            </text>
          </g>
        ))}
        <line x1={0} y1={zeroY} x2={EQ_W} y2={zeroY} stroke={G('text')} strokeOpacity={0.22} strokeDasharray="1 4" />
        {dbTicks.map((t, i) => (
          <text key={'d' + i} x={8} y={t.y} fontSize={9} fill={G('text')} fillOpacity={t.label === '0' ? 0.85 : 0.62} dominantBaseline="middle">
            {t.label}
          </text>
        ))}

        {/* ghost per-band curves */}
        {ghosts.map((d, i) => (
          <path key={'g' + i} d={d} fill="none" stroke={G('viz')} strokeOpacity={0.4} strokeWidth={1} pointerEvents="none" />
        ))}

        {/* combined curve: fill + stroke */}
        <path d={combined} fill={G('peak')} fillOpacity={0.16} stroke="none" pointerEvents="none" />
        <path d={combinedStroke} fill="none" stroke={G('peak')} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />

        {/* filter dots */}
        {dots.map((d, i) => (
          <circle
            key={'dot' + i}
            cx={d.x}
            cy={d.y}
            r={6}
            fill={d.color}
            stroke={G('screen')}
            strokeWidth={1.5}
            className="cursor-grab"
            onPointerDown={(e) => dotDown(i, e)}
            onDoubleClick={() => resetBand(i)}
          />
        ))}
      </svg>
    </div>
  );
}
