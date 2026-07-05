// Service worker: owns the offscreen document lifecycle and tab capture.
// All audio processing lives in offscreen.js (service workers have no Web Audio API).

const BUILD = '1.0.1'; // keep in sync with offscreen.js / popup.js

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

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) {
    dlog('chrome.runtime.getContexts unavailable (Chrome < 116?)');
    return false;
  }
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
        finish(!!(resp && resp.type === 'workspaceStatus'));
      });
    } catch (e) {
      clearTimeout(to);
      finish(false);
    }
  });
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    // A context exists — but is it alive? Ping it; recreate if it's a zombie.
    if (await pingOffscreen(700)) {
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
  // createDocument throws if called twice concurrently, so share one promise
  if (!creatingOffscreen) {
    dlog('creating offscreen document…');
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
        justification: 'Process and play back captured tab audio with Web Audio API'
      })
      .then(() => dlog('offscreen document created'))
      .catch((e) => {
        dlog('offscreen createDocument FAILED:', e && e.message);
        throw e;
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  await creatingOffscreen;
}

function isCapturableUrl(url) {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools://')
  );
}

async function startCaptureOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  dlog('startCapture: tab', tab && tab.id, 'url', tab && tab.url);
  if (!tab || !isCapturableUrl(tab.url)) {
    dlog('tab not capturable, aborting');
    return;
  }

  await ensureOffscreenDocument();

  // MV3: capture() is unavailable in service workers. Mint a stream id here,
  // consume it in the offscreen document via getUserMedia.
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (e) {
    // Most common cause: Chrome requires a user gesture / extension invocation
    // for this tab. Surface it to the popup instead of failing silently.
    const msg = (e && e.message) || String(e);
    dlog('getMediaStreamId failed:', msg);
    chrome.runtime.sendMessage({ type: 'captureError', error: msg }).catch(() => {});
    return;
  }
  dlog('got streamId', streamId, '→ offscreen');
  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'startCapture',
    streamId,
    tab: { id: tab.id, title: tab.title || '', favIconUrl: tab.favIconUrl || '' }
  });
}

async function stopCaptureOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (!(await hasOffscreenDocument())) return;
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stopCapture', tabId: tab.id });
}

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
      case 'toggleCapture':
        (message.on ? startCaptureOnActiveTab() : stopCaptureOnActiveTab()).catch((e) => {
          dlog('toggleCapture failed:', e && e.message);
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
    }
    return;
  }

  // Broadcasts from the offscreen document: mirror capture count onto the badge.
  if (message.type === 'workspaceStatus') {
    const n = (message.streams || []).length;
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
