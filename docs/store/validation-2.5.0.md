# 2.5.0 release validation

**Status recorded 2026-11-09:** release ready; Chrome Web Store review is pending submission. No submission, approval or store publication is claimed here.

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

## Saved privacy draft

The dashboard draft has Website content, Web history and Personal communications selected, all four permission justifications saved, No remote code selected, and all three data-use certifications checked. See [privacy-fields.md](privacy-fields.md) for the rationale and scope. Saving a draft is not submitting it for review.

## Final submission checks

- Confirm the Chrome Web Store draft uses the exact package above, both localized descriptions, the saved privacy selections, and the six final cards in their respective languages.
- Confirm the public privacy-policy URL shows the updated policy.
- Record the actual submission status after using Submit for Review. Keep the untested listening, DRM and fullscreen boundaries above explicit.

GitHub Actions validates committed revisions independently. Check the required result and exact head on the pull request before merge; earlier results do not cover later changes automatically. A passing build or a GitHub Release does not establish Chrome Web Store approval.
