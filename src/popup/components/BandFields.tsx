import { useEffect, useRef, useState } from 'react';
import { parseField, formatField, type BandField } from '@/lib/band-input';
import type { Band } from '@/lib/audio';
import { t } from '../i18n';

/**
 * The readout under the graph, made editable.
 *
 * It is the tooltip that already floats over a dragged dot — "437 · -19.7 dB · Q 0.71" — moved to
 * a fixed place and turned into three fields. A fixed place is the point: inline editors on the
 * dot itself fall off the edge of a 400px popup for the lowest and highest bands, which are
 * exactly the ones hardest to hit with the mouse and therefore likeliest to be typed.
 *
 * ARROWS BELONG TO THE TEXT HERE. On a dot they shape the band; inside these inputs they move the
 * caret, because that is what anyone typing a number expects. Nothing forwards a key from here to
 * the graph — the separation is that this component simply has no nudge handler.
 *
 * Enter commits, Escape puts back what the field held when editing started. While a field is being
 * typed in, it shows the draft rather than the live value, so a commit landing elsewhere cannot
 * rewrite the characters under the cursor.
 */
export function BandFields({
  band,
  index,
  editable,
  onBand,
  onCommit
}: {
  band: Band | null;
  index: number | null;
  editable: boolean;
  onBand: (patch: Partial<Band>) => void;
  onCommit: () => void;
}) {
  const FIELDS: { key: BandField; unit: string; width: string }[] = [
    { key: 'frequency', unit: 'Hz', width: 'w-[54px]' },
    { key: 'gain', unit: 'dB', width: 'w-[52px]' },
    { key: 'q', unit: '', width: 'w-[44px]' }
  ];

  const [draft, setDraft] = useState<{ key: BandField; text: string; from: string } | null>(null);
  const lastIndex = useRef(index);

  // Selecting another band while mid-edit abandons the draft rather than applying it to the new
  // band — the number was typed for the one that is no longer selected.
  useEffect(() => {
    if (lastIndex.current !== index) {
      lastIndex.current = index;
      setDraft(null);
    }
  }, [index]);

  if (!band || index === null) {
    return (
      <div className="flex h-[26px] items-center px-0.5 text-[10.5px] text-muted-foreground/70">{t('eq.bandNone')}</div>
    );
  }

  const value = (k: BandField) => (draft?.key === k ? draft.text : formatField(k, band[k === 'q' ? 'q' : k]));

  const commit = (k: BandField, text: string) => {
    const n = parseField(k, text);
    setDraft(null);
    if (n === null) return; // unreadable: leave the band alone and let the field snap back
    onBand({ [k]: n } as Partial<Band>);
    onCommit();
  };

  return (
    <div className="flex h-[26px] items-center gap-1.5 px-0.5 text-[10.5px] text-muted-foreground">
      <span className="shrink-0 font-semibold text-foreground/70">{t('eq.bandN', { n: String(index + 1) })}</span>
      {FIELDS.map(({ key, unit, width }) => (
        <span key={key} className="inline-flex items-center gap-1">
          {key === 'q' && <span className="opacity-70">Q</span>}
          <input
            value={value(key)}
            disabled={!editable}
            inputMode="decimal"
            aria-label={t('eq.band' + (key === 'frequency' ? 'Freq' : key === 'gain' ? 'Gain' : 'Q'))}
            onChange={(e) => setDraft({ key, text: e.target.value, from: draft?.key === key ? draft.from : value(key) })}
            onFocus={(e) => setDraft({ key, text: e.target.value, from: e.target.value })}
            onBlur={(e) => commit(key, e.target.value)}
            onKeyDown={(e) => {
              // Enter and Escape only. Arrows are deliberately not handled: inside a text field
              // they move the caret, and stealing them to shape the band is the conflict this
              // layout exists to avoid.
              if (e.key === 'Enter') {
                e.preventDefault();
                commit(key, (e.target as HTMLInputElement).value);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                const back = draft?.from ?? value(key);
                setDraft(null);
                (e.target as HTMLInputElement).value = back;
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={
              width +
              ' rounded-md border border-transparent bg-white/[.04] px-1 py-px text-right tabular-nums text-foreground/90 outline-none transition-colors hover:border-border focus:border-primary disabled:opacity-40'
            }
          />
          {unit && <span className="opacity-70">{unit}</span>}
        </span>
      ))}
    </div>
  );
}
