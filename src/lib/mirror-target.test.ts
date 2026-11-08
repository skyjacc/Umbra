import { describe, it, expect } from 'vitest';
import { mirrorHost } from './mirror-target';

// The regression these guard: the editing buffer was claimed by TAB IDENTITY, and the full-window
// editor has no tab id — so `tabs.find(t => t.id === null)` never matched and its graph never
// refreshed from storage. Its next edit then wrote a stale curve over whatever the popup had saved.
describe('mirrorHost — who owns the editing buffer', () => {
  const tabs = [
    { id: 7, host: 'youtube.com' },
    { id: 9, host: 'open.spotify.com' }
  ];

  it('the full-window editor owns the everywhere-sound, even with no tab id of its own', () => {
    // THE BUG, in one assertion. activeTabId is null there by construction (useEngine sets it so),
    // and '' is how resolvedFor addresses the global profile.
    expect(mirrorHost({ globalEditor: true, activeTabId: null, tabs })).toBe('');
  });

  it('and keeps owning it even when other tabs are captured', () => {
    // The full-window page pushes audio to every captured tab, so `tabs` is NOT empty there. A fix
    // that only special-cased an empty list would pass the test above and still fail in practice.
    expect(mirrorHost({ globalEditor: true, activeTabId: null, tabs })).toBe('');
    expect(mirrorHost({ globalEditor: true, activeTabId: 7, tabs })).toBe('');
  });

  it('the popup owns the active tab it is actually capturing', () => {
    expect(mirrorHost({ globalEditor: false, activeTabId: 9, tabs })).toBe('open.spotify.com');
  });

  it('and owns nothing when its active tab is not captured', () => {
    // null, not '' — '' is a real host meaning the global profile, so collapsing the two would
    // pull the everywhere-sound into a popup looking at an uncaptured tab.
    expect(mirrorHost({ globalEditor: false, activeTabId: 42, tabs })).toBeNull();
    expect(mirrorHost({ globalEditor: false, activeTabId: null, tabs })).toBeNull();
    expect(mirrorHost({ globalEditor: false, activeTabId: 7, tabs: [] })).toBeNull();
  });

  it('distinguishes "no owner" from "the global profile" by type, not by falsiness', () => {
    // A caller writing `if (host)` instead of `if (host !== null)` would silently stop mirroring
    // the full-window editor — the exact bug, reintroduced one layer up.
    const none = mirrorHost({ globalEditor: false, activeTabId: 42, tabs });
    const global = mirrorHost({ globalEditor: true, activeTabId: null, tabs });
    expect(none).toBeNull();
    expect(global).toBe('');
    expect(none).not.toBe(global);
  });
});
