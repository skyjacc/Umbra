import { useRef } from 'react';
import NumberFlow from '@number-flow/react';
import { EQ_H, MASTER_DB_MAX, MASTER_DB_MIN, masterGainToDb, dbToMasterGain, clampMasterGain, gainDbText } from '@/lib/audio';

const RANGE = MASTER_DB_MAX - MASTER_DB_MIN;
const FRAC0 = (0 - MASTER_DB_MIN) / RANGE; // fraction (from bottom) of the 0 dB line

// Thin vertical master-volume fader (Ears-style): fixed width (no reflow jitter),
// a visible 0 dB tick, and a detent that snaps to exactly 0. Value in dB.
export function VerticalVolume({
  gain,
  onGain,
  onCommit
}: {
  gain: number;
  onGain: (g: number) => void;
  onCommit: () => void;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const db = masterGainToDb(clampMasterGain(gain));
  const frac = Math.max(0, Math.min(1, (db - MASTER_DB_MIN) / RANGE));
  const topPct = ((1 - frac) * 100).toFixed(2) + '%';
  const fillPct = (frac * 100).toFixed(2) + '%';
  const zeroTop = ((1 - FRAC0) * 100).toFixed(2) + '%';

  const setFromY = (clientY: number) => {
    const r = colRef.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    let d = MASTER_DB_MIN + f * RANGE;
    if (Math.abs(d) < 0.9) d = 0; // detent — easy to land on unity
    onGain(dbToMasterGain(d));
  };
  const down = (e: React.PointerEvent) => {
    dragging.current = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    setFromY(e.clientY);
  };
  const move = (e: React.PointerEvent) => {
    if (dragging.current) setFromY(e.clientY);
  };
  const up = () => {
    if (dragging.current) {
      dragging.current = false;
      onCommit();
    }
  };

  return (
    <div className="flex w-10 shrink-0 select-none flex-col items-center gap-1" style={{ height: EQ_H }}>
      <span className="flex w-full items-baseline justify-center font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
        <NumberFlow value={Math.round(db)} format={{ signDisplay: 'exceptZero' }} />
      </span>
      <div
        ref={colRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative flex w-full flex-1 cursor-ns-resize touch-none justify-center"
        role="slider"
        aria-label="Master volume"
        aria-valuetext={gainDbText(gain) + ' dB'}
      >
        {/* 0 dB marker */}
        <div className="pointer-events-none absolute left-0.5 h-px w-3 bg-white/25" style={{ top: zeroTop }} />
        <span className="pointer-events-none absolute right-0.5 -translate-y-1/2 text-[8px] leading-none text-muted-foreground/70" style={{ top: zeroTop }}>
          0
        </span>
        {/* track */}
        <div className="relative h-full w-1.5 rounded-full bg-black/35 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
          <div className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-primary/40 to-accent" style={{ height: fillPct }} />
          <div
            className="absolute left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-white/25"
            style={{ top: topPct }}
          />
        </div>
      </div>
      <span className="text-[8px] tracking-[0.18em] text-muted-foreground/60">VOL</span>
    </div>
  );
}
