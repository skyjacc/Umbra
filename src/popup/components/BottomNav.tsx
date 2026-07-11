import { useEffect, useRef, useState } from 'react';
import { AudioLines, SlidersHorizontal, ListFilter, AppWindow, MoreHorizontal } from 'lucide-react';
import { useT } from '../i18n';

export type ViewId = 'eq' | 'presets' | 'rules' | 'tabs' | 'more';

const TABS: { id: ViewId; Icon: typeof AudioLines }[] = [
  { id: 'eq', Icon: AudioLines },
  { id: 'presets', Icon: SlidersHorizontal },
  { id: 'rules', Icon: ListFilter },
  { id: 'tabs', Icon: AppWindow },
  { id: 'more', Icon: MoreHorizontal }
];

// Bottom tab bar with a sliding active indicator (smoothui "animated tabs" idea).
export function BottomNav({ view, onView }: { view: ViewId; onView: (v: ViewId) => void }) {
  const tr = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ cx: 0 });

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-tab="${view}"]`);
    if (el) setPill({ cx: el.offsetLeft + el.offsetWidth / 2 });
  }, [view]);

  return (
    <nav ref={ref} className="relative flex border-t border-white/10 backdrop-blur-md" style={{ background: 'rgba(255,255,255,.04)' }}>
      <span
        aria-hidden
        className="absolute top-0 h-0.5 rounded bg-accent/80 transition-[left] duration-300 [transition-timing-function:cubic-bezier(.22,1,.36,1)]"
        style={{ left: pill.cx - 13, width: 26 }}
      />
      {TABS.map((tab) => {
        const on = view === tab.id;
        return (
          <button
            key={tab.id}
            data-tab={tab.id}
            onClick={() => onView(tab.id)}
            aria-current={on ? 'page' : undefined}
            className={
              'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition-[color,scale] duration-150 ease-out active:scale-[0.96] ' +
              (on ? 'text-accent' : 'text-muted-foreground/60 hover:text-muted-foreground')
            }
          >
            <tab.Icon className="size-5" />
            {tr('nav.' + tab.id)}
          </button>
        );
      })}
    </nav>
  );
}
