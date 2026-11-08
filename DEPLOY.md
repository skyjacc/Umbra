# Deploy checklist — Umbra EQ → Chrome Web Store

The popup is a React + TypeScript app (Vite + CRXJS); the audio engine is vanilla
(service worker + offscreen Web Audio). The loadable/uploadable extension is the
**`dist/`** folder produced by `npm run build`.

## Release gates

Use Node 24 LTS and `npm ci`. CI runs the dependency audit, typecheck, unit/DOM tests, Chromium audio/UI checks and build.
The build includes the application and production dependency license texts. Packaging rejects
missing licenses, temporary debug-recorder markers, Vite development clients and local
development-server URLs in the actual dist files.

## Version bump (do this first — all in lock-step)

The version string lives in **six** places and they MUST match. The popup compares its
own `BUILD` against the engine's on every status; if they drift it shows **"STALE —
reload extension"** and stops working. Bump all of them together:

- [ ] `package.json` → `"version"`
- [ ] `src/manifest.config.ts` → `version`
- [ ] `src/background.js` → `const BUILD`
- [ ] `public/offscreen.js` → `const BUILD`
- [ ] `src/lib/engine-io.ts` → `export const BUILD`
- [ ] `CHANGELOG.md` → new `## [x.y.z] — <date>` section

Chrome Web Store rejects an upload whose version isn't **higher** than the last one.
Bug fixes → patch (`x.y.`**`z`**); user-facing changes → minor (`x.`**`y`**`.0`).

- [ ] Update the maintainer's own notes, if you keep any. Nothing in this repository
      depends on them.
- [ ] Refresh `PROJECT.md` — the **Version:** and **Status:** lines are hand-maintained.
      Verify publication separately from the source version.
- [ ] Post-release: re-add an empty `## [Unreleased]` section to `CHANGELOG.md` above the
      new `## [x.y.z]` heading, so the next cycle's per-PR entries have a home.

## Pre-submit

- [ ] Run `npm ci`, `npm audit --audit-level=high`, `npm run typecheck`, `npm test`,
      `npx playwright install chromium`, `npm run test:audio`, `npm run build`, and
      `npm run test:ui`; then load **`dist/`** unpacked
      (`chrome://extensions` → Developer mode → Load unpacked) and smoke-test a real
      audio tab:
  - [ ] EQ This Tab / Stop, drag dots, Shift-drag (Q), double-click reset, master volume.
  - [ ] Two tabs at once hold two different curves (per-tab EQ); the output meter follows
        their combined output while the spectrum follows the selected tab.
  - [ ] Large boosts and multiple playing tabs stay within the output ceiling; normal
        playback has no new audible artifacts in the tested material. The 5 ms sample-peak
        limiter does not guarantee true peaks or repair distortion in the source.
  - [ ] Global sound: shape a curve on an un-ruled site → it plays on every EQ'd tab, and
        switching tabs keeps it (no reset).
  - [ ] Rules: add `youtube.` / `film. kino.`, confirm a matching site plays the rule's
        sound (rule overrides the global sound) and applies live.
  - [ ] Full window (More) edits the global sound: drag → a captured tab changes; Reset zeroes it.
  - [ ] Band-guide toggle labels the zones; the active preset shows in the EQ header.
  - [ ] Stop a tab, reopen the popup → it stays un-EQ'd.
  - [ ] Presets save/apply/delete, Export/Import file, Copy code / Paste code.
  - [ ] Spectrum toggle, Guide overlay, EN/RU switch, theme + custom color.
- [ ] Version bumped in all six places (see **Version bump** above).
- [ ] `DEBUG` is `false` in `src/background.js` and `public/offscreen.js` (default).
- [ ] Toolbar icons are the Umbra crescent (`public/icon{16,32,48,128}.png`) — done.
- [ ] Open the public privacy-policy URL before submitting for review and verify that its
      published content matches the release's actual behavior, including local audio and
      Chrome Sync. A local edit to `PRIVACY.md` does not update the public page:
      `https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md` (or GitHub Pages).
- [ ] Verify packaged `_locales/en/messages.json` and `_locales/ru/messages.json` resolve
      the manifest name and description. Check both language listings against
      [`docs/store/README.md`](docs/store/README.md).
- [ ] Contact is the GitHub Issues link (already in `PRIVACY.md`).
- [ ] Verify "Umbra EQ" is free / untrademarked on each store.
- [ ] Screenshots at 1280×800 (or 640×400), 1–5 images. Not in the repo — produce them at release time.

## Package

```powershell
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<version>.zip   (a zip of dist/, ~0.6 MB)
```

The zip is the built `dist/` tree: `manifest.json`, the service worker loader +
`assets/*` bundle (popup + background), `offscreen.html` / `offscreen.js`, `limiter-worklet.js` / `limiter-core.js`,
`onboarding.html` / `onboarding.js`, `src/popup/index.html`, the four `icon*.png`, and
the bundled fonts + OFL notices under `fonts/`, `LICENSE`, and generated
`THIRD-PARTY-NOTICES.txt`. No tests or local notes. The
production bundle has no remote code and no `eval` (CSP `script-src 'self'`).

This is the Chromium build. Each store has its own submission and review requirements.

## Chrome Web Store dashboard

- [ ] Open the existing Umbra item (`plkncppcgglcjdkmcdeajhbfccbnnoee`) → Package →
      upload the new-version zip. Do not create a second listing for an update.
- [ ] Use the ready-to-paste English and Russian listing text in
      [`docs/store/README.md`](docs/store/README.md); choose the category in the current form.
- [ ] Upload screenshots and the 128×128 store icon (`icon128.png`).
- [ ] Use the permission notes in [`docs/store/README.md`](docs/store/README.md) to complete
      the current form for the permissions in the packaged manifest
      (activeTab / tabCapture / storage / offscreen).
- [ ] Set the privacy-policy URL.
- [ ] Complete current data-use and trader-status declarations from the actual behavior
      and publisher circumstances. Audio is not recorded or uploaded; saved presets and
      site rules may use Chrome Sync. Keep the store description and privacy policy consistent.
- [ ] Submit for review.

## Microsoft Edge Add-ons (same zip)

- [ ] https://partner.microsoft.com/dashboard/microsoftedge → create extension →
      upload the **same** zip → reuse the listing assets.
- [ ] Complete the current Partner Center Privacy fields for purpose, permissions,
      remote code, data usage and the public privacy-policy URL from the actual release
      behavior. Keep the disclosures consistent with the published policy, then submit
      for certification. See [Microsoft's publishing instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#step-6-enter-privacy-information).

## Opera add-ons (same zip)

- [ ] https://addons.opera.com/developer/ → add extension → upload the **same** zip →
      reuse the same assets. Opera's review is manual and can be slower.

## GitHub release

- [ ] `git tag v<version> && git push origin v<version>` — CI
      (`.github/workflows/build.yml`) verifies the manifest version against the tag, builds
      the zip with a read-only token, and passes it to a separate release job with write access.

## Firefox

Not shipped in this release. Firefox lacks `tabCapture` and `offscreen`, so it needs a
separate content-script audio engine — tracked in `FIREFOX_PORT.md`.

## Third-party notices

- `fonts/InterVariable.ttf` (Inter) and `fonts/GeistMono-Regular.ttf` (Geist Mono) are
  bundled under the SIL Open Font License; keep `fonts/OFL-Inter.txt` and
  `fonts/OFL-GeistMono.txt` in the package.
- UI libraries: React, Tailwind CSS, shadcn/ui (MIT), lucide-react (ISC).
