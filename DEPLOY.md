# Deploy checklist — Umbra EQ → Chrome Web Store

## Pre-submit

- [ ] Load unpacked (`chrome://extensions` → Developer mode → Load unpacked) and smoke
      test a real audio tab: EQ capture, stop/start, drag dots, bass boost, master
      volume, spectrum toggle, reset, save/apply/delete presets, import/export.
- [ ] Confirm `manifest.json` has the intended version and that every upload bumps it.
- [ ] Turn off debug before public release if desired: set `DEBUG` to `false` in
      `popup.js`, `background.js`, and `offscreen.js`.
- [ ] Contact is the GitHub Issues link (already set in `PRIVACY.md`). Add a donation
      link later if used (see `MONETIZATION.md`).
- [ ] Privacy policy is served from the public repo at
      `https://github.com/skyjacc/umbra-eq/blob/main/PRIVACY.md` — keep that URL for the
      store forms (or host on GitHub Pages).
- [ ] Verify the name "Umbra EQ" is free on each store and not trademarked.
- [ ] Capture screenshots at Chrome Web Store sizes (1280×800 or 640×400).

## Package

Build the upload zip from this project folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build-zip.ps1
```

Expected output:

```text
dist/umbra-eq-<version>.zip
```

The zip intentionally contains runtime/store-required files only:

- `manifest.json`
- `background.js`
- `offscreen.html`
- `offscreen.js`
- `popup.html`
- `popup.css`
- `popup.js`
- `onboarding.html`
- `snap.svg-min.js`
- `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`
- bundled fonts under `fonts/`
- bundled font OFL license notices under `fonts/`

It excludes docs, tests, build scripts, previous zips, screenshots, and local notes.

## Chrome Web Store dashboard

- [ ] Create item → upload the zip.
- [ ] Paste the name, summary, description, and category from `STORE_LISTING.md`.
- [ ] Upload screenshots and the 128×128 store icon.
- [ ] Paste per-permission justifications from `STORE_LISTING.md`.
- [ ] Set the privacy-policy URL.
- [ ] Complete the data-use disclosures as: no collection, no sale, no transfer, no
      remote analytics/tracking.
- [ ] Submit for review.

## Microsoft Edge Add-ons (same zip)

- [ ] Sign in at https://partner.microsoft.com/dashboard/microsoftedge and create an
      extension.
- [ ] Upload the **same** `dist/umbra-eq-<version>.zip`.
- [ ] Reuse the name, description, screenshots, and permission justifications from
      `STORE_LISTING.md`.
- [ ] Set the privacy-policy URL and mark no data collection.
- [ ] Submit for certification.

## Opera add-ons (same zip)

- [ ] Sign in at https://addons.opera.com/developer/ and add an extension.
- [ ] Upload the **same** `dist/umbra-eq-<version>.zip`.
- [ ] Reuse the same listing assets. Note Opera's review is manual and can be slower.

## GitHub release

- [ ] `git tag v<version>` and push the tag — CI (`.github/workflows/build.yml`) builds
      the zip and attaches it to the GitHub Release automatically.
- [ ] Or attach `dist/umbra-eq-<version>.zip` to the release manually.

## Firefox

Not shipped in this release. Firefox lacks `tabCapture` and `offscreen`, so it needs a
separate content-script audio engine — tracked in `FIREFOX_PORT.md`.

## Third-party notices

- `snap.svg-min.js` is Snap.svg, Apache-2.0 — keep its license header intact.
- `fonts/InterVariable.ttf` and `fonts/GeistMono-Regular.ttf` are bundled under the
  SIL Open Font License; keep `fonts/OFL-Inter.txt` and `fonts/OFL-GeistMono.txt` in
  the package.
