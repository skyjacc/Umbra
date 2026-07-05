import { useEffect, useState } from 'react';
import { Power, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NumberFlow } from '@/components/NumberFlow';

// Phase-2 proof: Tailwind + shadcn/ui (Button) + a motion component (NumberFlow)
// building and rendering under CRXJS, in the dark-glass theme. Still a shell —
// the real views/graph come later.
export default function App() {
  const [engine, setEngine] = useState('starting…');
  const [db, setDb] = useState(4);

  useEffect(() => {
    const hasChrome = typeof chrome !== 'undefined' && !!chrome.runtime;
    if (!hasChrome) {
      setEngine('dev preview');
      return;
    }
    chrome.runtime.sendMessage({ target: 'bg', type: 'ensureOffscreen' }, (resp) => {
      if (chrome.runtime.lastError) return setEngine('bg error');
      setEngine(resp && resp.ok ? 'ready (build ' + resp.build + ')' : 'not ok');
    });
  }, []);

  return (
    <main className="flex min-h-[340px] flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <span
          className="h-5 w-5 rounded-full"
          style={{ background: 'radial-gradient(circle at 65% 35%, transparent 42%, hsl(var(--primary)) 44%)' }}
        />
        <span className="text-[15px] font-bold">
          Umbra<span className="text-primary">EQ</span>
        </span>
        <span className="ml-auto text-xs text-muted-foreground">React · shadcn · proof</span>
      </header>

      <section className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-md">
        <div className="mb-3 text-[10px] uppercase tracking-[0.14em] text-accent">Number Flow · master volume</div>
        <div className="flex items-center gap-4">
          <NumberFlow value={db} />
          <input
            type="range"
            min={-10}
            max={10}
            step={1}
            value={db}
            onChange={(e) => setDb(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            aria-label="master volume dB"
          />
        </div>
      </section>

      <section className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-md">
        <Button>
          <Power />
          EQ This Tab
        </Button>
        <Button variant="outline">
          <Sparkles />
          shadcn
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          Engine: <b className="text-foreground">{engine}</b>
        </span>
      </section>
    </main>
  );
}
