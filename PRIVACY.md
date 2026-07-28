# Privacy Policy — Umbra EQ

_Last updated: 2026-07-13_

Umbra EQ ("the extension") is a browser audio equalizer. This policy explains what
it does and does not do with your data.

## Short version

**The extension collects nothing, sends nothing, and contains no analytics or ads.**
All audio processing and all settings stay on your own device.

## What the extension accesses

- **Tab audio (via `tabCapture`)** — when you click "EQ This Tab", the extension
  captures the audio of the current tab and routes it through a local Web Audio
  equalizer. The audio is processed in real time inside your browser and is **never
  recorded, stored, or transmitted** anywhere.
- **The active tab's address, title, and favicon (via `activeTab`)** — the extension
  reads the current tab's URL to work out (a) whether the tab's audio can be captured
  at all (browser-internal pages like `chrome://` cannot be) and (b) its hostname, e.g.
  `youtube.com`. The hostname is what per-site rules match against, so the right saved
  sound is applied to the right site; it is also shown in the Rules tab for the
  "rule for this site" shortcut. The title and favicon are shown in the "Active Tabs"
  list so you can tell which tabs are being equalized. None of this is recorded as
  browsing history, and none of it leaves your browser.
- **Your EQ settings, presets, and domain rules (via `storage`)** — filter values,
  master volume, named presets, and domain rules (the hostname patterns you type
  yourself to assign a sound to a site, e.g. `youtube.`) are saved locally with
  `chrome.storage`. Presets and domain rules may be synced across your own signed-in
  Chrome profile using Chrome's built-in Sync (this is Google's sync of your own data
  to your own account; the extension operates no server and receives none of it). The
  extension never reads your browsing history — the only site names it holds are the
  patterns you enter yourself.

## What the extension does NOT do

- No data is sent to the developer or any third party.
- No servers, no external requests, no tracking pixels, no analytics SDKs.
- No collection of browsing history, personal information, or audio content.

## Permissions justification

| Permission   | Why it is needed                                                        |
| ------------ | ----------------------------------------------------------------------- |
| `activeTab`  | Read the active tab's audio, address (for per-site rules and capturability), title, and favicon when you invoke the extension |
| `tabCapture` | Capture the tab's audio stream to run it through the equalizer          |
| `storage`    | Save your EQ settings, presets, and domain rules on your device        |
| `offscreen`  | Host the Web Audio graph (service workers cannot use Web Audio)         |

## Contact

Questions, bug reports, or privacy concerns: open an issue at
<https://github.com/skyjacc/Umbra/issues>.

## Changes

If this policy changes, the updated version will be posted at the policy URL listed
on the Chrome Web Store page.
