# Contributing to Umbra EQ

Thanks for your interest! Umbra EQ is MIT-licensed and contributions are welcome.

## Project layout

See [`PROJECT.md`](PROJECT.md) for the full architecture reference. In short:

- `background.js` — MV3 service worker: offscreen lifecycle + tab-capture stream ids.
- `offscreen.js` — the Web Audio engine (11 biquads, click-free glides).
- `popup.js` / `popup.html` / `popup.css` — the UI, SVG EQ graph, presets, themes.
- `test/` — browser-run self-check suites (excluded from the store zip).

## Run it locally

```bash
npm install
npm run build   # or: npm run dev  (HMR)
```

Then `chrome://extensions` → **Developer mode** → **Load unpacked** → select the
**`dist/`** folder (Chrome 116+). After changing source, rebuild (or use `dev`) and
press **⟳ Reload** on the extension card so the service worker / offscreen document pick
up the new build.

## Tests

```bash
npm test        # Vitest — pure audio/preset logic in src/lib
```

Add cases for behavior changes. (The audio engine in `public/offscreen.js` is unchanged
vanilla; its browser suites live on the `main` branch.)

## Coding conventions

- Popup: React + TypeScript. Engine (`src/background.js`, `public/offscreen.js`): vanilla.
- Strict CSP (`script-src 'self'`): **no remote code, no `eval`, no CDN.** The production
  Vite bundle satisfies this — keep it that way (no `new Function`, no runtime script injection).
- Never put a CSS `transform`/`filter`/`backdrop-filter` on any ancestor of the EQ graph
  SVGs — drag hit-testing reads live element rectangles and those break it.
- Keep the `BUILD` constants (`src/background.js`, `public/offscreen.js`, `src/lib/engine-io.ts`)
  and the manifest `version` (`src/manifest.config.ts`) in sync.

## Pull requests

- Keep changes focused; describe what and why.
- Update `CHANGELOG.md` under `[Unreleased]`.
- Bump the version (manifest + the three `BUILD` constants) only for a real release.

## Build the store package

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1   # → release/umbra-eq-<version>.zip
```
