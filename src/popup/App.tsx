import { useEffect, useRef, useState } from 'react';
import { Power, RotateCcw, Download, Upload, Maximize2, TriangleAlert, Trash2, Activity, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EqGraph } from './components/EqGraph';
import { VerticalVolume } from './components/VerticalVolume';
import { RulesView } from './components/RulesView';
import { GuideOverlay } from './components/GuideOverlay';
import { ShareRow } from './components/ShareRow';
import { BottomNav, type ViewId } from './components/BottomNav';
import { useEngine } from './useEngine';
import { useT, useLang } from './i18n';
import { applyThemeId, applyCustomHue, type ThemeId } from './theme';
import { hasChrome } from '@/lib/engine-io';

const THEMES = ['eclipse', 'nocturne', 'aurora', 'solar'] as const;

export default function App() {
  const eng = useEngine();
  const tr = useT();
  const { lang, setLang } = useLang();
  const [view, setView] = useState<ViewId>('eq');
  const [presetName, setPresetName] = useState('');
  const [theme, setTheme] = useState<ThemeId>('eclipse');
  const [hue, setHueState] = useState(270);
  const [guideOpen, setGuideOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Theme: restore + apply (preset via data-theme, custom via inline OKLCH vars).
  useEffect(() => {
    let t: ThemeId = 'eclipse';
    let h = 270;
    try {
      const s = localStorage.THEME as ThemeId;
      if (s === 'custom' || (THEMES as readonly string[]).includes(s)) t = s;
      const savedH = parseInt(localStorage.THEME_HUE, 10);
      if (Number.isFinite(savedH)) h = ((savedH % 360) + 360) % 360;
    } catch {
      /* ignore */
    }
    setTheme(t);
    setHueState(h);
    applyThemeId(t, h);
  }, []);
  const applyTheme = (t: ThemeId) => {
    setTheme(t);
    applyThemeId(t, hue);
    try {
      localStorage.THEME = t;
    } catch {
      /* ignore */
    }
  };
  const setHue = (h: number) => {
    setHueState(h);
    setTheme('custom');
    applyCustomHue(h);
    try {
      localStorage.THEME = 'custom';
      localStorage.THEME_HUE = String(h);
    } catch {
      /* ignore */
    }
  };

  // Applying a preset fills the name box (matches the Save/Update label).
  useEffect(() => setPresetName(eng.activePreset), [eng.activePreset]);

  const names = Object.keys(eng.presets).sort();
  const saveLabel = presetName && eng.presets[presetName] ? tr('presets.update', { name: presetName }) : tr('presets.save');
  const fsHref = hasChrome() ? chrome.runtime.getURL('src/popup/index.html') : '#';

  const doSave = () => {
    const n = presetName.trim();
    if (!n) {
      eng.showNotice(tr('note.typeName'));
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
        <section className={'flex select-none flex-col gap-2.5 p-3 ' + hide('eq')}>
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
              title={tr('eq.spectrum')}
              aria-label={tr('eq.spectrum')}
              aria-pressed={eng.spectrum}
              className={
                'ml-auto inline-flex size-8 items-center justify-center rounded-lg border transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.94] ' +
                (eng.spectrum
                  ? 'border-accent/50 bg-accent/20 text-accent'
                  : 'border-border bg-white/[.04] text-muted-foreground hover:bg-white/[.08] hover:text-foreground')
              }
            >
              <Activity className="size-4" />
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
            {tr('eq.loud')}
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
              <span>{eng.capturing ? tr('eq.stop') : tr('eq.eqThisTab')}</span>
              {eng.activeHost && <span className="max-w-[170px] truncate font-normal opacity-55">· {eng.activeHost}</span>}
            </Button>
            <Button variant="outline" className="h-10 rounded-xl backdrop-blur-md" onClick={eng.resetAll}>
              <RotateCcw />
              {tr('eq.reset')}
            </Button>
          </div>
        </section>

        {/* ================= PRESETS ================= */}
        <section className={'flex flex-col gap-2.5 p-3 ' + hide('presets')}>
          <h1 className="text-[15px] font-semibold">{tr('presets.title')}</h1>
          <div className="flex gap-2">
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSave()}
              placeholder={tr('presets.placeholder')}
              className="flex-1 rounded-xl border border-border bg-black/25 px-3 py-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
            />
            <Button variant="secondary" className="rounded-xl" onClick={doSave}>
              {saveLabel}
            </Button>
          </div>

          {names.length === 0 ? (
            <p className="px-1 text-[12px] text-muted-foreground/70 text-pretty">{tr('presets.none')}</p>
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
                    title={tr('presets.deleteTitle', { name: n })}
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
              {tr('presets.export')}
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => fileRef.current?.click()}>
              <Upload />
              {tr('presets.import')}
            </Button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
          </div>
          <ShareRow onCopy={eng.copyPresetsCode} onImport={eng.importShareCode} />
        </section>

        {/* ================= RULES ================= */}
        <section className={'p-3 ' + hide('rules')}>
          <RulesView
            rules={eng.rules}
            presets={eng.presets}
            activeHost={eng.activeHost}
            matchedRuleId={eng.matchedRule?.id ?? null}
            autoDomain={eng.autoDomain}
            onSetAutoDomain={eng.setAutoDomain}
            onAdd={eng.addRule}
            onUpdate={eng.updateRule}
            onDelete={eng.deleteRule}
            onQuickAdd={eng.quickAddRule}
            onCopyCode={eng.copyRulesCode}
            onImportCode={eng.importShareCode}
          />
        </section>

        {/* ================= TABS ================= */}
        <section className={'flex flex-col gap-2.5 p-3 ' + hide('tabs')}>
          <h1 className="text-[15px] font-semibold">{tr('tabs.title')}</h1>
          {eng.streams.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground text-pretty">{tr('tabs.none')}</p>
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
                      {t.host || tr('tabs.local')}
                      {t.activePreset ? ' · ' + t.activePreset : ''}
                    </span>
                  </div>
                  <button
                    className="rounded-lg border border-border px-2 py-1 text-[10.5px] font-semibold text-muted-foreground transition-[color,scale] duration-150 active:scale-[0.96] hover:text-foreground"
                    title={tr('tabs.resetTitle')}
                    onClick={() => eng.resetTabById(t.id)}
                  >
                    {tr('tabs.reset')}
                  </button>
                  <button
                    className="rounded-lg border border-destructive/35 bg-destructive/10 px-2.5 py-1 text-[10.5px] font-semibold text-destructive transition-[color,background-color,scale] duration-150 active:scale-[0.96] hover:bg-destructive/20"
                    onClick={() => eng.stopTab(t.id)}
                  >
                    {tr('tabs.stop')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ================= MORE ================= */}
        <section className={'flex flex-col gap-2.5 p-3 ' + hide('more')}>
          <h1 className="text-[15px] font-semibold">{tr('more.title')}</h1>

          {/* Language */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[.05] p-3 [box-shadow:var(--shadow-border)]">
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold">{tr('more.language')}</span>
              <span className="text-[11px] text-muted-foreground text-pretty">{tr('more.languageDesc')}</span>
            </div>
            <div className="flex gap-0.5 rounded-lg bg-black/25 p-0.5">
              {(['en', 'ru'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={
                    'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ' +
                    (lang === l ? 'bg-primary/25 text-foreground' : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {l === 'en' ? 'EN' : 'RU'}
                </button>
              ))}
            </div>
          </div>

          {/* Theme + custom color */}
          <div className="flex flex-col gap-3 rounded-xl bg-white/[.05] p-3 [box-shadow:var(--shadow-border)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold">{tr('more.theme')}</span>
                <span className="text-[11px] text-muted-foreground text-pretty">{tr('more.themeDesc')}</span>
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
            <div className="flex items-center gap-2.5">
              <span className={'shrink-0 text-[11px] font-semibold ' + (theme === 'custom' ? 'text-foreground' : 'text-muted-foreground')}>{tr('more.custom')}</span>
              <input
                type="range"
                min={0}
                max={359}
                value={hue}
                onChange={(e) => setHue(+e.target.value)}
                aria-label={tr('more.custom')}
                className="umbra-hue h-2 flex-1 cursor-pointer appearance-none rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg,oklch(0.7 0.16 0),oklch(0.7 0.16 60),oklch(0.7 0.16 120),oklch(0.7 0.16 180),oklch(0.7 0.16 240),oklch(0.7 0.16 300),oklch(0.7 0.16 360))'
                }}
              />
              <span
                className="size-6 shrink-0 rounded-full border-2"
                style={{ borderColor: theme === 'custom' ? 'var(--g-grab)' : 'transparent', background: `oklch(0.69 0.11 ${hue})` }}
              />
            </div>
          </div>

          {/* Guide + full window */}
          <div className="flex gap-2">
            <button
              onClick={() => setGuideOpen(true)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-white/[.05] py-2 text-[12px] font-semibold text-foreground transition-[color,scale] duration-150 active:scale-[0.97] hover:border-input [box-shadow:var(--shadow-border)]"
            >
              <BookOpen className="size-4 text-accent" /> {tr('more.guide')}
            </button>
            <a
              href={fsHref}
              target="_blank"
              rel="noreferrer"
              title={tr('more.fullWindowDesc')}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white/[.05] px-3 py-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground [box-shadow:var(--shadow-border)]"
            >
              <Maximize2 className="size-4" /> {tr('more.fullWindow')}
            </a>
          </div>
        </section>
      </div>

      <BottomNav view={view} onView={setView} />

      {eng.notice && (
        <div className="fixed inset-x-3 bottom-[64px] z-50 rounded-xl border border-primary/40 bg-secondary/90 px-3.5 py-2.5 text-[11.5px] text-foreground shadow-lg backdrop-blur-md">
          {eng.notice}
        </div>
      )}

      <GuideOverlay open={guideOpen} onClose={() => setGuideOpen(false)} />
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
