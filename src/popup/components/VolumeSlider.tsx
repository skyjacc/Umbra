import { useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { MASTER_DB_MAX, DB_BOTTOM, masterGainToDb, dbToMasterGain, clampMasterGain, gainDbText } from '@/lib/audio';

// Horizontal glass master-volume slider (frosted pill: icon · dB · track · knob).
export function VolumeSlider({
  gain,
  onGain,
  onCommit
}: {
  gain: number;
  onGain: (g: number) => void;
  onCommit: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const db = masterGainToDb(clampMasterGain(gain));
  const frac = Math.max(0, Math.min(1, (db - DB_BOTTOM) / (MASTER_DB_MAX - DB_BOTTOM)));
  const pct = (frac * 100).toFixed(2) + '%';

  const setFromX = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onGain(dbToMasterGain(DB_BOTTOM + f * (MASTER_DB_MAX - DB_BOTTOM)));
  };
  const down = (e: React.PointerEvent) => {
    dragging.current = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    setFromX(e.clientX);
  };
  const move = (e: React.PointerEvent) => {
    if (dragging.current) setFromX(e.clientX);
  };
  const up = () => {
    if (dragging.current) {
      dragging.current = false;
      onCommit();
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/12 bg-white/[.06] px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur-md">
      {frac <= 0.01 ? (
        <VolumeX className="size-5 shrink-0 text-muted-foreground" />
      ) : (
        <Volume2 className="size-5 shrink-0 text-accent" />
      )}
      <span className="shrink-0 font-mono text-[15px] font-semibold tabular-nums text-foreground">
        {gainDbText(gain)}
        <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">dB</span>
      </span>
      <div
        ref={trackRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative h-2.5 flex-1 cursor-pointer touch-none rounded-full bg-black/30"
        role="slider"
        aria-label="Master volume"
        aria-valuetext={gainDbText(gain) + ' dB'}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/50 to-accent" style={{ width: pct }} />
        <div
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-2 ring-white/25"
          style={{ left: pct }}
        />
      </div>
    </div>
  );
}
