import { defineManifest } from '@crxjs/vite-plugin';

// Single source of truth for the MV3 manifest. background/offscreen stay vanilla
// (service worker + Web Audio); only the popup is React.
export default defineManifest({
  manifest_version: 3,
  name: 'Equalizer + Bass Boost, per Tab — Umbra EQ',
  short_name: 'Umbra EQ',
  description:
    'Give any tab its own equalizer. Boost bass, tame harsh audio, and save presets. Everything stays on your computer.',
  version: '2.4.1',
  homepage_url: 'https://github.com/skyjacc/Umbra',
  minimum_chrome_version: '116',
  icons: {
    '16': 'icon16.png',
    '32': 'icon32.png',
    '48': 'icon48.png',
    '128': 'icon128.png'
  },
  action: {
    default_icon: 'icon128.png',
    default_popup: 'src/popup/index.html'
  },
  permissions: ['activeTab', 'tabCapture', 'storage', 'offscreen'],
  // Deliberately shipped WITHOUT a suggested_key. Two reasons: Chrome silently drops a suggested
  // binding that collides with an existing one, so the shortcut would look broken to exactly the
  // users who have the most extensions; and on macOS the popular combinations are already taken by
  // the system. Users assign it at chrome://extensions/shortcuts.
  //
  // Why it exists at all: while a tab is captured Chrome downgrades fullscreen to
  // "fullscreen-within-tab", and the only reliable order is fullscreen FIRST, then capture. In
  // macOS fullscreen the toolbar is hidden, so the popup — the only way to start capture today —
  // is unreachable at the exact moment it is needed. Invoking a command counts as the user gesture
  // that grants activeTab, so this needs no extra permission.
  commands: {
    'toggle-eq': {
      description: 'Turn the equalizer on or off for the current tab'
    }
  },
  background: {
    // Vanilla service worker (no npm imports); CRXJS bundles it from src/.
    service_worker: 'src/background.js'
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; img-src 'self' data:; connect-src 'self'"
  }
});
