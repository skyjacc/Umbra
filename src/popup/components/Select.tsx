import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface Opt {
  value: string;
  label: string;
}

// Glass dropdown that matches the app — the native <select> popup can't be themed
// (browser-gray), so this replaces it with a styled listbox.
export function Select({
  value,
  options,
  onChange,
  className = '',
  ariaLabel
}: {
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // On open, move focus to the selected option; arrows rove between options (each is a real button,
  // so Enter/Space select natively).
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    (list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list?.querySelector<HTMLElement>('[role="option"]'))?.focus();
  }, [open]);
  const onListKey = (e: React.KeyboardEvent) => {
    const opts = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    if (!opts.length) return;
    const idx = opts.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      opts[Math.min(opts.length - 1, idx + 1)].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      opts[Math.max(0, idx <= 0 ? 0 : idx - 1)].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      opts[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      opts[opts.length - 1].focus();
    }
  };

  const cur = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={'relative ' + className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-black/25 px-2.5 py-1.5 text-[11.5px] text-foreground transition-[color,border-color,scale] duration-150 hover:border-input active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{cur?.label ?? value}</span>
        <ChevronDown className={'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          onKeyDown={onListKey}
          className="absolute left-0 z-50 mt-1 max-h-[176px] min-w-full overflow-y-auto rounded-xl border border-white/10 bg-secondary/95 p-1 shadow-xl backdrop-blur-md"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors ' +
                  (on ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-white/[.06] hover:text-foreground')
                }
              >
                <span className="flex-1 truncate">{o.label}</span>
                {on && <Check className="size-3.5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
