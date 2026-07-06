# Privacy Policy — Umbra EQ

_Last updated: 2026-07-06_

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
- **The active tab's title and favicon (via `activeTab`)** — shown only in the
  "Active Tabs" list inside the popup so you can tell which tabs are being equalized.
  This information never leaves your browser.
- **Your EQ settings and presets (via `storage`)** — filter values, master volume,
  and named presets are saved locally with `chrome.storage`. Presets you save may be
  synced across your own signed-in Chrome profile using Chrome's built-in Sync (this
  is Google's sync of your own data to your own account; the extension operates no
  server and receives none of it).

## What the extension does NOT do

- No data is sent to the developer or any third party.
- No servers, no external requests, no tracking pixels, no analytics SDKs.
- No collection of browsing history, personal information, or audio content.

## Permissions justification

| Permission   | Why it is needed                                                        |
| ------------ | ----------------------------------------------------------------------- |
| `activeTab`  | Read the active tab's audio/title/favicon when you invoke the extension |
| `tabCapture` | Capture the tab's audio stream to run it through the equalizer          |
| `storage`    | Save your EQ settings and presets on your device                        |
| `offscreen`  | Host the Web Audio graph (service workers cannot use Web Audio)         |

## Contact

Questions, bug reports, or privacy concerns: open an issue at
<https://github.com/skyjacc/Umbra/issues>.

## Changes

If this policy changes, the updated version will be posted at the policy URL listed
on the Chrome Web Store page.
