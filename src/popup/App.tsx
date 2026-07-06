import { useEffect, useRef, useState } from 'react';
import { Power, RotateCcw, Download, Upload, Maximize2, TriangleAlert, Trash2, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EqGraph } from './components/EqGraph';
import { VerticalVolume } from './components/VerticalVolume';
import { BottomNav, type ViewId } from './components/BottomNav';
import { useEngine } from './useEngine';
import { hasChrome } from '@/lib/engine-io';

const THEMES = ['eclipse', 'nocturne', 'aurora', 'solar'] as const;

export default function App() {
  const eng = useEngine();
  const [view, setView] = useState<ViewId>('eq');
  const [presetName, setPresetName] = useState('');
  const [theme, setTheme] = useState<string>('eclipse');
  const fileRef = useRef<HTMLInputElement>(null);

  // Theme: restore + apply to <body data-theme>.
  useEffect(() => {
    let t = 'eclipse';
    try {
      const saved = localStorage.THEME;
      if (THEMES.includes(saved)) t = saved;
    } catch {
      /* ignore */
    }
    setTheme(t);
    document.body.dataset.theme = t;
  }, []);
  const applyTheme = (t: string) => {
    setTheme(t);
    document.body.dataset.theme = t;
    try {
      localStorage.THEME = t;
    } catch {
      /* ignore */
    }
  };

  // Applying a preset fills the name box (matches the Save/Update label).
  useEffect(() => setPresetName(eng.activePreset), [eng.activePreset]);

  const names = Object.keys(eng.presets).sort();
  const saveLabel = presetName && eng.presets[presetName] ? `Update "${presetName}"` : '+ Save';
  const fsHref = hasChrome() ? chrome.runtime.getURL('src/popup/index.html') : '#';

  const doSave = () => {
    const n = presetName.trim();
    if (!n) {
      eng.showNotice('Type a name in the box, then Save.');
      return;
    }
    eng.savePreset(n);
  };
  const onFile = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (e) => eng.importPresets(String(e.target?.result || ''));
    r.readAsText(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  const hide = (v: ViewId) => (view === v ? '' : 'hidden');

  return (
    <div className="flex min-h-[470px] flex-col">
      <div className="flex-1">
        {/* ================= EQ ================= */}
        <section className={'flex flex-col gap-2.5 p-3 ' + hide('eq')}>
          <header className="flex items-center gap-2">
            <svg className="h-5 w-5" style={{ color: 'hsl(var(--accent))' }} viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <mask id="umbraCut">
                <rect width="32" height="32" fill="#fff" />
                <circle cx="20.5" cy="13.5" r="11" fill="#000" />
              </mask>
              <circle cx="16" cy="16" r="12" fill="currentColor" mask="url(#umbraCut)" />
              <circle cx="20.5" cy="13.5" r="11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.5" />
            </svg>
            <span className="text-[15px] font-bold">
              Umbra<span className="text-primary">EQ</span>
            </span>
            <button
              onClick={eng.toggleSpectrum}
              title="Live spectrum overlay (visual only — does not change the sound)"
              className={
                'ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.96] ' +
                (eng.spectrum ? 'border-accent/50 bg-accent/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')
              }
            >
              <Activity className="size-3.5" />
              Spectrum
              <span className={'size-1.5 rounded-full ' + (eng.spectrum ? 'bg-accent' : 'bg-muted-foreground/40')} />
            </button>
          </header>

          <div
            className="flex items-center gap-2 rounded-2xl border border-white/10 p-3"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,.03), transparent 42%), var(--g-screen)',
              boxShadow: 'inset 0 2px 18px rgba(0,0,0,.55), inset 0 0 0 1px rgba(0,0,0,.25), 0 1px 0 rgba(255,255,255,.06)'
            }}
          >
            <VerticalVolume gain={eng.gain} onGain={eng.onGainLive} onCommit={eng.onCommit} editable={eng.canEdit} />
            <EqGraph
              bands={eng.bands}
              sampleRate={eng.sampleRate}
              fft={eng.fft}
              onBands={eng.onBandsLive}
              onCommit={eng.onCommit}
              editable={eng.canEdit}
            />
          </div>

          <div className="flex items-center gap-2 px-0.5 text-[10.5px] text-muted-foreground/70">
            <TriangleAlert className="size-3.5 opacity-70" />
            Loud audio can harm hearing — keep it sensible
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={eng.toggleCapture}
              className={
                'h-10 flex-1 rounded-xl border text-[13px] font-semibold backdrop-blur-md transition-colors ' +
                (eng.capturing
                  ? 'border-destructive/50 bg-destructive/10 text-foreground hover:bg-destructive/15'
                  : 'border-primary/50 bg-primary/20 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.12)] hover:bg-primary/30')
              }
            >
              <Power className={eng.capturing ? 'text-destructive' : 'text-accent'} />
              <span>{eng.capturing ? 'Stop EQing' : 'EQ This Tab'}</span>
              {eng.activeHost && <span className="max-w-[170px] truncate font-normal opacity-55">· {eng.activeHost}</span>}
            </Button>
            <Button variant="outline" className="h-10 rounded-xl backdrop-blur-md" onClick={eng.resetAll}>
              <RotateCcw />
              Reset
            </Button>
          </div>
        </section>

        {/* ================= PRESETS ================= */}
        <section className={'flex flex-col gap-2.5 p-3 ' + hide('presets')}>
          <h1 className="text-[15px] font-semibold">Presets</h1>
          <div className="flex gap-2">
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSave()}
              placeholder="Name a preset…"
              className="flex-1 rounded-xl border border-border bg-black/25 px-3 py-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
            />
            <Button variant="secondary" className="rounded-xl" onClick={doSave}>
              {saveLabel}
            </Button>
          </div>

          {names.length === 0 ? (
            <p className="px-1 text-[12px] text-muted-foreground/70 text-pretty">No presets yet. Shape the EQ, type a name, then Save.</p>
          ) : (
            <div className="flex max-h-[168px] flex-wrap gap-2 overflow-y-auto">
              {names.map((n) => (
                <span
                  key={n}
                  className={
                    'inline-flex items-center gap-2 rounded-full border py-1.5 pl-3 pr-1.5 text-[12px] font-semibold transition-colors ' +
                    (n === eng.activePreset ? 'border-primary bg-accent/15' : 'border-border bg-white/[.06] hover:border-input')
                  }
                >
                  <button className="text-foreground" onClick={() => eng.applyPreset(n)}>
                    {n}
                  </button>
                  <button
                    className="flex size-[18px] items-center justify-center rounded-full text-muted-foreground/70 hover:bg-destructive/20 hover:text-destructive"
                    title={`Delete "${n}"`}
                    onClick={() => eng.deletePreset(n)}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-1 flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={eng.exportPresets}>
              <Download />
              Export
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => fileRef.current?.click()}>
              <Upload />
              Import
            </Button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
          </div>
        </section>

        {/* ================= TABS ================= */}
        <section className={'flex flex-col gap-2.5 p-3 ' + hide('tabs')}>
          <h1 className="text-[15px] font-semibold">Active tabs</h1>
          {eng.streams.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground text-pretty">No tabs are being EQ'd. Start with EQ This Tab.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {eng.streams.map((t) => (
                <div
                  key={t.id}
                  className={
                    'flex items-center gap-2.5 rounded-xl py-2 pl-3 pr-2 [box-shadow:var(--shadow-border)] ' +
                    (t.id === eng.activeTabId ? 'bg-primary/10' : 'bg-white/[.05]')
                  }
                >
                  {/^(https?:|data:)/.test(t.favIconUrl) ? (
                    <img src={t.favIconUrl} alt="" className="size-[17px] rounded" />
                  ) : (
                    <span className="text-[13px]">🌐</span>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12.5px] text-foreground" title={t.title}>
                      {t.title || '(untitled)'}
                    </span>
                    <span className="truncate text-[10.5px] text-muted-foreground/80">
                      {t.host || 'local'}
                      {t.activePreset ? ' · ' + t.activePreset : ''}
                    </span>
                  </div>
                  <button
                    className="rounded-lg border border-border px-2 py-1 text-[10.5px] font-semibold text-muted-foreground transition-[color,scale] duration-150 active:scale-[0.96] hover:text-foreground"
                    title="Reset this tab & forget its saved EQ"
                    onClick={() => eng.resetTabById(t.id)}
                  >
                    Reset
                  </button>
                  <button
                    className="rounded-lg border border-destructive/35 bg-destructive/10 px-2.5 py-1 text-[10.5px] font-semibold text-destructive transition-[color,background-color,scale] duration-150 active:scale-[0.96] hover:bg-destructive/20"
                    onClick={() => eng.stopTab(t.id)}
                  >
                    Stop
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ================= MORE ================= */}
        <section className={'flex flex-col gap-2.5 p-3 ' + hide('more')}>
          <h1 className="text-[15px] font-semibold">More</h1>

          {/* Sticky-EQ: auto-apply a site's saved curve on capture */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[.05] p-3 [box-shadow:var(--shadow-border)]">
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold">Remember EQ per site</span>
              <span className="text-[11px] text-muted-foreground text-pretty">Auto-apply a site's saved curve when you EQ its tab</span>
            </div>
            <button
              role="switch"
              aria-checked={eng.autoDomain}
              aria-label="Remember EQ per site"
              onClick={() => eng.setAutoDomain(!eng.autoDomain)}
              className={'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ' + (eng.autoDomain ? 'bg-primary/70' : 'bg-white/15')}
            >
              <span className={'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-150 ' + (eng.autoDomain ? 'left-[22px]' : 'left-0.5')} />
            </button>
          </div>

          {/* Remembered sites — the per-domain memory store */}
          <div className="rounded-xl bg-white/[.05] p-3 [box-shadow:var(--shadow-border)]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold">Remembered sites</span>
              {eng.savedHosts.length > 0 && (
                <button onClick={eng.resetEverything} className="text-[11px] text-muted-foreground transition-colors hover:text-destructive">
                  Clear all
                </button>
              )}
            </div>
            {eng.savedHosts.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground/70 text-pretty">Sites you EQ are saved here and re-applied automatically next time.</p>
            ) : (
              <div className="flex max-h-[150px] flex-col gap-1 overflow-y-auto">
                {eng.savedHosts.map((h) => (
                  <div key={h.host} className="flex items-center gap-2 rounded-lg bg-black/20 py-1.5 pl-2.5 pr-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground" title={h.host}>
                      {h.host}
                    </span>
                    {h.preset && <span className="shrink-0 rounded-full bg-white/[.06] px-2 py-0.5 text-[10px] text-muted-foreground">{h.preset}</span>}
                    <button
                      title={'Forget ' + h.host}
                      onClick={() => eng.forgetHost(h.host)}
                      className="flex size-[18px] items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-destructive/20 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[.05] p-3 [box-shadow:var(--shadow-border)]">
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold">Theme</span>
              <span className="text-[11px] text-muted-foreground text-pretty">Color of the graph and accents</span>
            </div>
            <div className="flex gap-1">
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => applyTheme(t)}
                  title={t}
                  aria-label={t}
                  className={'size-6 rounded-full border-2 transition-transform ' + (theme === t ? 'scale-110 border-foreground' : 'border-transparent')}
                  style={{ background: swatch(t) }}
                />
              ))}
            </div>
          </div>

          <a
            href={fsHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl bg-white/[.05] p-3 transition-[box-shadow] duration-150 [box-shadow:var(--shadow-border)] hover:[box-shadow:var(--shadow-border-hover)]"
          >
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold">Full window</span>
              <span className="text-[11px] text-muted-foreground">Open the equalizer in its own tab</span>
            </div>
            <Maximize2 className="size-4 text-muted-foreground" />
          </a>

          <div className="px-1">
            <h3 className="mb-1.5 text-[10px] uppercase tracking-[0.13em] text-accent">Shape the sound</h3>
            <p className="text-[12px] leading-relaxed text-muted-foreground text-pretty">
              Drag a dot: left/right = frequency, up/down = boost/cut. <b className="text-foreground">Shift-drag</b> = width (Q).{' '}
              <b className="text-foreground">Double-click</b> resets a band. The strip on the left is master volume.
            </p>
          </div>

          <div className="pt-1 text-center text-[10.5px] text-muted-foreground/60">Umbra EQ · engine: {eng.engineStatus}</div>
        </section>
      </div>

      <BottomNav view={view} onView={setView} />

      {eng.notice && (
        <div className="fixed inset-x-3 bottom-[64px] z-50 rounded-xl border border-primary/40 bg-secondary/90 px-3.5 py-2.5 text-[11.5px] text-foreground shadow-lg backdrop-blur-md">
          {eng.notice}
        </div>
      )}
    </div>
  );
}

function swatch(t: string) {
  // OKLCH, same lightness as the graph accents so each swatch previews the theme's
  // true brightness (all equal) rather than an eyeballed hex that drifted per theme.
  switch (t) {
    case 'nocturne':
      return 'linear-gradient(135deg, oklch(0.69 0.067 264.81), oklch(0.69 0.059 233.26))';
    case 'aurora':
      return 'linear-gradient(135deg, oklch(0.69 0.061 163.18), oklch(0.69 0.073 131.87))';
    case 'solar':
      return 'linear-gradient(135deg, oklch(0.69 0.082 78.49), oklch(0.69 0.075 41.43))';
    default:
      return 'linear-gradient(135deg, oklch(0.69 0.076 277.26), oklch(0.69 0.043 202.09))';
  }
}
