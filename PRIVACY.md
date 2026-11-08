# Privacy Policy — Umbra EQ

_Last updated: 2026-11-08_

Umbra EQ ("the extension") is a browser audio equalizer. This policy explains what
it does and does not do with your data.

## Short version

**Audio is processed on your device, not saved as recordings or uploaded. Umbra has no analytics or ads.**
Umbra operates no server and sends no data to its developer. Your global EQ and UI settings
stay on this device. Saved presets and site rules use Chrome Sync when you enable sync in
your browser; Chrome may transfer those settings through your Google account to your other devices.

## What the extension accesses

- **Tab audio (via `tabCapture`)** — when you invoke the extension on an audio tab
  (by opening the popup, clicking "EQ This Tab", or using its keyboard shortcut), it
  captures the audio of the current tab and routes it through a local Web Audio
  equalizer. The audio is processed in real time inside your browser and is **not
  saved as audio recordings or uploaded**. Temporary in-memory buffers are used for
  processing, playback, the level meter, and the spectrum display.
- **The active tab's address, title, and favicon (via `activeTab`)** — the extension
  reads the current tab's URL to work out (a) whether the tab's audio can be captured
  at all (browser-internal pages like `chrome://` cannot be) and (b) its hostname, e.g.
  `youtube.com`. The hostname is what per-site rules match against, so the right saved
  sound is applied to the right site; it is also shown in the Rules tab for the
  "rule for this site" shortcut. The title and favicon are shown in the "Active Tabs"
  list so you can tell which tabs are being equalized. These live tab details are not
  recorded as browsing history or uploaded. A hostname you save as a site rule becomes
  a stored setting and may use Chrome Sync as described below.
- **Your EQ settings, presets, and domain rules (via `storage`)** — filter values,
  master volume, named presets, and domain rules (hostname patterns you enter, import,
  or create with "Save for this site", e.g. `youtube.`) are saved with
  `chrome.storage`. Presets and domain rules may be synced across your own signed-in
  Chrome profile using Chrome's built-in Sync (this is Google's sync of your own data
  to your own account; the extension operates no server and receives none of it). The
  extension never reads your browsing history. Captured-tab metadata is transient;
  your saved hostname patterns remain until you edit or delete their rules.
- **Temporary diagnostic messages** — the background worker and audio document each
  keep an in-memory log of up to 400 entries for troubleshooting. These entries can
  include tab IDs, hostnames, full tab URLs (including any path or query string),
  timestamps, and error messages. In particular, capture attempts log the tab's URL.
  Umbra does not upload these logs or write them to persistent storage. Older entries
  are replaced as the log fills; each log is cleared when its worker or audio-document
  context ends or the extension reloads. Stopping capture does not immediately clear
  its diagnostic entries, and there is no fixed time-based retention period.

## What the extension does NOT do

- No audio or usage analytics are sent to the developer or to third parties.
- No Umbra servers, direct external requests, tracking pixels, or analytics SDKs.
- Chrome's optional settings synchronization is described above and is managed by your browser.
- No browsing-history database and no recording of audio content.

## Why Chrome shows a "tab is being shared" indicator

Reading a tab's audio uses Chrome's tab-capture API — the same mechanism screen sharing uses — so
Chrome marks the tab with its capture indicator while the equalizer is running.

**Audio only.** The stream is requested with an audio constraint and no video constraint at all.
The extension does not capture video frames or screenshots, read the page's DOM text or HTML,
or capture microphone input. It processes the sound the tab is playing in temporary memory
buffers and plays it back locally. Audio is not saved as recordings or uploaded. Chrome's optional
synchronization applies to saved settings, not to these audio buffers.

Chrome's `tabCapture` permission covers audio and video together. Holding the permission is not the
same as using it for video, and Umbra EQ uses it for audio alone.

The indicator is enforced by the browser and cannot be suppressed by an extension. That is
deliberate, and good: it means you are always told when something is capturing a tab, including by
us. It disappears as soon as you stop the equalizer on that tab.

## Permissions justification

| Permission   | Why it is needed                                                        |
| ------------ | ----------------------------------------------------------------------- |
| `activeTab`  | Read the active tab's address (for per-site rules and capturability), title, and favicon when you invoke the extension; audio capture uses `tabCapture` |
| `tabCapture` | Capture the tab's audio stream to run it through the equalizer          |
| `storage`    | Save EQ settings locally and allow Chrome to sync your saved presets and site rules |
| `offscreen`  | Host the Web Audio graph (service workers cannot use Web Audio)         |

## Contact

Questions, bug reports, or privacy concerns: open an issue at
<https://github.com/skyjacc/Umbra/issues>.

## Changes

If this policy changes, the updated version will be posted at the policy URL listed
on the Chrome Web Store page.
