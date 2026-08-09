import { useEffect, useRef, useState } from 'react';
import { Power, RotateCcw, Download, Upload, Maximize2, TriangleAlert, Trash2, Activity, Captions, Globe, BookOpen, X, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EqGraph } from './components/EqGraph';
import { BandFields } from './components/BandFields';
import { VerticalVolume } from './components/VerticalVolume';
import { RulesView } from './components/RulesView';
import { GuideOverlay } from './components/GuideOverlay';
import { ShareRow } from './components/ShareRow';
import { BottomNav, type ViewId } from './components/BottomNav';
import { useEngine } from './useEngine';
import { useT, useLang } from './i18n';
import { applyThemeId, applyCustomHue, type ThemeId } from './theme';
import { hasChrome } from '@/lib/engine-io';
import { BUILTIN_ORDER } from '@/lib/builtins';
import { showsGraph, offersCapture, type CaptureUIState } from '@/lib/capture-state';

const THEMES = ['eclipse', 'nocturne', 'aurora', 'solar'] as const;

// Copy for the states that replace the graph. The three graph states never reach this map.
const CAPTURE_COPY: Record<CaptureUIState, string> = {
  globalEditor: '',
  active: '',
  pending: '',
  uncapturable: 'capture.uncapturable',
  stopped: 'capture.stopped',
  idle: 'capture.idle',
  error: 'capture.error'
};

export default function App() {
  const eng = useEngine();
  const tr = useT();
  const { lang, setLang } = useLang();
  const [view, setView] = useState<ViewId>('eq');
  // Which band the editable readout under the graph is showing. Survives blur, unlike focus:
  // tabbing from a dot into a field must not empty the row you were about to type into.
  const [selBand, setSelBand] = useState<number | null>(null);
  const [presetName, setPresetName] = useState('');
  const [theme, setTheme] = useState<ThemeId>('eclipse');
  const [hue, setHueState] = useState(270);
  const [guideOpen, setGuideOpen] = useState(false);
  // Two-step arm for the destructive reset; cleared whenever the user leaves the More view.
  const [confirmReset, setConfirmReset] = useState(false);
  const [hiddenBuiltins, setHiddenBuiltins] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.HIDDEN_BUILTINS || '[]');
    } catch {
      return [];
    }
  });
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
  // Built-ins shown first; a user preset of the same name shadows its built-in.
  const visibleBuiltins = BUILTIN_ORDER.filter((n) => !hiddenBuiltins.includes(n) && !eng.presets[n]);
  const hideBuiltin = (n: string) =>
    setHiddenBuiltins((h) => {
      const nx = [...h, n];
      try {
        localStorage.HIDDEN_BUILTINS = JSON.stringify(nx);
      } catch {
        /* ignore */
      }
      return nx;
    });
  const restoreBuiltins = () => {
    setHiddenBuiltins([]);
    try {
      localStorage.removeItem('HIDDEN_BUILTINS');
    } catch {
      /* ignore */
    }
  };
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
    r.onerror = () => eng.showNotice(tr('note.importFailed', { err: 'could not read the file' }));
    r.readAsText(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Disarm the destructive reset when the user navigates away, so it can't stay armed unseen.
  useEffect(() => {
    if (view !== 'more') setConfirmReset(false);
  }, [view]);

  const hide = (v: ViewId) => (view === v ? '' : 'hidden');

  return (
    <div className="flex min-h-[500px] flex-col">
      {/* The notice is a fixed overlay sitting just above the nav, so any content at that height
          is hidden AND unclickable while it shows. Reserving the space is better than moving the
          toast: it works for whatever happens to be down there, not just today's layout. */}
      <div className={'flex-1 ' + (eng.notice.text ? 'pb-[56px]' : '')}>
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
            <span className="ml-2 min-w-0 truncate text-[11px] text-muted-foreground" title={tr('eq.preset')}>
              {tr('eq.preset')}:{' '}
              <span className="font-medium text-foreground/80">
                {/* "Vocal" while the curve still is Vocal; "Based on Vocal" once it has been
                    shaped away from it. Not "Vocal*" — an asterisk reads as unsaved, and the edit
                    is saved. Not "Vocal (edited)" — that names a different preset, not a source. */}
                {eng.provenance.kind === 'none'
                  ? tr('eq.presetNone')
                  : eng.provenance.kind === 'exact'
                    ? eng.provenance.name
                    : tr('eq.presetBasedOn', { name: eng.provenance.name })}
              </span>
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button
                onClick={eng.toggleRoles}
                title={tr('eq.roles')}
                aria-label={tr('eq.roles')}
                aria-pressed={eng.showRoles}
                disabled={!showsGraph(eng.captureState)}
                className={
                  'inline-flex size-8 items-center justify-center rounded-lg border transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40 ' +
                  (eng.showRoles
                    ? 'border-accent/50 bg-accent/20 text-accent'
                    : 'border-border bg-white/[.04] text-muted-foreground hover:bg-white/[.08] hover:text-foreground')
                }
              >
                <Captions className="size-4" />
              </button>
              <button
                onClick={eng.toggleBypass}
                title={tr('eq.bypassTitle')}
                aria-label={tr('eq.bypassTitle')}
                aria-pressed={eng.bypassed}
                disabled={!showsGraph(eng.captureState) || !eng.canEdit}
                className={
                  'inline-flex size-8 items-center justify-center rounded-lg border transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40 ' +
                  (eng.bypassed
                    ? 'border-destructive/50 bg-destructive/20 text-destructive'
                    : 'border-border bg-white/[.04] text-muted-foreground hover:bg-white/[.08] hover:text-foreground')
                }
              >
                <Power className="size-4" />
              </button>
              <button
                onClick={eng.toggleSpectrum}
                title={tr('eq.spectrum')}
                aria-label={tr('eq.spectrum')}
                aria-pressed={eng.spectrum}
                disabled={!showsGraph(eng.captureState)}
                className={
                  'inline-flex size-8 items-center justify-center rounded-lg border transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40 ' +
                  (eng.spectrum
                    ? 'border-accent/50 bg-accent/20 text-accent'
                    : 'border-border bg-white/[.04] text-muted-foreground hover:bg-white/[.08] hover:text-foreground')
                }
              >
                <Activity className="size-4" />
              </button>
            </div>
          </header>

          <div
            className="flex items-center gap-2 rounded-2xl border border-white/10 p-3"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,.03), transparent 42%), var(--g-screen)',
              boxShadow: 'inset 0 2px 18px rgba(0,0,0,.55), inset 0 0 0 1px rgba(0,0,0,.25), 0 1px 0 rgba(255,255,255,.06)'
            }}
          >
            {showsGraph(eng.captureState) ? (
              <>
                <VerticalVolume gain={eng.gain} onGain={eng.onGainLive} onCommit={eng.onCommit} editable={eng.canEdit} />
                <EqGraph
                  bands={eng.bands}
                  sampleRate={eng.sampleRate}
                  spectrumOn={eng.spectrum}
                  visible={view === 'eq'}
                  activeTabId={eng.activeTabId}
                  showRoles={eng.showRoles}
                  onBands={eng.onBandsLive}
                  onCommit={eng.onCommit}
                  editable={eng.canEdit}
                  bypassed={eng.bypassed}
                  onSelectBand={setSelBand}
                />
              </>
            ) : (
              // No capture: say why instead of rendering a full-size, inert equalizer that reads
              // as broken. Same height as the graph so the popup doesn't jump between states.
              // Announcement is handled by the always-mounted live region below — a region that
              // is inserted together with its text is not reliably read by assistive tech.
              <div className="flex h-[252px] flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <TriangleAlert className="size-5 opacity-40" aria-hidden="true" />
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">{tr(CAPTURE_COPY[eng.captureState])}</p>
                {eng.captureState === 'error' && eng.lastError && (
                  // Keep the cause on screen: the toast that carries it expires after 5s.
                  <p className="max-w-full truncate text-[11px] text-muted-foreground/70" title={eng.lastError}>
                    {eng.lastError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* The dragged-dot readout, in a fixed place and editable. Kept outside the graph box so
              the lowest and highest bands — the hardest to hit with a mouse, and so the likeliest
              to be typed — do not put their fields off the edge of a 400px popup. */}
          {showsGraph(eng.captureState) && (
            <BandFields
              band={selBand !== null ? (eng.bands[selBand] ?? null) : null}
              index={selBand !== null && eng.bands[selBand] ? selBand : null}
              editable={eng.canEdit}
              onBand={(patch) => {
                if (selBand === null) return;
                const nb = eng.bands.slice();
                nb[selBand] = { ...nb[selBand], ...patch };
                eng.onBandsLive(nb);
              }}
              onCommit={eng.onCommit}
            />
          )}

          {/* Always mounted so it is already a live region when its text changes — that is what
              makes a capture-state change audible to a screen reader. Empty while the graph shows. */}
          <span role="status" aria-live="polite" className="sr-only">
            {showsGraph(eng.captureState) ? '' : tr(CAPTURE_COPY[eng.captureState])}
          </span>

          {showsGraph(eng.captureState) && (
            <div className="flex items-center gap-2 px-0.5 text-[10.5px] text-muted-foreground">
              <TriangleAlert className="size-3.5 opacity-70" />
              {tr('eq.loud')}
              {eng.bypassed && (
                <span className="ml-auto shrink-0 rounded border border-destructive/40 px-1.5 py-0.5 font-semibold text-destructive">
                  {tr('eq.bypassOn')}
                </span>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {eng.globalEditor ? (
              // Full window edits the sound-everywhere profile, not a real tab — so there's
              // nothing to capture/stop here; show what you're editing instead.
              <div className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 text-[13px] font-semibold text-foreground">
                <Globe className="size-4 text-accent" />
                <span>{tr('eq.globalProfile')}</span>
              </div>
            ) : offersCapture(eng.captureState) ? (
              // Omitted on a browser system page: there is nothing the button could achieve there.
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
                <span>
                  {eng.capturing ? tr('eq.stop') : eng.captureState === 'error' ? tr('capture.retry') : tr('eq.eqThisTab')}
                </span>
                {eng.activeHost && <span className="max-w-[170px] truncate font-normal opacity-55">· {eng.activeHost}</span>}
              </Button>
            ) : null}
            {/* Put the sound back to what it was when the popup opened. Restores, never deletes —
                which is why it may sit here next to Save while the destructive `Reset profile`
                stays in More. It survives the auto-commit: an edit that saved itself 200ms ago is
                still an edit you may want back, and keying on the un-committed window is what made
                the first attempt blink out on mouse-up. */}
            {eng.canResetChanges && (
              <Button
                variant="outline"
                title={tr('eq.resetChangesTitle')}
                className="h-10 shrink-0 rounded-xl backdrop-blur-md"
                onClick={eng.resetChanges}
              >
                <RotateCcw />
                <span>{tr('eq.resetChanges')}</span>
              </Button>
            )}
            {/* Turn what you are hearing into a rule for this site. Only where there is a site to
                attach it to, and only while the tab is actually being shaped. */}
            {!eng.globalEditor && eng.activeHost && showsGraph(eng.captureState) && (
              <Button
                variant="outline"
                title={eng.matchedRule ? tr('eq.updateRuleTitle') : tr('eq.saveForSiteTitle')}
                className="h-10 rounded-xl backdrop-blur-md"
                onClick={() => void eng.saveForThisSite()}
              >
                <Globe />
                <span className={eng.canResetChanges ? 'max-w-[92px] truncate' : 'max-w-[150px] truncate'}>
                  {eng.matchedRule ? tr('eq.updateRule', { host: eng.activeHost }) : tr('eq.saveForSite', { host: eng.activeHost })}
                </span>
              </Button>
            )}
            {/* No reset button here at all. The destructive one lives in More; the harmless one
                would need a state that does not exist yet — a drag auto-commits, so "there is an
                unsaved edit to discard" survives only the ~200ms debounce. It comes back in the
                Bypass PR, where a preview persists for as long as the user leaves it on. */}
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

          {visibleBuiltins.length === 0 && names.length === 0 ? (
            <p className="px-1 text-[12px] text-muted-foreground text-pretty">{tr('presets.none')}</p>
          ) : (
            <div className="flex max-h-[168px] flex-wrap gap-2 overflow-y-auto">
              {/* built-in presets — accent-tinted, dismissible (recoverable) */}
              {visibleBuiltins.map((n) => (
                <span
                  key={'b:' + n}
                  className={
                    'inline-flex items-center gap-2 rounded-full border py-1.5 pl-3 pr-1.5 text-[12px] font-semibold transition-colors ' +
                    (n === eng.activePreset ? 'border-primary bg-accent/15' : 'border-accent/30 bg-accent/[.08] hover:border-accent/50')
                  }
                >
                  <button className="text-foreground" onClick={() => eng.applyPreset(n)}>
                    {n}
                  </button>
                  <button
                    className="flex size-[18px] items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-white/10 hover:text-foreground"
                    title={tr('presets.hideTitle')}
                    onClick={() => hideBuiltin(n)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {/* user presets — deletable */}
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
              {hiddenBuiltins.length > 0 && (
                <button
                  onClick={restoreBuiltins}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[.04] px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Undo2 className="size-3.5" /> {tr('presets.restore')}
                </button>
              )}
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
                  {/^data:image\//.test(t.favIconUrl) ? (
                    <img src={t.favIconUrl} alt="" className="size-[17px] rounded" />
                  ) : (
                    <Globe className="size-[17px] text-muted-foreground" aria-hidden />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12.5px] text-foreground" title={t.title}>
                      {t.title || tr('tabs.untitled')}
                    </span>
                    <span className="truncate text-[10.5px] text-muted-foreground/80">
                      {t.host || tr('tabs.local')}
                      {t.activePreset ? ' · ' + t.activePreset : ''}
                    </span>
                  </div>
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

          {/* Auto Gain. A listening preference, not part of any profile — switching it on rewrites
              nothing, which is why it sits with the view toggles rather than near Save. */}
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <button
              onClick={eng.toggleAutoGain}
              role="switch"
              aria-checked={eng.autoGain}
              className={
                'inline-flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition-colors [box-shadow:var(--shadow-border)] ' +
                (eng.autoGain
                  ? 'border-primary/50 bg-primary/15 text-foreground'
                  : 'border-border bg-white/[.05] text-muted-foreground hover:text-foreground')
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <Activity className="size-4" />
                {tr('more.autoGain')}
              </span>
              <span
                className={
                  'h-4 w-7 shrink-0 rounded-full border transition-colors ' +
                  (eng.autoGain ? 'border-primary/60 bg-primary/60' : 'border-border bg-white/[.06]')
                }
              >
                <span
                  className={'block size-3 translate-y-px rounded-full bg-foreground/80 transition-transform ' + (eng.autoGain ? 'translate-x-3.5' : 'translate-x-px')}
                />
              </span>
            </button>
            <p className="px-0.5 text-[10.5px] leading-snug text-muted-foreground">{tr('more.autoGainHint')}</p>
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

          {/* The destructive reset lives only here. Two steps rather than a modal — the project has
              no modal pattern and adding one for a single action isn't worth it — and the notice
              that follows offers an undo, so a mis-click is recoverable either way. */}
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <button
              onClick={() => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  return;
                }
                setConfirmReset(false);
                eng.resetProfile();
              }}
              className={
                'inline-flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[12px] font-semibold transition-colors [box-shadow:var(--shadow-border)] ' +
                (confirmReset
                  ? 'border-destructive/60 bg-destructive/15 text-foreground'
                  : 'border-border bg-white/[.05] text-muted-foreground hover:text-foreground')
              }
            >
              <RotateCcw className="size-4" />
              {confirmReset ? tr('more.resetProfileConfirm') : tr('more.resetProfile')}
            </button>
            <p className="px-0.5 text-[10.5px] leading-snug text-muted-foreground">
              {eng.activeHost && eng.matchedRule ? tr('more.resetProfileRule', { host: eng.activeHost }) : tr('more.resetProfileGlobal')}
            </p>

            {/* The undo lives here, not only in the toast. Deciding whether you wanted a reset
                means listening to something, which takes longer than any notice should stay on
                screen — so it outlives the toast and is cleared by a later save instead of by a
                timer. See lib/undo.ts. */}
            {eng.canUndoReset && (
              <div className="mt-1 flex flex-col gap-1">
                <button
                  onClick={eng.undoReset}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/50 bg-primary/10 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-primary/20"
                >
                  <Undo2 className="size-4" />
                  {tr('more.undoReset')}
                </button>
                <p className="px-0.5 text-[10.5px] leading-snug text-muted-foreground">{tr('more.undoResetHint')}</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <BottomNav view={view} onView={setView} />

      {eng.notice.text && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fixed inset-x-3 bottom-[64px] z-50 rounded-xl border border-primary/40 bg-secondary/90 px-3.5 py-2.5 text-[11.5px] text-foreground shadow-lg backdrop-blur-md"
        >
          <span>{eng.notice.text}</span>
          {/* Only the notice that ARMED an undo offers one. The button used to be gated on the
              slot alone, so any later unrelated notice inherited a live Undo. */}
          {eng.notice.undo && eng.canUndoReset && (
            <button
              onClick={eng.undoReset}
              className="ml-2 rounded-md border border-primary/50 px-2 py-0.5 font-semibold text-foreground hover:bg-primary/20"
            >
              {tr('eq.undo')}
            </button>
          )}
        </div>
      )}

      {['stale', 'error', 'notResponding'].includes(eng.engineStatus) && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed inset-x-3 top-3 z-50 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/15 px-3.5 py-2.5 text-[11.5px] font-semibold text-destructive shadow-lg backdrop-blur-md"
        >
          <TriangleAlert className="size-4 shrink-0" />
          {tr('engine.' + eng.engineStatus)}
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
