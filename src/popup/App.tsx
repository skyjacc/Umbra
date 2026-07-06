import { useEffect, useRef, useState } from 'react';
import { Power, RotateCcw, Download, Upload, Maximize2, TriangleAlert, Trash2, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EqGraph } from './components/EqGraph';
import { VolumeSlider } from './components/VolumeSlider';
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
        <section className={'flex flex-col gap-3 p-4 ' + hide('eq')}>
          <header className="flex items-center gap-2">
            <span
              className="h-5 w-5 rounded-full"
              style={{ background: 'radial-gradient(circle at 65% 35%, transparent 42%, hsl(var(--accent)) 44%)' }}
            />
            <span className="text-[15px] font-bold">Equalizer</span>
            <button
              onClick={eng.toggleSpectrum}
              title="Live spectrum overlay (visual only — does not change the sound)"
              className={
                'ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ' +
                (eng.spectrum ? 'border-accent/50 bg-accent/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')
              }
            >
              <Activity className="size-3.5" />
              Spectrum
              <span className={'size-1.5 rounded-full ' + (eng.spectrum ? 'bg-accent' : 'bg-muted-foreground/40')} />
            </button>
          </header>

          <EqGraph
            bands={eng.bands}
            sampleRate={eng.sampleRate}
            fft={eng.fft}
            onBands={eng.onBandsLive}
            onCommit={eng.onCommit}
          />

          <VolumeSlider gain={eng.gain} onGain={eng.onGainLive} onCommit={eng.onCommit} />

          <div className="flex items-center gap-2 px-0.5 text-[10.5px] text-muted-foreground/70">
            <TriangleAlert className="size-3.5 opacity-70" />
            Loud audio can harm hearing — keep it sensible
          </div>

          <div className="flex gap-2.5">
            <Button
              variant="outline"
              onClick={eng.toggleCapture}
              className={
                'flex-1 rounded-xl border py-6 text-[13.5px] font-semibold backdrop-blur-md transition-colors ' +
                (eng.capturing
                  ? 'border-destructive/50 bg-destructive/10 text-foreground hover:bg-destructive/15'
                  : 'border-primary/50 bg-primary/20 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.12)] hover:bg-primary/30')
              }
            >
              <Power className={eng.capturing ? 'text-destructive' : 'text-accent'} />
              {eng.capturing ? 'Stop EQing' : 'EQ This Tab'}
            </Button>
            <Button variant="outline" className="rounded-xl py-6 backdrop-blur-md" onClick={eng.resetAll}>
              <RotateCcw />
              Reset
            </Button>
          </div>
        </section>

        {/* ================= PRESETS ================= */}
        <section className={'flex flex-col gap-3 p-4 ' + hide('presets')}>
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
            <p className="px-1 text-[12px] text-muted-foreground/70">No presets yet. Shape the EQ, type a name, then Save.</p>
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
        <section className={'flex flex-col gap-3 p-4 ' + hide('tabs')}>
          <h1 className="text-[15px] font-semibold">Active tabs</h1>
          {eng.streams.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No tabs are being EQ'd. Start with EQ This Tab.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {eng.streams.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-white/[.05] py-2 pl-3 pr-2">
                  {/^(https?:|data:)/.test(t.favIconUrl) ? (
                    <img src={t.favIconUrl} alt="" className="size-[17px] rounded" />
                  ) : (
                    <span className="text-[13px]">🌐</span>
                  )}
                  <span className="flex-1 truncate text-[12.5px] text-foreground" title={t.title}>
                    {t.title || '(untitled)'}
                  </span>
                  <button
                    className="rounded-lg border border-destructive/35 bg-destructive/10 px-2.5 py-1 text-[10.5px] font-semibold text-destructive hover:bg-destructive/20"
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
        <section className={'flex flex-col gap-3 p-4 ' + hide('more')}>
          <h1 className="text-[15px] font-semibold">More</h1>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white/[.05] p-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold">Theme</span>
              <span className="text-[11px] text-muted-foreground">Color of the graph and accents</span>
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
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white/[.05] p-3 hover:border-input"
          >
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold">Full window</span>
              <span className="text-[11px] text-muted-foreground">Open the equalizer in its own tab</span>
            </div>
            <Maximize2 className="size-4 text-muted-foreground" />
          </a>

          <div className="px-1">
            <h3 className="mb-1.5 text-[10px] uppercase tracking-[0.13em] text-accent">Shape the sound</h3>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
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
  switch (t) {
    case 'nocturne':
      return 'linear-gradient(135deg, #7f93bd, #6f9ab2)';
    case 'aurora':
      return 'linear-gradient(135deg, #7fae97, #9ab585)';
    case 'solar':
      return 'linear-gradient(135deg, #c2a06a, #c78f7a)';
    default:
      return 'linear-gradient(135deg, #8b93c6, #79a0a3)';
  }
}
