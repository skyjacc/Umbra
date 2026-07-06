import { useState } from 'react';
import { Trash2, Plus, HelpCircle } from 'lucide-react';
import { parsePatterns, type Rule } from '@/lib/rules';
import type { PresetBands } from '@/lib/presets';
import { useT } from '../i18n';
import { Select } from './Select';

interface Props {
  rules: Rule[];
  presets: Record<string, PresetBands>;
  activeHost: string;
  matchedRuleId: string | null;
  onAdd: (rule: Rule) => void;
  onUpdate: (id: string, patch: Partial<Rule>) => void;
  onDelete: (id: string) => void;
  onQuickAdd: (scope: 'exact' | 'anyTld' | 'anySub') => void;
}

const chip =
  'flex-1 rounded-lg border border-border bg-black/20 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground transition-[color,background-color,scale] duration-150 active:scale-[0.96] hover:text-foreground';

export function RulesView({ rules, presets, activeHost, matchedRuleId, onAdd, onUpdate, onDelete, onQuickAdd }: Props) {
  const tr = useT();
  const [guide, setGuide] = useState(false);
  const presetNames = Object.keys(presets).sort();

  const addBlank = () =>
    onAdd({ id: 'r_' + Date.now().toString(36), patterns: [], mode: 'preset', preset: presetNames[0] || 'bassBoost', enabled: true });

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold">{tr('rules.title')}</h1>
        <button
          onClick={() => setGuide((g) => !g)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <HelpCircle className="size-3.5" /> {tr('rules.guide')}
        </button>
      </div>

      {guide && <GuidePanel />}

      {activeHost && (
        <div className="rounded-xl bg-white/[.05] p-3 [box-shadow:var(--shadow-border)]">
          <div
            className="mb-2 text-[12px] text-muted-foreground text-pretty"
            dangerouslySetInnerHTML={{ __html: tr('rules.ruleForUsing', { host: `<b class="text-foreground">${escapeHtml(activeHost)}</b>` }) }}
          />
          <div className="flex gap-1.5">
            <button onClick={() => onQuickAdd('exact')} className={chip} title={tr('rules.quickExactTip')}>
              {tr('rules.quickExact')}
            </button>
            <button onClick={() => onQuickAdd('anyTld')} className={chip} title={tr('rules.quickAnyTldTip')}>
              {tr('rules.quickAnyTld')}
            </button>
            <button onClick={() => onQuickAdd('anySub')} className={chip} title={tr('rules.quickAnySubTip')}>
              {tr('rules.quickAnySub')}
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="px-1 text-[12px] text-muted-foreground/70 text-pretty">{tr('rules.none')}</p>
      ) : (
        rules.map((r) => (
          <RuleCard key={r.id} r={r} presetNames={presetNames} matched={r.id === matchedRuleId} onUpdate={onUpdate} onDelete={onDelete} />
        ))
      )}

      <button
        onClick={addBlank}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-[12.5px] font-semibold text-muted-foreground transition-[color,scale] duration-150 ease-out active:scale-[0.96] hover:text-foreground"
      >
        <Plus className="size-4" /> {tr('rules.add')}
      </button>
    </div>
  );
}

function RuleCard({
  r,
  presetNames,
  matched,
  onUpdate,
  onDelete
}: {
  r: Rule;
  presetNames: string[];
  matched: boolean;
  onUpdate: (id: string, patch: Partial<Rule>) => void;
  onDelete: (id: string) => void;
}) {
  const tr = useT();
  const [patText, setPatText] = useState(r.patterns.join(' '));

  const presetOptions = [{ value: 'bassBoost', label: tr('rules.bassBoost') }, ...presetNames.map((n) => ({ value: n, label: n }))];

  return (
    <div className={'rounded-xl p-3 [box-shadow:var(--shadow-border)] ' + (matched ? 'bg-primary/10' : 'bg-white/[.05]')}>
      <div className="flex items-center gap-2">
        <input
          value={patText}
          onChange={(e) => setPatText(e.target.value)}
          onBlur={() => onUpdate(r.id, { patterns: parsePatterns(patText) })}
          placeholder={tr('rules.placeholder')}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-border bg-black/25 px-2.5 py-1.5 font-mono text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
        />
        <button
          role="switch"
          aria-checked={r.enabled}
          aria-label={tr('rules.enabledLabel')}
          onClick={() => onUpdate(r.id, { enabled: !r.enabled })}
          className={'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ' + (r.enabled ? 'bg-primary/70' : 'bg-white/15')}
        >
          <span className={'absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] duration-150 ' + (r.enabled ? 'left-[18px]' : 'left-0.5')} />
        </button>
        <button
          onClick={() => onDelete(r.id)}
          title={tr('rules.deleteTitle')}
          className="flex size-[22px] shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-destructive/20 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span aria-hidden>→</span>
        {r.mode === 'curve' ? (
          <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[10.5px] text-foreground">{tr('rules.customCurve')}</span>
        ) : (
          <Select value={r.preset || ''} options={presetOptions} onChange={(v) => onUpdate(r.id, { preset: v })} className="min-w-[130px]" />
        )}
        {matched && <span className="ml-auto shrink-0 font-semibold text-accent">{tr('rules.matches')}</span>}
      </div>
    </div>
  );
}

function GuidePanel() {
  const tr = useT();
  const rows: [string, string][] = [
    ['youtube.com', tr('guide.row.exact')],
    ['youtube.', tr('guide.row.anyEnd')],
    ['.youtube.', tr('guide.row.anywhere')],
    ['.youtube.com', tr('guide.row.anyPage')],
    ['film. kino.', tr('guide.row.several')]
  ];
  return (
    <div className="rounded-xl bg-black/20 p-3 [box-shadow:var(--shadow-border)]">
      <p className="mb-2 text-[11.5px] text-muted-foreground text-pretty">{tr('guide.intro')}</p>
      <div className="flex flex-col gap-1.5">
        {rows.map(([p, d]) => (
          <div key={p} className="flex gap-2">
            <code className="h-fit shrink-0 rounded bg-white/[.06] px-1.5 py-0.5 font-mono text-[11px] text-accent">{p}</code>
            <span className="text-[11px] text-muted-foreground">{d}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground text-pretty">{tr('guide.tip')}</p>
      <p className="mt-1.5 text-[10.5px] text-muted-foreground/60 text-pretty">{tr('guide.applyNote')}</p>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
