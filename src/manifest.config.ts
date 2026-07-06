import { defineManifest } from '@crxjs/vite-plugin';

// Single source of truth for the MV3 manifest. background/offscreen stay vanilla
// (service worker + Web Audio); only the popup is React.
export default defineManifest({
  manifest_version: 3,
  name: 'Umbra EQ — Equalizer & Bass Boost',
  short_name: 'Umbra EQ',
  description:
    'Live 11-band parametric equalizer and bass boost for any browser tab. No ads, no tracking, works fully offline.',
  version: '2.1.0',
  author: 'skyjacc',
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
  background: {
    // Vanilla service worker (no npm imports); CRXJS bundles it from src/.
    service_worker: 'src/background.js'
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'"
  }
});
