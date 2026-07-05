import { useState } from 'react';
import { EqGraph } from './components/EqGraph';
import { DEFAULT_FREQUENCIES, DEFAULT_Q, NUM_FILTERS, dbToMasterGain, filterType, type Band } from '@/lib/audio';

function flatBands(): Band[] {
  return Array.from({ length: NUM_FILTERS }, (_, i) => ({
    frequency: DEFAULT_FREQUENCIES[i],
    gain: 0,
    q: DEFAULT_Q,
    type: filterType(i)
  }));
}

// A shaped starting curve so the graph is visible during Phase-3 verification.
function demoBands(): Band[] {
  const gains = [6, 5, 3, 1, -1, -2, -1, 1, 2, 3, 4];
  return flatBands().map((b, i) => ({ ...b, gain: gains[i] }));
}

// Phase-3 harness: the real EQ graph (React SVG, reusing the ported math) driven by
// local state. Messaging/persistence (onCommit) and the full views land in Phase 4.
export default function App() {
  const [bands, setBands] = useState<Band[]>(demoBands);
  const [gain, setGain] = useState(dbToMasterGain(3));
  const sampleRate = 44100;

  return (
    <main className="flex flex-col gap-3 p-3">
      <header className="flex items-center gap-2 px-1">
        <span
          className="h-5 w-5 rounded-full"
          style={{ background: 'radial-gradient(circle at 65% 35%, transparent 42%, hsl(var(--primary)) 44%)' }}
        />
        <span className="text-[15px] font-bold">
          Umbra<span className="text-primary">EQ</span>
        </span>
        <span className="ml-auto text-xs text-muted-foreground">Phase 3 · graph</span>
      </header>

      <EqGraph
        bands={bands}
        gain={gain}
        sampleRate={sampleRate}
        onBands={setBands}
        onGain={setGain}
        onCommit={() => {
          /* Phase 4: persist + send canonical state to the engine */
        }}
      />

      <button
        className="self-start px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={() => {
          setBands(flatBands());
          setGain(1);
        }}
      >
        reset
      </button>
    </main>
  );
}
