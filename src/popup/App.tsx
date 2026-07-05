import { useEffect, useState } from 'react';

// Phase-1 shell: proves the React popup builds, loads, and can talk to the
// vanilla service worker + offscreen engine. The real UI (views, graph) lands
// in later phases.
export default function App() {
  const [engine, setEngine] = useState('starting…');

  useEffect(() => {
    const hasChrome = typeof chrome !== 'undefined' && !!chrome.runtime;
    if (!hasChrome) {
      setEngine('no chrome APIs (dev preview)');
      return;
    }
    chrome.runtime.sendMessage({ target: 'bg', type: 'ensureOffscreen' }, (resp) => {
      if (chrome.runtime.lastError) {
        setEngine('bg error: ' + chrome.runtime.lastError.message);
        return;
      }
      setEngine(resp && resp.ok ? 'engine ready (build ' + resp.build + ')' : 'engine not ok');
    });
  }, []);

  return (
    <main className="shell">
      <header className="bar">
        <span className="logo" aria-hidden="true" />
        <span className="wordmark">Umbra<b>EQ</b></span>
      </header>
      <div className="card">
        <div className="lab">React build · Phase 1</div>
        <p className="line">Popup is now a React app (Vite + CRXJS). Audio engine stays vanilla.</p>
        <p className="status">Engine: <b>{engine}</b></p>
      </div>
    </main>
  );
}
