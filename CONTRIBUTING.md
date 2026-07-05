# Contributing to Umbra EQ

Thanks for your interest! Umbra EQ is MIT-licensed and contributions are welcome.

## Project layout

See [`PROJECT.md`](PROJECT.md) for the full architecture reference. In short:

- `background.js` — MV3 service worker: offscreen lifecycle + tab-capture stream ids.
- `offscreen.js` — the Web Audio engine (11 biquads, click-free glides).
- `popup.js` / `popup.html` / `popup.css` — the UI, SVG EQ graph, presets, themes.
- `test/` — browser-run self-check suites (excluded from the store zip).

## Run it locally

1. Open `chrome://extensions` (or `edge://extensions`, `opera://extensions`).
2. Enable **Developer mode** → **Load unpacked** → select this folder.
3. After editing files, press **⟳ Reload** on the extension card (the popup re-reads
   files on open, but the service worker / offscreen document do not until reloaded).

## Tests

The suites in `test/` run in a browser over `http://` and expose results on
`window.__results`. Serve the folder and open each `*.html`:

```bash
# from the repo root
python -m http.server 8000
# then open http://localhost:8000/test/engine-test.html etc.
```

Keep the suite green (currently 53/53) and add cases for behavior changes.

## Coding conventions

- Vanilla JS, no build step, no bundler. Match the surrounding style and comment density.
- Strict CSP (`script-src 'self'`): **no inline scripts, no remote scripts, no `eval`,
  no CDN.** Inline or bundle everything.
- Never put a CSS `transform`/`filter` on any ancestor of the graph SVGs — drag
  hit-testing reads live element rectangles and a transformed ancestor breaks it.
- Keep the three `BUILD` constants (`background.js`, `offscreen.js`, `popup.js`) and the
  manifest `version` in sync.

## Pull requests

- Keep changes focused; describe what and why.
- Update `CHANGELOG.md` under `[Unreleased]`.
- Bump the version (manifest + the three `BUILD` constants) only for a real release.

## Build the store package

```powershell
powershell -ExecutionPolicy Bypass -File build-zip.ps1
```
