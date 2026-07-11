# Chrome Web Store listing — Umbra EQ

Copy/paste fields for the developer dashboard. Fill the `<...>` placeholders.

## Name (≤ 75 chars) — must match manifest "name"

Umbra EQ — Equalizer & Bass Boost

> Verify the name is not already taken on the Chrome Web Store and does not collide
> with an existing trademark before you commit to it. Alternates: "Umbra Sound EQ",
> "Curve EQ — Bass Boost", "Nightshade EQ".

## Summary / short description (≤ 132 chars)

One equalizer for every tab — boost bass, fix harsh or quiet audio, save presets. Per-site rules. Works on Netflix & Spotify.

## Category

Tools (alternate: Accessibility)

## Single purpose (required by Chrome review)

Umbra EQ has one purpose: to let the user equalize and adjust the volume of audio
playing in their browser tabs in real time.

## Detailed description

Paste this into the CWS **Description** field. It is keyword-dense on purpose (~4,500
chars) — the store's search ranks on the name (~70%) and this description (~30%), so it
reads denser than the README. No banned words (free / best / premium / #1 / recommended).

---

Umbra EQ is a per-tab equalizer and bass booster for Chrome, Edge, and Opera. It adds a real 11-band parametric equalizer to any browser tab, so you can shape the sound of anything you play — music, video, streams, podcasts, or calls — live, while it plays. Boost the bass, tame harsh highs, lift a quiet video, or fix thin laptop-speaker sound with a graphic equalizer that responds the moment you drag.

Most browser EQ extensions go silent on the streaming sites people actually use. Umbra EQ works where they do not. It is a sound equalizer, audio equalizer, and volume booster in one, built for the tab you are listening to right now.

What Umbra EQ does:
- 11-band parametric equalizer — drag the response curve to boost or cut any frequency, from deep bass to high treble, with a live spectrum analyzer behind the curve so you see exactly what you are shaping.
- Bass boost — a one-click bass booster for deep, clean low end on laptop speakers, earbuds, or headphones.
- Volume booster — push a tab past 100% when a video or call is mixed too quiet, with a brick-wall limiter that keeps big boosts clean, with no clipping.
- Per-site rules — give specific sites their own equalizer sound by address pattern (first match wins), so one rule can cover a whole streaming site and its mirrors.
- Per-tab sound — every tab keeps its own equalizer chain, so a movie tab and a music tab can sound different at the same time.
- Presets — save your own equalizer presets, or start from Bass Boost, Vocal, Movie, and Warm; export a preset as a file or share it with a copy-paste code.

Where Umbra EQ works:
1. Netflix equalizer — fix muffled dialogue or heavy bass on movies and shows.
2. Spotify equalizer — shape music the way you want, per genre, with presets.
3. YouTube equalizer — even out loud and quiet videos and boost the bass on music.
4. Any tab with sound — streams, podcasts, web players, browser games, and calls.

How to use Umbra EQ:
1. Play audio in a tab.
2. Click the Umbra EQ icon and press EQ This Tab.
3. Drag the dots on the graph — left and right is frequency, up and down is boost or cut; hold Shift to change the width (Q); double-click a dot to reset it. The strip on the left is master volume for a quick volume boost.
4. Add a rule such as "youtube." in the Rules tab to give a site its own equalizer sound, or open the full-window editor to shape your global sound on a bigger graph.

Why people choose Umbra EQ:
▸ A true parametric equalizer, not a fixed graphic-EQ slider set — every band moves in frequency, gain, and width.
▸ One global sound everywhere, plus per-site overrides — set it once, then fine-tune the sites that need it.
▸ Bass boost and volume boost that stay clean under a limiter, so louder never means distorted.
▸ Keyboard and screen-reader friendly, with English and Russian interfaces and four color themes.
▸ Everything runs on your computer. Umbra EQ does not record or send your audio, there is no account, and there is no analytics or tracking.

Umbra EQ helps in everyday listening:
- Headphone and earbud EQ — tune the bass and treble to match your gear.
- Laptop-speaker fix — add body and bass to thin, tinny built-in speakers.
- Podcast and audiobook equalizer — lift quiet voices and soften harsh sibilance.
- Movie and dialogue clarity — boost the mids so speech sits above music and effects.
- Music equalizer — warm up, brighten, or add punch to any genre with presets.
- Browser games and calls — even out loud effects and quiet voice chat.

More about the sound. Umbra EQ is a parametric equalizer, so each of the 11 bands is a full biquad filter you move in frequency, gain, and Q — more precise than a fixed graphic equalizer with locked sliders. The low bands act as a bass booster and sub-bass control; the middle bands shape vocals, dialogue, and instruments; the high bands add air and presence or tame sharp, harsh treble. The master volume control doubles as a volume booster that pushes past 100 percent, while a brick-wall limiter on the output keeps loud, bass-heavy audio clean instead of distorted. Because the equalizer runs per tab, you can boost the bass on a music tab and keep speech clear on a video tab at the same time.

Umbra EQ is a lightweight, private sound equalizer for the browser — a parametric equalizer, bass booster, and volume booster that works on the sites where audio matters most. Install it, press EQ This Tab, and hear the change while you drag.

## Permission justifications (paste into the review form)

- activeTab: to access the audio of the tab the user is on when they click the icon.
- tabCapture: to capture that tab's audio stream and pass it through the equalizer.
- storage: to save the user's EQ settings and presets locally.
- offscreen: to run the Web Audio processing graph (unavailable in service workers).

## Privacy

- Privacy policy URL: https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md
  (or host it on GitHub Pages and use that URL).
- Support contact: https://github.com/skyjacc/Umbra/issues
- Data usage disclosures: does NOT collect or use any user data. Check "I do not
  collect user data" where applicable (audio is processed locally and never sent).

## Other Chromium stores (same package)

The exact `dist/umbra-eq-<version>.zip` is accepted by all three; only the listing
dashboards differ:

- **Microsoft Edge Add-ons** — https://partner.microsoft.com/dashboard/microsoftedge
  Reuse the name, summary, description, screenshots, and permission justifications above.
- **Opera add-ons** — https://addons.opera.com/developer/
  Reuse the same assets. Opera reviews are manual and can take longer.

## Assets to prepare

- Store icon: 128×128 (use icon128.png).
- Screenshots: 1280×800 or 640×400, 1–5 images (use the popup renders; a hero shot of
  the EQ curve reads best).
- Small promo tile (optional): 440×280.
- Marquee (optional): 1400×560.
