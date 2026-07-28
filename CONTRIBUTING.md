# Contributing to Umbra EQ

Thanks for your interest! Umbra EQ is MIT-licensed and contributions are welcome.

## Project layout

See [`PROJECT.md`](PROJECT.md) for the full architecture reference. In short:

- `src/background.js` — MV3 service worker: offscreen lifecycle + tab-capture stream ids.
- `public/offscreen.js` — the Web Audio engine (11 biquads, click-free glides). Vanilla JS,
  loaded as a static `<script>` outside the bundler; a dumb applier — the popup resolves settings.
- `src/popup/` — the React + TypeScript UI: `App.tsx`, `main.tsx`, `index.html`, `index.css`,
  `i18n.tsx` (en + ru strings), `theme.ts`, `useEngine.ts`, and `components/` (`EqGraph.tsx`
  SVG EQ graph, `RulesView.tsx`, `BottomNav.tsx`, `ShareRow.tsx`, `VerticalVolume.tsx`,
  `GuideOverlay.tsx`, `Select.tsx`).
- `src/lib/` — pure logic shared by the popup (`audio.ts`, `rules.ts`, `presets.ts`,
  `builtins.ts`, `engine-io.ts`, `utils.ts`) plus the Vitest suites (`*.test.ts`).

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

Add cases for behavior changes. The Vitest suites cover `src/lib` only; the audio engine in
`public/offscreen.js` is vanilla and is verified by loading the unpacked `dist/` in Chrome.

## Coding conventions

- Popup: React + TypeScript. Engine (`src/background.js`, `public/offscreen.js`): vanilla.
- Strict CSP (`script-src 'self'`): **no remote code, no `eval`, no CDN.** The production
  Vite bundle satisfies this — keep it that way (no `new Function`, no runtime script injection).
- Never put a CSS `transform`/`filter`/`backdrop-filter` on any ancestor of the EQ graph
  SVGs — drag hit-testing reads live element rectangles and those break it.
- The version lives in **six** places that must match — `package.json`, `src/manifest.config.ts`,
  the three `BUILD` constants (`src/background.js`, `public/offscreen.js`, `src/lib/engine-io.ts`),
  and `CHANGELOG.md`. The popup compares its `BUILD` against the engine's; a mismatch shows
  "STALE — reload extension". Use the checklist in [`DEPLOY.md`](DEPLOY.md) — it is the source of truth.

## Pull requests

- Keep changes focused; describe what and why.
- Update `CHANGELOG.md` under `[Unreleased]`.
- Bump the version only for a real release, and bump all six places together (see [`DEPLOY.md`](DEPLOY.md)).

## Build the store package

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1   # → release/umbra-eq-<version>.zip
```
