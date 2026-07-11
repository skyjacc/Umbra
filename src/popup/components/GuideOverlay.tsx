import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n';

const SECTIONS = ['eq', 'vol', 'spectrum', 'presets', 'rules', 'tabs', 'privacy'] as const;

// Full detailed "how to use" manual (own, Ears-style), overlaid on the popup.
export function GuideOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tr = useT();
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

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
        onClose();
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={tr('howto.title')}
      className="fixed inset-0 z-[60] flex select-none flex-col bg-background/95 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-[14px] font-bold">{tr('howto.title')}</span>
        <button
          onClick={onClose}
          aria-label={tr('guide.close')}
          className="flex size-8 items-center justify-center rounded-lg border border-border bg-white/[.05] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          {SECTIONS.map((s) => (
            <section key={s}>
              <h3 className="mb-1 text-[13px] font-semibold text-accent">{tr('howto.' + s + '.h')}</h3>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground text-pretty">{tr('howto.' + s + '.p')}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
