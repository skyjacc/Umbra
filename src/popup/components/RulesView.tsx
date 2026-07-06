import { useState } from 'react';
import { Trash2, Plus, HelpCircle } from 'lucide-react';
import { parsePatterns, type Rule } from '@/lib/rules';
import type { PresetBands } from '@/lib/presets';

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
  const [guide, setGuide] = useState(false);
  const presetNames = Object.keys(presets).sort();

  const addBlank = () =>
    onAdd({ id: 'r_' + Date.now().toString(36), patterns: [], mode: 'preset', preset: presetNames[0] || 'bassBoost', enabled: true });

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold">Domain rules</h1>
        <button
          onClick={() => setGuide((g) => !g)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <HelpCircle className="size-3.5" /> Guide
        </button>
      </div>

      {guide && <GuidePanel />}

      {/* Quick-add a rule for the active site from the curve on screen */}
      {activeHost && (
        <div className="rounded-xl bg-white/[.05] p-3 [box-shadow:var(--shadow-border)]">
          <div className="mb-2 text-[12px] text-muted-foreground text-pretty">
            Rule for <b className="text-foreground">{activeHost}</b> using the current curve:
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => onQuickAdd('exact')} className={chip} title="Exactly this hostname">
              This host
            </button>
            <button onClick={() => onQuickAdd('anyTld')} className={chip} title="Same name, any TLD (.com/.gg/…)">
              Any TLD
            </button>
            <button onClick={() => onQuickAdd('anySub')} className={chip} title="Any subdomain + any TLD">
              + subdomains
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="px-1 text-[12px] text-muted-foreground/70 text-pretty">
          No rules yet. Add one for the current site above, or a blank rule below. A rule maps hostname patterns to a preset or a saved curve.
        </p>
      ) : (
        rules.map((r) => (
          <RuleCard key={r.id} r={r} presetNames={presetNames} matched={r.id === matchedRuleId} onUpdate={onUpdate} onDelete={onDelete} />
        ))
      )}

      <button
        onClick={addBlank}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-[12.5px] font-semibold text-muted-foreground transition-[color,scale] duration-150 ease-out active:scale-[0.96] hover:text-foreground"
      >
        <Plus className="size-4" /> Add rule
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
  const [patText, setPatText] = useState(r.patterns.join(' / '));

  return (
    <div className={'rounded-xl p-3 [box-shadow:var(--shadow-border)] ' + (matched ? 'bg-primary/10' : 'bg-white/[.05]')}>
      <div className="flex items-center gap-2">
        <input
          value={patText}
          onChange={(e) => setPatText(e.target.value)}
          onBlur={() => onUpdate(r.id, { patterns: parsePatterns(patText) })}
          placeholder="film. / kino. / .youtube."
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-border bg-black/25 px-2.5 py-1.5 font-mono text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
        />
        <button
          role="switch"
          aria-checked={r.enabled}
          aria-label="Rule enabled"
          onClick={() => onUpdate(r.id, { enabled: !r.enabled })}
          className={'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ' + (r.enabled ? 'bg-primary/70' : 'bg-white/15')}
        >
          <span className={'absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] duration-150 ' + (r.enabled ? 'left-[18px]' : 'left-0.5')} />
        </button>
        <button
          onClick={() => onDelete(r.id)}
          title="Delete rule"
          className="flex size-[22px] shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-destructive/20 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span aria-hidden>→</span>
        {r.mode === 'curve' ? (
          <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[10.5px] text-foreground">Custom curve</span>
        ) : (
          <select
            value={r.preset || ''}
            onChange={(e) => onUpdate(r.id, { preset: e.target.value })}
            className="rounded-lg border border-border bg-black/25 px-2 py-1 text-[11.5px] text-foreground outline-none focus:border-primary"
          >
            <option value="bassBoost">Bass boost</option>
            {presetNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        {matched && <span className="ml-auto font-semibold text-accent">● matches this site</span>}
      </div>
    </div>
  );
}

function GuidePanel() {
  const rows: [string, string][] = [
    ['music.youtube.com', 'exact host'],
    ['youtube.', 'name + any TLD — youtube.com, youtube.gg'],
    ['.youtube.', 'any subdomain + any TLD — music.youtube.com'],
    ['.youtube.com', 'any subdomain, fixed TLD'],
    ['film. / kino.', 'several patterns → one rule (space or /)']
  ];
  return (
    <div className="rounded-xl bg-black/20 p-3 [box-shadow:var(--shadow-border)]">
      <p className="mb-2 text-[11.5px] text-muted-foreground text-pretty">
        Each rule maps hostname patterns to a preset or a saved curve. The first matching rule wins; a hand-tweaked site always overrides its
        rule. Rules apply on the next capture.
      </p>
      <div className="flex flex-col gap-1">
        {rows.map(([p, d]) => (
          <div key={p} className="flex gap-2">
            <code className="h-fit shrink-0 rounded bg-white/[.06] px-1.5 py-0.5 font-mono text-[11px] text-accent">{p}</code>
            <span className="text-[11px] text-muted-foreground">{d}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] text-muted-foreground/60 text-pretty">
        Note: multi-part TLDs like .co.uk match approximately (no public-suffix list).
      </p>
    </div>
  );
}
