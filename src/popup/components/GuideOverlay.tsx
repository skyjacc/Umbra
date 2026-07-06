import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n';

const SECTIONS = ['eq', 'vol', 'spectrum', 'presets', 'rules', 'tabs', 'privacy'] as const;

// Full detailed "how to use" manual (own, Ears-style), overlaid on the popup.
export function GuideOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tr = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex select-none flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-[14px] font-bold">{tr('howto.title')}</span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 items-center justify-center rounded-lg border border-border bg-white/[.05] text-muted-foreground transition-colors hover:text-foreground"
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
