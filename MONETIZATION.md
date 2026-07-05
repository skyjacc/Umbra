# Monetization plan — Umbra EQ

Goal: keep the whole core free (EQ, volume, bass boost, local presets), add a small
**Pro** tier that unlocks a few extras, plus a **donation** link. Core is never gated.

## Reality of Chrome Web Store payments

- Google **removed** Chrome Web Store payments / paid-extension licensing (deprecated
  2020, fully gone). There is **no** built-in "buy" button or license API anymore.
- All money must go through an **external** processor, and you issue the entitlement.
- Client-side feature gates are bypassable (it's JS in the browser). For a cheap indie
  tool this is acceptable — use a light check + honor system, not heavy DRM.

## Step 1 — Donations (zero backend, ship first)

- Create a page: **Ko-fi**, **Buy Me a Coffee**, **GitHub Sponsors**, or PayPal.me.
- Add a "Support / Donate" link in the popup footer (opens in a new tab).
- Fully policy-compliant, no review issues. This is the lowest-effort first revenue.

## Step 2 — Pro tier (recommended tool: ExtensionPay)

[ExtensionPay](https://extensionpay.com) is built specifically for MV3 extensions:
Stripe under the hood, hosted login + checkout, subscription/one-time, and a tiny SDK
that answers "is this user paid?". Minimal backend for a solo dev.

Flow:
1. Register the extension on ExtensionPay, connect Stripe, set a price (e.g. one-time
   $4.99 or $1.49/mo).
2. Bundle `ExtPay.js` locally (CSP-safe — no remote script) and initialize in the
   background service worker and popup.
3. `const user = await extpay.getUser();` → `user.paid` boolean drives the gates below.
4. A "Go Pro" button opens `extpay.openPaymentPage()`.

Alternative if you want your own site: Lemon Squeezy / Paddle / Gumroad license keys +
a validation endpoint. More control, more work.

## Pro features chosen (core stays free)

| Feature                  | Free                              | Pro                                   | Gate point |
| ------------------------ | --------------------------------- | ------------------------------------- | ---------- |
| Preset cloud sync        | Local + Chrome Sync of own profile| Cross-device sync via your account    | `offscreen.js` save/get presets |
| Extra themes / skins     | Umbra (default) only              | Additional color themes for the EQ    | `popup.js` COLOR_* + CSS vars, a theme switcher |
| Export/import collections| Single export (free)              | Export/import named preset **sets**   | `popup.js` export/import handlers |

## Exact gate points (for later — not built yet)

Add one predicate `isPro()` (returns `await extpay.getUser().then(u=>u.paid)`), then:

1. **Themes** — add a `THEMES` map (each = the 6 `COLOR_*` values + a CSS class on
   `<body>`). Free users get `umbra`; `if (!pro) lockToDefault()`. Cheapest to build,
   pure client-side, good first Pro carrot.
2. **Export collections** — the current single-file export stays free; gate a
   "save as collection / import collection" action behind `isPro()`, showing the
   existing `showNotice(...)` upsell when locked.
3. **Preset cloud sync** — real cross-device sync needs a backend keyed to the paid
   account (ExtensionPay gives you a stable user id). Most work; do last.

Keep every gate as: `if (!pro) { showNotice('This is a Pro feature — ...'); return; }`
so nothing in the core path ever depends on payment.

## Suggested sequence

1. Ship free + donation link → validate demand.
2. Add the **themes** Pro gate via ExtensionPay (smallest, fully client-side).
3. Add export-collections gate.
4. Add cloud sync last (needs backend).
