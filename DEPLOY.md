# Deploy checklist — Umbra EQ → Chrome Web Store

The popup is a React + TypeScript app (Vite + CRXJS); the audio engine is vanilla
(service worker + offscreen Web Audio). The loadable/uploadable extension is the
**`dist/`** folder produced by `npm run build`.

## Pre-submit

- [ ] `npm ci && npm test && npm run build`, then load **`dist/`** unpacked
      (`chrome://extensions` → Developer mode → Load unpacked) and smoke-test a real
      audio tab:
  - [ ] EQ This Tab / Stop, drag dots, Shift-drag (Q), double-click reset, master volume.
  - [ ] Two tabs at once hold two different curves (per-tab EQ).
  - [ ] Sticky per-site: shape a site, reopen it → the curve comes back.
  - [ ] Rules: add `youtube.` / `film. kino.`, confirm matching + priority (a hand
        tweak beats a rule).
  - [ ] Presets save/apply/delete, Export/Import file, Copy code / Paste code.
  - [ ] Spectrum toggle, Guide overlay, EN/RU switch, theme + custom color.
- [ ] `manifest.json` version is correct and bumped since the last upload (now `2.1.0`).
- [ ] `DEBUG` is `false` in `src/background.js` and `public/offscreen.js` (default).
- [ ] Toolbar icons are the Umbra crescent (`public/icon{16,32,48,128}.png`) — done.
- [ ] Privacy policy is reachable at a public URL for the store forms — the repo file
      `https://github.com/skyjacc/umbra-eq/blob/main/PRIVACY.md` works (or GitHub Pages).
- [ ] Contact is the GitHub Issues link (already in `PRIVACY.md`).
- [ ] Verify "Umbra EQ" is free / untrademarked on each store.
- [ ] Screenshots at 1280×800 (or 640×400), 1–5 images (see `store-assets/`).

## Package

```powershell
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<version>.zip   (a zip of dist/, ~0.6 MB)
```

The zip is the built `dist/` tree: `manifest.json`, the service worker loader +
`assets/*` bundle (popup + background), `offscreen.html` / `offscreen.js`,
`onboarding.html` / `onboarding.js`, `src/popup/index.html`, the four `icon*.png`, and
the bundled fonts + OFL notices under `fonts/`. No docs, tests, or local notes. The
production bundle has no remote code and no `eval` (CSP `script-src 'self'`).

The same zip is accepted by Chrome, Edge, and Opera.

## Chrome Web Store dashboard

- [ ] Create item → upload the zip.
- [ ] Paste name, summary, description, category from `STORE_LISTING.md`.
- [ ] Upload screenshots and the 128×128 store icon (`icon128.png`).
- [ ] Paste per-permission justifications from `STORE_LISTING.md`
      (activeTab / tabCapture / storage / offscreen).
- [ ] Set the privacy-policy URL.
- [ ] Data-use disclosures: no collection, no sale, no transfer, no remote
      analytics/tracking. (EEA trader status: Non-trader — free, personal.)
- [ ] Submit for review.

## Microsoft Edge Add-ons (same zip)

- [ ] https://partner.microsoft.com/dashboard/microsoftedge → create extension →
      upload the **same** zip → reuse the listing assets → mark no data collection →
      submit for certification.

## Opera add-ons (same zip)

- [ ] https://addons.opera.com/developer/ → add extension → upload the **same** zip →
      reuse the same assets. Opera's review is manual and can be slower.

## GitHub release

- [ ] `git tag v<version> && git push origin v<version>` — CI
      (`.github/workflows/build.yml`) builds the zip and attaches it to the GitHub
      Release automatically, after verifying the manifest version matches the tag.

## Firefox

Not shipped in this release. Firefox lacks `tabCapture` and `offscreen`, so it needs a
separate content-script audio engine — tracked in `FIREFOX_PORT.md`.

## Third-party notices

- `fonts/InterVariable.ttf` (Inter) and `fonts/GeistMono-Regular.ttf` (Geist Mono) are
  bundled under the SIL Open Font License; keep `fonts/OFL-Inter.txt` and
  `fonts/OFL-GeistMono.txt` in the package.
- UI libraries: React, Tailwind CSS, shadcn/ui (MIT), lucide-react (ISC).
