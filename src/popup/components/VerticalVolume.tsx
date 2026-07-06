import { useRef } from 'react';
import { MASTER_DB_MAX, DB_BOTTOM, masterGainToDb, dbToMasterGain, clampMasterGain, gainDbText } from '@/lib/audio';

// Thin vertical master-volume fader (Ears-style): dB readout on top, a slim frosted
// track with a level fill and a round thumb, "VOL" caption below. Sits left of the graph.
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
  const frac = Math.max(0, Math.min(1, (db - DB_BOTTOM) / (MASTER_DB_MAX - DB_BOTTOM)));
  const topPct = ((1 - frac) * 100).toFixed(2) + '%';
  const fillPct = (frac * 100).toFixed(2) + '%';

  const setFromY = (clientY: number) => {
    const r = colRef.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    onGain(dbToMasterGain(DB_BOTTOM + f * (MASTER_DB_MAX - DB_BOTTOM)));
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
    <div className="flex select-none flex-col items-center gap-1.5" style={{ height: 220 }}>
      <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">{gainDbText(gain)}</span>
      <div
        ref={colRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative flex w-5 flex-1 cursor-ns-resize touch-none justify-center"
        role="slider"
        aria-label="Master volume"
        aria-valuetext={gainDbText(gain) + ' dB'}
      >
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
