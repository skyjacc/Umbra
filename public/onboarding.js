// Onboarding page logic. Kept in a separate file (not inline) so it complies
// with the extension's Content Security Policy (script-src 'self'), which
// forbids inline <script> execution.
'use strict';

try {
  const v = chrome.runtime.getManifest().version;
  const verEl = document.getElementById('ver');
  if (verEl) verEl.textContent = 'v' + v;
} catch (e) {
  /* getManifest unavailable outside the extension context — ignore */
}

const closeBtn = document.getElementById('closeBtn');
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    try {
      window.close();
    } catch (e) {
      /* ignore */
    }
  });
}
