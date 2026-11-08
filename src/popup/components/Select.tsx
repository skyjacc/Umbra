import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface Opt {
  value: string;
  label: string;
}

// Shared listbox, positioned inside the viewport even in a scrollable popup.
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
  const listId = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = btnRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const below = window.innerHeight - trigger.bottom;
      const above = trigger.top;
      const up = below < 180 && above > below;
      const width = Math.min(Math.max(trigger.width, 160), window.innerWidth - 16);
      setPosition({
        width,
        left: Math.max(8, Math.min(trigger.left, window.innerWidth - width - 8)),
        maxHeight: Math.max(80, Math.min(256, (up ? above : below) - 12)),
        ...(up ? { bottom: window.innerHeight - trigger.top + 4 } : { top: trigger.bottom + 4 })
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes AND returns focus to the trigger (ARIA listbox pattern) — without this, focus is
    // dumped to <body> when the focused option unmounts. Outside-click (onDoc) deliberately does NOT
    // refocus: the user is moving focus elsewhere.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
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
    } else if (e.key === 'Tab') {
      // Continue the document's tab order from the trigger, not from the portal at body end.
      btnRef.current?.focus();
      setOpen(false);
    }
  };

  const cur = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={'relative min-w-0 ' + (className || '')}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ? `${ariaLabel}: ${cur?.label ?? value}` : undefined}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-black/25 px-2.5 py-1.5 text-[11.5px] text-foreground transition-[color,border-color,scale] duration-150 hover:border-input active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 truncate" title={cur?.label ?? value}>{cur?.label ?? value}</span>
        <ChevronDown className={'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ' + (open ? 'rotate-180' : '')} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={listRef}
          role="listbox"
          id={listId}
          aria-label={ariaLabel}
          onKeyDown={onListKey}
          className="fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-secondary p-1 shadow-xl"
          style={position}
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                tabIndex={-1}
                title={o.label}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  btnRef.current?.focus(); // selection closes the list → keep focus on the combobox
                }}
                className={
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ' +
                  (on ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-white/[.06] hover:text-foreground')
                }
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {on && <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" />}
              </button>
            );
          })}
        </div>, btnRef.current?.closest('main') ?? document.body
      )}
    </div>
  );
}
