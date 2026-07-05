import { useEffect, useRef, useState } from 'react';
import { AudioLines, SlidersHorizontal, AppWindow, MoreHorizontal } from 'lucide-react';

export type ViewId = 'eq' | 'presets' | 'tabs' | 'more';

const TABS: { id: ViewId; label: string; Icon: typeof AudioLines }[] = [
  { id: 'eq', label: 'EQ', Icon: AudioLines },
  { id: 'presets', label: 'Presets', Icon: SlidersHorizontal },
  { id: 'tabs', label: 'Tabs', Icon: AppWindow },
  { id: 'more', label: 'More', Icon: MoreHorizontal }
];

// Bottom tab bar with a sliding active indicator (smoothui "animated tabs" idea).
export function BottomNav({ view, onView }: { view: ViewId; onView: (v: ViewId) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ cx: 0 });

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-tab="${view}"]`);
    if (el) setPill({ cx: el.offsetLeft + el.offsetWidth / 2 });
  }, [view]);

  return (
    <nav ref={ref} className="relative flex border-t border-border" style={{ background: 'rgba(255,255,255,.035)' }}>
      <span
        aria-hidden
        className="absolute top-0 h-0.5 rounded bg-accent/80 transition-[left] duration-300 [transition-timing-function:cubic-bezier(.22,1,.36,1)]"
        style={{ left: pill.cx - 13, width: 26 }}
      />
      {TABS.map((t) => {
        const on = view === t.id;
        return (
          <button
            key={t.id}
            data-tab={t.id}
            onClick={() => onView(t.id)}
            aria-selected={on}
            className={
              'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition-colors ' +
              (on ? 'text-accent' : 'text-muted-foreground/60 hover:text-muted-foreground')
            }
          >
            <t.Icon className="size-5" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
