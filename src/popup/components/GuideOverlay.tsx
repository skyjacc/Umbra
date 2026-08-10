import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n';
import { DEFAULT_FREQUENCIES } from '@/lib/audio';

/**
 * The guide, as a set of pictures rather than a page of prose.
 *
 * What it replaces was seven paragraphs under seven headings. Nobody reads that inside a 620px
 * popup, and the things 2.5 added — typing a band's numbers, Bypass as a draft mode, Auto Gain,
 * the peak meter, "Based on Vocal" — are all easier to SHOW than to describe. So every section
 * here is one diagram, one heading and at most two short lines, and the diagrams are drawn with
 * the same tokens the equalizer itself uses (--g-peak, --g-shelf, --g-axis, --accent) so the guide
 * looks like something Umbra drew about itself rather than documentation bolted on beside it.
 *
 * THE KEY BINDINGS BELOW WERE READ OUT OF THE CODE, NOT OUT OF THE OLD COMMENT. EqGraph's own
 * header still claims "Shift+Up/Down = Q"; it does not do that. `stepKind` maps Shift to a COARSE
 * step and Alt to a FINE one, and both arrow branches feed gain (up/down) or frequency
 * (left/right). Q has no keyboard binding on a dot at all — it is Shift+drag, or the Q field.
 * Step sizes come from STEPS in lib/band-input.ts.
 */

const G = (v: string) => `var(--g-${v})`;
const ACCENT = 'hsl(var(--accent))';
const DANGER = 'hsl(var(--destructive))';

/** One section: a picture, a heading, and as little text as the thing can be explained in. */
function Panel({ children, title, lines }: { children: ReactNode; title: string; lines: string[] }) {
  return (
    <section className="rounded-xl border border-white/[.09] bg-white/[.035] p-3 [box-shadow:var(--shadow-border)]">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[.13em] text-accent">{title}</h3>
      <div className="mb-2.5 overflow-hidden rounded-lg bg-black/25 p-2.5">{children}</div>
      {lines.map((l, i) => (
        <p key={i} className={'text-pretty leading-snug ' + (i === 0 ? 'text-[12px] text-foreground/85' : 'mt-1 text-[11px] text-muted-foreground')}>
          {l}
        </p>
      ))}
    </section>
  );
}

/** A physical-looking key. Inner shadow rather than a gradient, so it survives every theme. */
function Key({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center justify-center rounded-[6px] border border-white/[.14] bg-white/[.07] text-[10.5px] font-semibold text-foreground/90 ' +
        'shadow-[inset_0_-2px_0_rgba(0,0,0,.4),0_1px_0_rgba(255,255,255,.05)] ' +
        (wide ? 'h-[24px] px-2' : 'size-[24px]')
      }
    >
      {children}
    </span>
  );
}

/** `[ SHIFT ] + [ ↑ ]  — larger step` */
function Combo({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
          <Key wide={k.length > 1}>{k}</Key>
        </span>
      ))}
      <span className="ml-1 text-[10.5px] text-muted-foreground">{label}</span>
    </div>
  );
}

/** The curve, with the dot the user is about to move and the two axes it moves along. */
function GraphArt({ dragLabel, freqLabel, gainLabel }: { dragLabel: string; freqLabel: string; gainLabel: string }) {
  return (
    <svg viewBox="0 0 260 92" className="mx-auto block w-full max-w-[300px]" role="img" aria-label={dragLabel}>
      <line x1="8" y1="46" x2="252" y2="46" stroke={G('axis')} strokeDasharray="2 4" />
      <path d="M8 60 C 60 60, 78 20, 116 20 C 154 20, 172 62, 210 62 L252 62" fill="none" stroke={G('peak')} strokeWidth="2" strokeLinecap="round" />
      {/* the selected dot */}
      <circle cx="116" cy="20" r="12" fill={ACCENT} fillOpacity={0.16} />
      <circle cx="116" cy="20" r="5.5" fill={G('peak')} stroke={G('screen')} strokeWidth="2" />
      {/* gain axis */}
      <g stroke={ACCENT} strokeWidth="1.2">
        <line x1="116" y1="8" x2="116" y2="34" strokeOpacity={0.55} />
        <path d="M116 5 l-3.5 5 h7 z" fill={ACCENT} stroke="none" />
        <path d="M116 37 l-3.5 -5 h7 z" fill={ACCENT} stroke="none" />
      </g>
      <text x="124" y="14" fontSize="8" fill={ACCENT} fillOpacity={0.9}>
        {gainLabel}
      </text>
      {/* frequency axis */}
      <g stroke={ACCENT} strokeWidth="1.2">
        <line x1="86" y1="20" x2="146" y2="20" strokeOpacity={0.35} />
        <path d="M83 20 l5 -3.5 v7 z" fill={ACCENT} stroke="none" />
        <path d="M149 20 l-5 -3.5 v7 z" fill={ACCENT} stroke="none" />
      </g>
      <text x="116" y="46" fontSize="8" fill={ACCENT} fillOpacity={0.9} textAnchor="middle">
        {freqLabel}
      </text>
      <text x="8" y="86" fontSize="7.5" fill={G('text')}>
        20 Hz
      </text>
      <text x="252" y="86" fontSize="7.5" fill={G('text')} textAnchor="end">
        20 kHz
      </text>
    </svg>
  );
}

/** Bypass: the flat line is what you hear, the curve is what you are still shaping. */
function BypassArt({ audible, preview }: { audible: string; preview: string }) {
  return (
    <svg viewBox="0 0 260 78" className="mx-auto block w-full max-w-[300px]" role="img" aria-label={preview}>
      <path d="M8 56 C 60 56, 78 22, 116 22 C 154 22, 172 58, 210 58 L252 58" fill="none" stroke={G('peak')} strokeWidth="1.5" strokeOpacity={0.3} strokeDasharray="3 3" />
      <line x1="8" y1="40" x2="252" y2="40" stroke={G('grab')} strokeOpacity={0.8} strokeWidth="2" />
      <text x="8" y="34" fontSize="8" fill={G('grab')} fillOpacity={0.85}>
        {audible}
      </text>
      <text x="252" y="72" fontSize="8" fill={G('peak')} fillOpacity={0.75} textAnchor="end">
        {preview}
      </text>
      <g>
        <rect x="100" y="4" width="60" height="15" rx="4" fill={DANGER} fillOpacity={0.16} stroke={DANGER} strokeOpacity={0.45} />
        <text x="130" y="14.5" fontSize="8" fontWeight="700" fill={DANGER} textAnchor="middle" letterSpacing="1">
          BYPASS
        </text>
      </g>
    </svg>
  );
}

/** Auto Gain: the boost is the same, the level you end up at is not. */
function AutoGainArt({ off, on, same }: { off: string; on: string; same: string }) {
  // The reference is where the tab sat BEFORE the curve was shaped. With Auto Gain off a boost
  // pushes past it; with it on the same boost lands back on it. Drawing both bars the same length
  // said nothing at all, which is what the first version of this did.
  const REF = 176;
  return (
    <svg viewBox="0 0 260 74" className="mx-auto block w-full max-w-[300px]" role="img" aria-label={same}>
      <line x1={REF} y1="6" x2={REF} y2="56" stroke={ACCENT} strokeOpacity={0.45} strokeDasharray="2 3" />
      <text x={REF + 5} y="66" fontSize="7.5" fill={ACCENT} fillOpacity={0.9}>
        {same}
      </text>

      <text x="8" y="21" fontSize="8" fill={G('text')}>
        {off}
      </text>
      <rect x="46" y="12" width={REF - 46} height="12" rx="3" fill={G('shelf')} fillOpacity={0.35} />
      <rect x="46" y="12" width={214 - 46} height="12" rx="3" fill={G('peak')} fillOpacity={0.85} />

      <text x="8" y="48" fontSize="8" fill={G('text')}>
        {on}
      </text>
      <rect x="46" y="39" width={REF - 46} height="12" rx="3" fill={G('shelf')} fillOpacity={0.35} />
      <rect x="46" y="39" width={REF - 46} height="12" rx="3" fill={G('peak')} fillOpacity={0.85} />
    </svg>
  );
}

/** Spectrum behind the curve, peak meter down the edge. */
function MetersArt({ spectrum, peak }: { spectrum: string; peak: string }) {
  const bars = [10, 26, 18, 34, 46, 30, 22, 38, 26, 16, 24, 12, 18, 9, 13, 7];
  return (
    <svg viewBox="0 0 260 74" className="mx-auto block w-full max-w-[300px]" role="img" aria-label={spectrum}>
      {bars.map((h, i) => (
        <rect key={i} x={10 + i * 12} y={58 - h} width="7" height={h} rx="1.5" fill={G('viz')} fillOpacity={0.75} />
      ))}
      <line x1="6" y1="58" x2="204" y2="58" stroke={G('axis')} />
      <text x="6" y="70" fontSize="8" fill={G('text')}>
        {spectrum}
      </text>
      <rect x="228" y="8" width="6" height="50" rx="3" fill={G('text')} fillOpacity={0.12} />
      <rect x="228" y="26" width="6" height="32" rx="3" fill={G('viz')} fillOpacity={0.9} />
      <rect x="226.5" y="18" width="9" height="2" rx="1" fill={G('grab')} />
      <circle cx="231" cy="6" r="3" fill={DANGER} />
      <text x="252" y="70" fontSize="8" fill={G('text')} textAnchor="end">
        {peak}
      </text>
    </svg>
  );
}

/** Global sound at the root, site rules branching off it. */
function RulesArt({ global, siteA, siteB }: { global: string; siteA: string; siteB: string }) {
  const box = (x: number, y: number, w: number, label: string, accent: boolean) => (
    <g>
      <rect x={x} y={y} width={w} height="20" rx="6" fill={accent ? ACCENT : G('screen')} fillOpacity={accent ? 0.16 : 1} stroke={accent ? ACCENT : G('axis')} strokeOpacity={accent ? 0.5 : 1} />
      <text x={x + w / 2} y={y + 13.5} fontSize="8.5" fill={accent ? ACCENT : G('text')} textAnchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 260 86" className="mx-auto block w-full max-w-[300px]" role="img" aria-label={global}>
      {box(80, 6, 100, global, true)}
      <path d="M130 26 v14 M40 40 h180 M40 40 v14 M220 40 v14" fill="none" stroke={G('axis')} />
      {box(6, 54, 96, siteA, false)}
      {box(158, 54, 96, siteB, false)}
    </svg>
  );
}

/** Reset walks the saved sound back; Undo walks that one step back again. */
function ResetArt({ yours, reset, before, undo }: { yours: string; reset: string; before: string; undo: string }) {
  const chip = (x: number, label: string, accent = false) => (
    <g>
      <rect x={x} y="22" width="76" height="20" rx="6" fill={accent ? ACCENT : G('screen')} fillOpacity={accent ? 0.14 : 1} stroke={accent ? ACCENT : G('axis')} strokeOpacity={accent ? 0.45 : 1} />
      <text x={x + 38} y="35.5" fontSize="8.5" fill={accent ? ACCENT : G('text')} textAnchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 260 66" className="mx-auto block w-full max-w-[300px]" role="img" aria-label={reset}>
      {chip(6, yours)}
      <path d="M88 32 h74" stroke={G('axis')} />
      <path d="M164 32 l-6 -3.5 v7 z" fill={G('axis')} />
      <text x="125" y="27" fontSize="8" fill={DANGER} fillOpacity={0.9} textAnchor="middle">
        {reset}
      </text>
      {chip(176, before, true)}
      <path d="M214 46 q -76 16 -170 0" fill="none" stroke={ACCENT} strokeOpacity={0.6} strokeDasharray="3 3" />
      <path d="M44 46 l7 -3 v6 z" fill={ACCENT} fillOpacity={0.8} />
      <text x="130" y="62" fontSize="8" fill={ACCENT} fillOpacity={0.9} textAnchor="middle">
        {undo}
      </text>
    </svg>
  );
}

/** Popup on the left, the same editor with room on the right. */
function FullWindowArt({ popup, full }: { popup: string; full: string }) {
  return (
    <svg viewBox="0 0 260 74" className="mx-auto block w-full max-w-[300px]" role="img" aria-label={full}>
      <rect x="8" y="10" width="72" height="52" rx="6" fill={G('screen')} stroke={G('axis')} />
      <path d="M16 44 C 30 44, 34 26, 44 26 C 54 26, 58 42, 72 42" fill="none" stroke={G('peak')} strokeWidth="1.4" />
      <text x="44" y="70" fontSize="8" fill={G('text')} textAnchor="middle">
        {popup}
      </text>
      <path d="M92 36 h26" stroke={G('axis')} />
      <path d="M120 36 l-6 -3.5 v7 z" fill={G('axis')} />
      <rect x="130" y="4" width="122" height="58" rx="6" fill={G('screen')} stroke={ACCENT} strokeOpacity={0.4} />
      <path d="M140 46 C 168 46, 176 16, 194 16 C 212 16, 220 44, 244 44" fill="none" stroke={G('peak')} strokeWidth="1.8" />
      <text x="191" y="70" fontSize="8" fill={ACCENT} fillOpacity={0.9} textAnchor="middle">
        {full}
      </text>
    </svg>
  );
}

/** Each captured tab keeps its own chain. */
function TabsArt({ rows }: { rows: string[] }) {
  return (
    <svg viewBox="0 0 260 74" className="mx-auto block w-full max-w-[300px]" role="img" aria-label={rows.join(', ')}>
      {rows.map((r, i) => (
        <g key={r}>
          <rect x="8" y={6 + i * 22} width="244" height="18" rx="5" fill={G('screen')} stroke={G('axis')} />
          <circle cx="22" cy={15 + i * 22} r="3.5" fill={i === 0 ? ACCENT : G('viz')} />
          <text x="34" y={18.5 + i * 22} fontSize="8.5" fill={G('text')}>
            {r}
          </text>
          <path d={`M210 ${18 + i * 22} c 8 0, 10 -8, 18 -8 c 8 0, 10 8, 18 8`} fill="none" stroke={G('peak')} strokeOpacity={0.7} strokeWidth="1.3" />
        </g>
      ))}
    </svg>
  );
}

/** Everything inside one machine. */
function PrivacyArt({ device, label }: { device: string; label: string }) {
  return (
    <svg viewBox="0 0 260 74" className="mx-auto block w-full max-w-[300px]" role="img" aria-label={label}>
      <rect x="82" y="8" width="96" height="46" rx="8" fill={G('screen')} stroke={ACCENT} strokeOpacity={0.4} />
      <path d="M120 54 h20 v8 h-20 z" fill={G('axis')} />
      <rect x="108" y="62" width="44" height="4" rx="2" fill={G('axis')} />
      <path d="M96 34 C 112 34, 116 18, 130 18 C 144 18, 148 32, 164 32" fill="none" stroke={G('peak')} strokeWidth="1.6" />
      <text x="130" y="48" fontSize="8" fill={ACCENT} fillOpacity={0.9} textAnchor="middle">
        {device}
      </text>
    </svg>
  );
}

export function GuideOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tr = useT();
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  // Keep onClose in a ref so the focus-trap effect need not depend on it. App passes a fresh inline
  // onClose each render, so listing it in the deps would tear down and re-run the effect on every
  // parent re-render (e.g. a workspaceStatus broadcast or the notice toast clearing), yanking focus
  // out of and back into the dialog.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Modal dialog behaviour: move focus in on open, trap Tab within, restore focus on close.
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement;
    const root = ref.current;
    const focusables = () =>
      Array.from(root?.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])') ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) {
        e.preventDefault();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || !root?.contains(a))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (a === last || !root?.contains(a))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={tr('howto.title')}
      className="fixed inset-0 z-[60] flex select-none flex-col bg-background/95 backdrop-blur-sm"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-[14px] font-bold">{tr('howto.title')}</span>
        <button
          onClick={onClose}
          aria-label={tr('guide.close')}
          className="flex size-8 items-center justify-center rounded-lg border border-border bg-white/[.05] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-2.5">
          <Panel title={tr('howto.graph.h')} lines={[tr('howto.graph.p'), tr('howto.graph.q')]}>
            <GraphArt dragLabel={tr('howto.graph.h')} gainLabel={tr('howto.axis.gain')} freqLabel={tr('howto.axis.freq')} />
          </Panel>

          <Panel title={tr('howto.keys.h')} lines={[tr('howto.keys.p')]}>
            <div className="flex flex-col items-center gap-2 py-1">
              <Key>↑</Key>
              <div className="flex items-center gap-2">
                <Key>←</Key>
                <Key>↓</Key>
                <Key>→</Key>
              </div>
              <div className="mt-1 flex w-full flex-col gap-1.5 border-t border-white/[.07] pt-2">
                {/* Steps read off STEPS in lib/band-input.ts, not invented. */}
                <Combo keys={['Shift', '↑']} label={tr('howto.keys.coarse')} />
                <Combo keys={['Alt', '↑']} label={tr('howto.keys.fine')} />
                <Combo keys={['Shift', 'drag']} label={tr('howto.keys.q')} />
                <Combo keys={['Enter']} label={tr('howto.keys.flat')} />
              </div>
            </div>
          </Panel>

          <Panel title={tr('howto.fields.h')} lines={[tr('howto.fields.p')]}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
                <span className="shrink-0 text-[10px] font-semibold text-foreground/60">{tr('howto.fields.band')}</span>
                {[`${DEFAULT_FREQUENCIES[5]} Hz`, '−4.5 dB', 'Q 0.71'].map((v) => (
                  <span key={v} className="flex-1 rounded-md border border-primary/40 bg-black/30 px-1.5 py-1 text-right text-foreground/90">
                    {v}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-white/[.07] pt-2">
                <Combo keys={['Tab']} label={tr('howto.fields.tab')} />
                <Combo keys={['Enter']} label={tr('howto.fields.enter')} />
                <Combo keys={['Esc']} label={tr('howto.fields.esc')} />
              </div>
            </div>
          </Panel>

          <Panel title={tr('howto.presets.h')} lines={[tr('howto.presets.p')]}>
            <div className="flex items-center justify-center gap-2 py-1 text-[10.5px]">
              <span className="rounded-full border border-accent/40 bg-accent/[.12] px-2.5 py-1 font-semibold text-foreground">Vocal</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-muted-foreground">{tr('howto.presets.drag')}</span>
              <span className="text-muted-foreground">→</span>
              <span className="rounded-full border border-border bg-white/[.05] px-2.5 py-1 text-muted-foreground">
                {tr('eq.presetBasedOn', { name: 'Vocal' })}
              </span>
            </div>
          </Panel>

          <Panel title={tr('howto.bypass.h')} lines={[tr('howto.bypass.p'), tr('howto.bypass.q')]}>
            <BypassArt audible={tr('howto.bypass.audible')} preview={tr('howto.bypass.preview')} />
          </Panel>

          <Panel title={tr('howto.autogain.h')} lines={[tr('howto.autogain.p'), tr('howto.autogain.q')]}>
            <AutoGainArt off={tr('howto.autogain.off')} on={tr('howto.autogain.on')} same={tr('howto.autogain.same')} />
          </Panel>

          <Panel title={tr('howto.meters.h')} lines={[tr('howto.meters.p'), tr('howto.meters.q')]}>
            <MetersArt spectrum={tr('howto.meters.spectrum')} peak={tr('howto.meters.peak')} />
          </Panel>

          <Panel title={tr('howto.reset.h')} lines={[tr('howto.reset.p'), tr('howto.reset.q')]}>
            <ResetArt yours={tr('howto.reset.yours')} reset={tr('howto.reset.action')} before={tr('howto.reset.before')} undo={tr('howto.reset.undo')} />
          </Panel>

          <Panel title={tr('howto.rules.h')} lines={[tr('howto.rules.p'), tr('howto.rules.q')]}>
            <RulesArt global={tr('howto.rules.global')} siteA="youtube.com" siteB="open.spotify.com" />
          </Panel>

          <Panel title={tr('howto.fullwindow.h')} lines={[tr('howto.fullwindow.p')]}>
            <FullWindowArt popup={tr('howto.fullwindow.popup')} full={tr('howto.fullwindow.full')} />
          </Panel>

          <Panel title={tr('howto.tabs.h')} lines={[tr('howto.tabs.p')]}>
            <TabsArt rows={['youtube.com', 'open.spotify.com', 'netflix.com']} />
          </Panel>

          <Panel title={tr('howto.privacy.h')} lines={[tr('howto.privacy.p'), tr('howto.privacy.q')]}>
            <PrivacyArt device={tr('howto.privacy.device')} label={tr('howto.privacy.h')} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
