# Firefox port — design notes (not yet built)

Umbra EQ's current engine relies on two Chromium-only APIs that **Firefox does not
implement**:

- **`chrome.tabCapture` / `getMediaStreamId`** — Firefox has never shipped `tabCapture`.
  There is no way to grab a whole tab's audio stream the way Chrome does.
- **`chrome.offscreen`** — no offscreen documents in Firefox. (Not a blocker on its own:
  Firefox background scripts are event pages with DOM access, so Web Audio can live
  there directly — but without a capture stream there is nothing to feed it.)

So Firefox needs a **different audio architecture**, not a manifest tweak.

## Proposed Firefox architecture

Per-element capture via a content script and the Web Audio API:

```
content script (injected in the page)
  → find <audio>/<video> elements
  → AudioContext.createMediaElementSource(el)
  → preGain → 11 biquads → postGain → AudioContext.destination
background event page (DOM) holds shared state / messaging
popup ← → content script  (same UI, same SVG graph, same presets)
```

- Reuse **all** of `popup.*` (UI, graph, presets, themes) unchanged.
- Replace the `background.js` + `offscreen.js` capture/engine pair with:
  - `content.js` — builds the Web Audio chain on each media element it finds, listens
    for `modifyFilter` / `applySettings` / `modifyGain` messages, and re-attaches when
    the SPA swaps media elements (MutationObserver).
  - A Firefox `manifest.json` variant: `browser_specific_settings.gecko`, no
    `tabCapture`/`offscreen` permissions, `background.scripts` instead of a service
    worker, and content-script registration.

## Known limitations to communicate to users

- **One extension per media element.** If the site or another audio add-on has already
  called `createMediaElementSource` on the element, Umbra cannot attach.
- **Breaks on Web-Audio-locked sites** (Spotify Web, Apple Music, some DRM streams) that
  route audio through their own graph — the element source is unavailable or tainted.
- **CORS-tainted media** can throw when connected to a Web Audio graph.
- **No true "whole tab" capture** — only media elements the content script can see.

Because of these, Firefox is a functionally weaker variant. It ships as a separate
listing once demand for the Chromium build is validated.

## Packaging notes

- Use two manifests (e.g. `manifest.chromium.json` / `manifest.firefox.json`) selected at
  build time, or Mozilla's `web-ext` tooling.
- Lint with `web-ext lint` before submitting to addons.mozilla.org.
