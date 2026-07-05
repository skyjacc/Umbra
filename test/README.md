# Umbra EQ — tests & diagnostics

Two things live here: a **runnable test suite** (for the developer/agent) and, in the
extension itself, a **one-click diagnostics export** (for the end user).

## Runnable tests

Four self-contained test pages drive the REAL code with a mocked `chrome.*` in a real
browser engine (so `AudioContext`, Snap.svg, etc. are genuine):

- `test/engine-test.html` — loads `../offscreen.js` (the audio engine) and drives it
  through messages: `getStatus`, `modifyFilter`, clamps, `applyPreset` (bassBoost),
  `resetFilters`, `importPresets`, `getLogs`. Asserts the graph is built, status is
  correct, and nothing throws (no `UNCAUGHT` in the engine log).
- `test/ui-test.html` — loads `../popup.js` with a full offscreen DOM and asserts the
  pure logic: coordinate transforms round-trip, `biquadCoefficients` finite,
  `normalizePresets` (legacy named-object format / alt-keys / arrays / malformed / garbage),
  `filterType` mapping.
- `test/preset-persistence-test.html` — presets are popup-owned: they survive an
  empty/stale engine status, survive save/delete, and pick up external
  `storage.onChanged` writes without being wiped.
- `test/legacy-preset-clamp-test.html` — a dirty legacy preset (gains at
  +/-99 dB, out-of-range/negative/non-numeric frequencies, junk Q) must render with
  every dot INSIDE the canvas (grabbable, no NaN), persist clamped values, and
  self-heal the stored sync copy on read (clean presets untouched, idempotent).

### How to run

Serve the folder and open each page; results land in `window.__results`
(`{passed, failed, total, results[]}`) and render on the page.

```
# from the project folder
python -m http.server 8731
# then open:  http://localhost:8731/test/engine-test.html
#             http://localhost:8731/test/ui-test.html
```

Headless (what the agent uses): navigate a browser to each URL and read
`window.__results`. Green = all pass. Extend a suite by adding `ok(name, cond, extra)`
assertions in its trailing `<script>`.

> The `test/` folder is dev-only and is **excluded** from the store zip by
> `build-zip.ps1` (it ships a fixed runtime whitelist).

## In-extension diagnostics (for bug reports)

Every context (popup, service worker, offscreen) keeps a 400-line ring buffer and
captures uncaught errors. The popup's **⧉ Diagnostics** button (visible while
`DEBUG = true`) gathers all three logs + state + environment into JSON and copies it to
the clipboard — one paste is a complete bug report:

```json
{
  "extVersion": "1.0.0",
  "userAgent": "...",
  "popup":   { "engine": "connected", "err": "", "currentTabId": 42, "streams": [...] },
  "serviceWorker": { "log": [...], "state": { "offscreenContexts": 1 } },
  "offscreen":     { "log": [...], "state": { "contextState": "running", "filters": 11, "streams": [...] } },
  "popupLog": [...]
}
```

Turn all of it off before publishing: set `DEBUG = false` in `popup.js`,
`background.js`, and `offscreen.js` (hides the `#dbg` line + Diagnostics button and
silences console logs; the ring buffer stays but is never surfaced).
