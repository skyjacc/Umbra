# 2.5.0 release validation

**Status recorded 2026-11-09 (Europe/Moscow):** 2.5.0 submitted to Chrome Web Store and awaiting review. The public version remains 2.4.1; approval and publication of 2.5.0 are not claimed.

## Exact package and real-site checks — 2026-11-09

- Package: `release/umbra-eq-2.5.0.zip`, 674,186 bytes.
- SHA-256: `1e277e2921368937a27d79664aefbae07cf1046ecf6761fdca79cab4018b374c`.
- Environment: official Google Chrome in an isolated profile, with the extension loaded from this production ZIP and operated through the native popup using CUA.

| Scenario | Observed result |
|---|---|
| YouTube playback and capture | [Big Buck Bunny](https://www.youtube.com/watch?v=aqz-KE-bpKQ) played; the captured tab showed a live FFT |
| Bypass and master | Bypass state was checked; changing master from −50 to 0 dB produced an observed output response |
| Custom preset persistence | `Soft vocals`, with a band at 2500 Hz, +4 dB and Q 0.9, was saved and verified after reopening the popup |
| Site rule | A rule for YouTube was created through the interface |
| Second real audio source | The [MDN T-Rex audio sample](https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3) was looped and captured with Bass Boost |
| Independent tab lifecycle | Both tabs were active together; stopping MDN left the YouTube capture active |
| Last-tab Stop and restart | Stopping YouTube emptied the captured-tab list. Reopening the popup kept EQ off and preserved `Soft vocals`. EQ This Tab restored live FFT and the saved 2500 Hz / +4 dB curve; a second Stop returned to off |

YouTube later autoplayed another video while capture remained active on the same hostname. This is not a cross-host navigation test. The test tab was closed afterwards.

These are playback, UI-state and signal-response observations, not subjective listening results. DRM/protected playback and fullscreen were not tested. They do not establish compatibility with every video, player or streaming service.

## Earlier automated evidence — 2026-11-08

The following results were recorded with Node 24.12.0, a clean `npm ci`, and the built extension on 2026-11-08. They are retained as earlier evidence, not presented as a new run against today's ZIP.

| Check | Result |
|---|---|
| Dependency audit | 0 reported vulnerabilities |
| TypeScript | Passed |
| Unit and DOM regression tests | 491 passed across 27 files |
| Native filter-response comparison | 6,075 comparisons; maximum error 0.00001404 dB |
| Native AudioWorklet renders | 15 scenarios across 44.1, 48 and 96 kHz; sample ceiling, quiet-signal delay and stereo relation verified |
| Production build | Passed; application and production dependency licenses included |
| Built-extension UI smoke | Passed: responsive editing, preset controls, rule listbox, language switching, popup geometry/navigation; no page errors |
| Manifest locales | English and Russian messages resolve in Chromium; summaries fit the 132-character limit |
| Native tab capture | Two actual audio tabs captured concurrently, with nonzero output and spectrum; stopping one preserved the other, then both stopped |

The native-capture smoke used an isolated Chromium profile, two local Web Audio tone pages (440 and 880 Hz), and the DevTools `Extensions.triggerAction` command to invoke the real extension action. Chrome APIs were not mocked. Playback remained available after returning focus to the source tabs. This checks capture/offscreen routing and stop behavior; it is not a subjective listening test or a compatibility certification for third-party streaming services.

## Submitted privacy disclosures

The submitted disclosures have Website content, Web history and Personal communications selected, all four permission justifications saved, No remote code selected, and all three data-use certifications checked. See [privacy-fields.md](privacy-fields.md) for the rationale and scope.

## Submission record — 2026-11-09 (Europe/Moscow)

- [PR #27](https://github.com/skyjacc/Umbra/pull/27) merged as `3ccf8f93daa329ccb69d7e27cdd6678e5e971b1a`; the required `build` passed in 2m 15s with all CI steps passing.
- Three new English cards were uploaded as global screenshots and three Russian cards as localized screenshots, each in EQ → Rules → Presets order. All six images were saved and verified after reloading the dashboard.
- The submission dialog confirmed: “Ваш продукт (расширение) отправлен на проверку”. The item header then showed “Состояние: Ожидает рассмотрения”.
- Automatic publication was unchecked before Submit. After approval, manual publication is required within the 30-day window shown by the UI.
- The existing public version remains 2.4.1. Keep the untested listening, DRM and fullscreen boundaries above explicit.

The CI result above belongs to PR #27, not to later documentation commits. Earlier results do not cover later changes automatically. A passing build, GitHub Release or store submission does not establish Chrome Web Store approval.
