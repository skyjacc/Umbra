import { resolveStoredSound } from './lib/sound-profile';
import { outputGain } from './lib/auto-gain';

// Service worker: owns the offscreen document lifecycle and tab capture.
// All audio processing lives in offscreen.js (service workers have no Web Audio API).

const BUILD = '2.5.0'; // keep in sync with offscreen.js / src/lib/engine-io.ts (guarded by invariants.test.ts)

// --- Logging: ring buffer + console, for one-click diagnostics export. ---
const DEBUG = false; // flip to true only for local diagnostics
const LOG = [];
const _ts = () => new Date().toISOString().substr(11, 12);
const _fmt = (x) => {
  try {
    return typeof x === 'object' ? JSON.stringify(x) : String(x);
  } catch (e) {
    return String(x);
  }
};
function dlog(...a) {
  LOG.push(_ts() + ' ' + a.map(_fmt).join(' '));
  if (LOG.length > 400) LOG.shift();
  if (DEBUG) console.log('[UmbraEQ bg]', ...a);
}
self.addEventListener('error', (e) => dlog('UNCAUGHT', e.message, e.filename + ':' + e.lineno));
self.addEventListener('unhandledrejection', (e) => dlog('UNHANDLED_REJECTION', e.reason && (e.reason.message || e.reason)));

const OFFSCREEN_PATH = 'offscreen.html';

// Tabs the user explicitly Stopped — auto-capture (open popup = EQ the tab) must NOT re-EQ
// these, or Stop would be undone every time the popup reopens. Cleared on manual EQ / navigate.
// Persisted to chrome.storage.session so an MV3 service-worker eviction (which clears the
// in-memory Set after ~30s idle) can't silently re-EQ a Stopped tab. `stoppedReady` gates the
// auto-capture guard so a cold SW hydrates the Set before deciding.
const stoppedTabs = new Set();
const stoppedReady = (async () => {
  try {
    const { stoppedTabs: s } = await chrome.storage.session.get('stoppedTabs');
    if (Array.isArray(s)) s.forEach((id) => stoppedTabs.add(id));
  } catch (e) {
    dlog('stoppedTabs hydrate failed:', e && e.message);
  }
})();
function persistStopped() {
  chrome.storage.session.set({ stoppedTabs: [...stoppedTabs] }).catch((e) => dlog('stoppedTabs persist failed:', e && e.message));
}

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
  });
  dlog('existing offscreen contexts:', contexts.length);
  return contexts.length > 0;
}

let creatingOffscreen = null;

// Ping the offscreen doc; resolve true only if it answers with a real status.
// Distinguishes a LIVE document from a zombie/suspended one that getContexts
// still reports as existing.
function pingOffscreen(timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const to = setTimeout(() => finish(false), timeoutMs);
    try {
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'getStatus' }, (resp) => {
        void chrome.runtime.lastError; // ignore "no receiver"
        clearTimeout(to);
        finish(!!(resp && resp.type === 'workspaceStatus' && !resp.failed));
      });
    } catch (e) {
      clearTimeout(to);
      finish(false);
    }
  });
}

function ensureOffscreenDocument() {
  // Share the entire probe/close/create transaction. Sharing only createDocument lets a slower
  // recovery caller close the replacement document that a faster caller has already created.
  if (!creatingOffscreen) {
    creatingOffscreen = (async () => {
      if (await hasOffscreenDocument()) {
        // Give healthy, initializing audio devices a second, longer chance to answer.
        if ((await pingOffscreen(700)) || (await pingOffscreen(4000))) {
          dlog('offscreen alive');
          return;
        }
        dlog('offscreen exists but did not answer — recreating');
        try {
          await chrome.offscreen.closeDocument();
        } catch (e) {
          dlog('closeDocument failed:', e && e.message);
        }
      }
      dlog('creating offscreen document…');
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
        justification: 'Process and play back captured tab audio with Web Audio API'
      });
      dlog('offscreen document created');
    })()
      .catch((e) => {
        dlog('offscreen createDocument FAILED:', e && e.message);
        throw e;
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  return creatingOffscreen;
}

function isCapturableUrl(url) {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome-untrusted://') ||
    url.startsWith('edge://') ||
    url.startsWith('opera://') || // Opera is a supported target — its internal pages aren't capturable
    url.startsWith('about:') ||
    url.startsWith('devtools://') ||
    url.startsWith('view-source:')
  );
}

// Tell the popup WHY no capture happened. Both early returns below used to write only to the
// debug log, so the popup rendered a dead, unexplained equalizer. Broadcast (not sendResponse):
// the toggleCapture route is fire-and-forget and has no response channel.
function reportSkip(reason, tabId) {
  chrome.runtime.sendMessage({ type: 'captureSkipped', reason, tabId }).catch(() => {});
}

async function startCaptureOnActiveTab(auto) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return startCaptureTab(tab, auto);
}

async function startCaptureTab(tab, auto) {
  dlog('startCapture: tab', tab && tab.id, 'url', tab && tab.url, auto ? '(auto)' : '(manual)');
  if (!tab || !isCapturableUrl(tab.url)) {
    dlog('tab not capturable, aborting');
    reportSkip('uncapturable', tab?.id);
    return;
  }
  const epoch = invalidateCapture(tab.id);
  await stoppedReady; // a cold service worker must hydrate the Stopped set before deciding
  if (auto && stoppedTabs.has(tab.id)) {
    dlog('auto-capture skipped — user stopped this tab', tab.id);
    reportSkip('stopped', tab.id);
    return;
  }
  if (stoppedTabs.delete(tab.id)) persistStopped(); // manual EQ (or a fresh auto) re-arms it

  await ensureOffscreenDocument();
  const settings = await settingsForUrl(tab.url);
  if ((captureEpoch.get(tab.id) || 0) !== epoch) return;

  // MV3: capture() is unavailable in service workers. Mint a stream id here,
  // consume it in the offscreen document via getUserMedia.
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (e) {
    if ((captureEpoch.get(tab.id) || 0) !== epoch) return;
    // Most common cause: Chrome requires a user gesture / extension invocation
    // for this tab. Surface it to the popup instead of failing silently.
    const msg = (e && e.message) || String(e);
    dlog('getMediaStreamId failed:', msg);
    chrome.runtime.sendMessage({ type: 'captureError', error: msg }).catch(() => {});
    return;
  }
  if ((captureEpoch.get(tab.id) || 0) !== epoch) return;
  chrome.runtime
    .sendMessage({
      target: 'offscreen',
      type: 'startCapture',
      streamId,
      settings,
      // url carries the hostname the offscreen engine keys per-domain memory on.
      tab: { id: tab.id, title: tab.title || '', favIconUrl: tab.favIconUrl || '', url: tab.url || '' }
    })
    .catch((e) => dlog('startCapture sendMessage dropped:', e && e.message)); // offscreen may still be waking
}

// Tell the popup which tab it is looking at, so it can edit that tab's EQ and show
// whether the site already has a saved (domain) curve.
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { id: null, host: '', title: '', capturable: false };
  let host = '';
  try {
    host = tab.url ? new URL(tab.url).hostname.replace(/^www\./, '') : '';
  } catch (e) {
    host = '';
  }
  return { id: tab.id, host, title: tab.title || '', favIconUrl: tab.favIconUrl || '', capturable: isCapturableUrl(tab.url) };
}

// Invalidate pending startup work before any await. Stop is always addressed to a stable tab id.
const captureEpoch = new Map();
const invalidateCapture = (tabId) => {
  const next = (captureEpoch.get(tabId) || 0) + 1;
  captureEpoch.set(tabId, next);
  return next;
};

async function settingsForUrl(url) {
  const [sync, local] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get(['DEFAULT_EQ', 'AUTO_GAIN'])]);
  const host = new URL(url).hostname.replace(/^www\./, '');
  const sound = resolveStoredSound(host, sync, local);
  return { eqFilters: sound.bands, gain: outputGain({ userGain: sound.gain, bands: sound.bands, on: local.AUTO_GAIN === true }), activePreset: sound.presetName };
}

async function stopCaptureTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  invalidateCapture(tabId);
  await stoppedReady;
  stoppedTabs.add(tabId);
  persistStopped();
  reportSkip('stopped', tabId);
  if (!(await hasOffscreenDocument())) return;
  // A later manual Start clears this intent before its own async startup. An old lookup must
  // not deliver Stop after that Start. A skipped auto-capture keeps the Stop intent intact.
  if (!stoppedTabs.has(tabId)) return;
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stopCapture', tabId }).catch(() => {});
}

async function stopCaptureOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await stopCaptureTab(tab.id);
}

// Is the active tab currently in the engine's capture list? Asked rather than tracked: the
// offscreen document owns that truth, and a service worker can be evicted between two questions.
async function isTabCaptured(tabId) {
  if (!(await hasOffscreenDocument())) return false;
  try {
    const status = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'getStatus' });
    return !!(status && (status.tabs || []).some((t) => t.id === tabId));
  } catch (e) {
    return false; // engine asleep or not answering — treat as "not capturing" and try to start
  }
}

// Keyboard shortcut (chrome://extensions/shortcuts — unbound by default, see manifest.config.ts).
//
// It exists for one situation the popup cannot serve: while a tab is captured Chrome downgrades
// fullscreen to fullscreen-within-tab, and the only order that keeps real fullscreen is fullscreen
// FIRST, then capture. In macOS fullscreen the toolbar is hidden, so the popup is unreachable
// exactly then. Invoking a command is a user gesture, so activeTab is granted and
// tabCapture.getMediaStreamId stays legal from here — no additional permission.
//
// Passing auto=false matters: a manual request must also re-arm a tab the user previously Stopped,
// same as pressing the button in the popup.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-eq') return;
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    if (await isTabCaptured(tab.id)) await stopCaptureTab(tab.id);
    else await startCaptureTab(tab, false);
  })().catch((e) => dlog('toggle-eq failed:', e && e.message));
});

// Same-origin URL changes retain capture. A hidden/unknown destination or a different origin
// cannot inherit the old site's sound: activeTab may already have been revoked, so stop safely.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'loading' && typeof info.url !== 'string') return;
  const epoch = invalidateCapture(tabId);
  (async () => {
    await stoppedReady;
    if (stoppedTabs.delete(tabId)) persistStopped();
    if (!(await hasOffscreenDocument())) return;
    const status = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'getStatus' });
    if ((captureEpoch.get(tabId) || 0) !== epoch) return;
    const current = status?.tabs?.find((entry) => entry.id === tabId);
    // tab.url can still describe the old committed document during loading; only the changed
    // URL or pending destination can establish where this navigation is going.
    const url = info.url || tab?.pendingUrl;
    let sameOrigin = false;
    try { sameOrigin = !!current?.url && !!url && new URL(current.url).origin === new URL(url).origin && isCapturableUrl(url); } catch {}
    if (!sameOrigin) {
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stopCapture', tabId }).catch(() => {});
      if (current) chrome.runtime.sendMessage({ type: 'captureInterrupted', tabId, reason: 'navigation' }).catch(() => {});
      return;
    }
    const settings = await settingsForUrl(url);
    if ((captureEpoch.get(tabId) || 0) !== epoch) return;
    await chrome.runtime.sendMessage({
      target: 'offscreen', type: 'applySettings', tabId, ...settings,
      tab: { id: tabId, url, title: tab?.title || current.title || '', favIconUrl: tab?.favIconUrl || current.favIconUrl || '' }
    }).catch(() => {});
  })().catch((e) => {
    // Failure to refresh must not leave a stale site's profile running.
    if ((captureEpoch.get(tabId) || 0) !== epoch) return;
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'stopCapture', tabId }).catch(() => {});
    dlog('navigation refresh failed:', e && e.message);
  });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  invalidateCapture(tabId);
  stoppedReady.then(() => {
    if (stoppedTabs.delete(tabId)) persistStopped();
  });
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stopCapture', tabId }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'bg') {
    switch (message.type) {
      case 'getLogs':
        chrome.runtime
          .getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
          .then((c) =>
            sendResponse({ build: BUILD, log: LOG.slice(), state: { offscreenContexts: c.length, creating: !!creatingOffscreen } })
          )
          .catch(() => sendResponse({ build: BUILD, log: LOG.slice(), state: {} }));
        return true;
      case 'stopCapture':
        stopCaptureTab(message.tabId).catch((e) => dlog('stopCapture failed:', e && e.message));
        break;
      case 'toggleCapture':
        (message.on ? startCaptureOnActiveTab(message.auto) : stopCaptureOnActiveTab()).catch((e) => {
          dlog('toggleCapture failed:', e && e.message);
          chrome.runtime.sendMessage({ type: 'captureError', error: e?.message || String(e) }).catch(() => {});
        });
        break;
      case 'ensureOffscreen':
        ensureOffscreenDocument()
          .then(() => sendResponse({ ok: true, build: BUILD }))
          .catch((e) => {
            console.error('[UmbraEQ bg] ensureOffscreen failed:', e && e.message);
            sendResponse({ ok: false, error: (e && e.message) || 'unknown' });
          });
        return true; // async sendResponse
      case 'getActiveTab':
        getActiveTab()
          .then((t) => sendResponse(t))
          .catch(() => sendResponse({ id: null, host: '', title: '', capturable: false }));
        return true; // async sendResponse
    }
    return;
  }

  // Broadcasts from the offscreen document: mirror capture count onto the badge.
  if (message.type === 'workspaceStatus') {
    const n = (message.tabs || []).length; // engine sends `tabs`; the old `streams` name was always empty

    chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#2C3E50' });
  }
});

// First run: open a local, offline "how to use" page (no network, no iframe).
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') }).catch((e) => dlog('onboarding open failed:', e && e.message));
  }
});
