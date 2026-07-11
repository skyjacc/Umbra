import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EQ_W,
  EQ_H,
  DB_TOP,
  DB_BOTTOM,
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
  filterType,
  curvePoints
} from '@/lib/audio';
import { t } from '../i18n';
import * as io from '@/lib/engine-io';

interface Props {
  bands: Band[];
  sampleRate: number;
  spectrumOn?: boolean; // whether the live FFT visualizer is on (EqGraph owns the poll now)
  activeTabId?: number | null; // the tab whose FFT to poll
  showRoles?: boolean; // overlay a zone icon over each dot (a "what does this do" guide)
  onBands: (b: Band[]) => void; // live, during drag
  onCommit: () => void; // drag end — parent persists + sends canonical state
  editable?: boolean; // dots draggable only when the active tab is captured
}

// The rough zone each band sits in (11 fixed bands, low → high), shown as a small text
// label when the band guide is on: bass / mids / treble / air.
const bandZone = (i: number) =>
  i <= 2 ? t('eq.zoneBass') : i <= 6 ? t('eq.zoneMid') : i <= 8 ? t('eq.zoneTreble') : t('eq.zoneAir');

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

export function EqGraph({ bands, sampleRate, spectrumOn = false, activeTabId = null, showRoles = false, onBands, onCommit, editable = true }: Props) {
  const eqRef = useRef<SVGSVGElement>(null);
  const dragIdx = useRef<number | null>(null);
  const liveRef = useRef<Band[] | null>(null); // drag buffer — the frame-current bands (the prop is rAF-coalesced)
  const [hover, setHover] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null); // keyboard focus, separate from mouse hover

  // FFT lives HERE (not in the top-level engine hook) so polling the spectrum at ~60fps re-renders
  // only this component, not the whole popup + every sibling section. Off by default → usually no loop.
  const [fft, setFft] = useState<number[] | null>(null);
  const tabIdRef = useRef(activeTabId);
  tabIdRef.current = activeTabId;
  useEffect(() => {
    if (!spectrumOn) {
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
      io.toOffscreen('getFFT', { tabId: tabIdRef.current }, (resp: any) => {
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
  }, [spectrumOn]);

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

  // Spectrum — resampled per x-column (log axis vs linear FFT bins), peak-held,
  // 3-point smoothed, capped to ~40% height. Rendered as a soft gradient that fades
  // to nothing at the baseline, so it reads as a clean glass "energy" ghost that
  // never fights the axis labels or the curve.
  const spectrum = useMemo(() => {
    if (!fft || !fft.length) return null;
    const cap = EQ_H * 0.55;
    // Ears-style: walk every FFT bin, place it by its own frequency, peak-hold within
    // 2px. Gives a high-resolution jagged line (a thin stroke + a soft fill) instead of
    // a smoothed blob. Non-finite bins (silence -> -Infinity -> JSON null) are skipped.
    const cols: Array<[number, number]> = [];
    for (let i = 1; i < fft.length; i++) {
      const freq = (i * sampleRate) / (fft.length * 2);
      if (freq < 5) continue; // per-bin resolution — no flat band, so start near the axis min
      const x = freqToX(freq);
      if (x > EQ_W) break;
      const v = fft[i];
      if (!Number.isFinite(v)) continue;
      const h = Math.max(0, Math.min(cap, ((v + 100) / 100) * cap));
      const last = cols[cols.length - 1];
      if (last && x - last[0] < 2) {
        if (h > last[1]) last[1] = h;
      } else {
        cols.push([x, h]);
      }
    }
    if (cols.length < 2) return null;
    let maxH = 0;
    for (const c of cols) if (c[1] > maxH) maxH = c[1];
    if (maxH < 2) return null; // near-silence: draw nothing (no flat baseline line)
    const pts = cols.map(([x, h]) => `${x.toFixed(1)} ${(EQ_H - 1 - h).toFixed(1)}`);
    return {
      line: 'M' + pts.join(' L'),
      area: `${cols[0][0].toFixed(1)},${EQ_H} ${cols.map(([x, h]) => `${x.toFixed(1)},${(EQ_H - 1 - h).toFixed(1)}`).join(' ')} ${cols[cols.length - 1][0].toFixed(1)},${EQ_H}`
    };
  }, [fft, sampleRate]);

  // ---- Drag: filter dots ----
  function dotDown(i: number, e: React.PointerEvent) {
    if (!editable) return; // no live capture on the active tab — read-only
    e.preventDefault();
    dragIdx.current = i;
    liveRef.current = bands.slice();
    setHover(i);
    try {
      eqRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  }
  function eqMove(e: React.PointerEvent) {
    const i = dragIdx.current;
    if (i == null) return;
    const src = liveRef.current || bands; // accumulate off the drag buffer — the prop lags by a frame
    const b = src[i];
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
    const nb = src.slice();
    nb[i] = next;
    liveRef.current = nb;
    onBands(nb);
  }
  function eqUp() {
    if (dragIdx.current != null) {
      dragIdx.current = null;
      liveRef.current = null;
      onCommit();
    }
    setHover(null);
  }
  function resetBand(i: number) {
    if (!editable) return;
    const nb = bands.slice();
    nb[i] = { frequency: DEFAULT_FREQUENCIES[i], gain: 0, q: DEFAULT_Q, type: filterType(i) };
    onBands(nb);
    onCommit();
  }
  // Keyboard editing (a11y): Up/Down = gain, Left/Right = frequency (~1/6 octave), Shift+Up/Down =
  // Q, Enter/Delete = reset. Each press is a discrete commit.
  function nudgeBand(i: number, e: React.KeyboardEvent) {
    if (!editable) return;
    const b = bands[i];
    let next: Band | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const s = e.key === 'ArrowUp' ? 1 : -1;
      next = e.shiftKey ? { ...b, q: clampQ(b.q + s * 0.1) } : { ...b, gain: clampGainDb(b.gain + s) };
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      next = { ...b, frequency: clampFreq(b.frequency * Math.pow(2, (e.key === 'ArrowRight' ? 1 : -1) / 6)) };
    } else if (e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      resetBand(i);
      return;
    } else {
      return;
    }
    e.preventDefault();
    const nb = bands.slice();
    nb[i] = next;
    onBands(nb);
    onCommit();
  }

  const zeroY = dbToY(0); // 0 dB baseline for the graph
  const active = hover ?? focusIdx; // mouse hover wins; else the keyboard-focused dot drives the readout

  return (
    <svg
        ref={eqRef}
        width={EQ_W}
        height={EQ_H}
        className="touch-none rounded-lg"
        style={{ background: 'rgba(255,255,255,.012)' }}
        role="group"
        aria-label={t('eq.graphLabel')}
        onPointerMove={eqMove}
        onPointerUp={eqUp}
        onPointerCancel={eqUp}
      >
        <defs>
          <linearGradient id="umbraSpec" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: G('viz'), stopOpacity: 0.4 }} />
            <stop offset="1" style={{ stopColor: G('viz'), stopOpacity: 0 }} />
          </linearGradient>
          <linearGradient id="umbraCurve" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: G('peak') }} />
            <stop offset="1" style={{ stopColor: G('shelf') }} />
          </linearGradient>
          <linearGradient id="umbraFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: G('peak'), stopOpacity: 0.14 }} />
            <stop offset="1" style={{ stopColor: G('peak'), stopOpacity: 0 }} />
          </linearGradient>
        </defs>
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

        {/* spectrum — high-res thin line + soft gradient fill, behind everything */}
        {spectrum && (
          <g pointerEvents="none">
            <polygon points={spectrum.area} fill="url(#umbraSpec)" fillOpacity={0.55} />
            <path d={spectrum.line} fill="none" stroke={G('viz')} strokeWidth={1} strokeOpacity={0.6} strokeLinejoin="round" />
          </g>
        )}

        {/* combined curve — subtle fill first so it sits UNDER the per-band curves and
            never washes them out; the hero stroke sits above the ghosts */}
        <path d={combined} fill="url(#umbraFill)" stroke="none" pointerEvents="none" />

        {/* ghost per-band curves — colored by band type, hover-highlighted so it's
            obvious which dot drives which bell */}
        {ghosts.map((d, i) => {
          const on = active === i;
          const c = bands[i].type === 'peaking' ? G('peak') : G('shelf');
          return (
            <path
              key={'g' + i}
              d={d}
              fill="none"
              stroke={c}
              strokeOpacity={on ? 0.85 : 0.42}
              strokeWidth={on ? 2 : 1.25}
              strokeLinejoin="round"
              strokeDasharray={on ? undefined : '3 3'}
              pointerEvents="none"
            />
          );
        })}

        {/* combined curve — hero stroke (gradient peak->shelf), above the ghosts */}
        <path d={combinedStroke} fill="none" stroke="url(#umbraCurve)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />

        {/* filter dots — a dark knockout ring separates each dot from the curve and
            neighbours; the hovered dot grows + gets a soft accent halo */}
        {dots.map((d, i) => {
          const on = active === i;
          return (
            <g key={'dot' + i}>
              {on && <circle cx={d.x} cy={d.y} r={11} fill={d.color} fillOpacity={0.18} pointerEvents="none" />}
              <circle
                cx={d.x}
                cy={d.y}
                r={on ? 7.5 : 6.5}
                fill={d.color}
                fillOpacity={editable ? 1 : 0.45}
                stroke={G('screen')}
                strokeWidth={2.5}
                className={editable ? 'cursor-grab' : 'cursor-default'}
                tabIndex={editable ? 0 : -1}
                role="slider"
                aria-label={`${bandZone(i)} ${freqLabel(bands[i].frequency)} Hz`}
                aria-valuemin={DB_BOTTOM}
                aria-valuemax={DB_TOP}
                aria-valuenow={Math.round(bands[i].gain)}
                aria-valuetext={`${freqLabel(bands[i].frequency)} Hz, ${bands[i].gain >= 0 ? '+' : ''}${bands[i].gain.toFixed(1)} dB, Q ${bands[i].q.toFixed(2)}`}
                onPointerDown={(e) => dotDown(i, e)}
                onPointerEnter={() => dragIdx.current == null && setHover(i)}
                onPointerLeave={() => dragIdx.current == null && setHover(null)}
                onFocus={() => setFocusIdx(i)}
                onBlur={() => setFocusIdx(null)}
                onKeyDown={(e) => nudgeBand(i, e)}
                onDoubleClick={() => resetBand(i)}
              />
              <circle cx={d.x} cy={d.y} r={2} fill={G('grab')} fillOpacity={0.9} pointerEvents="none" />
            </g>
          );
        })}

        {/* band guide — a per-dot zone label (bass/mids/treble/air) for newcomers, opt-in */}
        {showRoles &&
          dots.map((d, i) => (
            <text
              key={'role' + i}
              x={d.x}
              y={Math.max(10, d.y - 13)}
              textAnchor="middle"
              fontSize={7.5}
              fill={G('text')}
              fillOpacity={0.7}
              pointerEvents="none"
              style={{ letterSpacing: '.02em' }}
            >
              {bandZone(i)}
            </text>
          ))}

        {/* readout tooltip for the hovered / dragged band */}
        {active != null &&
          bands[active] &&
          (() => {
            const b = bands[active];
            const tx = Math.max(60, Math.min(EQ_W - 60, dots[active].x));
            const ty = Math.max(20, dots[active].y - 16);
            const label = `${freqLabel(b.frequency)}  ·  ${b.gain >= 0 ? '+' : ''}${b.gain.toFixed(1)} dB  ·  Q ${b.q.toFixed(2)}`;
            return (
              <g pointerEvents="none">
                <rect x={tx - 59} y={ty - 11} width={118} height={16} rx={5} fill={G('screen')} fillOpacity={0.92} stroke={dots[active].color} strokeOpacity={0.5} />
                <text x={tx} y={ty} textAnchor="middle" fontSize={8.5} fill={G('grab')} dominantBaseline="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {label}
                </text>
              </g>
            );
          })()}
      </svg>
  );
}
