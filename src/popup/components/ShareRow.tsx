import { useState } from 'react';
import { Copy, ClipboardPaste, Check } from 'lucide-react';
import { useT } from '../i18n';

const btn =
  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-white/[.05] py-1.5 text-[11px] font-semibold text-muted-foreground transition-[color,scale] duration-150 active:scale-[0.97] hover:text-foreground';

// Copy a self-contained share code to the clipboard, or paste one in to import.
// Paste uses a text field (no clipboard-read permission needed).
export function ShareRow({ onCopy, onImport }: { onCopy: () => void; onImport: (code: string) => void }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={onCopy} className={btn}>
          <Copy className="size-3.5" /> {tr('share.copyCode')}
        </button>
        <button onClick={() => setOpen((o) => !o)} className={btn}>
          <ClipboardPaste className="size-3.5" /> {tr('share.pasteCode')}
        </button>
      </div>
      {open && (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="UMBRA1:…"
            spellCheck={false}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-border bg-black/25 px-2.5 py-1.5 font-mono text-[10.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
          />
          <button
            aria-label="Import"
            onClick={() => {
              if (text.trim()) onImport(text);
              setText('');
              setOpen(false);
            }}
            className="inline-flex items-center justify-center rounded-lg border border-primary/50 bg-primary/20 px-3 text-foreground transition-[color,scale] duration-150 active:scale-[0.97]"
          >
            <Check className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
